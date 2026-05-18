import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import {
  Ddb,
  AppLogger,
  Config,
  UserRecord,
  UserService,
  JwtPayload,
  PublicUser,
} from '../interfaces';

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRES_IN = '24h';

export function makeUserService({
  ddb,
  config,
  logger,
}: {
  ddb: Ddb;
  config: Config;
  logger: AppLogger;
}): UserService {
  function signToken(userId: string, email: string): string {
    return jwt.sign({ sub: userId, email }, config.jwtSecret, { expiresIn: JWT_EXPIRES_IN });
  }

  function toPublicUser(record: UserRecord): PublicUser {
    return { id: record.userId, email: record.email, createdAt: record.createdAt };
  }

  return {
    async signup({ email, password, provider = 'local' }) {
      const normalizedEmail = email.trim().toLowerCase();

      const existing = await ddb.getUserByEmail(normalizedEmail);
      if (existing) {
        return { ok: false, reason: 'email_taken' };
      }

      const passwordHash = provider === 'local'
        ? await bcrypt.hash(password, BCRYPT_ROUNDS)
        : '';

      const record: UserRecord = {
        userId: randomUUID(),
        email: normalizedEmail,
        passwordHash,
        createdAt: new Date().toISOString(),
        provider,
      };

      const result = await ddb.createUser(record);
      if (!result.created) {
        return { ok: false, reason: 'email_taken' };
      }

      logger.info({ userId: record.userId, provider }, 'user.signup');
      const token = signToken(record.userId, record.email);
      return { ok: true, token, user: toPublicUser(record) };
    },

    async login({ email, password }) {
      const normalizedEmail = email.trim().toLowerCase();
      const record = await ddb.getUserByEmail(normalizedEmail);
      if (!record) {
        logger.warn({ email: normalizedEmail }, 'user.login.not_found');
        return { ok: false, reason: 'invalid_credentials' };
      }

      const valid = await bcrypt.compare(password, record.passwordHash);
      if (!valid) {
        logger.warn({ userId: record.userId }, 'user.login.wrong_password');
        return { ok: false, reason: 'invalid_credentials' };
      }

      logger.info({ userId: record.userId }, 'user.login');
      const token = signToken(record.userId, record.email);
      return { ok: true, token, user: toPublicUser(record) };
    },

    async loginWithGoogle({ email }) {
      const normalizedEmail = email.trim().toLowerCase();
      let record = await ddb.getUserByEmail(normalizedEmail);

      if (!record) {
        record = {
          userId: randomUUID(),
          email: normalizedEmail,
          passwordHash: '',
          createdAt: new Date().toISOString(),
          provider: 'google',
        };
        await ddb.createUser(record);
        logger.info({ userId: record.userId }, 'user.google.signup');
      } else {
        logger.info({ userId: record.userId }, 'user.google.login');
      }

      const token = signToken(record.userId, record.email);
      return { ok: true, token, user: toPublicUser(record) };
    },

    async verifyToken(token: string): Promise<JwtPayload | null> {
      try {
        const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
        return payload;
      } catch {
        return null;
      }
    },
  };
}
