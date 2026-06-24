// Composite-meal assembly.
//
// Takes a parsed ingredient list (from parser.ts) plus a `resolve` function that
// returns the best USDA match for a single ingredient, then deterministically
// scales and SUMS USDA nutrient values. No nutrition value is ever invented here
// — every macro comes from a USDA per-100g bundle scaled by a gram amount.
//
// Honesty rules baked in:
//   - A component with no USDA match contributes NOTHING and is flagged as a
//     warning (never silently treated as zero).
//   - A fat subtype is summed only when EVERY contributing component reports it;
//     if any is unknown, the composite subtype is null (unknown), not a partial
//     sum masquerading as a complete one.
//   - Portion assumptions are recorded per component so the UI can show them.

import { MacroBundle, round, scale } from './usda.ts';
import { ParsedComponent, ParsedMeal } from './parser.ts';

/** One parsed ingredient resolved (or not) against USDA. */
export interface ComponentEstimate {
  displayName: string;
  quantity: number | null;
  unit: string | null;
  assumedQuantity: boolean;
  matchedName: string | null;
  externalId: string | null;
  foodId: string | null;
  servingGramWeight: number;
  servingDescription: string;
  confidence: number;
  /** USDA macros for this component's grams; null when no match was found. */
  macros: MacroBundle | null;
}

/** The minimal shape `buildComposite` needs from a resolved USDA candidate. */
export interface ResolvedFood {
  externalId: string;
  foodId: string | null;
  name: string;
  per100g: MacroBundle;
  servingGramWeight: number;
  confidence: number;
}

export interface CompositeEstimate {
  components: ComponentEstimate[];
  summed: MacroBundle;
  totalGrams: number;
  per100g: MacroBundle;
  confidence: number;
  confidenceRange: { low: number; high: number };
  assumptions: string[];
  warnings: string[];
}

// Mass units we can convert to grams exactly. Anything else (count/volume) uses
// the matched food's serving weight as one portion and flags the assumption.
const MASS_UNITS: Record<string, number> = {
  g: 1, gram: 1, grams: 1, gm: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  lb: 453.59, lbs: 453.59, pound: 453.59, pounds: 453.59,
};

// Clamp a single component so a hallucinated "500 lb of butter" can't blow up totals.
const MAX_COMPONENT_GRAMS = 2000;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Decide the gram weight (and human description) for one parsed component. */
function componentGrams(
  parsed: ParsedComponent,
  food: ResolvedFood,
): { grams: number; assumed: boolean; description: string } {
  const unit = (parsed.unit ?? '').toLowerCase();
  const massFactor = MASS_UNITS[unit];

  // Known mass unit + explicit quantity → exact grams, no assumption.
  if (parsed.quantity !== null && massFactor !== undefined) {
    const grams = clamp(round(parsed.quantity * massFactor), 0, MAX_COMPONENT_GRAMS);
    return { grams, assumed: false, description: `${grams} g` };
  }

  // Otherwise scale the matched food's serving by the count (default 1) and flag
  // the portion as assumed.
  const portion = food.servingGramWeight > 0 ? food.servingGramWeight : 100;
  const count = parsed.quantity ?? 1;
  const grams = clamp(round(portion * count), 0, MAX_COMPONENT_GRAMS);
  const description =
    count === 1
      ? `1 serving (~${round(portion)} g)`
      : `${count} × ~${round(portion)} g`;
  return { grams, assumed: true, description };
}

/** Sum macros across resolved components, keeping subtype coverage honest. */
function sumMacros(list: MacroBundle[]): MacroBundle {
  // A subtype sums only if every component reports it; otherwise it's unknown.
  const sumOpt = (key: keyof MacroBundle): number | null => {
    if (list.some((m) => m[key] === null)) {
      return null;
    }
    return round(list.reduce((acc, m) => acc + (m[key] as number), 0));
  };
  return {
    calories: round(list.reduce((acc, m) => acc + m.calories, 0)),
    proteinG: round(list.reduce((acc, m) => acc + m.proteinG, 0)),
    carbsG: round(list.reduce((acc, m) => acc + m.carbsG, 0)),
    fatG: round(list.reduce((acc, m) => acc + m.fatG, 0)),
    saturatedFatG: sumOpt('saturatedFatG'),
    transFatG: sumOpt('transFatG'),
    unsaturatedFatG: sumOpt('unsaturatedFatG'),
    fiberG: sumOpt('fiberG'),
    sodiumMg: sumOpt('sodiumMg'),
  };
}

/** Re-express a summed bundle (for `totalGrams`) as a per-100g bundle. */
function toPer100g(summed: MacroBundle, totalGrams: number): MacroBundle {
  if (totalGrams <= 0) {
    return summed;
  }
  const factor = 100 / totalGrams;
  const opt = (v: number | null) => (v === null ? null : round(v * factor));
  return {
    calories: round(summed.calories * factor),
    proteinG: round(summed.proteinG * factor),
    carbsG: round(summed.carbsG * factor),
    fatG: round(summed.fatG * factor),
    saturatedFatG: opt(summed.saturatedFatG),
    transFatG: opt(summed.transFatG),
    unsaturatedFatG: opt(summed.unsaturatedFatG),
    fiberG: opt(summed.fiberG),
    sodiumMg: opt(summed.sodiumMg),
  };
}

/**
 * Build a composite estimate by resolving each parsed component against USDA and
 * summing the results. Returns null when NOTHING matched (so the caller can fall
 * back to whole-query search). `resolve` is injected so this module never talks
 * to USDA or Supabase directly.
 */
export async function buildComposite(
  parsed: ParsedMeal,
  resolve: (name: string) => Promise<ResolvedFood | null>,
): Promise<CompositeEstimate | null> {
  const components: ComponentEstimate[] = [];
  const assumptions: string[] = [];
  const warnings: string[] = [...parsed.warnings];

  for (const parsedComponent of parsed.components) {
    const food = await resolve(parsedComponent.name);

    if (!food) {
      // Partial estimate: record the miss, contribute zero macros, warn the user.
      components.push({
        displayName: parsedComponent.name,
        quantity: parsedComponent.quantity,
        unit: parsedComponent.unit,
        assumedQuantity: parsedComponent.assumedQuantity,
        matchedName: null,
        externalId: null,
        foodId: null,
        servingGramWeight: 0,
        servingDescription: 'no USDA match',
        confidence: 0,
        macros: null,
      });
      warnings.push(`No USDA match for "${parsedComponent.name}" — it is not included in the totals.`);
      continue;
    }

    const { grams, assumed, description } = componentGrams(parsedComponent, food);
    components.push({
      displayName: parsedComponent.name,
      quantity: parsedComponent.quantity,
      unit: parsedComponent.unit,
      assumedQuantity: assumed || parsedComponent.assumedQuantity,
      matchedName: food.name,
      externalId: food.externalId,
      foodId: food.foodId,
      servingGramWeight: round(grams),
      servingDescription: description,
      confidence: food.confidence,
      macros: scale(food.per100g, grams),
    });
    if (assumed) {
      assumptions.push(`Assumed ${description} for "${parsedComponent.name}".`);
    }
  }

  const resolved = components.filter((c): c is ComponentEstimate & { macros: MacroBundle } =>
    c.macros !== null,
  );
  if (resolved.length === 0) {
    return null;
  }

  const summed = sumMacros(resolved.map((c) => c.macros));
  const totalGrams = round(resolved.reduce((acc, c) => acc + c.servingGramWeight, 0));
  const per100g = toPer100g(summed, totalGrams);

  // Composite confidence is deliberately conservative: anchored to the weakest
  // component match and discounted because summing whole foods approximates a
  // real plate. Exposed as a range so the UI can show honest uncertainty.
  const confs = resolved.map((c) => c.confidence);
  const minC = Math.min(...confs);
  const avgC = confs.reduce((acc, c) => acc + c, 0) / confs.length;
  const confidence = clamp(round(minC * 0.85, 3), 0.2, 0.7);
  const confidenceRange = {
    low: clamp(round(minC * 0.7, 3), 0.15, 0.7),
    high: clamp(round(avgC, 3), 0.2, 0.8),
  };

  assumptions.unshift(
    'Composite estimate: macros are summed from one USDA match per item. Review and edit before saving.',
  );

  return { components, summed, totalGrams, per100g, confidence, confidenceRange, assumptions, warnings };
}
