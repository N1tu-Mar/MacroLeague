// USDA FoodData Central client + nutrient mapping.
//
// This module lives inside the edge function (NOT in the Expo `src/` tree) on
// purpose: it holds the logic that touches the USDA API key, and the key must
// never reach the client. The Expo app only ever calls the edge function.
//
// FDC `/foods/search` returns nutrient values per 100 g for all data types, so
// we treat `foodNutrients[].value` as per-100g and scale to a serving here.

import { MacroBundle, deriveUnsaturated, round, scale } from './shared.ts';
// Re-exported so existing callers (composite.ts, index.ts) keep working
// unchanged — MacroBundle/round/scale/normalizeQuery now live in shared.ts
// since openFoodFacts.ts needs them too.
export type { MacroBundle } from './shared.ts';
export { round, scale, normalizeQuery } from './shared.ts';

const FDC_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// USDA nutrient numbers (stable string identifiers in the FDC payload).
const NUTRIENT = {
  energyKcal: '208',
  protein: '203',
  carbs: '205',
  totalFat: '204',
  saturatedFat: '606',
  transFat: '605',
  monoFat: '645',
  polyFat: '646',
  fiber: '291',
  sodium: '307',
} as const;

export interface UsdaCandidate {
  source: 'usda_fdc';
  externalId: string;
  name: string;
  brandName: string | null;
  dataType: string | null;
  servingDescription: string;
  servingGramWeight: number;
  confidence: number;
  // Macros for the described serving.
  serving: MacroBundle;
  // Macros per 100 g (kept so the client can re-scale if the user edits qty).
  per100g: MacroBundle;
  rawPayload: unknown;
}

interface FdcNutrient {
  nutrientNumber?: string;
  unitName?: string;
  value?: number;
}

interface FdcFood {
  fdcId: number;
  description?: string;
  dataType?: string;
  brandName?: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: FdcNutrient[];
}

function nutrientValue(food: FdcFood, number: string, preferUnit?: string): number | null {
  const matches = (food.foodNutrients ?? []).filter((n) => n.nutrientNumber === number);
  if (matches.length === 0) return null;

  const preferred = preferUnit
    ? matches.find((n) => (n.unitName ?? '').toUpperCase() === preferUnit)
    : undefined;
  const chosen = preferred ?? matches[0];

  return typeof chosen.value === 'number' ? chosen.value : null;
}

function per100gMacros(food: FdcFood): MacroBundle {
  const totalFat = nutrientValue(food, NUTRIENT.totalFat);
  const saturated = nutrientValue(food, NUTRIENT.saturatedFat);
  const trans = nutrientValue(food, NUTRIENT.transFat);
  const mono = nutrientValue(food, NUTRIENT.monoFat);
  const poly = nutrientValue(food, NUTRIENT.polyFat);

  return {
    calories: round(nutrientValue(food, NUTRIENT.energyKcal, 'KCAL') ?? 0),
    proteinG: round(nutrientValue(food, NUTRIENT.protein) ?? 0),
    carbsG: round(nutrientValue(food, NUTRIENT.carbs) ?? 0),
    fatG: round(totalFat ?? 0),
    saturatedFatG: saturated === null ? null : round(saturated),
    transFatG: trans === null ? null : round(trans),
    unsaturatedFatG: deriveUnsaturated(totalFat, saturated, trans, mono, poly),
    fiberG: ((v) => (v === null ? null : round(v)))(nutrientValue(food, NUTRIENT.fiber)),
    sodiumMg: ((v) => (v === null ? null : round(v)))(nutrientValue(food, NUTRIENT.sodium)),
  };
}

function servingGrams(food: FdcFood): { grams: number; description: string } {
  const unit = (food.servingSizeUnit ?? '').toLowerCase();
  if (typeof food.servingSize === 'number' && food.servingSize > 0 && (unit === 'g' || unit === 'grm')) {
    return { grams: food.servingSize, description: `${round(food.servingSize)} g` };
  }
  // No usable gram serving — default to 100 g so the per-100g macros are shown directly.
  return { grams: 100, description: '100 g' };
}

function confidenceFor(food: FdcFood, per100g: MacroBundle): number {
  const byType: Record<string, number> = {
    Foundation: 0.7,
    'SR Legacy': 0.65,
    'Survey (FNDDS)': 0.6,
    Branded: 0.6,
  };
  let score = byType[food.dataType ?? ''] ?? 0.5;
  if (per100g.calories <= 0) score *= 0.5;
  if (per100g.proteinG > 0 && per100g.carbsG > 0 && per100g.fatG > 0) score += 0.05;
  return Math.max(0.3, Math.min(0.9, round(score, 3)));
}

function toCandidate(food: FdcFood): UsdaCandidate {
  const per100g = per100gMacros(food);
  const { grams, description } = servingGrams(food);
  return {
    source: 'usda_fdc',
    externalId: String(food.fdcId),
    name: food.description ?? 'Unknown food',
    brandName: food.brandName ?? food.brandOwner ?? null,
    dataType: food.dataType ?? null,
    servingDescription: description,
    servingGramWeight: round(grams),
    confidence: confidenceFor(food, per100g),
    serving: scale(per100g, grams),
    per100g,
    rawPayload: food,
  };
}

/** Search USDA FoodData Central and map the top results into candidates. */
export async function searchUsda(
  apiKey: string,
  normalizedQuery: string,
  pageSize: number,
): Promise<UsdaCandidate[]> {
  const response = await fetch(FDC_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      query: normalizedQuery,
      pageSize,
      // Prefer whole-food data types over branded for natural-language meals.
      dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded'],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`USDA FDC search failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const json = (await response.json()) as { foods?: FdcFood[] };
  return (json.foods ?? []).map(toCandidate);
}
