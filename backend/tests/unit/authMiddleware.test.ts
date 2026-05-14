import type { Request, Response } from 'express';
import { makeAuthMiddleware } from '../../src/api/middleware/auth';
import { Config, AppLogger, MockRes } from '../../src/interfaces';

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
