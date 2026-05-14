import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { makeUserService } from '../../src/services/userService';
import { Ddb, UserRecord, Config } from '@/types';

jest.mock('bcryptjs');
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

const JWT_SECRET = 'test-secret';

function makeFakeDdb(users = new Map<string, UserRecord>()): Ddb {
  return {
    putProduct: jest.fn(),
    getProduct: jest.fn(),
    listProducts: jest.fn(),
    decrementProductStock: jest.fn(),
    writePurchase: jest.fn(),
    getPurchaseByUser: jest.fn(),
    createUser: jest.fn(async (record: UserRecord) => {
      if (users.has(record.email)) return { created: false };
      users.set(record.email, record);
      return { created: true };
    }),
    getUserByEmail: jest.fn(async (email: string) => users.get(email) ?? null),
    getUserById: jest.fn(async (id: string) => {
      for (const u of users.values()) if (u.userId === id) return u;
      return null;
    }),
  };
}

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any;
}

const config: Config = {
  stage: 'test',
  authMode: 'jwt',
  region: 'us-east-1',
  jwtSecret: JWT_SECRET,
  redis: { host: 'localhost', port: 6379 },
  sqs: { queueUrl: 'http://localhost:9324/queue' },
  ddb: { purchasesTable: 'p', productsTable: 'pr', usersTable: 'u' },
  cognito: {},
};

describe('userService.signup', () => {
  beforeEach(() => {
    mockBcrypt.hash.mockResolvedValue('hashed-password' as never);
  });

  afterEach(() => jest.clearAllMocks());

  test('creates user and returns token + public user on success', async () => {
    const svc = makeUserService({ ddb: makeFakeDdb(), config, logger: makeLogger() });
    const result = await svc.signup({ email: 'alice@example.com', password: 'password123' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('alice@example.com');
    expect(result.user.id).toBeDefined();
    expect(mockBcrypt.hash).toHaveBeenCalledWith('password123', 12);
  });

  test('normalises email to lowercase', async () => {
    const ddb = makeFakeDdb();
    const svc = makeUserService({ ddb, config, logger: makeLogger() });
    await svc.signup({ email: 'Alice@Example.COM', password: 'password123' });

    expect(ddb.getUserByEmail).toHaveBeenCalledWith('alice@example.com');
  });

  test('returns email_taken when email already registered', async () => {
    const users = new Map<string, UserRecord>();
    users.set('alice@example.com', {
      userId: 'u1', email: 'alice@example.com', passwordHash: 'h', createdAt: '', provider: 'local',
    });
    const svc = makeUserService({ ddb: makeFakeDdb(users), config, logger: makeLogger() });
    const result = await svc.signup({ email: 'alice@example.com', password: 'password123' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('email_taken');
  });

  test('returns email_taken on createUser race (concurrent signup)', async () => {
    const ddb = makeFakeDdb();
    (ddb.createUser as jest.Mock).mockResolvedValue({ created: false });
    const svc = makeUserService({ ddb, config, logger: makeLogger() });
    const result = await svc.signup({ email: 'bob@example.com', password: 'password123' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('email_taken');
  });

  test('skips bcrypt hash for google provider', async () => {
    const svc = makeUserService({ ddb: makeFakeDdb(), config, logger: makeLogger() });
    await svc.signup({ email: 'g@example.com', password: '', provider: 'google' });

    expect(mockBcrypt.hash).not.toHaveBeenCalled();
  });

  test('issued token contains correct sub and email claims', async () => {
    const svc = makeUserService({ ddb: makeFakeDdb(), config, logger: makeLogger() });
    const result = await svc.signup({ email: 'alice@example.com', password: 'password123' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload = jwt.verify(result.token, JWT_SECRET) as { sub: string; email: string };
    expect(payload.sub).toBe(result.user.id);
    expect(payload.email).toBe('alice@example.com');
  });
});

describe('userService.login', () => {
  const existingUser: UserRecord = {
    userId: 'u1',
    email: 'alice@example.com',
    passwordHash: 'hashed',
    createdAt: '2024-01-01T00:00:00Z',
    provider: 'local',
  };

  afterEach(() => jest.clearAllMocks());

  test('returns token on valid credentials', async () => {
    mockBcrypt.compare.mockResolvedValue(true as never);
    const users = new Map([['alice@example.com', existingUser]]);
    const svc = makeUserService({ ddb: makeFakeDdb(users), config, logger: makeLogger() });
    const result = await svc.login({ email: 'alice@example.com', password: 'correct' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.email).toBe('alice@example.com');
    expect(result.token).toBeDefined();
  });

  test('returns invalid_credentials when user not found', async () => {
    const svc = makeUserService({ ddb: makeFakeDdb(), config, logger: makeLogger() });
    const result = await svc.login({ email: 'nobody@example.com', password: 'pass' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid_credentials');
    expect(mockBcrypt.compare).not.toHaveBeenCalled();
  });

  test('returns invalid_credentials on wrong password', async () => {
    mockBcrypt.compare.mockResolvedValue(false as never);
    const users = new Map([['alice@example.com', existingUser]]);
    const svc = makeUserService({ ddb: makeFakeDdb(users), config, logger: makeLogger() });
    const result = await svc.login({ email: 'alice@example.com', password: 'wrong' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid_credentials');
  });

  test('normalises email before lookup', async () => {
    mockBcrypt.compare.mockResolvedValue(true as never);
    const users = new Map([['alice@example.com', existingUser]]);
    const ddb = makeFakeDdb(users);
    const svc = makeUserService({ ddb, config, logger: makeLogger() });
    await svc.login({ email: '  Alice@Example.COM  ', password: 'correct' });

    expect(ddb.getUserByEmail).toHaveBeenCalledWith('alice@example.com');
  });
});

describe('userService.loginWithGoogle', () => {
  afterEach(() => jest.clearAllMocks());

  test('creates new user on first google login and returns token', async () => {
    const ddb = makeFakeDdb();
    const svc = makeUserService({ ddb, config, logger: makeLogger() });
    const result = await svc.loginWithGoogle({ email: 'google@example.com' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.email).toBe('google@example.com');
    expect(ddb.createUser).toHaveBeenCalledTimes(1);
  });

  test('returns existing user on subsequent google login without creating a new one', async () => {
    const existingGoogle: UserRecord = {
      userId: 'g1', email: 'google@example.com', passwordHash: '', createdAt: '', provider: 'google',
    };
    const users = new Map([['google@example.com', existingGoogle]]);
    const ddb = makeFakeDdb(users);
    const svc = makeUserService({ ddb, config, logger: makeLogger() });
    const result = await svc.loginWithGoogle({ email: 'google@example.com' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.id).toBe('g1');
    expect(ddb.createUser).not.toHaveBeenCalled();
  });
});

describe('userService.verifyToken', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns payload for a valid token', async () => {
    const svc = makeUserService({ ddb: makeFakeDdb(), config, logger: makeLogger() });
    const token = jwt.sign({ sub: 'u1', email: 'alice@example.com' }, JWT_SECRET, { expiresIn: '1h' });
    const payload = await svc.verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('u1');
    expect(payload?.email).toBe('alice@example.com');
  });

  test('returns null for a tampered token', async () => {
    const svc = makeUserService({ ddb: makeFakeDdb(), config, logger: makeLogger() });
    const token = jwt.sign({ sub: 'u1', email: 'x@x.com' }, 'wrong-secret');
    const payload = await svc.verifyToken(token);

    expect(payload).toBeNull();
  });

  test('returns null for an expired token', async () => {
    const svc = makeUserService({ ddb: makeFakeDdb(), config, logger: makeLogger() });
    const token = jwt.sign({ sub: 'u1', email: 'x@x.com' }, JWT_SECRET, { expiresIn: -1 });
    const payload = await svc.verifyToken(token);

    expect(payload).toBeNull();
  });
});
