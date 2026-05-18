import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import jwt from 'jsonwebtoken';
import type { Config, AppLogger, AuthedRequest } from '../../interfaces';

export { type AuthedRequest } from '../../interfaces';

export function makeAuthMiddleware({
  config,
  logger,
}: {
  config: Config;
  logger: AppLogger;
}): RequestHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cognitoVerifier: any = null;
  if (
    config.authMode === 'cognito' &&
    config.cognito.userPoolId &&
    config.cognito.clientId
  ) {
    cognitoVerifier = CognitoJwtVerifier.create({
      userPoolId: config.cognito.userPoolId,
      clientId: config.cognito.clientId,
      tokenUse: 'access',
    });
  }

  return async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // local mode: trust X-User-Id header (for tests/scripts only)
    if (config.authMode === 'local') {
      const userId = req.header('X-User-Id');
      if (!userId) {
        res.status(401).json({ error: 'X-User-Id header required in local mode' });
        return;
      }
      (req as AuthedRequest).user = { sub: userId, username: userId };
      next();
      return;
    }

    const authHeader = req.header('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'Missing bearer token' });
      return;
    }

    // jwt mode: verify with our own secret
    if (config.authMode === 'jwt') {
      try {
        const payload = jwt.verify(token, config.jwtSecret) as { sub: string; email: string };
        (req as AuthedRequest).user = { sub: payload.sub, username: payload.email };
        next();
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'auth.jwt.verify.failed');
        res.status(401).json({ error: 'Invalid or expired token' });
      }
      return;
    }

    // cognito mode
    try {
      const payload = await cognitoVerifier.verify(token);
      (req as AuthedRequest).user = {
        sub: payload.sub,
        username: payload.username || payload.sub,
      };
      next();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'auth.cognito.verify.failed');
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}
