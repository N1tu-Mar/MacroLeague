import { useCallback, useRef, useState } from 'react';
import {
  DatabaseError,
  editMeal,
  logMeal,
  MealEstimateMeta,
  MealLog,
  MealType,
  ValidationError,
} from '../services/mealLogService';
import { MealEstimateCandidate } from '../services/nutrition/types';
import { generateRequestId } from '../utils/clientRequestId';

export interface MealLogFields {
  freeText: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  quantity: string;
}

const EMPTY_FIELDS: MealLogFields = {
  freeText: '',
  calories: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
  quantity: '1',
};

function parseFormNumber(field: keyof MealLogFields, value: string): number {
  const parsed = Number(value);

  if (value.trim() === '' || !Number.isFinite(parsed)) {
    throw new ValidationError(field, `${field} must be a valid number.`);
  }

  return parsed;
}

function toUserFacingError(error: unknown): string {
  if (error instanceof ValidationError) {
    return error.message;
  }

  if (error instanceof DatabaseError) {
    // describeDbError already turned the Postgres failure into plain language,
    // so show it instead of an opaque "please try again" that hides the cause.
    console.error('[useMealLogger] save failed', error.code, error.cause ?? error);
    return error.message || 'We could not save that meal. Please try again.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function formatNumeric(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

export function useMealLogger(): {
  fields: MealLogFields;
  setField: (field: keyof MealLogFields, value: string) => void;
  mealType: MealType;
  setMealType: (type: MealType) => void;
  isSubmitting: boolean;
  error: string | null;
  appliedEstimateName: string | null;
  editingId: string | null;
  applyEstimate: (candidate: MealEstimateCandidate) => void;
  beginEdit: (meal: MealLog) => void;
  cancelEdit: () => void;
  submit: () => Promise<MealLog | null>;
  reset: () => void;
} {
  const [fields, setFields] = useState<MealLogFields>(EMPTY_FIELDS);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedEstimateName, setAppliedEstimateName] = useState<string | null>(null);
  // When set, submit() updates this existing meal instead of inserting a new one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const requestIdRef = useRef(generateRequestId());
  // Provenance for an applied estimate, carried through to logMeal on submit.
  const metaRef = useRef<MealEstimateMeta | null>(null);

  const setField = useCallback((field: keyof MealLogFields, value: string) => {
    setFields((currentFields) => ({ ...currentFields, [field]: value }));
  }, []);

  const applyEstimate = useCallback((candidate: MealEstimateCandidate) => {
    const { serving } = candidate;
    setFields({
      // meal_logs.free_text is capped at 200 chars; USDA names can be longer.
      freeText: candidate.name.slice(0, 200),
      calories: formatNumeric(serving.calories),
      proteinG: formatNumeric(serving.proteinG),
      carbsG: formatNumeric(serving.carbsG),
      fatG: formatNumeric(serving.fatG),
      quantity: '1',
    });
    metaRef.current = {
      source: 'user_estimate',
      sourceFoodId: candidate.foodId,
      confidence: candidate.confidence,
      saturatedFatG: serving.saturatedFatG,
      transFatG: serving.transFatG,
      unsaturatedFatG: serving.unsaturatedFatG,
      fiberG: serving.fiberG,
      sodiumMg: serving.sodiumMg,
    };
    setAppliedEstimateName(candidate.name);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setFields(EMPTY_FIELDS);
    setMealType('lunch');
    setError(null);
    setAppliedEstimateName(null);
    setEditingId(null);
    metaRef.current = null;
  }, []);

  const beginEdit = useCallback((meal: MealLog) => {
    setFields({
      freeText: meal.freeText,
      calories: formatNumeric(meal.calories),
      proteinG: formatNumeric(meal.proteinG),
      carbsG: formatNumeric(meal.carbsG),
      fatG: formatNumeric(meal.fatG),
      quantity: formatNumeric(meal.quantity),
    });
    setMealType(meal.mealType);
    setEditingId(meal.id);
    setAppliedEstimateName(null);
    setError(null);
    metaRef.current = null;
  }, []);

  const cancelEdit = useCallback(() => {
    reset();
  }, [reset]);

  const submit = useCallback(async (): Promise<MealLog | null> => {
    if (isSubmitting) {
      return null;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const parsed = {
        freeText: fields.freeText,
        calories: parseFormNumber('calories', fields.calories),
        proteinG: parseFormNumber('proteinG', fields.proteinG),
        carbsG: parseFormNumber('carbsG', fields.carbsG),
        fatG: parseFormNumber('fatG', fields.fatG),
        quantity: parseFormNumber('quantity', fields.quantity),
        mealType,
      };

      // Edit path: update the existing row in place (no new idempotency key).
      if (editingId) {
        const updated = await editMeal(editingId, parsed);
        reset();
        return updated;
      }

      const saved = await logMeal({
        ...parsed,
        clientRequestId: requestIdRef.current,
        // Default manual provenance; an applied estimate (metaRef) overrides it.
        source: 'manual',
        ...(metaRef.current ?? {}),
      });

      // Only rotate the idempotency key after a confirmed success so a retried
      // save reuses the same client_request_id and cannot create a duplicate.
      requestIdRef.current = generateRequestId();
      reset();
      return saved;
    } catch (caughtError) {
      setError(toUserFacingError(caughtError));
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [fields, isSubmitting, mealType, editingId, reset]);

  return {
    fields,
    setField,
    mealType,
    setMealType,
    isSubmitting,
    error,
    appliedEstimateName,
    editingId,
    applyEstimate,
    beginEdit,
    cancelEdit,
    submit,
    reset,
  };
}
