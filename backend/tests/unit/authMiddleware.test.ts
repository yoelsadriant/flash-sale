import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { makeAuthMiddleware } from '../../src/api/middleware/auth';
import { Config, MockRes, AppLogger } from '@/types';

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(),
  },
}));
import { CognitoJwtVerifier } from 'aws-jwt-verify';
const mockCreate = CognitoJwtVerifier.create as jest.Mock;

const noopLogger = {
  warn: () => {},
  info: () => {},
  error: () => {},
} as unknown as AppLogger;

function mockRes(): MockRes {
  return {
    statusCode: 200,
    body: null,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: { error?: string }) {
      this.body = b;
      return this;
    },
  };
}

describe('auth middleware — local mode', () => {
  const config = {
    authMode: 'local',
    cognito: { userPoolId: undefined, clientId: undefined },
  } as Config;

  test('attaches req.user when X-User-Id header present', async () => {
    const mw = makeAuthMiddleware({ config, logger: noopLogger });
    const req = {
      header: (h: string) => (h === 'X-User-Id' ? 'alice' : undefined),
    } as unknown as Request;
    const res = mockRes() as unknown as Response;
    let nextCalled = false;
    await mw(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect((req as Request & { user?: { sub: string } }).user).toEqual({
      sub: 'alice',
      username: 'alice',
    });
  });

  test('401 when X-User-Id header missing', async () => {
    const mw = makeAuthMiddleware({ config, logger: noopLogger });
    const req = { header: () => undefined } as unknown as Request;
    const res = mockRes();
    await mw(req, res as unknown as Response, () => {});
    expect(res.statusCode).toBe(401);
    expect(res.body?.error).toMatch(/X-User-Id/);
  });
});

describe('auth middleware — prod (cognito) mode', () => {
  const config = {
    authMode: 'prod',
    cognito: { userPoolId: 'ap-southeast-1_abc123', clientId: 'client' },
  } as Config;

  test('401 when Authorization header missing', async () => {
    const mw = makeAuthMiddleware({ config, logger: noopLogger });
    const req = { header: () => undefined } as unknown as Request;
    const res = mockRes();
    await mw(req, res as unknown as Response, () => {});
    expect(res.statusCode).toBe(401);
    expect(res.body?.error).toMatch(/bearer/i);
  });

  test('401 when bearer prefix is malformed', async () => {
    const mw = makeAuthMiddleware({ config, logger: noopLogger });
    const req = {
      header: (h: string) => (h === 'Authorization' ? 'NotBearer xxx' : undefined),
    } as unknown as Request;
    const res = mockRes();
    await mw(req, res as unknown as Response, () => {});
    expect(res.statusCode).toBe(401);
  });
});

describe('auth middleware — jwt mode', () => {
  const JWT_SECRET = 'test-secret';
  const config = {
    authMode: 'jwt',
    jwtSecret: JWT_SECRET,
    cognito: {},
  } as Config;

  test('attaches req.user for a valid JWT', async () => {
    const token = jwt.sign({ sub: 'u1', email: 'alice@example.com' }, JWT_SECRET);
    const mw = makeAuthMiddleware({ config, logger: noopLogger });
    const req = {
      header: (h: string) => h === 'Authorization' ? `Bearer ${token}` : undefined,
    } as unknown as Request;
    const res = mockRes() as unknown as Response;
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect((req as AuthedReq).user).toEqual({ sub: 'u1', username: 'alice@example.com' });
  });

  test('401 for an invalid or tampered JWT', async () => {
    const mw = makeAuthMiddleware({ config, logger: noopLogger });
    const req = {
      header: (h: string) => h === 'Authorization' ? 'Bearer not.a.valid.token' : undefined,
    } as unknown as Request;
    const res = mockRes();
    await mw(req, res as unknown as Response, () => {});
    expect(res.statusCode).toBe(401);
    expect(res.body?.error).toMatch(/invalid/i);
  });
});

type AuthedReq = Request & { user?: { sub: string; username: string } };

describe('auth middleware — cognito mode', () => {
  const config = {
    authMode: 'cognito',
    jwtSecret: '',
    cognito: { userPoolId: 'us-east-1_test', clientId: 'client123' },
  } as Config;

  test('creates CognitoJwtVerifier with correct params on init', () => {
    mockCreate.mockReturnValue({ verify: jest.fn() });
    makeAuthMiddleware({ config, logger: noopLogger });
    expect(mockCreate).toHaveBeenCalledWith({
      userPoolId: 'us-east-1_test',
      clientId: 'client123',
      tokenUse: 'access',
    });
  });

  test('attaches req.user when Cognito verifies successfully', async () => {
    const mockVerify = jest.fn().mockResolvedValue({ sub: 'cog-u1', username: 'alice' });
    mockCreate.mockReturnValue({ verify: mockVerify });
    const mw = makeAuthMiddleware({ config, logger: noopLogger });
    const req = {
      header: (h: string) => h === 'Authorization' ? 'Bearer valid-token' : undefined,
    } as unknown as Request;
    const res = mockRes() as unknown as Response;
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect((req as AuthedReq).user).toEqual({ sub: 'cog-u1', username: 'alice' });
  });

  test('falls back to sub as username when cognito payload has no username field', async () => {
    const mockVerify = jest.fn().mockResolvedValue({ sub: 'cog-u1' });
    mockCreate.mockReturnValue({ verify: mockVerify });
    const mw = makeAuthMiddleware({ config, logger: noopLogger });
    const req = {
      header: (h: string) => h === 'Authorization' ? 'Bearer valid-token' : undefined,
    } as unknown as Request;
    const res = mockRes() as unknown as Response;
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect((req as AuthedReq).user).toEqual({ sub: 'cog-u1', username: 'cog-u1' });
  });

  test('401 when Cognito verification throws', async () => {
    const mockVerify = jest.fn().mockRejectedValue(new Error('expired'));
    mockCreate.mockReturnValue({ verify: mockVerify });
    const mw = makeAuthMiddleware({ config, logger: noopLogger });
    const req = {
      header: (h: string) => h === 'Authorization' ? 'Bearer bad-token' : undefined,
    } as unknown as Request;
    const res = mockRes();
    await mw(req, res as unknown as Response, () => {});
    expect(res.statusCode).toBe(401);
    expect(res.body?.error).toMatch(/invalid/i);
  });
});
