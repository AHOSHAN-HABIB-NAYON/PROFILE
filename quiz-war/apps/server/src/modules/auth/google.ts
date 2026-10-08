import { OAuth2Client } from 'google-auth-library';
import { unauthorized } from '../../lib/errors';

export interface GoogleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export interface GoogleVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
}

/**
 * Verifies Google ID tokens (from Google Identity Services on web, and from Android
 * Credential Manager "Sign in with Google" in the app). Signature, issuer, expiry and
 * audience are all checked by google-auth-library.
 */
export class GoogleIdTokenVerifier implements GoogleVerifier {
  private client = new OAuth2Client();
  constructor(private readonly audiences: string[]) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (!this.audiences.length) throw unauthorized('Google login is not configured');
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.audiences });
      const p = ticket.getPayload();
      if (!p?.sub) throw new Error('no subject');
      return {
        sub: p.sub,
        email: p.email?.toLowerCase() ?? null,
        emailVerified: !!p.email_verified,
        name: p.name ?? null,
        picture: p.picture ?? null,
      };
    } catch {
      throw unauthorized('Google sign-in could not be verified');
    }
  }
}
