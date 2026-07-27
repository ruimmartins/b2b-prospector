import type { PageSpeedResult } from "../audit/pagespeed.js";
import type { Lead } from "../db/repository.js";

export interface ScoringResult {
  scoreFinal: number;
  details: string;
}

export function calculateScore(
  _lead: Lead,
  pageSpeed: PageSpeedResult,
  isWordPress: boolean
): ScoringResult {
  let score = 0;

  score += pageSpeed.performanceScore * 50;

  if (pageSpeed.temViewportMobile) {
    score += 15;
  }

  if (pageSpeed.temHttps) {
    score += 15;
  }

  if (!isWordPress) {
    score += 10;
  }

  if (pageSpeed.loadingTimeMs !== null) {
    if (pageSpeed.loadingTimeMs <= 3000) {
      score += 10;
    } else if (pageSpeed.loadingTimeMs <= 6000) {
      score += 5;
    }
  }

  const finalScore = Math.round(Math.min(100, Math.max(0, score)));

  const details = `Perf:${pageSpeed.performanceScore}, VP:${pageSpeed.temViewportMobile}, HTTPS:${pageSpeed.temHttps}, WP:${isWordPress}, Load:${pageSpeed.loadingTimeMs ?? "N/A"}ms`;

  return { scoreFinal: finalScore, details };
}

export function shouldSendEmail(scoreFinal: number, threshold: number): boolean {
  return scoreFinal < threshold;
}
