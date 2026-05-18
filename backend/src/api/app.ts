import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { makeDdb } from '../adapters/ddb';
import { makeQueue } from '../adapters/queue';
import { makeRedis } from '../adapters/redis';
import { loadConfig } from '../config';
import { AppDeps, AppWithDeps, Config, Product, ProductContext } from '../interfaces';
import logger from '../logger';
import { mockProducts } from '../products';
import { makeProductPurchaseService } from '../services/purchaseService';
import { makeProductSaleService } from '../services/saleService';
import { makeStockService } from '../services/stockService';
import { makeAuthMiddleware } from './middleware/auth';
import { makeProductRoutes } from './routes/products';
import { makeAuthRoutes } from './routes/auth';
import { makeUserService } from '../services/userService';

export type { AppDeps, AppWithDeps } from '../interfaces';

export function buildApp({
  config: cfg,
  deps,
  products: productsOverride,
}: {
  config?: Config;
  deps?: AppDeps;
  products?: Product[];
} = {}): AppWithDeps {
  const config = cfg || loadConfig();
  const redis = deps?.redis || makeRedis({ config, logger });
  const ddb   = deps?.ddb   || makeDdb({ config, logger });
  const queue = deps?.queue  || makeQueue({ config, logger });
  const products = productsOverride ?? mockProducts;

  const productServices = new Map<string, ProductContext>();
  for (const product of products) {
    const stockService   = makeStockService({ redis, saleId: product.id });
    const saleService    = makeProductSaleService({ stockService, product });
    const purchaseService = makeProductPurchaseService({ stockService, saleService, ddb, queue, product });
    productServices.set(product.id, { product, saleService, purchaseService });
  }

  const authMiddleware = makeAuthMiddleware({ config, logger });
  const userService = makeUserService({ ddb, config, logger });

  const app = express() as AppWithDeps;
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '64kb' }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/ready', async (_req, res) => {
    try { await redis.ping(); res.json({ ok: true }); }
    catch (err) { res.status(503).json({ ok: false, err: (err as Error).message }); }
  });

  app.use('/auth', makeAuthRoutes({ userService }));
  app.use('/products', makeProductRoutes({ productServices, authMiddleware }));

  app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err: err.message, stack: err.stack }, 'unhandled.error');
    res.status(500).json({ error: 'Internal server error' });
  });

  app._deps = { redis, ddb, config };
  return app;
}
