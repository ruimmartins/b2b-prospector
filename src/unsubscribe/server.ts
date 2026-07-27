import http from "node:http";
import { loadConfig } from "../config/env.js";
import { initDb, closeDb } from "../db/client.js";
import {
  getLeadByUnsubscribeToken,
  upsertUnsubscribe,
  updateLeadEstado,
} from "../db/repository.js";
import { ESTADOS_LEAD } from "../config/constants.js";

function buildResponse(
  res: http.ServerResponse,
  statusCode: number,
  body: string,
  contentType = "text/html; charset=utf-8"
): void {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
}

const PAGE_HTML = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><title>Cancelar Subscrição</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px;text-align:center;">
  <h1 style="color:#2563eb;">Subscrição Cancelada</h1>
  <p>O seu email foi removido da nossa lista de contactos.</p>
  <p>Não voltará a receber comunicações nossas.</p>
  <a href="/" style="color:#9ca3af;">Voltar</a>
</body>
</html>`;

const ERROR_HTML = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><title>Erro</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px;text-align:center;">
  <h1 style="color:#dc2626;">Erro</h1>
  <p>Ocorreu um erro ao processar o pedido.</p>
  <p>Se o problema persistir, contacte-nos diretamente.</p>
</body>
</html>`;

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (req.method !== "GET") {
    return buildResponse(res, 405, "Method Not Allowed");
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const token = url.searchParams.get("token");

  if (!token) {
    return buildResponse(res, 400, "Token em falta");
  }

  try {
    const lead = getLeadByUnsubscribeToken(token);

    if (lead) {
      updateLeadEstado(lead.id, ESTADOS_LEAD.UNSUBSCRIBED);
    } else {
      upsertUnsubscribe(-1, token);
      return buildResponse(res, 200, PAGE_HTML);
    }

    upsertUnsubscribe(lead.id, token);
    updateLeadEstado(lead.id, ESTADOS_LEAD.UNSUBSCRIBED);

    return buildResponse(res, 200, PAGE_HTML);
  } catch (err) {
    console.error("Erro no processamento de unsubscribe:", err);
    return buildResponse(res, 500, ERROR_HTML);
  }
}

export function startUnsubscribeServer(port: number): http.Server {
  const config = loadConfig();
  initDb();

  const server = http.createServer(handleRequest);

  server.listen(port, () => {
    console.log(`[Unsubscribe] Servidor a correr em http://localhost:${port}`);
    console.log(
      `[Unsubscribe] URL base: ${config.UNSUBSCRIBE_BASE_URL}?token=<token>`
    );
  });

  process.on("SIGINT", () => {
    console.log("\n[Unsubscribe] A encerrar...");
    server.close();
    closeDb();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    server.close();
    closeDb();
    process.exit(0);
  });

  return server;
}

const port = parseInt(process.env.PORT ?? "3000", 10);
startUnsubscribeServer(port);
