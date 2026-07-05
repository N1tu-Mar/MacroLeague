// Open Food Facts client + nutrient mapping.
//
// Complements USDA FoodData Central: OFF is crowdsourced, barcode-first, and
// strongest on branded/packaged products worldwide, including non-US brands
// USDA doesn't carry. No API key is required for reads — OFF's fair-use policy
// only asks for a descriptive User-Agent. This queries live, on demand, exactly
// like usda.ts (the caller in index.ts caches results the same way). Bulk-
// mirroring OFF's full data export is a separate, much larger effort and is
// NOT what this module does — see the nutrition-database-sourcing memo.
//
// IMPORTANT UNIT NOTE: OFF reports sodium in GRAMS per 100 g (`sodium_100g`),
// not milligrams like USDA's nutrient 307. We convert to mg here so nothing
// downstream has to know which source a candidate came from.

import { MacroBundle, deriveUnsaturated, round, scale } from './shared.ts';

const OFF_SEARCH_URL = 'https://search.openfoodfacts.org/search';
// Required by OFF's fair-use policy: identify the app + a contact address.
// Reuses the same support address already published in the App Store / Play
// listings (see docs/deployment.md).
const USER_AGENT = 'MacroLeague/1.0 (nityanth.maramreddy@gmail.com)';

export interface OffCandidate {
  source: 'open_food_facts';
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

interface OffNutriments {
  'energy-kcal_100g'?: number;
  'energy-kj_100g'?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  'saturated-fat_100g'?: number;
  'trans-fat_100g'?: number;
  fiber_100g?: number;
  sodium_100g?: number;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  // search-a-licious returns this as a string[] (e.g. ["Nutella"]); the legacy
  // /cgi/search.pl endpoint instead returns a comma-separated string. Handle
  // both defensively rather than assuming one shape.
  brands?: string[] | string;
  serving_size?: string;
  completeness?: number;
  nutriments?: OffNutriments;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstBrand(brands: string[] | string | undefined): string | null {
  if (Array.isArray(brands)) {
    return brands[0]?.trim() || null;
  }
  if (typeof brands === 'string') {
    return brands.split(',')[0]?.trim() || null;
  }
  return null;
}

function per100gMacros(n: OffNutriments): MacroBundle {
  const totalFat = num(n.fat_100g);
  const saturated = num(n['saturated-fat_100g']);
  const trans = num(n['trans-fat_100g']);
  const fiber = num(n.fiber_100g);
  const sodiumG = num(n.sodium_100g);

  const kcal = num(n['energy-kcal_100g']);
  const kj = num(n['energy-kj_100g']);
  const calories = kcal ?? (kj !== null ? kj / 4.184 : null);

  return {
    calories: round(calories ?? 0),
    proteinG: round(num(n.proteins_100g) ?? 0),
    carbsG: round(num(n.carbohydrates_100g) ?? 0),
    fatG: round(totalFat ?? 0),
    saturatedFatG: saturated === null ? null : round(saturated),
    transFatG: trans === null ? null : round(trans),
    // OFF doesn't report mono/poly fat separately, so this falls back to
    // total - saturated - trans, same as USDA does when mono/poly are absent.
    unsaturatedFatG: deriveUnsaturated(totalFat, saturated, trans, null, null),
    fiberG: fiber === null ? null : round(fiber),
    sodiumMg: sodiumG === null ? null : round(sodiumG * 1000),
  };
}

// OFF's serving_size is a free-text string ("30 g", "1 bar (40g)", "250ml"...)
// with no separate numeric+unit pair like USDA. Pull a trailing gram figure
// out of it when present; otherwise default to 100 g — same honest fallback
// usda.ts uses when it can't find a usable gram serving.
function servingGrams(product: OffProduct): { grams: number; description: string } {
  const raw = product.serving_size?.trim();
  if (raw) {
    const match = raw.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
    if (match) {
      const grams = parseFloat(match[1].replace(',', '.'));
      if (Number.isFinite(grams) && grams > 0) {
        return { grams, description: raw };
      }
    }
  }
  return { grams: 100, description: '100 g' };
}

function confidenceFor(product: OffProduct, per100g: MacroBundle): number {
  // OFF is crowdsourced — anchor to its own per-product completeness score
  // rather than a fixed per-data-type table like USDA's Foundation/Branded/etc.
  const completeness = num(product.completeness) ?? 0.5;
  let score = 0.35 + completeness * 0.4; // base range 0.35–0.75
  if (per100g.calories <= 0) score *= 0.5;
  if (per100g.proteinG > 0 && per100g.carbsG > 0 && per100g.fatG > 0) score += 0.05;
  // Lower ceiling than USDA's 0.9 to reflect materially less curation.
  return Math.max(0.25, Math.min(0.8, round(score, 3)));
}

/** Maps one OFF product to a candidate, or null if it's unusable (no real
 *  nutrition data, no name, or no barcode to key on). Never fabricates a
 *  candidate around missing data — same honesty rule the composite estimator
 *  applies to unmatched ingredients. */
function toCandidate(product: OffProduct): OffCandidate | null {
  // Products without a barcode have no stable external_id to cache against
  // (foods_source_external_id is unique per source+external_id) — skip them
  // rather than risk collisions on a fallback key.
  if (!product.code) {
    return null;
  }
  const name = (product.product_name_en || product.product_name || '').trim();
  if (!name) {
    return null;
  }
  const per100g = per100gMacros(product.nutriments ?? {});
  if (per100g.calories <= 0 && per100g.proteinG <= 0 && per100g.carbsG <= 0 && per100g.fatG <= 0) {
    return null;
  }
  const { grams, description } = servingGrams(product);
  return {
    source: 'open_food_facts',
    externalId: product.code,
    name,
    brandName: firstBrand(product.brands),
    dataType: 'Open Food Facts',
    servingDescription: description,
    servingGramWeight: round(grams),
    confidence: confidenceFor(product, per100g),
    serving: scale(per100g, grams),
    per100g,
    rawPayload: product,
  };
}

/** Search Open Food Facts (search-a-licious) and map the top results into
 *  candidates. No API key required for reads. */
export async function searchOpenFoodFacts(
  normalizedQuery: string,
  pageSize: number,
): Promise<OffCandidate[]> {
  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set('q', normalizedQuery);
  url.searchParams.set('page_size', String(pageSize));

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Open Food Facts search failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const json = (await response.json()) as { hits?: OffProduct[] };
  return (json.hits ?? [])
    .map(toCandidate)
    .filter((c): c is OffCandidate => c !== null);
}
