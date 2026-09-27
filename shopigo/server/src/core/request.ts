export interface AdminContext {
  id: number;
  name: string;
  email: string;
  roleId: number;
  roleSlug: string;
  permissions: Set<string>;
  sessionId: number;
  authMethod: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminContext;
    }
  }
}

export {};
