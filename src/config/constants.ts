export const CONSTANTS = {
  DB_PATH: "data/leads.db",

  GOOGLE_PLACES_SEARCH_RADIUS_M: 15000,
  GOOGLE_PLACES_MAX_RESULTS: 20,

  OVERPASS_SEARCH_RADIUS_M: 15000,
  OVERPASS_MAX_NODES: 20,

  REENVIO_APOS_DIAS: 90,

  EMAIL_MAX_PALAVRAS: 120,

  PACING_MIN_MS: 2 * 60 * 1000,
  PACING_MAX_MS: 4 * 60 * 1000,

  DEEPSEEK_MODEL: "deepseek-v4-pro",
  DEEPSEEK_BASE_URL: "https://api.deepseek.com",

  PAGESPEED_BASE_URL: "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",

  HTTP_TIMEOUT_MS: 15_000,
  PAGESPEED_TIMEOUT_MS: 30_000,
} as const;

export const ESTADOS_LEAD = {
  NOVO: "novo",
  SEM_WEBSITE: "sem_website",
  AUDITADO: "auditado",
  SKIPPED_HIGH_SCORE: "skipped_high_score",
  EMAIL_GERADO: "email_gerado",
  ENVIADO: "enviado",
  UNSUBSCRIBED: "unsubscribed",
  ERROR: "error",
} as const;

export type EstadoLead = (typeof ESTADOS_LEAD)[keyof typeof ESTADOS_LEAD];

export const FONTE = {
  GOOGLE_PLACES: "google_places",
  OVERPASS: "overpass",
} as const;

export type Fonte = (typeof FONTE)[keyof typeof FONTE];
