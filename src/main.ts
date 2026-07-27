import { loadConfig } from "./config/env.js";
import { CONSTANTS, ESTADOS_LEAD, FONTE } from "./config/constants.js";
import type { Fonte } from "./config/constants.js";
import { initDb, closeDb } from "./db/client.js";
import {
  countLeadsPendentes,
  upsertLeads,
  getLeadsParaProcessar,
  updateLeadEstado,
  updateLeadWebsiteEmail,
  insertAuditoria,
  insertEmailEnviado,
  upsertUnsubscribe,
  isDomainBlacklisted,
  getLeadsSentToday,
} from "./db/repository.js";
import type { ProspectionInput } from "./db/repository.js";
import { GooglePlacesProvider, OverpassProvider } from "./prospection/index.js";
import type { ProspectionProvider, ProspectionResult } from "./prospection/index.js";
import { auditWebsite, scrapeWebsiteContactInfo } from "./audit/pagespeed.js";
import { calculateScore, shouldSendEmail } from "./scoring/score.js";
import { generateEmail } from "./email/generateEmail.js";
import { sendEmail, generateUnsubscribeToken } from "./email/sendEmail.js";

interface RunStats {
  prospetados: number;
  auditados: number;
  enviados: number;
  ignoradosScoreAlto: number;
  erros: number;
  semWebsite: number;
}

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacing(): number {
  return Math.floor(
    Math.random() * (CONSTANTS.PACING_MAX_MS - CONSTANTS.PACING_MIN_MS) +
      CONSTANTS.PACING_MIN_MS
  );
}

async function runProspection(
  config: ReturnType<typeof loadConfig>,
  needed: number
): Promise<number> {
  const googleProvider: ProspectionProvider = new GooglePlacesProvider(
    config.GOOGLE_PLACES_API_KEY
  );
  const overpassProvider: ProspectionProvider = new OverpassProvider();

  let results: ProspectionResult[] = [];
  let fonte: Fonte = FONTE.GOOGLE_PLACES;

  try {
    console.log(
      `[Prospeção] Google Places: "${config.TARGET_NICHE}" em "${config.TARGET_CITY}"...`
    );
    results = await googleProvider.search(
      config.TARGET_NICHE,
      config.TARGET_CITY,
      needed + 5
    );
  } catch (err) {
    console.warn(
      `[Prospeção] Google Places falhou: ${err instanceof Error ? err.message : err}. Fallback Overpass...`
    );
    results = [];
  }

  if (results.length === 0) {
    try {
      console.log(
        `[Prospeção] Overpass: "${config.TARGET_NICHE}" em "${config.TARGET_CITY}"...`
      );
      results = await overpassProvider.search(
        config.TARGET_NICHE,
        config.TARGET_CITY,
        needed + 5
      );
      fonte = FONTE.OVERPASS;
    } catch (err) {
      console.error(
        `[Prospeção] Overpass também falhou: ${err instanceof Error ? err.message : err}`
      );
      return 0;
    }
  }

  if (results.length === 0) {
    console.warn(`[Prospeção] 0 resultados encontrados para a prospeção.`);
    return 0;
  }

  console.log(`[Prospeção] ${results.length} resultados encontrados (fonte: ${fonte}).`);

  const leads: ProspectionInput[] = results
    .filter((r) => !isDomainBlacklisted(r.domain ?? ""))
    .map((r) => ({
      place_id: r.place_id,
      nome_empresa: r.nome_empresa,
      nicho: config.TARGET_NICHE,
      cidade: config.TARGET_CITY,
      website_url: r.website_url,
      email: r.email,
      telefone: r.telefone,
      morada: r.morada,
      fonte,
      domain: r.domain,
    }));

  const inserted = upsertLeads(leads);
  console.log(`[Prospeção] ${inserted} novos leads inseridos na BD.`);
  return inserted;
}

async function processLead(
  lead: ReturnType<typeof getLeadsParaProcessar>[number],
  config: ReturnType<typeof loadConfig>,
  stats: RunStats
): Promise<void> {
  console.log(`\n[Processar] Lead #${lead.id}: ${lead.nome_empresa}`);

  if (!lead.website_url) {
    console.log(`  -> Sem website. A marcar como 'sem_website'.`);
    updateLeadEstado(lead.id, ESTADOS_LEAD.SEM_WEBSITE);
    stats.semWebsite++;
    return;
  }

  let pageSpeedResult;
  try {
    console.log(`  -> A auditar website: ${lead.website_url}`);
    pageSpeedResult = await auditWebsite(
      lead.website_url,
      config.PAGESPEED_API_KEY
    );
  } catch (err) {
    console.error(
      `  -> Erro na auditoria PageSpeed: ${err instanceof Error ? err.message : err}`
    );
    updateLeadEstado(lead.id, ESTADOS_LEAD.ERROR);
    stats.erros++;
    return;
  }

  let scrapedInfo;
  try {
    console.log(`  -> A extrair contactos do website...`);
    scrapedInfo = await scrapeWebsiteContactInfo(lead.website_url);
  } catch {
    scrapedInfo = { email: null, isWordPress: false };
  }

  if (scrapedInfo.email && !lead.email) {
    updateLeadWebsiteEmail(lead.id, lead.website_url, lead.domain, scrapedInfo.email);
  }

  const score = calculateScore(lead, pageSpeedResult, scrapedInfo.isWordPress);
  console.log(`  -> Score final: ${score.scoreFinal}/100`);

  insertAuditoria({
    lead_id: lead.id,
    performance_score: pageSpeedResult.performanceScore,
    loading_time_ms: pageSpeedResult.loadingTimeMs,
    tem_viewport_mobile: pageSpeedResult.temViewportMobile ? 1 : 0,
    tem_https: pageSpeedResult.temHttps ? 1 : 0,
    is_wordpress: scrapedInfo.isWordPress ? 1 : 0,
    raw_json: null,
  });

  if (!shouldSendEmail(score.scoreFinal, config.SCORE_THRESHOLD)) {
    console.log(
      `  -> Score acima do threshold (${config.SCORE_THRESHOLD}). A saltar.`
    );
    updateLeadEstado(lead.id, ESTADOS_LEAD.SKIPPED_HIGH_SCORE, {
      performance_score: score.scoreFinal,
    });
    stats.ignoradosScoreAlto++;
    return;
  }

  stats.auditados++;

  updateLeadEstado(lead.id, ESTADOS_LEAD.AUDITADO, {
    performance_score: score.scoreFinal,
  });

  let generatedEmail;
  try {
    console.log(`  -> A gerar email com DeepSeek...`);
    generatedEmail = await generateEmail(
      lead,
      pageSpeedResult,
      score,
      scrapedInfo.isWordPress,
      config.DEEPSEEK_API_KEY
    );
  } catch (err) {
    console.error(
      `  -> Erro na geração de email: ${err instanceof Error ? err.message : err}`
    );
    updateLeadEstado(lead.id, ESTADOS_LEAD.ERROR);
    stats.erros++;
    return;
  }

  const leadEmail = lead.email ?? scrapedInfo.email;
  if (!leadEmail) {
    console.log(`  -> Sem email do lead. Impossível enviar.`);
    updateLeadEstado(lead.id, ESTADOS_LEAD.ERROR);
    stats.erros++;
    return;
  }

  const token = generateUnsubscribeToken(lead.id);
  const unsubscribeUrl = `${config.UNSUBSCRIBE_BASE_URL}?token=${token}`;

  upsertUnsubscribe(lead.id, token);

  let sendResult;
  try {
    console.log(`  -> A enviar email para ${leadEmail}...`);
    sendResult = await sendEmail(
      leadEmail,
      config.SENDER_EMAIL,
      generatedEmail,
      unsubscribeUrl,
      config.RESEND_API_KEY
    );
  } catch (err) {
    console.error(
      `  -> Erro no envio de email: ${err instanceof Error ? err.message : err}`
    );
    updateLeadEstado(lead.id, ESTADOS_LEAD.ERROR);
    stats.erros++;
    return;
  }

  if (!sendResult.success) {
    console.error(`  -> Envio falhou: ${sendResult.error}`);
    updateLeadEstado(lead.id, ESTADOS_LEAD.ERROR);
    stats.erros++;
    return;
  }

  insertEmailEnviado({
    lead_id: lead.id,
    assunto: generatedEmail.subject,
    corpo: generatedEmail.body,
    resend_id: sendResult.resendId,
    tipo: "inicial",
  });

  updateLeadEstado(lead.id, ESTADOS_LEAD.ENVIADO, {
    last_contacted_at: new Date().toISOString(),
  });

  stats.enviados++;
  console.log(
    `  -> Email enviado com sucesso! (Resend ID: ${sendResult.resendId ?? "N/A"})`
  );

  const pacing = randomPacing();
  console.log(
    `  -> Pausa de ${Math.round(pacing / 1000)}s entre envios...`
  );
  await sleep(pacing);
}

async function main(): Promise<void> {
  console.log("=== Prospeção B2B Diária ===");
  console.log(`Data: ${new Date().toISOString()}\n`);

  if (isWeekend()) {
    console.log("Fim de semana. A abortar execução.");
    closeDb();
    return;
  }

  const config = loadConfig();
  console.log(`Nicho: ${config.TARGET_NICHE}`);
  console.log(`Cidade: ${config.TARGET_CITY}`);
  console.log(`Limite diário: ${config.DAILY_LIMIT}`);
  console.log(`Threshold de score: ${config.SCORE_THRESHOLD}\n`);

  initDb();

  const alreadySent = getLeadsSentToday();
  const effectiveLimit = Math.max(0, config.DAILY_LIMIT - alreadySent);

  if (effectiveLimit <= 0) {
    console.log(
      `Limite diário de ${config.DAILY_LIMIT} envios já atingido (${alreadySent} enviados hoje). A abortar.`
    );
    closeDb();
    return;
  }

  console.log(
    `Enviados hoje: ${alreadySent}. Limite restante: ${effectiveLimit}.\n`
  );

  const pendentes = countLeadsPendentes();
  console.log(`Leads pendentes na BD: ${pendentes}`);

  if (pendentes < effectiveLimit) {
    const needed = effectiveLimit - pendentes;
    console.log(`A prospeção precisa de ${needed} novos leads.`);
    await runProspection(config, needed);
  }

  const leads = getLeadsParaProcessar(effectiveLimit);
  console.log(`\nA processar ${leads.length} leads...`);

  const stats: RunStats = {
    prospetados: 0,
    auditados: 0,
    enviados: 0,
    ignoradosScoreAlto: 0,
    erros: 0,
    semWebsite: 0,
  };

  for (const lead of leads) {
    try {
      await processLead(lead, config, stats);
    } catch (err) {
      console.error(
        `[ERRO FATAL] Lead #${lead?.id}: ${err instanceof Error ? err.message : err}`
      );
      try {
        if (lead?.id) {
          updateLeadEstado(lead.id, ESTADOS_LEAD.ERROR);
        }
      } catch {
        // ignore
      }
      stats.erros++;
    }
  }

  console.log("\n=== Resumo da Execução ===");
  console.log(`Prospetados (novos):   ${stats.prospetados}`);
  console.log(`Auditados:             ${stats.auditados}`);
  console.log(`Enviados:              ${stats.enviados}`);
  console.log(`Saltos (score alto):   ${stats.ignoradosScoreAlto}`);
  console.log(`Sem website:           ${stats.semWebsite}`);
  console.log(`Erros:                 ${stats.erros}`);
  console.log("===========================\n");

  closeDb();
}

main().catch((err) => {
  console.error("Erro fatal na execução:", err);
  try {
    closeDb();
  } catch {
    // ignore
  }
  process.exit(1);
});
