import crypto from "node:crypto";
import { CONSTANTS } from "../config/index.js";
import type { ProspectionProvider, ProspectionResult } from "./types.js";

interface OverpassElement {
  type: string;
  id: number;
  tags: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function extractDomainFromTags(tags: Record<string, string>): string | null {
  const website = tags.website ?? tags["contact:website"] ?? tags.url ?? null;
  if (!website) return null;
  try {
    const parsed = new URL(
      website.startsWith("http") ? website : `https://${website}`
    );
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function extractWebsite(tags: Record<string, string>): string | null {
  const raw = tags.website ?? tags["contact:website"] ?? tags.url ?? null;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("http")) return trimmed;
  return `https://${trimmed}`;
}

function extractEmail(tags: Record<string, string>): string | null {
  return tags.email ?? tags["contact:email"] ?? null;
}

function extractPhone(tags: Record<string, string>): string | null {
  return tags.phone ?? tags["contact:phone"] ?? null;
}

function extractAddress(tags: Record<string, string>): string | null {
  const parts = [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:postcode"],
    tags["addr:city"],
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function generatePlaceId(tags: Record<string, string>, cidade: string): string {
  const name = tags.name ?? tags["brand"] ?? "unknown";
  const raw = `${name}|${cidade}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function buildCategoriaQuery(nicho: string): string {
  const lower = nicho.toLowerCase();

  if (lower.includes("clínica") || lower.includes("dentária") || lower.includes("médica")) {
    return '["amenity"="clinic"]';
  }
  if (lower.includes("restaurante") || lower.includes("café") || lower.includes("restauração")) {
    return '["amenity"="restaurant"]';
  }
  if (lower.includes("hotel") || lower.includes("alojamento")) {
    return '["tourism"="hotel"]';
  }
  if (lower.includes("farmácia")) {
    return '["amenity"="pharmacy"]';
  }
  if (lower.includes("advogado") || lower.includes("escritório")) {
    return '["office"~"lawyer|notary"]';
  }

  return `["name"~"${nicho}",i]`;
}

export class OverpassProvider implements ProspectionProvider {
  async search(
    nicho: string,
    cidade: string,
    limite: number
  ): Promise<ProspectionResult[]> {
    const categoriaQuery = buildCategoriaQuery(nicho);

    const query = `
      [out:json][timeout:15];
      area["name"="${cidade}"]["admin_level"="7"]->.city;
      (
        node${categoriaQuery}(area.city);
        way${categoriaQuery}(area.city);
        relation${categoriaQuery}(area.city);
      );
      out body ${CONSTANTS.OVERPASS_MAX_NODES};
    `;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      CONSTANTS.HTTP_TIMEOUT_MS
    );

    try {
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: query,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Overpass API devolveu HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as OverpassResponse;

      if (!data.elements?.length) {
        return [];
      }

      return data.elements.slice(0, limite).map((el) => ({
        place_id: generatePlaceId(el.tags, cidade),
        nome_empresa: el.tags.name ?? el.tags["brand"] ?? "Desconhecido",
        website_url: extractWebsite(el.tags),
        email: extractEmail(el.tags),
        telefone: extractPhone(el.tags),
        morada: extractAddress(el.tags),
        domain: extractDomainFromTags(el.tags),
      }));
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
