export type PrincipalType = 'user' | 'admin';

export interface AuthContext {
  type: PrincipalType;
  id: number;
  sessionId: number;
  mfaAt: number | null; // last time the session passed step-up verification
  method: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    admin?: { id: number; email: string; name: string; role: string; permissions: Set<string> };
    deviceId?: string;
  }
}
