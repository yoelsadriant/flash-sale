import { Router, type Request, type Response } from 'express';
import { UserService } from '../../interfaces';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

const GOOGLE_DEMO_EMAIL = 'google-demo@flashsale.local';

export function makeAuthRoutes({ userService }: { userService: UserService }): Router {
  const router = Router();

  router.post('/signup', async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      res.status(400).json({ error: 'Invalid email address' });
      return;
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LEN) {
      res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters` });
      return;
    }

    const result = await userService.signup({ email, password });
    if (!result.ok) {
      if (result.reason === 'email_taken') {
        res.status(409).json({ error: 'An account with this email already exists' });
        return;
      }
      res.status(400).json({ error: 'Invalid input' });
      return;
    }

    res.status(201).json({ token: result.token, user: result.user });
  });

  router.post('/login', async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await userService.login({ email, password });
    if (!result.ok) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    res.json({ token: result.token, user: result.user });
  });

  // Offline Google mock — logs in as a fixed demo Google account
  router.post('/google', async (_req: Request, res: Response): Promise<void> => {
    const result = await userService.loginWithGoogle({ email: GOOGLE_DEMO_EMAIL });
    if (!result.ok) {
      res.status(500).json({ error: 'Google sign-in failed' });
      return;
    }
    res.json({ token: result.token, user: result.user });
  });

  return router;
}
