import { supabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/errors';
import { DatabaseError } from '../mealLogService';
import {
  MealEstimateCandidate,
  MealEstimateResponse,
} from './types';

// Client-side entry point for natural-language meal estimation.
//
// IMPORTANT: this service never calls USDA FoodData Central directly. It invokes
// the `estimate-meal` Supabase edge function, which holds the USDA API key
// server-side and caches results. Calling USDA from the app would leak the key.

/** Upper bound on an estimate lookup before we surface a timeout. */
const ESTIMATE_TIMEOUT_MS = 20_000;

export class EstimateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EstimateError';
  }
}

export interface EstimateMealParams {
  query: string;
  /** Number of candidate matches to request (clamped server-side to 1-10). */
  pageSize?: number;
}

function isResponseShape(value: unknown): value is MealEstimateResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { candidates?: unknown }).candidates)
  );
}

/**
 * Estimates macros for a free-text meal description via the edge function.
 * Returns one or more candidates the user can confirm/edit before logging.
 */
export async function estimateMeal(
  params: EstimateMealParams,
): Promise<MealEstimateResponse> {
  const query = params.query.trim();
  if (query.length < 2) {
    throw new EstimateError('Please describe your meal in at least 2 characters.');
  }

  // Bounded so a stalled connection can't leave the meal logger stuck in its
  // searching state forever. Shorter than the chat budget: this is a lookup
  // against a cache-backed function, not an LLM completion.
  const { data, error } = await withTimeout(
    supabase.functions.invoke('estimate-meal', {
      body: { query, pageSize: params.pageSize },
    }),
    ESTIMATE_TIMEOUT_MS,
    'meal estimate request',
  );

  if (error) {
    // FunctionsHttpError exposes the JSON body the function returned.
    const message = await extractFunctionError(error);
    throw new EstimateError(message);
  }

  if (!isResponseShape(data)) {
    throw new DatabaseError('Estimate service returned an unexpected response.', data);
  }

  return data;
}

async function extractFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const body = await context.json();
      if (body && typeof body.error === 'string') {
        return body.error;
      }
    } catch {
      // fall through to generic message
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Could not estimate macros for that meal. Please try again.';
}

/** Re-scales a candidate's per-100g macros to an arbitrary gram amount. */
export function scaleCandidate(
  candidate: MealEstimateCandidate,
  grams: number,
): MealEstimateCandidate['serving'] {
  const factor = grams / 100;
  const opt = (v: number | null) => (v === null ? null : round(v * factor));
  const { per100g } = candidate;
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

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
