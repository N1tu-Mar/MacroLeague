import { supabase } from '../lib/supabase';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { reportError } from '../lib/monitoring';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

// 'manual'        = user typed every macro themselves.
// 'usda_fdc'      = (reserved) a direct, unedited USDA row.
// 'user_estimate' = a USDA-derived estimate the user reviewed/edited/confirmed.
// NULL on a row   = legacy meal logged before `source` existed; treated as manual.
export type MealSource = 'manual' | 'usda_fdc' | 'user_estimate';

/**
 * Optional provenance + extended-nutrition fields written when a meal comes from
 * the natural-language estimate flow. All nullable so the manual path is
 * unaffected and existing callers need not pass them.
 *
 * IMPORTANT (fat model): `fatG` on the meal is ALWAYS total fat. The three
 * subtype fields below are independent, individually-nullable values:
 *   - saturatedFatG   = saturated fat
 *   - transFatG       = trans fat
 *   - unsaturatedFatG = unsaturated fat (mono + poly)
 * A null subtype means "not known" and must never be coerced to 0.
 */
export interface MealEstimateMeta {
  source?: MealSource | null;
  sourceFoodId?: string | null;
  confidence?: number | null;
  saturatedFatG?: number | null;
  transFatG?: number | null;
  unsaturatedFatG?: number | null;
  fiberG?: number | null;
  sodiumMg?: number | null;
}

export interface MealLog {
  id: string;
  userId: string;
  foodId: string | null;
  freeText: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  /** Total fat (grams). Never relabel this as unsaturated fat. */
  fatG: number;
  quantity: number;
  mealType: MealType;
  eatenAt: string;
  clientRequestId: string;
  createdAt: string;
  updatedAt: string;
  // --- Provenance + fat subtypes (migration 0003; nullable for legacy rows). ---
  /** NULL is a legacy row → treat as a manual log. */
  source: MealSource | null;
  sourceFoodId: string | null;
  confidence: number | null;
  /** Subtype grams, per single serving (×quantity for totals). NULL = unknown. */
  saturatedFatG: number | null;
  transFatG: number | null;
  unsaturatedFatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  userConfirmedAt: string | null;
}

/**
 * Running total for one fat subtype across a day's meals. Because a subtype can
 * be unknown (null) on any given meal, we deliberately track coverage instead of
 * silently summing nulls as zero — the UI uses `knownCount`/`missingCount` to
 * show an honest "Not available" / "partial" state instead of false precision.
 */
export interface FatSubtypeTotal {
  /** Sum of (subtype × quantity) over only the meals where the value is known. */
  grams: number;
  /** Number of the day's meals that supplied a value. */
  knownCount: number;
  /** Number of the day's meals where the value was null/unknown. */
  missingCount: number;
}

export interface DailyTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  /** Total fat — always summed; the schema keeps `fat_g` not-null. */
  fatG: number;
  mealCount: number;
  // Fat subtypes are coverage-aware so the UI never invents missing data.
  saturatedFat: FatSubtypeTotal;
  transFat: FatSubtypeTotal;
  unsaturatedFat: FatSubtypeTotal;
}

export interface LogMealParams extends MealEstimateMeta {
  freeText: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  quantity: number;
  mealType: MealType;
  eatenAt?: Date;
  clientRequestId: string;
}

export type EditableMealFields = Omit<LogMealParams, 'clientRequestId'>;

type ValidatedLogMealParams = Omit<LogMealParams, 'eatenAt' | 'freeText'> & {
  freeText: string;
  eatenAt: Date;
};

type MealLogRow = {
  id: string;
  user_id: string;
  food_id: string | null;
  free_text: string;
  calories: number | string;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
  quantity: number | string;
  meal_type: MealType;
  eaten_at: string;
  client_request_id: string;
  created_at: string;
  updated_at: string;
  // Nullable provenance + fat-subtype columns added in migration 0003. Older
  // rows predate these columns, so every one can come back null.
  source: MealSource | null;
  source_food_id: string | null;
  confidence: number | string | null;
  saturated_fat_g: number | string | null;
  trans_fat_g: number | string | null;
  unsaturated_fat_g: number | string | null;
  fiber_g: number | string | null;
  sodium_mg: number | string | null;
  user_confirmed_at: string | null;
};

type DbErrorShape = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export class ValidationError extends Error {
  field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class DatabaseError extends Error {
  cause: unknown;
  code?: string;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'DatabaseError';
    this.cause = cause;
    if (isDbError(cause) && typeof cause.code === 'string') {
      this.code = cause.code;
    }
  }
}

/**
 * Builds a human-readable, support-friendly description of a Postgres/PostgREST
 * error so save failures stop collapsing into an opaque generic string.
 */
export function describeDbError(error: unknown): string {
  if (!isDbError(error)) {
    return 'Unknown database error.';
  }

  const code = error.code ?? '';

  // Map the failure modes that actually block meal inserts to plain language.
  if (code === '23503') {
    // foreign_key_violation — almost always a missing profile row for this user.
    return 'Your profile is not set up yet. Please finish onboarding, then try again.';
  }
  if (code === '42501' || /row-level security/i.test(error.message ?? '')) {
    return 'You are not signed in with permission to save this meal. Please sign in again.';
  }
  if (code === '23514') {
    return `That meal breaks a data rule (${error.details ?? error.message ?? 'check constraint'}).`;
  }
  if (code === '23502') {
    return 'A required field is missing.';
  }

  const parts = [error.message, error.details, error.hint].filter(Boolean);
  return parts.length > 0 ? parts.join(' — ') : 'Database request failed.';
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A subtype total that no meal has contributed to yet. */
function emptySubtypeTotal(): FatSubtypeTotal {
  return { grams: 0, knownCount: 0, missingCount: 0 };
}

const ZERO_TOTALS: DailyTotals = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  mealCount: 0,
  saturatedFat: emptySubtypeTotal(),
  transFat: emptySubtypeTotal(),
  unsaturatedFat: emptySubtypeTotal(),
};

function normalizeNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

/**
 * Numeric columns that can be null (fat subtypes, confidence). Returns null when
 * the DB value is null/undefined/non-finite so "unknown" never becomes a fake 0.
 */
function normalizeNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = normalizeNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapMealLog(row: MealLogRow): MealLog {
  return {
    id: row.id,
    userId: row.user_id,
    foodId: row.food_id,
    freeText: row.free_text,
    calories: normalizeNumber(row.calories),
    proteinG: normalizeNumber(row.protein_g),
    carbsG: normalizeNumber(row.carbs_g),
    fatG: normalizeNumber(row.fat_g),
    quantity: normalizeNumber(row.quantity),
    mealType: row.meal_type,
    eatenAt: row.eaten_at,
    clientRequestId: row.client_request_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source ?? null,
    sourceFoodId: row.source_food_id ?? null,
    confidence: normalizeNullableNumber(row.confidence),
    saturatedFatG: normalizeNullableNumber(row.saturated_fat_g),
    transFatG: normalizeNullableNumber(row.trans_fat_g),
    unsaturatedFatG: normalizeNullableNumber(row.unsaturated_fat_g),
    fiberG: normalizeNullableNumber(row.fiber_g),
    sodiumMg: normalizeNullableNumber(row.sodium_mg),
    userConfirmedAt: row.user_confirmed_at ?? null,
  };
}

function isDbError(error: unknown): error is DbErrorShape {
  return typeof error === 'object' && error !== null;
}

function isIdempotencyViolation(error: unknown): boolean {
  if (!isDbError(error)) {
    return false;
  }

  const detailText = `${error.message ?? ''} ${error.details ?? ''}`;
  return error.code === '23505' && detailText.includes('meal_logs_idempotency');
}

function validateFreeText(freeText: string): string {
  const trimmed = freeText.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    throw new ValidationError('freeText', 'Food name must be between 1 and 200 characters.');
  }
  return trimmed;
}

// Per-meal upper bounds. These mirror the DB CHECK constraints (migration 0014)
// so an absurd single-meal value is rejected with a clear message client-side
// rather than as a raw DB error — and so it can't auto-satisfy every macro bonus.
const MEAL_MAX = {
  calories: 10000,
  proteinG: 1000,
  carbsG: 1000,
  fatG: 1000,
  quantity: 50,
} as const;

function validateNumber(
  field: string,
  value: number,
  min: number,
  minLabel: string,
  max: number = Number.POSITIVE_INFINITY,
): void {
  if (!Number.isFinite(value) || value < min) {
    throw new ValidationError(field, `${field} must be ${minLabel}.`);
  }
  if (value > max) {
    throw new ValidationError(field, `${field} must be ${max} or less.`);
  }
}

function validateMealType(mealType: MealType): void {
  if (!MEAL_TYPES.includes(mealType)) {
    throw new ValidationError('mealType', 'Meal type must be breakfast, lunch, dinner, or snack.');
  }
}

function validateDate(field: string, value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new ValidationError(field, `${field} must be a valid date.`);
  }
}

function validateClientRequestId(clientRequestId: string): void {
  if (!UUID_V4_PATTERN.test(clientRequestId)) {
    throw new ValidationError('clientRequestId', 'Request ID must be a UUID v4.');
  }
}

function validateLogMealParams(params: LogMealParams): ValidatedLogMealParams {
  const eatenAt = params.eatenAt ?? new Date();

  const validated = {
    ...params,
    freeText: validateFreeText(params.freeText),
    eatenAt,
  };

  validateNumber('calories', validated.calories, 0, 'a non-negative number', MEAL_MAX.calories);
  validateNumber('proteinG', validated.proteinG, 0, 'a non-negative number', MEAL_MAX.proteinG);
  validateNumber('carbsG', validated.carbsG, 0, 'a non-negative number', MEAL_MAX.carbsG);
  validateNumber('fatG', validated.fatG, 0, 'a non-negative number', MEAL_MAX.fatG);
  validateNumber('quantity', validated.quantity, Number.MIN_VALUE, 'greater than 0', MEAL_MAX.quantity);
  validateMealType(validated.mealType);
  validateDate('eatenAt', validated.eatenAt);
  validateClientRequestId(validated.clientRequestId);
  validateOptionalMeta(validated);
  // NOTE: we deliberately do NOT block a meal whose fat subtypes sum to more
  // than its total fat. USDA rounding and honest user edits routinely produce a
  // small mismatch, and hard-rejecting the save trapped users who couldn't log a
  // legitimate meal. Subtypes are still validated as non-negative in
  // validateOptionalMeta; over-limit trans fat is surfaced as a soft, dismissible
  // warning in the UI (see MealLoggerScreen), never a block.

  return validated;
}

function validateOptionalMeta(meta: MealEstimateMeta): void {
  const nonNegativeFields: (keyof MealEstimateMeta)[] = [
    'saturatedFatG',
    'transFatG',
    'unsaturatedFatG',
    'fiberG',
    'sodiumMg',
  ];
  for (const field of nonNegativeFields) {
    const value = meta[field];
    if (value !== undefined && value !== null) {
      validateNumber(field, value as number, 0, 'a non-negative number');
    }
  }
  if (meta.confidence !== undefined && meta.confidence !== null) {
    if (!Number.isFinite(meta.confidence) || meta.confidence < 0 || meta.confidence > 1) {
      throw new ValidationError('confidence', 'confidence must be between 0 and 1.');
    }
  }
}

function buildMetaPayload(meta: MealEstimateMeta): Record<string, string | number | null> {
  const payload: Record<string, string | number | null> = {};
  if (meta.source !== undefined) payload.source = meta.source;
  if (meta.sourceFoodId !== undefined) payload.source_food_id = meta.sourceFoodId;
  if (meta.confidence !== undefined) payload.confidence = meta.confidence;
  if (meta.saturatedFatG !== undefined) payload.saturated_fat_g = meta.saturatedFatG;
  if (meta.transFatG !== undefined) payload.trans_fat_g = meta.transFatG;
  if (meta.unsaturatedFatG !== undefined) payload.unsaturated_fat_g = meta.unsaturatedFatG;
  if (meta.fiberG !== undefined) payload.fiber_g = meta.fiberG;
  if (meta.sodiumMg !== undefined) payload.sodium_mg = meta.sodiumMg;
  // Mark when an estimate (non-manual source) was confirmed by the user.
  if (meta.source !== undefined && meta.source !== null && meta.source !== 'manual') {
    payload.user_confirmed_at = new Date().toISOString();
  }
  return payload;
}

function validateEditableFields(params: Partial<EditableMealFields>): Partial<EditableMealFields> {
  const validated: Partial<EditableMealFields> = { ...params };

  if (params.freeText !== undefined) {
    validated.freeText = validateFreeText(params.freeText);
  }
  if (params.calories !== undefined) {
    validateNumber('calories', params.calories, 0, 'a non-negative number', MEAL_MAX.calories);
  }
  if (params.proteinG !== undefined) {
    validateNumber('proteinG', params.proteinG, 0, 'a non-negative number', MEAL_MAX.proteinG);
  }
  if (params.carbsG !== undefined) {
    validateNumber('carbsG', params.carbsG, 0, 'a non-negative number', MEAL_MAX.carbsG);
  }
  if (params.fatG !== undefined) {
    validateNumber('fatG', params.fatG, 0, 'a non-negative number', MEAL_MAX.fatG);
  }
  if (params.quantity !== undefined) {
    validateNumber('quantity', params.quantity, Number.MIN_VALUE, 'greater than 0', MEAL_MAX.quantity);
  }
  if (params.mealType !== undefined) {
    validateMealType(params.mealType);
  }
  if (params.eatenAt !== undefined) {
    validateDate('eatenAt', params.eatenAt);
  }
  validateOptionalMeta(params);

  return validated;
}

async function getAuthenticatedUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new DatabaseError('Unable to verify the current user.', error);
  }
  if (!data.user) {
    throw new NotFoundError('No authenticated user found.');
  }
  return data.user.id;
}

function getUtcDayRange(date: Date, timezone: string): { start: Date; end: Date } {
  validateDate('date', date);

  const zonedDate = toZonedTime(date, timezone);
  const startInZone = new Date(
    zonedDate.getFullYear(),
    zonedDate.getMonth(),
    zonedDate.getDate(),
    0,
    0,
    0,
    0
  );
  const endInZone = new Date(
    zonedDate.getFullYear(),
    zonedDate.getMonth(),
    zonedDate.getDate() + 1,
    0,
    0,
    0,
    0
  );

  return {
    start: fromZonedTime(startInZone, timezone),
    end: fromZonedTime(endInZone, timezone),
  };
}

export async function logMeal(params: LogMealParams): Promise<MealLog> {
  const validated = validateLogMealParams(params);
  const userId = await getAuthenticatedUserId();

  const insertPayload = {
    user_id: userId,
    food_id: null,
    free_text: validated.freeText,
    calories: validated.calories,
    protein_g: validated.proteinG,
    carbs_g: validated.carbsG,
    fat_g: validated.fatG,
    quantity: validated.quantity,
    meal_type: validated.mealType,
    eaten_at: validated.eatenAt.toISOString(),
    client_request_id: validated.clientRequestId,
    ...buildMetaPayload(validated),
  };

  const { data, error } = await supabase
    .from('meal_logs')
    .insert(insertPayload)
    .select('*')
    .single<MealLogRow>();

  if (error) {
    if (isIdempotencyViolation(error)) {
      const { data: existingRow, error: existingError } = await supabase
        .from('meal_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('client_request_id', validated.clientRequestId)
        .single<MealLogRow>();

      if (existingError || !existingRow) {
        throw new DatabaseError('Meal was already logged, but the existing row could not be loaded.', existingError);
      }

      return mapMealLog(existingRow);
    }

    // Route through Sentry rather than console: a raw PostgrestError `details`
    // string can echo row values (e.g. the meal free_text) into device logs.
    reportError(error, { context: 'mealLogService.logMeal' });
    throw new DatabaseError(describeDbError(error), error);
  }

  if (!data) {
    throw new DatabaseError('Unable to log meal.', new Error('Insert returned no row.'));
  }

  return mapMealLog(data);
}

export async function getMealsForDay(date: Date, timezone: string): Promise<MealLog[]> {
  const userId = await getAuthenticatedUserId();
  const { start, end } = getUtcDayRange(date, timezone);

  const { data, error } = await supabase
    .from('meal_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('eaten_at', start.toISOString())
    .lt('eaten_at', end.toISOString())
    .order('eaten_at', { ascending: true })
    .returns<MealLogRow[]>();

  if (error) {
    throw new DatabaseError('Unable to load meals for the selected day.', error);
  }

  return (data ?? []).map(mapMealLog);
}

/**
 * Folds one meal's subtype value into a running FatSubtypeTotal. A null value
 * counts toward `missingCount` (so the UI can flag incomplete coverage) and is
 * NOT added to `grams`; a known value is scaled by quantity and summed.
 */
function accumulateSubtype(
  running: FatSubtypeTotal,
  value: number | null,
  quantity: number,
): FatSubtypeTotal {
  if (value === null) {
    return { ...running, missingCount: running.missingCount + 1 };
  }
  return {
    grams: running.grams + value * quantity,
    knownCount: running.knownCount + 1,
    missingCount: running.missingCount,
  };
}

/**
 * Pure reducer: sums already-loaded meals into daily totals. Kept separate from
 * the DB call so callers that already hold the day's rows (useDailyTotals) can
 * compute totals in memory without a second `meal_logs` query. Quantity is
 * applied consistently to every macro and known fat subtype.
 */
export function sumMealTotals(meals: MealLog[]): DailyTotals {
  if (meals.length === 0) {
    return {
      ...ZERO_TOTALS,
      saturatedFat: emptySubtypeTotal(),
      transFat: emptySubtypeTotal(),
      unsaturatedFat: emptySubtypeTotal(),
    };
  }

  return meals.reduce<DailyTotals>(
    (totals, meal) => ({
      calories: totals.calories + meal.calories * meal.quantity,
      proteinG: totals.proteinG + meal.proteinG * meal.quantity,
      carbsG: totals.carbsG + meal.carbsG * meal.quantity,
      fatG: totals.fatG + meal.fatG * meal.quantity,
      mealCount: totals.mealCount + 1,
      saturatedFat: accumulateSubtype(totals.saturatedFat, meal.saturatedFatG, meal.quantity),
      transFat: accumulateSubtype(totals.transFat, meal.transFatG, meal.quantity),
      unsaturatedFat: accumulateSubtype(totals.unsaturatedFat, meal.unsaturatedFatG, meal.quantity),
    }),
    {
      ...ZERO_TOTALS,
      saturatedFat: emptySubtypeTotal(),
      transFat: emptySubtypeTotal(),
      unsaturatedFat: emptySubtypeTotal(),
    },
  );
}

export async function getDailyTotals(date: Date, timezone: string): Promise<DailyTotals> {
  const meals = await getMealsForDay(date, timezone);
  return sumMealTotals(meals);
}

export async function editMeal(
  id: string,
  params: Partial<EditableMealFields>
): Promise<MealLog> {
  const validated = validateEditableFields(params);
  // `null` is allowed so a blank fat subtype clears the column back to unknown.
  const updatePayload: Record<string, string | number | null> = {
    updated_at: new Date().toISOString(),
  };

  if (validated.freeText !== undefined) updatePayload.free_text = validated.freeText;
  if (validated.calories !== undefined) updatePayload.calories = validated.calories;
  if (validated.proteinG !== undefined) updatePayload.protein_g = validated.proteinG;
  if (validated.carbsG !== undefined) updatePayload.carbs_g = validated.carbsG;
  if (validated.fatG !== undefined) updatePayload.fat_g = validated.fatG;
  if (validated.quantity !== undefined) updatePayload.quantity = validated.quantity;
  if (validated.mealType !== undefined) updatePayload.meal_type = validated.mealType;
  if (validated.eatenAt !== undefined) updatePayload.eaten_at = validated.eatenAt.toISOString();
  // Fat subtypes travel on edits too; a blank/null value is written as SQL NULL
  // (not 0) so "unknown" stays unknown after an edit.
  if (validated.saturatedFatG !== undefined) updatePayload.saturated_fat_g = validated.saturatedFatG;
  if (validated.transFatG !== undefined) updatePayload.trans_fat_g = validated.transFatG;
  if (validated.unsaturatedFatG !== undefined) updatePayload.unsaturated_fat_g = validated.unsaturatedFatG;
  if (validated.fiberG !== undefined) updatePayload.fiber_g = validated.fiberG;
  if (validated.sodiumMg !== undefined) updatePayload.sodium_mg = validated.sodiumMg;

  const { data, error } = await supabase
    .from('meal_logs')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .maybeSingle<MealLogRow>();

  if (error) {
    throw new DatabaseError('Unable to update meal.', error);
  }

  if (!data) {
    throw new NotFoundError('Meal not found.');
  }

  return mapMealLog(data);
}

export async function deleteMeal(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('meal_logs')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new DatabaseError('Unable to delete meal.', error);
  }

  if (!data) {
    throw new NotFoundError('Meal not found.');
  }
}
