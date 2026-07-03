import { useCallback, useRef, useState } from 'react';
import {
  EstimateError,
  estimateMeal,
} from '../services/nutrition/mealEstimateService';
import { DatabaseError } from '../services/mealLogService';
import { MealEstimateCandidate } from '../services/nutrition/types';

function toUserFacingError(error: unknown): string {
  if (error instanceof EstimateError) {
    return error.message;
  }
  if (error instanceof DatabaseError) {
    return 'We could not estimate that meal. Please try again.';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function useMealEstimate(): {
  query: string;
  setQuery: (value: string) => void;
  candidates: MealEstimateCandidate[];
  isEstimating: boolean;
  cached: boolean;
  error: string | null;
  estimate: () => Promise<void>;
  reset: () => void;
} {
  const [query, setQueryState] = useState('');
  const [candidates, setCandidates] = useState<MealEstimateCandidate[]>([]);
  const [isEstimating, setIsEstimating] = useState(false);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const activeRequest = useRef<number | null>(null);

  const setQuery = useCallback((value: string) => {
    // Changing the text invalidates both the visible old candidates and any
    // response still in flight for the previous description.
    requestSequence.current += 1;
    setQueryState(value);
    setCandidates([]);
    setCached(false);
    setError(null);
  }, []);

  const estimate = useCallback(async () => {
    if (activeRequest.current !== null) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setError('Please describe your meal in at least 2 characters.');
      return;
    }

    const requestId = ++requestSequence.current;
    activeRequest.current = requestId;
    setIsEstimating(true);
    setError(null);

    try {
      const result = await estimateMeal({ query: trimmed });
      if (requestId !== requestSequence.current) return;
      setCandidates(result.candidates);
      setCached(result.cached);
      if (result.candidates.length === 0) {
        setError('No matches found. Try simpler keywords, then edit the macros before saving.');
      }
    } catch (caughtError) {
      if (requestId !== requestSequence.current) return;
      setCandidates([]);
      setError(toUserFacingError(caughtError));
    } finally {
      if (activeRequest.current === requestId) {
        activeRequest.current = null;
        setIsEstimating(false);
      }
    }
  }, [query]);

  const reset = useCallback(() => {
    requestSequence.current += 1;
    setQueryState('');
    setCandidates([]);
    setCached(false);
    setError(null);
  }, []);

  return { query, setQuery, candidates, isEstimating, cached, error, estimate, reset };
}
