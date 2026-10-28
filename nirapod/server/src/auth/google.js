// Google ID-token verification (Credential Manager / Google Identity Services on the app).
// Injectable: tests pass a fake `verify(idToken)` with the same result shape.
import { OAuth2Client } from 'google-auth-library';
import { ApiError } from '../errors.js';

/**
 * @returns {(idToken: string) => Promise<{sub: string, email: string, email_verified: boolean,
 *           name?: string, picture?: string}>}
 */
export function createGoogleVerifier(clientIdsCsv) {
  const audience = String(clientIdsCsv || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!audience.length) {
    return async () => {
      throw new ApiError('FEATURE_DISABLED', { message: 'Google sign-in is not configured.' });
    };
  }
  const client = new OAuth2Client();
  return async (idToken) => {
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience });
      payload = ticket.getPayload();
    } catch {
      throw new ApiError('AUTH_INVALID_CREDENTIALS', { message: 'Google sign-in failed. Please try again.' });
    }
    if (!payload?.sub) throw new ApiError('AUTH_INVALID_CREDENTIALS', { message: 'Google sign-in failed. Please try again.' });
    return {
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified === true,
      name: payload.name,
      picture: payload.picture,
    };
  };
}
