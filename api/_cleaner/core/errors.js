export class CleanerError extends Error {
  constructor(code, message, status = 500, details = undefined, options = {}) {
    super(message);
    this.name = 'CleanerError';
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
    if (options.cause) this.cause = options.cause;
  }
}

export function isTimeoutError(error) {
  return (
    error?.code === 'timeout' ||
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError'
  );
}

export function toCleanerError(error, fallbackCode = 'internal_error') {
  if (error instanceof CleanerError) return error;
  if (isTimeoutError(error)) {
    return new CleanerError(
      'timeout',
      'Cleaner request timed out.',
      504,
      undefined,
      { cause: error },
    );
  }
  if (error?.code === 'invalid_resource' || error?.code === 'invalid_query') {
    return new CleanerError(
      error.code,
      error.message || 'Invalid Cleaner query.',
      400,
      error.details,
    );
  }
  return new CleanerError(
    fallbackCode,
    'Cleaner request failed.',
    500,
    undefined,
    { cause: error },
  );
}

export function errorBody(error) {
  const normalized = toCleanerError(error);
  return {
    error: normalized.code,
    ...(normalized.message ? { message: normalized.message } : {}),
    ...(normalized.details !== undefined
      ? { details: normalized.details }
      : {}),
  };
}
