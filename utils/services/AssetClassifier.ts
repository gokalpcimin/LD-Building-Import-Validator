import type { AssetType } from '../../types';
import { ASSET_KEYWORD_RULES } from '../rules/assetRules';

export interface AssetClassification {
  assetType: AssetType;
  /** 0–1 scale (1 = highest-confidence keyword match). */
  confidence: number;
  matchedKeywords: string[];
  needsReview: boolean;
}

/** Normalize Outlet/Location text for deterministic matching. */
export function normalizeClassificationText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_/\\|,;:]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s+#.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordToPattern(keyword: string): RegExp {
  const escaped = keyword
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  // Phrase boundaries: avoid matching "wc" inside unrelated tokens.
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
}

interface TypeScore {
  score: number;
  matchedKeywords: string[];
  bestKeywordLength: number;
}

/**
 * Weighted keyword classifier for Monthly Outlet (and other free-text locations).
 * Prefers the highest score; on ties, the longer (more specific) keyword wins.
 */
export function classifyAssetFromText(rawText: string): AssetClassification {
  const normalized = normalizeClassificationText(rawText);
  if (!normalized) {
    return {
      assetType: 'Unknown',
      confidence: 0,
      matchedKeywords: [],
      needsReview: true,
    };
  }

  const scores = new Map<AssetType, TypeScore>();

  for (const rule of ASSET_KEYWORD_RULES) {
    if (rule.weight <= 0) {
      continue;
    }
    if (!keywordToPattern(rule.keyword).test(normalized)) {
      continue;
    }

    const existing = scores.get(rule.assetType);
    if (!existing || rule.weight > existing.score) {
      // New best score for this type — keep only the keyword that earned it.
      scores.set(rule.assetType, {
        score: rule.weight,
        matchedKeywords: [rule.keyword],
        bestKeywordLength: rule.keyword.length,
      });
    } else if (rule.weight === existing.score) {
      if (!existing.matchedKeywords.includes(rule.keyword)) {
        existing.matchedKeywords.push(rule.keyword);
      }
      if (rule.keyword.length > existing.bestKeywordLength) {
        existing.bestKeywordLength = rule.keyword.length;
      }
    }
  }

  if (scores.size === 0) {
    return {
      assetType: 'Unknown',
      confidence: 0,
      matchedKeywords: [],
      needsReview: true,
    };
  }

  let winner: AssetType = 'Unknown';
  let winnerScore = -1;
  let winnerKeywordLength = -1;
  let winnerKeywords: string[] = [];

  for (const [assetType, entry] of scores) {
    if (
      entry.score > winnerScore ||
      (entry.score === winnerScore && entry.bestKeywordLength > winnerKeywordLength)
    ) {
      winner = assetType;
      winnerScore = entry.score;
      winnerKeywordLength = entry.bestKeywordLength;
      winnerKeywords = entry.matchedKeywords;
    }
  }

  const confidence = Math.min(1, Math.max(0, winnerScore / 100));
  // Soft matches (< 100) always need a human look; Unknown already flagged.
  const needsReview = winner === 'Unknown' || winnerScore < 100;

  return {
    assetType: winner,
    confidence,
    matchedKeywords: winnerKeywords,
    needsReview,
  };
}
