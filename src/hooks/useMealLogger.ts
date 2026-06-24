import { useCallback, useRef, useState } from 'react';
import {
  DatabaseError,
  deleteMeal,
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
  /** Total fat (grams). Always the total — never relabeled as unsaturated. */
  fatG: string;
  carbsG: string;
  quantity: string;
  // Optional fat subtypes. These are EDITABLE and VISIBLE on purpose: the USDA
  // estimate populates them here rather than in a hidden ref, so what the user
  // sees is exactly what gets saved. Blank means "unknown" → saved as NULL.
  saturatedFatG: string;
  transFatG: string;
  unsaturatedFatG: string;
}

const EMPTY_FIELDS: MealLogFields = {
  freeText: '',
  calories: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
  quantity: '1',
  saturatedFatG: '',
  transFatG: '',
  unsaturatedFatG: '',
};

// Required numeric fields the user must always supply (manual or assisted).
function parseFormNumber(field: keyof MealLogFields, value: string): number {
  const parsed = Number(value);

  if (value.trim() === '' || !Number.isFinite(parsed)) {
    throw new ValidationError(field, `${field} must be a valid number.`);
  }

  return parsed;
}

/**
 * Parses an OPTIONAL numeric field. A blank field is intentionally returned as
 * `null` (not 0) so a missing fat subtype is stored as unknown. A present value
 * must be a valid non-negative number.
 */
function parseOptionalFormNumber(field: keyof MealLogFields, value: string): number | null {
  if (value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ValidationError(field, `${field} must be a non-negative number.`);
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

// A null subtype (USDA didn't report it) renders as a blank input, which then
// saves back as null — preserving "unknown" rather than inventing a 0.
function formatNullableNumeric(value: number | null): string {
  return value === null ? '' : formatNumeric(value);
}

/**
 * Provenance for an applied estimate, kept in a ref across edits. Deliberately
 * holds NO fat-subtype values: those live in the visible/editable form fields so
 * they can never go stale relative to an edited total-fat field. Non-fat extras
 * (fiber/sodium) ride along here because total-fat edits can't invalidate them.
 */
interface EstimateProvenance {
  source: MealEstimateMeta['source'];
  sourceFoodId: MealEstimateMeta['sourceFoodId'];
  confidence: MealEstimateMeta['confidence'];
  fiberG: MealEstimateMeta['fiberG'];
  sodiumMg: MealEstimateMeta['sodiumMg'];
}

export function useMealLogger(): {
  fields: MealLogFields;
  setField: (field: keyof MealLogFields, value: string) => void;
  mealType: MealType;
  setMealType: (type: MealType) => void;
  isSubmitting: boolean;
  error: string | null;
  appliedEstimateName: string | null;
  /** Non-null while editing an existing meal (submit updates instead of inserts). */
  editingId: string | null;
  applyEstimate: (candidate: MealEstimateCandidate) => void;
  /** Load an existing meal into the form to edit it in place. */
  beginEdit: (meal: MealLog) => void;
  /** Abandon an in-progress edit and clear the form. */
  cancelEdit: () => void;
  /** Delete an existing meal by id. Returns true on success. */
  removeMeal: (id: string) => Promise<boolean>;
  /**
   * Save the form. Resolves `{ logged: true }` only when a NEW meal was inserted
   * (so the caller can fire post-log XP/streak feedback); an in-place edit or any
   * failure resolves `{ logged: false }`.
   */
  submit: () => Promise<{ logged: boolean }>;
  reset: () => void;
} {
  const [fields, setFields] = useState<MealLogFields>(EMPTY_FIELDS);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedEstimateName, setAppliedEstimateName] = useState<string | null>(null);
  // When set, submit() updates this existing meal in place instead of inserting.
  const [editingId, setEditingId] = useState<string | null>(null);
  const requestIdRef = useRef(generateRequestId());
  // Provenance ONLY (no fat subtypes) for an applied estimate, carried through
  // to logMeal on submit even after the user edits the visible macros.
  const provenanceRef = useRef<EstimateProvenance | null>(null);

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
      // USDA fat breakdown goes into visible/editable fields. If total fat is
      // later edited, these stay on screen for the user to reconcile (and the
      // service rejects a breakdown that exceeds the new total).
      saturatedFatG: formatNullableNumeric(serving.saturatedFatG),
      transFatG: formatNullableNumeric(serving.transFatG),
      unsaturatedFatG: formatNullableNumeric(serving.unsaturatedFatG),
    });
    provenanceRef.current = {
      source: 'user_estimate',
      sourceFoodId: candidate.foodId,
      confidence: candidate.confidence,
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
    provenanceRef.current = null;
  }, []);

  // Load an existing meal's values (including any fat subtypes) into the form so
  // every field stays visible/editable. We do NOT restore estimate provenance:
  // editMeal() only updates macro columns and leaves source/source_food_id as-is.
  const beginEdit = useCallback((meal: MealLog) => {
    setFields({
      freeText: meal.freeText,
      calories: formatNumeric(meal.calories),
      proteinG: formatNumeric(meal.proteinG),
      carbsG: formatNumeric(meal.carbsG),
      fatG: formatNumeric(meal.fatG),
      quantity: formatNumeric(meal.quantity),
      saturatedFatG: formatNullableNumeric(meal.saturatedFatG),
      transFatG: formatNullableNumeric(meal.transFatG),
      unsaturatedFatG: formatNullableNumeric(meal.unsaturatedFatG),
    });
    setMealType(meal.mealType);
    setEditingId(meal.id);
    setAppliedEstimateName(null);
    setError(null);
    provenanceRef.current = null;
  }, []);

  const cancelEdit = useCallback(() => {
    reset();
  }, [reset]);

  const removeMeal = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    try {
      await deleteMeal(id);
      // If the row being deleted is the one loaded for editing, clear the form.
      setEditingId((current) => {
        if (current === id) {
          reset();
        }
        return current === id ? null : current;
      });
      return true;
    } catch (caughtError) {
      setError(toUserFacingError(caughtError));
      return false;
    }
  }, [reset]);

  const submit = useCallback(async (): Promise<{ logged: boolean }> => {
    if (isSubmitting) {
      return { logged: false };
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Fat subtypes come from the visible fields (blank → null), so an edited
      // total fat can never leave a stale hidden breakdown behind.
      const fatBreakdown = {
        saturatedFatG: parseOptionalFormNumber('saturatedFatG', fields.saturatedFatG),
        transFatG: parseOptionalFormNumber('transFatG', fields.transFatG),
        unsaturatedFatG: parseOptionalFormNumber('unsaturatedFatG', fields.unsaturatedFatG),
      };

      // Core macro fields shared by both the insert and update paths.
      const core = {
        freeText: fields.freeText,
        calories: parseFormNumber('calories', fields.calories),
        proteinG: parseFormNumber('proteinG', fields.proteinG),
        carbsG: parseFormNumber('carbsG', fields.carbsG),
        fatG: parseFormNumber('fatG', fields.fatG),
        quantity: parseFormNumber('quantity', fields.quantity),
        mealType,
      };

      if (editingId) {
        // Edit path: update the existing row in place. We pass the fat breakdown
        // (blank → null) so an edit can also clear a stale subtype, and we do NOT
        // mint a new idempotency key — this is an update, not a new insert.
        await editMeal(editingId, { ...core, ...fatBreakdown });
        reset();
        // An edit updates an existing row; the award trigger fires on INSERT only,
        // so no new XP/streak is granted and the caller shows no feedback.
        return { logged: false };
      }

      // Provenance (USDA food id, confidence, fiber/sodium) survives edits; an
      // un-estimated manual entry defaults to source 'manual'. The form-driven
      // fat breakdown is spread LAST so it always wins over anything else.
      const provenance: MealEstimateMeta = provenanceRef.current ?? { source: 'manual' };

      await logMeal({
        ...core,
        clientRequestId: requestIdRef.current,
        ...provenance,
        ...fatBreakdown,
      });

      // Only rotate the idempotency key after a confirmed success, so a retried
      // save reuses the same client_request_id and cannot create a duplicate.
      requestIdRef.current = generateRequestId();
      reset();
      return { logged: true };
    } catch (caughtError) {
      setError(toUserFacingError(caughtError));
      return { logged: false };
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
    removeMeal,
    submit,
    reset,
  };
}
