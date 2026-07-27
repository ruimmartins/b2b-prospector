import { CONSTANTS } from "../config/index.js";

export interface PageSpeedResult {
  performanceScore: number;
  loadingTimeMs: number | null;
  temViewportMobile: boolean;
  temHttps: boolean;
  rawJson: string | null;
}

interface LighthouseCategory {
  score: number;
}

interface LighthouseAudit {
  score: number;
  numericValue: number;
}

interface PageSpeedResponse {
  lighthouseResult?: {
    categories?: {
      performance?: LighthouseCategory;
    };
    audits?: Record<string, LighthouseAudit>;
    finalUrl?: string;
  };
  error?: { message: string };
}

export async function auditWebsite(
  url: string,
  apiKey: string
): Promise<PageSpeedResult> {
  const psUrl = new URL(CONSTANTS.PAGESPEED_BASE_URL);
  psUrl.searchParams.set("url", url);
  psUrl.searchParams.set("key", apiKey);
  psUrl.searchParams.set("strategy", "mobile");
  psUrl.searchParams.set("locale", "pt");

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONSTANTS.PAGESPEED_TIMEOUT_MS
  );

  try {
    const response = await fetch(psUrl.toString(), {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `PageSpeed API devolveu HTTP ${response.status}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as PageSpeedResponse;

    if (data.error) {
      throw new Error(`PageSpeed API error: ${data.error.message}`);
    }

    const lhr = data.lighthouseResult;
    const score = lhr?.categories?.performance?.score ?? 0;
    const interactive =
      lhr?.audits?.["interactive"]?.numericValue ?? null;

    const finalUrl = lhr?.finalUrl ?? url;
    const temHttps = finalUrl.startsWith("https://");
    const temViewportMobile =
      lhr?.audits?.["viewport"]?.score === 1;

    return {
      performanceScore: score,
      loadingTimeMs: interactive ? Math.round(interactive) : null,
      temViewportMobile,
      temHttps,
      rawJson: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function scrapeWebsiteContactInfo(
  url: string
): Promise<{ email: string | null; isWordPress: boolean }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONSTANTS.HTTP_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; B2BProspector/1.0; +https://prospeccao.pt)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return { email: null, isWordPress: false };
    }

    const html = await response.text();
    const isWordPress = html.includes("wp-content") || html.includes("wp-json");

    const emailPatterns = [
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    ];

    const foundEmails = new Set<string>();
    for (const pattern of emailPatterns) {
      for (const match of html.matchAll(pattern)) {
        const email = match[1] ?? match[0];
        if (email && !email.includes("example.com") && !email.includes("domain.com")) {
          foundEmails.add(email);
        }
      }
    }

    const emailList = [...foundEmails];
    const email =
      emailList.find((e) => e.includes("geral") || e.includes("info") || e.includes("contacto")) ??
      emailList[0] ??
      null;

    return { email, isWordPress };
  } catch {
    return { email: null, isWordPress: false };
  } finally {
    clearTimeout(timeoutId);
  }
}
