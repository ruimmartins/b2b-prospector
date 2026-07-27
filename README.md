# Prospeção B2B Automática - PMEs Portuguesas

Script de prospeção B2B diária focado em PMEs portuguesas. Corre uma vez por dia, analisa websites com PageSpeed, gera emails hiper-personalizados em PT-PT via DeepSeek V4 Pro e envia via Resend API.

## Pré-requisitos

- **Node.js** v20+
- **npm** v10+

**Contas/API Keys necessárias:**
- Google Cloud: Places API + PageSpeed Insights API
- DeepSeek: API key
- Resend: API key + domínio verificado

## Instalação

```bash
git clone <repo-url> prospeccao-leads
cd prospeccao-leads
npm install
```

## Configuração

1. Copia o ficheiro `.env.example` para `.env`:
```bash
cp .env.example .env
```

2. Preenche as variáveis no `.env`:

| Variável | Descrição |
|----------|-----------|
| `GOOGLE_PLACES_API_KEY` | API key da Google Cloud Places API |
| `PAGESPEED_API_KEY` | API key da Google PageSpeed Insights API |
| `DEEPSEEK_API_KEY` | API key da DeepSeek (`sk-...`) |
| `RESEND_API_KEY` | API key da Resend (`re_...`) |
| `SENDER_EMAIL` | Email remetente verificado na Resend |
| `TARGET_NICHE` | Nicho/segmento a prospetar (ex: "Clínicas Dentárias") |
| `TARGET_CITY` | Cidade/localização (ex: "Lisboa, Portugal") |
| `DAILY_LIMIT` | Máximo de envios por dia (default: 12) |
| `SCORE_THRESHOLD` | Score mínimo para enviar email (0-100, default: 60). Leads com score >= threshold são ignorados |
| `UNSUBSCRIBE_BASE_URL` | URL base pública para unsubscribe (ex: `https://outreach.oteudominio.com/unsubscribe`) |
| `PORT` | Porta do servidor de unsubscribe (default: 3000) |

## Execução

### Pipeline diária (prospeção + auditoria + envio)

```bash
npx tsx src/main.ts
```

### Servidor de Unsubscribe (processo separado)

```bash
npx tsx src/unsubscribe/server.ts
```

O servidor expõe um endpoint HTTP em `/unsubscribe?token=<token>` que processa pedidos de cancelamento.

## Agendamento

### Via Crontab (Linux/macOS)

```cron
# Executar pipeline diária às 9h de segunda a sexta
0 9 * * 1-5 cd /caminho/para/prospeccao-leads && /usr/local/bin/npx tsx src/main.ts >> /var/log/prospeccao.log 2>&1

# Servidor de unsubscribe como processo permanente (reinicia se cair)
@reboot cd /caminho/para/prospeccao-leads && /usr/local/bin/npx tsx src/unsubscribe/server.ts >> /var/log/unsubscribe.log 2>&1
```

### Via GitHub Actions

```yaml
name: Prospeção Diária
on:
  schedule:
    - cron: '0 9 * * 1-5'  # 9h de segunda a sexta
  workflow_dispatch:

jobs:
  prospection:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx tsx src/main.ts
        env:
          GOOGLE_PLACES_API_KEY: ${{ secrets.GOOGLE_PLACES_API_KEY }}
          PAGESPEED_API_KEY: ${{ secrets.PAGESPEED_API_KEY }}
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          SENDER_EMAIL: ${{ secrets.SENDER_EMAIL }}
          TARGET_NICHE: ${{ secrets.TARGET_NICHE }}
          TARGET_CITY: ${{ secrets.TARGET_CITY }}
          DAILY_LIMIT: ${{ secrets.DAILY_LIMIT }}
          SCORE_THRESHOLD: ${{ secrets.SCORE_THRESHOLD }}
          UNSUBSCRIBE_BASE_URL: ${{ secrets.UNSUBSCRIBE_BASE_URL }}
```

## Estrutura do Projeto

```
prospeccao-leads/
├── src/
│   ├── config/           # Validação de envs com Zod e constantes
│   ├── db/               # SQLite schema, conexão e queries
│   ├── prospection/      # Google Places + Overpass (fallback)
│   ├── audit/            # PageSpeed + extração de email + deteção WP
│   ├── scoring/          # Cálculo de score e regras de filtro
│   ├── email/            # Geração DeepSeek + envio Resend
│   ├── unsubscribe/      # Servidor HTTP de cancelamento
│   └── main.ts           # Orquestrador da pipeline diária
├── data/                 # Base de dados SQLite (gitignored)
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Fluxo da Pipeline

1. **Guarda de fim de semana** – aborta ao Sábado e Domingo
2. **Prospeção** – Google Places API → Overpass API (fallback)
3. **Auditoria** – PageSpeed Insights (Mobile) + scrape de contactos
4. **Scoring** – cálculo de score 0-100 com base em performance, viewport, HTTPS, WordPress e tempo de carregamento
5. **Filtro** – leads com score ≥ threshold são ignorados (já têm bom website)
6. **Geração IA** – email curto e personalizado em PT-PT nativo
7. **Envio** – Resend API com headers List-Unsubscribe
8. **Pacing** – pausa aleatória de 2-4 minutos entre envios
9. **Unsubscribe** – servidor HTTP que processa cancelamentos

## Base de Dados

SQLite local (`data/leads.db`) com 4 tabelas:

- `leads` – empresas prospetadas com estado e score
- `auditorias` – detalhes da auditoria PageSpeed por lead
- `emails_enviados` – histórico de emails disparados
- `unsubscribes` – registo de cancelamentos com tokens únicos

O estado de cada lead é gerido de forma idempotente, permitindo reexecuções seguras.

## TypeScript

```bash
# Verificar tipos
npx tsc --noEmit
```
