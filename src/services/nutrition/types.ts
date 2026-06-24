// Shared types for the natural-language meal estimate flow.
// These mirror the response shape of the `estimate-meal` edge function.

export type NutritionSourceKey = 'usda_fdc' | 'manual' | 'user_estimate';

/** A bundle of macros for a specific amount of food. */
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

/**
 * One parsed-and-resolved ingredient inside a composite estimate. `macros` is
 * null when no USDA match was found — that ingredient contributes nothing to the
 * summed totals (it is never silently treated as zero) and is flagged in
 * `warnings`.
 */
export interface ComponentEstimate {
  displayName: string;
  quantity: number | null;
  unit: string | null;
  /** True when the portion was assumed rather than taken from the description. */
  assumedQuantity: boolean;
  matchedName: string | null;
  externalId: string | null;
  foodId: string | null;
  servingGramWeight: number;
  servingDescription: string;
  confidence: number;
  macros: MacroBundle | null;
}

/** One candidate match the user can confirm/edit before logging. */
export interface MealEstimateCandidate {
  source: 'usda_fdc';
  externalId: string;
  /** Our cached `foods.id`, if the candidate was persisted server-side. */
  foodId: string | null;
  name: string;
  brandName: string | null;
  dataType: string | null;
  servingDescription: string;
  servingGramWeight: number;
  /** Source-mapping confidence, 0-1. Estimates only — the user edits before saving. */
  confidence: number;
  /** Macros for `servingDescription`. */
  serving: MacroBundle;
  /** Macros per 100 g, so the client can re-scale on quantity edits. */
  per100g: MacroBundle;

  // --- Optional composite fields (additive). A missing `kind` means 'direct',
  // so older candidates and clients keep working unchanged. ---
  /** 'direct' = single USDA match; 'composite' = summed multi-item estimate. */
  kind?: 'direct' | 'composite';
  /** The original free-text description (composite candidates only). */
  originalQuery?: string;
  /** Per-ingredient breakdown for a composite estimate. */
  components?: ComponentEstimate[];
  /** Portion/aggregation assumptions to show before "Use & Edit". */
  assumptions?: string[];
  /** Caveats (e.g. an ingredient with no USDA match). */
  warnings?: string[];
  /** Confidence band for a composite estimate, when available. */
  confidenceRange?: { low: number; high: number } | null;
}

export interface MealEstimateResponse {
  query: string;
  normalizedQuery: string;
  source: 'usda_fdc';
  cached: boolean;
  candidates: MealEstimateCandidate[];
}
