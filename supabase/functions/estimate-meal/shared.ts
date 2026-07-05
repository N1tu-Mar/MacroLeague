// Cross-provider helpers shared by usda.ts and openFoodFacts.ts.
//
// Kept provider-agnostic on purpose: both nutrition sources map their raw
// response into the same per-100g MacroBundle shape, so search/composite/index
// can treat any source's candidates identically.

export interface MacroBundle {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  saturatedFatG: number | null;
  transFatG: number | null;
  unsaturatedFatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
}

/** One resolved food candidate, independent of which provider produced it. */
export interface SourceCandidate {
  source: string;
  externalId: string;
  name: string;
  brandName: string | null;
  dataType: string | null;
  servingDescription: string;
  servingGramWeight: number;
  confidence: number;
  serving: MacroBundle;
  per100g: MacroBundle;
  rawPayload: unknown;
}

/** Lowercase, strip punctuation, and collapse whitespace for cache + search. */
export function normalizeQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Re-express a per-100g bundle at an arbitrary gram amount. */
export function scale(per100g: MacroBundle, grams: number): MacroBundle {
  const factor = grams / 100;
  const opt = (v: number | null) => (v === null ? null : round(v * factor));
  return {
    calories: round(per100g.calories * factor),
    proteinG: round(per100g.proteinG * factor),
    carbsG: round(per100g.carbsG * factor),
    fatG: round(per100g.fatG * factor),
    saturatedFatG: opt(per100g.saturatedFatG),
    transFatG: opt(per100g.transFatG),
    unsaturatedFatG: opt(per100g.unsaturatedFatG),
    fiberG: opt(per100g.fiberG),
    sodiumMg: opt(per100g.sodiumMg),
  };
}

/** Derive unsaturated fat from mono/poly if reported, else total-saturated-trans. */
export function deriveUnsaturated(
  totalFat: number | null,
  saturated: number | null,
  trans: number | null,
  mono: number | null,
  poly: number | null,
): number | null {
  if (mono !== null || poly !== null) {
    return round((mono ?? 0) + (poly ?? 0));
  }
  if (totalFat !== null && saturated !== null) {
    return round(Math.max(0, totalFat - saturated - (trans ?? 0)));
  }
  return null;
}
