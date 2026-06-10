import { supabase } from '../lib/supabase';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealLog {
  id: string;
  userId: string;
  foodId: string | null;
  freeText: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  quantity: number;
  mealType: MealType;
  eatenAt: string;
  clientRequestId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
}

export interface LogMealParams {
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

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'DatabaseError';
    this.cause = cause;
  }
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

const ZERO_TOTALS: DailyTotals = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  mealCount: 0,
};

function normalizeNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
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

function validateNumber(field: string, value: number, min: number, minLabel: string): void {
  if (!Number.isFinite(value) || value < min) {
    throw new ValidationError(field, `${field} must be ${minLabel}.`);
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

  validateNumber('calories', validated.calories, 0, 'a non-negative number');
  validateNumber('proteinG', validated.proteinG, 0, 'a non-negative number');
  validateNumber('carbsG', validated.carbsG, 0, 'a non-negative number');
  validateNumber('fatG', validated.fatG, 0, 'a non-negative number');
  validateNumber('quantity', validated.quantity, Number.MIN_VALUE, 'greater than 0');
  validateMealType(validated.mealType);
  validateDate('eatenAt', validated.eatenAt);
  validateClientRequestId(validated.clientRequestId);

  return validated;
}

function validateEditableFields(params: Partial<EditableMealFields>): Partial<EditableMealFields> {
  const validated: Partial<EditableMealFields> = { ...params };

  if (params.freeText !== undefined) {
    validated.freeText = validateFreeText(params.freeText);
  }
  if (params.calories !== undefined) {
    validateNumber('calories', params.calories, 0, 'a non-negative number');
  }
  if (params.proteinG !== undefined) {
    validateNumber('proteinG', params.proteinG, 0, 'a non-negative number');
  }
  if (params.carbsG !== undefined) {
    validateNumber('carbsG', params.carbsG, 0, 'a non-negative number');
  }
  if (params.fatG !== undefined) {
    validateNumber('fatG', params.fatG, 0, 'a non-negative number');
  }
  if (params.quantity !== undefined) {
    validateNumber('quantity', params.quantity, Number.MIN_VALUE, 'greater than 0');
  }
  if (params.mealType !== undefined) {
    validateMealType(params.mealType);
  }
  if (params.eatenAt !== undefined) {
    validateDate('eatenAt', params.eatenAt);
  }

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

    throw new DatabaseError('Unable to log meal.', error);
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

export async function getDailyTotals(date: Date, timezone: string): Promise<DailyTotals> {
  const meals = await getMealsForDay(date, timezone);

  if (meals.length === 0) {
    return { ...ZERO_TOTALS };
  }

  return meals.reduce<DailyTotals>(
    (totals, meal) => ({
      calories: totals.calories + meal.calories * meal.quantity,
      proteinG: totals.proteinG + meal.proteinG * meal.quantity,
      carbsG: totals.carbsG + meal.carbsG * meal.quantity,
      fatG: totals.fatG + meal.fatG * meal.quantity,
      mealCount: totals.mealCount + 1,
    }),
    { ...ZERO_TOTALS }
  );
}

export async function editMeal(
  id: string,
  params: Partial<EditableMealFields>
): Promise<MealLog> {
  const validated = validateEditableFields(params);
  const updatePayload: Record<string, string | number> = {
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
