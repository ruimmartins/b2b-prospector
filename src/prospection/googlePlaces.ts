import { CONSTANTS } from "../config/index.js";
import type { ProspectionProvider, ProspectionResult } from "./types.js";

interface GooglePlaceCandidate {
  place_id: string;
  name: string;
  formatted_address?: string;
  website?: string;
  formatted_phone_number?: string;
}

interface GoogleTextSearchResponse {
  results: GooglePlaceCandidate[];
  status: string;
  error_message?: string;
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export class GooglePlacesProvider implements ProspectionProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(
    nicho: string,
    cidade: string,
    limite: number
  ): Promise<ProspectionResult[]> {
    const query = `${nicho} em ${cidade}`;
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", query);
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("language", "pt-PT");
    url.searchParams.set("region", "pt");

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      CONSTANTS.HTTP_TIMEOUT_MS
    );

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Google Places API devolveu HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as GoogleTextSearchResponse;

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        throw new Error(
          `Google Places API error: ${data.status} - ${data.error_message ?? "sem detalhes"}`
        );
      }

      if (data.status === "ZERO_RESULTS" || !data.results?.length) {
        return [];
      }

      return data.results.slice(0, limite).map((place) => ({
        place_id: place.place_id,
        nome_empresa: place.name,
        website_url: place.website ?? null,
        email: null,
        telefone: place.formatted_phone_number ?? null,
        morada: place.formatted_address ?? null,
        domain: place.website ? extractDomain(place.website) : null,
      }));
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
