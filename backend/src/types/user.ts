export interface UserRecord {
  userId: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  provider?: 'local' | 'google';
}

export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

export type SignupResult =
  | { ok: true; token: string; user: PublicUser }
  | { ok: false; reason: 'email_taken' | 'invalid_input' };

export type LoginResult =
  | { ok: true; token: string; user: PublicUser }
  | { ok: false; reason: 'invalid_credentials' };

export interface UserService {
  signup(input: { email: string; password: string; provider?: 'local' | 'google' }): Promise<SignupResult>;
  login(input: { email: string; password: string }): Promise<LoginResult>;
  loginWithGoogle(input: { email: string }): Promise<LoginResult>;
  verifyToken(token: string): Promise<JwtPayload | null>;
}
