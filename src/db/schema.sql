CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT UNIQUE,
  nome_empresa TEXT NOT NULL,
  nicho TEXT NOT NULL,
  cidade TEXT NOT NULL,
  website_url TEXT,
  domain TEXT UNIQUE,
  email TEXT,
  telefone TEXT,
  morada TEXT,
  fonte TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'novo',
  performance_score INTEGER,
  last_contacted_at TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auditorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  performance_score REAL,
  loading_time_ms INTEGER,
  tem_viewport_mobile INTEGER,
  tem_https INTEGER,
  is_wordpress INTEGER,
  raw_json TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emails_enviados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  assunto TEXT NOT NULL,
  corpo TEXT NOT NULL,
  resend_id TEXT,
  tipo TEXT NOT NULL DEFAULT 'inicial',
  enviado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS unsubscribes (
  lead_id INTEGER PRIMARY KEY REFERENCES leads(id),
  token TEXT UNIQUE NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_domain ON leads(domain) WHERE domain IS NOT NULL;
