import express, {
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from 'express';
import { z } from 'zod';
import type { ProductContext, AuthedRequest } from '@/types';

export function makeProductRoutes({
  productServices,
  authMiddleware,
}: {
  productServices: Map<string, ProductContext>;
  authMiddleware: RequestHandler;
}) {
  const router = express.Router();
  const productIdSchema = z.string().min(1).max(64);

  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const results = await Promise.all(
        [...productServices.values()].map(async ({ product, saleService }) => {
          const status = await saleService.getStatus();
          return {
            id: product.id,
            name: product.name,
            description: product.description,
            emoji: product.emoji,
            price: product.price,
            originalPrice: product.originalPrice,
            ...status,
          };
        })
      );
      res.json(results);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/:productId/purchase',
    authMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const productId = productIdSchema.parse(req.params.productId);
        const services = productServices.get(productId);
        if (!services) { res.status(404).json({ error: 'Product not found' }); return; }

        const user = (req as AuthedRequest).user;
        if (!user) { res.status(401).json({ error: 'Unauthenticated' }); return; }

        const result = await services.purchaseService.attempt(user.sub);
        switch (result.status) {
          case 'PURCHASED':          res.status(200).json(result); return;
          case 'ALREADY_PURCHASED':  res.status(409).json(result); return;
          case 'SOLD_OUT':           res.status(410).json(result); return;
          case 'NOT_ACTIVE':         res.status(409).json(result); return;
          default: res.status(500).json({ error: 'Unexpected result' }); return;
        }
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/:productId/purchase/me',
    authMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const productId = productIdSchema.parse(req.params.productId);
        const services = productServices.get(productId);
        if (!services) { res.status(404).json({ error: 'Product not found' }); return; }

        const user = (req as AuthedRequest).user;
        if (!user) { res.status(401).json({ error: 'Unauthenticated' }); return; }

        const record = await services.purchaseService.getUserPurchase(user.sub);
        if (!record) {
          res.status(404).json({ status: 'NONE', userId: user.sub, productId });
          return;
        }
        res.json(record);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
