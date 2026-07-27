import { z } from "zod";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const envSchema = z.object({
  GOOGLE_PLACES_API_KEY: z.string().min(1, "GOOGLE_PLACES_API_KEY é obrigatória"),
  PAGESPEED_API_KEY: z.string().min(1, "PAGESPEED_API_KEY é obrigatória"),
  DEEPSEEK_API_KEY: z.string().min(1, "DEEPSEEK_API_KEY é obrigatória"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY é obrigatória"),
  SENDER_EMAIL: z.string().email("SENDER_EMAIL deve ser um email válido"),
  TARGET_NICHE: z.string().min(1, "TARGET_NICHE é obrigatório"),
  TARGET_CITY: z.string().min(1, "TARGET_CITY é obrigatório"),
  DAILY_LIMIT: z.coerce.number().int().positive().default(12),
  SCORE_THRESHOLD: z.coerce.number().int().min(0).max(100).default(60),
  UNSUBSCRIBE_BASE_URL: z.string().url("UNSUBSCRIBE_BASE_URL deve ser um URL válido"),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type EnvConfig = z.infer<typeof envSchema>;

let validatedEnv: EnvConfig | null = null;

export function loadConfig(): EnvConfig {
  if (validatedEnv) return validatedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuração de ambiente inválida:\n${errors}`);
  }

  validatedEnv = result.data;
  return validatedEnv;
}

export function getConfig(): EnvConfig {
  if (!validatedEnv) {
    throw new Error("Config não foi inicializada. Chame loadConfig() primeiro.");
  }
  return validatedEnv;
}
