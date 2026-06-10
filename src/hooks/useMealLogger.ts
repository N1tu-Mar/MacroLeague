import { useCallback, useRef, useState } from 'react';
import {
  DatabaseError,
  logMeal,
  MealType,
  ValidationError,
} from '../services/mealLogService';
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
    return 'We could not save that meal. Please try again.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

export function useMealLogger(): {
  fields: MealLogFields;
  setField: (field: keyof MealLogFields, value: string) => void;
  mealType: MealType;
  setMealType: (type: MealType) => void;
  isSubmitting: boolean;
  error: string | null;
  submit: () => Promise<void>;
  reset: () => void;
} {
  const [fields, setFields] = useState<MealLogFields>(EMPTY_FIELDS);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(generateRequestId());

  const setField = useCallback((field: keyof MealLogFields, value: string) => {
    setFields((currentFields) => ({ ...currentFields, [field]: value }));
  }, []);

  const reset = useCallback(() => {
    setFields(EMPTY_FIELDS);
    setMealType('lunch');
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await logMeal({
        freeText: fields.freeText,
        calories: parseFormNumber('calories', fields.calories),
        proteinG: parseFormNumber('proteinG', fields.proteinG),
        carbsG: parseFormNumber('carbsG', fields.carbsG),
        fatG: parseFormNumber('fatG', fields.fatG),
        quantity: parseFormNumber('quantity', fields.quantity),
        mealType,
        clientRequestId: requestIdRef.current,
      });

      requestIdRef.current = generateRequestId();
      reset();
    } catch (caughtError) {
      setError(toUserFacingError(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }, [fields, isSubmitting, mealType, reset]);

  return {
    fields,
    setField,
    mealType,
    setMealType,
    isSubmitting,
    error,
    submit,
    reset,
  };
}
