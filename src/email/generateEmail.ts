import OpenAI from "openai";
import { CONSTANTS } from "../config/index.js";
import type { Lead } from "../db/repository.js";
import type { PageSpeedResult } from "../audit/pagespeed.js";
import type { ScoringResult } from "../scoring/score.js";

export interface GeneratedEmail {
  subject: string;
  body: string;
}

const SYSTEM_PROMPT = `És um especialista em presença e performance digital para PMEs em Portugal.
Escreves exclusivamente em Português de Portugal (PT-PT) natural (usa palavras como "telemóvel", "contacto", "otimização").
O teu tom é profissional, conciso e prestável — nunca agressivo na venda ou robótico.
Formata SEMPRE a resposta em JSON com o seguinte formato estrito:
{ "subject": "...", "body": "..." }`;

export async function generateEmail(
  lead: Lead,
  pageSpeed: PageSpeedResult,
  score: ScoringResult,
  isWordPress: boolean,
  apiKey: string
): Promise<GeneratedEmail> {
  const deepseek = new OpenAI({
    apiKey,
    baseURL: CONSTANTS.DEEPSEEK_BASE_URL,
  });

  const completion = await deepseek.chat.completions.create({
    model: CONSTANTS.DEEPSEEK_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Empresa: ${lead.nome_empresa}
Nicho: ${lead.nicho}
Cidade: ${lead.cidade}
Website: ${lead.website_url ?? "N/A"}
Score Mobile: ${score.scoreFinal}/100
Tempo Carregamento: ${pageSpeed.loadingTimeMs ?? "N/A"}ms
É WordPress: ${isWordPress ? "Sim" : "Não"}

Escreve um email muito curto (máximo 120 palavras) focado em como a lentidão no telemóvel pode estar a fazer perder clientes em ${lead.cidade}. Sugere uma conversa rápida de 2 minutos para apresentar melhorias.`,
      },
    ],
    temperature: 0.3,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("DeepSeek não devolveu conteúdo na resposta");
  }

  const parsed = JSON.parse(raw) as GeneratedEmail;
  if (!parsed.subject || !parsed.body) {
    throw new Error("DeepSeek devolveu JSON inválido: falta subject ou body");
  }

  return parsed;
}
