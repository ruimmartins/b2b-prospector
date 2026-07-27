# AGENTS.md — AI Agent Documentation

## Project Overview

Automated daily B2B prospecting pipeline for Portuguese SMEs. Runs once per day (weekdays only), processes 10–15 companies per execution, audits websites via Google PageSpeed Insights, generates hyper-personalised PT-PT emails via DeepSeek V4 Pro, and sends them via Resend API. Lead state is managed idempotently in local SQLite.

**Stack**: Node.js 20+ / TypeScript ES2022 / `tsx` / better-sqlite3 / Zod / OpenAI SDK / Resend

## Quick Commands

```bash
npx tsx src/main.ts              # Run daily pipeline
npx tsx src/unsubscribe/server.ts # Start unsubscribe HTTP server
npx tsc --noEmit                 # Type-check only
npm install                      # Install deps
```

## Architecture

```
main.ts (Orchestrator)
  ├── [Weekend guard] → abort
  ├── config/env.ts          ← Zod-validated env vars
  ├── db/client.ts           ← better-sqlite3 + schema.sql
  ├── prospection/           ← Google Places API → Overpass (fallback)
  │   ├── types.ts           ← ProspectionProvider interface
  │   ├── googlePlaces.ts    ← GooglePlacesProvider
  │   └── overpass.ts        ← OverpassProvider
  ├── audit/pagespeed.ts     ← PageSpeed Insights + HTML contact scraper
  ├── scoring/score.ts       ← Score 0-100 + threshold filter
  ├── email/
  │   ├── generateEmail.ts   ← DeepSeek V4 Pro (OpenAI SDK)
  │   └── sendEmail.ts       ← Resend API + List-Unsubscribe headers
  └── unsubscribe/server.ts  ← Standalone HTTP server
```

### Pipeline Flow (per lead)

1. No website? → state `sem_website`, skip
2. `auditWebsite()` → PageSpeed Insights (mobile)
3. `scrapeWebsiteContactInfo()` → fetch HTML, extract email + WP detection
4. `calculateScore()` → 0–100 score (perf×50 + VP + HTTPS + WP + load)
5. Score ≥ threshold? → state `skipped_high_score`, skip (good website = don't bother)
6. `generateEmail()` → DeepSeek V4 Pro (JSON output: `{subject, body}`)
7. `sendEmail()` → Resend API with unsubscribe token
8. Random 2–4 min delay between sends

### Database (SQLite via better-sqlite3, synchronous)

4 tables: `leads`, `auditorias`, `emails_enviados`, `unsubscribes`

Partial unique index on `leads(domain) WHERE domain IS NOT NULL`.

State machine for `leads.estado`:
```
novo → sem_website | auditado → [skipped_high_score | email_gerado → enviado] | error
                                                                  └→ unsubscribed (via HTTP)
```

## Conventions

### Always Follow These

- **No `any`** — strict TypeScript with `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`
- **`interface` not `type`** for object shapes
- **`as const` + `(typeof X)[keyof typeof X]`** for enum-like discriminated unions (`EstadoLead`, `Fonte`)
- **Portuguese** for domain terms (DB columns, states, sources): `nome_empresa`, `ESTADOS_LEAD.NOVO`, `FONTE.GOOGLE_PLACES`
- **English** for technical/API terms: `GooglePlacesProvider`, `PageSpeedResult`, `SendResult`
- **camelCase** for functions/variables, **UPPER_SNAKE_CASE** for env vars
- **Barrel files** (`index.ts`) re-export from each module directory
- **Narrative logs** in Portuguese: `[Prospeção]`, `[Processar]`, etc.

### Error Handling Rules

| Scenario | Strategy |
|----------|----------|
| Config validation | `safeParse` + aggregate all Zod issues, throw single Error |
| API calls (Google/Overpass/DeepSeek) | try/catch, log, set lead state `error`, continue batch |
| Scraping (fetch) | try/catch, return safe defaults `{ email: null, isWordPress: false }` |
| Email sending (Resend) | Return `{ success: boolean, error?: string }`, never throw |
| Unsubscribe HTTP | Always return HTML page (200 or 500), never crash |
| Fatal per-lead error | Outer try/catch in main loop, set `error` state, continue |

### Import Style

- Always use `.js` extension in imports (ESM): `import { getDb } from "./client.js";`
- `import type` for type-only imports
- Use barrel files (`index.ts`) for multi-file modules

## Module Reference

### `src/config/`

| File | Exports | Notes |
|------|---------|-------|
| `env.ts` | `loadConfig()`, `getConfig()`, `EnvConfig` type | Zod schema with 11 env vars (5 API keys, 6 config) |
| `constants.ts` | `CONSTANTS`, `ESTADOS_LEAD`, `FONTE`, `EstadoLead`, `Fonte` | All runtime constants + discriminated unions |

### `src/db/`

| File | Key exports | Notes |
|------|-------------|-------|
| `client.ts` | `initDb()`, `getDb()`, `closeDb()` | Singleton connection; WAL + FK pragmas; runs schema.sql on init |
| `repository.ts` | `Lead`, `Auditoria`, `EmailEnviado`, `ProspectionInput` types; 11 query functions | All DB access; `upsertLeads` uses transactions |
| `schema.sql` | DDL | 4 tables + 1 partial unique index |

### `src/prospection/`

| File | Key exports | Notes |
|------|-------------|-------|
| `types.ts` | `ProspectionResult`, `ProspectionProvider` | Single `search(nicho, cidade, limite)` method |
| `googlePlaces.ts` | `GooglePlacesProvider` | Text Search API with 15s timeout |
| `overpass.ts` | `OverpassProvider` | OpenStreetMap fallback; niche→category mapping function |

### `src/audit/`

| File | Key exports | Notes |
|------|-------------|-------|
| `pagespeed.ts` | `auditWebsite()`, `scrapeWebsiteContactInfo()` | PageSpeed mobile strategy; email regex + WP detection from HTML |

### `src/scoring/`

| File | Key exports | Notes |
|------|-------------|-------|
| `score.ts` | `calculateScore()`, `shouldSendEmail()` | Score 0-100; `shouldSendEmail` returns true when score < threshold |

### `src/email/`

| File | Key exports | Notes |
|------|-------------|-------|
| `generateEmail.ts` | `generateEmail()` | OpenAI SDK → DeepSeek V4 Pro; JSON response format |
| `sendEmail.ts` | `sendEmail()`, `generateUnsubscribeToken()`, `buildEmailHtml()` | Resend API with List-Unsubscribe headers |

### `src/unsubscribe/`

| File | Key exports | Notes |
|------|-------------|-------|
| `server.ts` | `startUnsubscribeServer()` | Standalone HTTP server; handles `GET /?token=` |

## Types Reference

| Type | Location | Fields |
|------|----------|--------|
| `EnvConfig` | `config/env.ts` | 11 validated env vars |
| `Lead` | `db/repository.ts` | Full row: id, place_id, nome_empresa, nicho, cidade, website_url, domain, email, telefone, morada, fonte, estado, performance_score, last_contacted_at, criado_em, atualizado_em |
| `Auditoria` | `db/repository.ts` | Full row: id, lead_id, performance_score, loading_time_ms, tem_viewport_mobile (0/1), tem_https (0/1), is_wordpress (0/1), raw_json, criado_em |
| `EmailEnviado` | `db/repository.ts` | Full row: id, lead_id, assunto, corpo, resend_id, tipo, enviado_em |
| `ProspectionInput` | `db/repository.ts` | Insert subset: place_id, nome_empresa, nicho, cidade, website_url, domain, email, telefone, morada, fonte |
| `ProspectionResult` | `prospection/types.ts` | Raw result: place_id, nome_empresa, website_url, email, telefone, morada, domain |
| `ProspectionProvider` | `prospection/types.ts` | Interface: `search(nicho, cidade, limite): Promise<ProspectionResult[]>` |
| `PageSpeedResult` | `audit/pagespeed.ts` | performanceScore (0-1), loadingTimeMs, temViewportMobile, temHttps, rawJson |
| `ScoringResult` | `scoring/score.ts` | scoreFinal (0-100), details (string breakdown) |
| `GeneratedEmail` | `email/generateEmail.ts` | subject, body |
| `SendResult` | `email/sendEmail.ts` | resendId, success, error? |
| `RunStats` | `main.ts` (local) | prospetados, auditados, enviados, ignoradosScoreAlto, erros, semWebsite |

## Env Variables

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `GOOGLE_PLACES_API_KEY` | string | — | Google Places API key |
| `PAGESPEED_API_KEY` | string | — | Google PageSpeed Insights API key |
| `DEEPSEEK_API_KEY` | string | — | DeepSeek API key (`sk-...`) |
| `RESEND_API_KEY` | string | — | Resend API key (`re_...`) |
| `SENDER_EMAIL` | string (email) | — | Verified sender email |
| `TARGET_NICHE` | string | — | Niche to prospect |
| `TARGET_CITY` | string | — | City to target |
| `DAILY_LIMIT` | number | 12 | Max emails per day |
| `SCORE_THRESHOLD` | number | 60 | Score below which to send email (0-100) |
| `UNSUBSCRIBE_BASE_URL` | string (URL) | — | Public base URL for unsubscribe |
| `PORT` | number | 3000 | Unsubscribe server port |

## Invariants & Important Rules

1. **Weekend abort**: Pipeline exits immediately on Saturday/Sunday — no B2B emails on weekends
2. **Re-entry after 90 days**: Leads in `enviado` state become eligible again if `last_contacted_at` is older than 90 days and they haven't unsubscribed
3. **Daily limit**: `getLeadsSentToday()` prevents exceeding `DAILY_LIMIT`. Multiple runs per day are safe
4. **Dedup by `place_id`**: `upsertLeads` uses `ON CONFLICT(place_id) DO NOTHING` — safe to re-run prospection
5. **Domain blacklist**: Leads from domains where any lead has `unsubscribed` are filtered out during prospection
6. **Score inversion**: Lower score = worse website = SHOULD send email. `shouldSendEmail(score, threshold)` returns `true` when `score < threshold`
7. **`email_gerado` state**: Declared in `ESTADOS_LEAD` but never SET by code — the pipeline goes directly from `auditado` to `enviado`
8. **Pacing**: Random 2–4 minute delay AFTER each successful send (not between leads). Failed/errored leads don't trigger pacing
9. **Unsubscribe is idempotent**: Calling unsubscribe with the same token multiple times returns success each time
10. **DB is WAL mode**: `PRAGMA journal_mode = WAL` — supports concurrent reads during writes

## Common Task Instructions

### Adding a new prospection source
1. Implement `ProspectionProvider` interface in `src/prospection/`
2. Add the class re-export in `src/prospection/index.ts`
3. Add a new `FONTE` value in `src/config/constants.ts`
4. Wire into `runProspection()` in `src/main.ts` as a third fallback

### Changing the scoring algorithm
1. Modify `calculateScore()` in `src/scoring/score.ts`
2. Ensure result is clamped `Math.round(Math.min(100, Math.max(0, score)))`
3. Update `ScoringResult.details` string to reflect new breakdown
4. The `shouldSendEmail()` threshold check doesn't need changes

### Changing the DeepSeek prompt
1. Edit `SYSTEM_PROMPT` constant in `src/email/generateEmail.ts`
2. Edit the user message template in the same file
3. Keep `response_format: { type: "json_object" }` and the `JSON.parse()` validation

### Adding a new DB table
1. Add DDL to `src/db/schema.sql`
2. Add the interface type in `src/db/repository.ts`
3. Add query functions in `src/db/repository.ts`
4. Schema auto-runs on `initDb()` — no migration framework needed

### Debugging a failed lead
```sql
sqlite3 data/leads.db "SELECT id, nome_empresa, estado, performance_score FROM leads WHERE estado='error';"
sqlite3 data/leads.db "SELECT * FROM auditorias WHERE lead_id=<id>;"
```
