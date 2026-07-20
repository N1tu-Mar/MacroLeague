import {
  toError,
  isOfflineError,
  isTimeoutError,
  toUserFacingMessage,
  withTimeout,
  OFFLINE_MESSAGE,
  TIMEOUT_MESSAGE,
} from '../errors';

describe('toError', () => {
  it('passes an Error through unchanged', () => {
    const original = new Error('boom');
    expect(toError(original)).toBe(original);
  });

  it('preserves Error subclasses', () => {
    class ValidationError extends Error {}
    const original = new ValidationError('bad input');
    expect(toError(original)).toBe(original);
    expect(toError(original)).toBeInstanceOf(ValidationError);
  });

  it('wraps a string', () => {
    expect(toError('plain failure').message).toBe('plain failure');
  });

  it('extracts message and code from a PostgREST-shaped object', () => {
    const result = toError({
      message: 'permission denied for table profiles',
      code: '42501',
      details: 'RLS',
      hint: 'check policies',
    });

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('permission denied for table profiles (42501)');
  });

  it('omits the parenthetical when there is no code', () => {
    expect(toError({ message: 'just a message' }).message).toBe('just a message');
  });

  it('never leaks unknown fields from the object', () => {
    const result = toError({ message: 'nope', token: 'super-secret-value' });
    expect(result.message).not.toContain('super-secret-value');
  });

  it('falls back to a generic message for unusable values', () => {
    expect(toError(null).message).toBe('Something went wrong. Please try again.');
    expect(toError(undefined).message).toBe('Something went wrong. Please try again.');
    expect(toError({}).message).toBe('Something went wrong. Please try again.');
    expect(toError('   ').message).toBe('Something went wrong. Please try again.');
  });
});

describe('isOfflineError', () => {
  it('detects the React Native fetch failure', () => {
    // The exact string users were being shown verbatim.
    expect(isOfflineError(new TypeError('Network request failed'))).toBe(true);
  });

  it('detects other transport failures', () => {
    expect(isOfflineError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isOfflineError('Network Error')).toBe(true);
    expect(isOfflineError({ message: 'connection reset' })).toBe(true);
    expect(isOfflineError(new Error('ECONNREFUSED'))).toBe(true);
  });

  it('does not misclassify real application errors', () => {
    expect(isOfflineError(new Error('Daily message limit reached.'))).toBe(false);
    expect(isOfflineError({ message: 'permission denied', code: '42501' })).toBe(false);
  });
});

describe('isTimeoutError', () => {
  it('detects an aborted request by name', () => {
    const aborted = new Error('The operation was aborted.');
    aborted.name = 'AbortError';
    expect(isTimeoutError(aborted)).toBe(true);
  });

  it('detects timeouts by message', () => {
    expect(isTimeoutError(new Error('The request timed out.'))).toBe(true);
    expect(isTimeoutError('Request timeout')).toBe(true);
  });

  it('does not misclassify unrelated errors', () => {
    expect(isTimeoutError(new Error('Invalid password.'))).toBe(false);
  });
});

describe('toUserFacingMessage', () => {
  it('replaces raw transport errors with actionable copy', () => {
    expect(toUserFacingMessage(new TypeError('Network request failed'))).toBe(OFFLINE_MESSAGE);
    expect(toUserFacingMessage(new TypeError('Network request failed'))).not.toContain('fetch');
  });

  it('replaces timeouts with actionable copy', () => {
    expect(toUserFacingMessage(new Error('The chat request timed out.'))).toBe(TIMEOUT_MESSAGE);
  });

  it('keeps deliberate, human-readable service messages intact', () => {
    // These are written for users already — rewriting them would lose meaning.
    expect(toUserFacingMessage(new Error('Daily message limit reached.'))).toBe(
      'Daily message limit reached.',
    );
  });

  it('uses the supplied fallback when no message is usable', () => {
    expect(toUserFacingMessage(null, "Couldn't load the leaderboard.")).toBe(
      "Couldn't load the leaderboard.",
    );
    expect(toUserFacingMessage({}, 'Custom fallback.')).toBe('Custom fallback.');
  });
});

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('propagates the original rejection rather than masking it as a timeout', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('server said no')), 1000),
    ).rejects.toThrow('server said no');
  });

  it('rejects with a labelled TimeoutError once the deadline passes', async () => {
    const pending = withTimeout(new Promise(() => {}), 5000, 'AI coach request');
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
      message: 'The AI coach request timed out.',
    });

    jest.advanceTimersByTime(5000);
    await assertion;
  });

  it('produces a timeout error that maps to user-facing timeout copy', async () => {
    const pending = withTimeout(new Promise(() => {}), 1000, 'request');
    const assertion = pending.catch((err) => {
      expect(toUserFacingMessage(err)).toBe(TIMEOUT_MESSAGE);
    });

    jest.advanceTimersByTime(1000);
    await assertion;
  });

  it('clears its timer when the promise resolves first', async () => {
    const clearSpy = jest.spyOn(globalThis, 'clearTimeout');
    await withTimeout(Promise.resolve('done'), 1000);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
