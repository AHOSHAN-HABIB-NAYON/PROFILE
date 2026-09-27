export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const Errors = {
  badRequest: (msg = 'Bad request', details?: unknown) => new AppError(400, 'bad_request', msg, details),
  validation: (details: unknown) => new AppError(422, 'validation_error', 'Validation failed', details),
  unauthorized: (msg = 'Authentication required') => new AppError(401, 'unauthorized', msg),
  forbidden: (msg = 'Forbidden') => new AppError(403, 'forbidden', msg),
  notFound: (msg = 'Not found') => new AppError(404, 'not_found', msg),
  conflict: (msg: string, code = 'conflict') => new AppError(409, code, msg),
  tooMany: (msg = 'Too many requests', retryAfter?: number) =>
    new AppError(429, 'rate_limited', msg, retryAfter ? { retryAfter } : undefined),
  unavailable: (msg = 'Service unavailable') => new AppError(503, 'unavailable', msg),
  mfaRequired: (details: unknown) =>
    new AppError(403, 'mfa_required', 'Additional verification required', details),
  insufficient: (msg = 'Insufficient balance') => new AppError(422, 'insufficient_balance', msg),
};
