// Consistent error codes. The full list is the contract in docs/CONTRACTS/error-codes.md.
// Response shape: { "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "...", "details": {...}?, "requestId": "..." } }

export const ErrorCodes = Object.freeze({
  VALIDATION_FAILED: { status: 400, message: 'Some fields are invalid.' },
  BAD_REQUEST: { status: 400, message: 'The request could not be understood.' },
  AUTH_REQUIRED: { status: 401, message: 'Please log in.' },
  AUTH_INVALID_CREDENTIALS: { status: 401, message: 'Email or password is incorrect.' },
  AUTH_TOKEN_EXPIRED: { status: 401, message: 'Your session has expired.' },
  AUTH_REFRESH_INVALID: { status: 401, message: 'Your session has ended. Please log in again.' },
  AUTH_LOCKED: { status: 423, message: 'Too many attempts. Try again later.' },
  AUTH_EMAIL_NOT_VERIFIED: { status: 403, message: 'Please verify your email first.' },
  FORBIDDEN: { status: 403, message: 'You do not have access to this.' },
  CONSENT_REQUIRED: { status: 403, message: 'This person has not agreed to share their location.' },
  NOT_FOUND: { status: 404, message: 'Not found.' },
  CONFLICT: { status: 409, message: 'This already exists.' },
  CODE_INVALID: { status: 400, message: 'The code is not valid.' },
  CODE_EXPIRED: { status: 410, message: 'The code has expired.' },
  PLAN_LIMIT_REACHED: { status: 402, message: 'Your plan limit has been reached.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'The file is too large.' },
  UNSUPPORTED_MEDIA: { status: 415, message: 'This file type is not supported.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please wait and try again.' },
  UPGRADE_REQUIRED: { status: 426, message: 'Please update the app.' },
  FEATURE_DISABLED: { status: 503, message: 'This feature is turned off right now.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'The service is temporarily unavailable.' },
  INTERNAL: { status: 500, message: 'Something went wrong on our side.' },
});

export class ApiError extends Error {
  constructor(code, { message, details, status } = {}) {
    const def = ErrorCodes[code] || ErrorCodes.INTERNAL;
    super(message || def.message);
    this.code = ErrorCodes[code] ? code : 'INTERNAL';
    this.status = status || def.status;
    this.details = details;
  }
}

export function errorBody(err, requestId) {
  const body = { code: err.code, message: err.message, requestId };
  if (err.details) body.details = err.details;
  return { error: body };
}
