import request from 'supertest';
import express from 'express';
import { makeAuthRoutes } from '../../src/api/routes/auth';
import { UserService, PublicUser } from '../../src/interfaces';

const DEMO_USER: PublicUser = { id: 'u1', email: 'a@a.com', createdAt: '2024-01-01T00:00:00Z' };

function makeUserSvc(overrides: Partial<UserService> = {}): UserService {
  return {
    signup: jest.fn().mockResolvedValue({ ok: true, token: 'tok', user: DEMO_USER }),
    login: jest.fn().mockResolvedValue({ ok: true, token: 'tok', user: DEMO_USER }),
    loginWithGoogle: jest.fn().mockResolvedValue({ ok: true, token: 'tok', user: { ...DEMO_USER, email: 'google-demo@flashsale.local' } }),
    verifyToken: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeApp(svc: UserService) {
  const app = express();
  app.use(express.json());
  app.use('/auth', makeAuthRoutes({ userService: svc }));
  return app;
}

describe('POST /auth/signup', () => {
  test('201 with token and user on success', async () => {
    const res = await request(makeApp(makeUserSvc())).post('/auth/signup').send({ email: 'a@a.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBe('tok');
    expect(res.body.user.email).toBe('a@a.com');
  });

  test('400 when JSON body is null (triggers ?? {} fallback)', async () => {
    // strict:false lets null reach our handler so we can test the req.body ?? {} branch
    const app = express();
    app.use(express.json({ strict: false }));
    app.use('/auth', makeAuthRoutes({ userService: makeUserSvc() }));
    const res = await request(app)
      .post('/auth/signup')
      .set('Content-Type', 'application/json')
      .send('null');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('400 for invalid email', async () => {
    const res = await request(makeApp(makeUserSvc())).post('/auth/signup').send({ email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('400 for password shorter than 8 characters', async () => {
    const res = await request(makeApp(makeUserSvc())).post('/auth/signup').send({ email: 'a@a.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  test('409 when email is already taken', async () => {
    const svc = makeUserSvc({ signup: jest.fn().mockResolvedValue({ ok: false, reason: 'email_taken' }) });
    const res = await request(makeApp(svc)).post('/auth/signup').send({ email: 'a@a.com', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test('400 for other signup failures', async () => {
    const svc = makeUserSvc({ signup: jest.fn().mockResolvedValue({ ok: false, reason: 'invalid_input' }) });
    const res = await request(makeApp(svc)).post('/auth/signup').send({ email: 'a@a.com', password: 'password123' });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  test('200 with token on valid credentials', async () => {
    const res = await request(makeApp(makeUserSvc())).post('/auth/login').send({ email: 'a@a.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBe('tok');
  });

  test('400 when JSON body is null (triggers ?? {} fallback)', async () => {
    const app = express();
    app.use(express.json({ strict: false }));
    app.use('/auth', makeAuthRoutes({ userService: makeUserSvc() }));
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('null');
    expect(res.status).toBe(400);
  });

  test('400 when password field is missing', async () => {
    const res = await request(makeApp(makeUserSvc())).post('/auth/login').send({ email: 'a@a.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('401 on invalid credentials', async () => {
    const svc = makeUserSvc({ login: jest.fn().mockResolvedValue({ ok: false, reason: 'invalid_credentials' }) });
    const res = await request(makeApp(svc)).post('/auth/login').send({ email: 'a@a.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });
});

describe('POST /auth/google', () => {
  test('200 with token on success and calls loginWithGoogle with demo email', async () => {
    const svc = makeUserSvc();
    const res = await request(makeApp(svc)).post('/auth/google');
    expect(res.status).toBe(200);
    expect(res.body.token).toBe('tok');
    expect(svc.loginWithGoogle).toHaveBeenCalledWith({ email: 'google-demo@flashsale.local' });
  });

  test('500 when Google sign-in fails', async () => {
    const svc = makeUserSvc({ loginWithGoogle: jest.fn().mockResolvedValue({ ok: false, reason: 'invalid_credentials' }) });
    const res = await request(makeApp(svc)).post('/auth/google');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Google sign-in failed/i);
  });
});
