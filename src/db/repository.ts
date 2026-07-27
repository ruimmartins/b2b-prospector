import { getDb } from "./client.js";
import { ESTADOS_LEAD, CONSTANTS } from "../config/index.js";
import type { EstadoLead, Fonte } from "../config/index.js";

export interface Lead {
  id: number;
  place_id: string | null;
  nome_empresa: string;
  nicho: string;
  cidade: string;
  website_url: string | null;
  domain: string | null;
  email: string | null;
  telefone: string | null;
  morada: string | null;
  fonte: string;
  estado: string;
  performance_score: number | null;
  last_contacted_at: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Auditoria {
  id: number;
  lead_id: number;
  performance_score: number | null;
  loading_time_ms: number | null;
  tem_viewport_mobile: number;
  tem_https: number;
  is_wordpress: number;
  raw_json: string | null;
  criado_em: string;
}

export interface EmailEnviado {
  id: number;
  lead_id: number;
  assunto: string;
  corpo: string;
  resend_id: string | null;
  tipo: string;
  enviado_em: string;
}

export interface Unsubscribe {
  lead_id: number;
  token: string;
  criado_em: string;
}

export interface ProspectionInput {
  place_id: string;
  nome_empresa: string;
  nicho: string;
  cidade: string;
  website_url: string | null;
  email: string | null;
  telefone: string | null;
  morada: string | null;
  fonte: Fonte;
  domain: string | null;
}

export function upsertLeads(leads: ProspectionInput[]): number {
  const db = getDb();
  let inserted = 0;

  const stmt = db.prepare(`
    INSERT INTO leads (place_id, nome_empresa, nicho, cidade, website_url, domain, email, telefone, morada, fonte)
    VALUES (@place_id, @nome_empresa, @nicho, @cidade, @website_url, @domain, @email, @telefone, @morada, @fonte)
    ON CONFLICT(place_id) DO NOTHING
  `);

  const insertMany = db.transaction((items: ProspectionInput[]) => {
    for (const item of items) {
      const result = stmt.run(item);
      if (result.changes > 0) inserted++;
    }
  });

  insertMany(leads);
  return inserted;
}

export function getLeadsParaProcessar(limit: number): Lead[] {
  const db = getDb();

  const rows = db
    .prepare(
      `
    SELECT l.* FROM leads l
    WHERE (
      l.estado = @estadoNovo
      OR (
        l.estado = @estadoEnviado
        AND l.last_contacted_at <= datetime('now', '-' || @dias || ' days')
      )
    )
    AND l.id NOT IN (SELECT lead_id FROM unsubscribes)
    ORDER BY
      CASE WHEN l.estado = @estadoEnviado THEN 0 ELSE 1 END,
      l.criado_em ASC
    LIMIT @limit
    `
    )
    .all({
      estadoNovo: ESTADOS_LEAD.NOVO,
      estadoEnviado: ESTADOS_LEAD.ENVIADO,
      dias: CONSTANTS.REENVIO_APOS_DIAS,
      limit,
    }) as Lead[];

  return rows;
}

export function countLeadsPendentes(): number {
  const db = getDb();

  const row = db
    .prepare(
      `
    SELECT COUNT(*) as total FROM leads l
    WHERE (
      l.estado = @estadoNovo
      OR (
        l.estado = @estadoEnviado
        AND l.last_contacted_at <= datetime('now', '-' || @dias || ' days')
      )
    )
    AND l.id NOT IN (SELECT lead_id FROM unsubscribes)
    `
    )
    .get({
      estadoNovo: ESTADOS_LEAD.NOVO,
      estadoEnviado: ESTADOS_LEAD.ENVIADO,
      dias: CONSTANTS.REENVIO_APOS_DIAS,
    }) as { total: number };

  return row.total;
}

export function updateLeadEstado(
  leadId: number,
  estado: EstadoLead,
  extraFields: Partial<Pick<Lead, "performance_score" | "last_contacted_at">> = {}
): void {
  const db = getDb();

  const fields = ["estado = @estado", "atualizado_em = datetime('now')"];
  const params: Record<string, unknown> = {
    id: leadId,
    estado,
  };

  if (extraFields.performance_score !== undefined) {
    fields.push("performance_score = @performance_score");
    params.performance_score = extraFields.performance_score;
  }

  if (extraFields.last_contacted_at !== undefined) {
    fields.push("last_contacted_at = @last_contacted_at");
    params.last_contacted_at = extraFields.last_contacted_at;
  }

  db.prepare(`UPDATE leads SET ${fields.join(", ")} WHERE id = @id`).run(params);
}

export function updateLeadWebsiteEmail(
  leadId: number,
  website_url: string | null,
  domain: string | null,
  email: string | null
): void {
  const db = getDb();
  db.prepare(
    `UPDATE leads SET website_url = @website_url, domain = @domain, email = @email, atualizado_em = datetime('now') WHERE id = @id`
  ).run({ id: leadId, website_url, domain, email });
}

export function insertAuditoria(audit: Omit<Auditoria, "id" | "criado_em">): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO auditorias (lead_id, performance_score, loading_time_ms, tem_viewport_mobile, tem_https, is_wordpress, raw_json)
     VALUES (@lead_id, @performance_score, @loading_time_ms, @tem_viewport_mobile, @tem_https, @is_wordpress, @raw_json)`
  ).run(audit);
}

export function insertEmailEnviado(
  email: Omit<EmailEnviado, "id" | "enviado_em">
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO emails_enviados (lead_id, assunto, corpo, resend_id, tipo)
     VALUES (@lead_id, @assunto, @corpo, @resend_id, @tipo)`
  ).run(email);
}

export function upsertUnsubscribe(leadId: number, token: string): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO unsubscribes (lead_id, token) VALUES (@lead_id, @token)`
  ).run({ lead_id: leadId, token });
}

export function getLeadByUnsubscribeToken(token: string): Lead | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT l.* FROM leads l
       INNER JOIN unsubscribes u ON u.lead_id = l.id
       WHERE u.token = @token`
    )
    .get({ token }) as Lead | undefined;
  return row ?? null;
}

export function isDomainBlacklisted(domain: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT 1 FROM leads WHERE domain = @domain AND estado = @unsubscribed`
    )
    .get({ domain, unsubscribed: ESTADOS_LEAD.UNSUBSCRIBED });
  return row !== undefined;
}

export function getLeadsSentToday(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as total FROM emails_enviados WHERE date(enviado_em) = date('now')`
    )
    .get() as { total: number };
  return row.total;
}
