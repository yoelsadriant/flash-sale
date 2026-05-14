import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
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
  let verifier: any = null;
  if (
    config.authMode !== 'local' &&
    config.cognito.userPoolId &&
    config.cognito.clientId
  ) {
    verifier = CognitoJwtVerifier.create({
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

    const auth = req.header('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'Missing bearer token' });
      return;
    }
    try {
      const payload = await verifier.verify(token);
      (req as AuthedRequest).user = {
        sub: payload.sub,
        username: payload.username || payload.sub,
      };
      next();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'auth.verify.failed');
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}
