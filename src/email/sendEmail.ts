import { Resend } from "resend";
import crypto from "node:crypto";
import type { GeneratedEmail } from "./generateEmail.js";

export interface SendResult {
  resendId: string | null;
  success: boolean;
  error?: string;
}

export function generateUnsubscribeToken(leadId: number): string {
  return crypto
    .createHash("sha256")
    .update(`${leadId}-${Date.now()}-${crypto.randomUUID()}`)
    .digest("hex")
    .slice(0, 40);
}

export function buildEmailHtml(
  subject: string,
  body: string,
  unsubscribeUrl: string
): string {
  const paragraphs = body
    .split("\n")
    .filter((p) => p.trim())
    .map((p) => `<p>${p.trim()}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#2563eb;">${subject}</h2>
  ${paragraphs}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <p style="font-size:11px;color:#9ca3af;">
    Recebeu este email porque o seu website foi identificado numa análise de performance digital.
    <br>
    <a href="${unsubscribeUrl}" style="color:#9ca3af;">Cancelar subscrição</a>
  </p>
</body>
</html>`;
}

export async function sendEmail(
  to: string,
  from: string,
  generatedEmail: GeneratedEmail,
  unsubscribeUrl: string,
  apiKey: string
): Promise<SendResult> {
  const resend = new Resend(apiKey);

  const html = buildEmailHtml(
    generatedEmail.subject,
    generatedEmail.body,
    unsubscribeUrl
  );

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject: generatedEmail.subject,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (result.error) {
      return {
        resendId: null,
        success: false,
        error: result.error.message ?? "Erro desconhecido da Resend API",
      };
    }

    return {
      resendId: result.data?.id ?? null,
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return { resendId: null, success: false, error: message };
  }
}
