import {
  AppDeps,
  AppWithDeps,
  Config,
  Product,
  ProductContext,
} from "@/types";
import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { makeDdb } from "../adapters/ddb";
import { makeQueue } from "../adapters/queue";
import { makeRedis } from "../adapters/redis";
import { loadConfig } from "../config";
import logger from "../logger";
import { makeProductPurchaseService } from "../services/purchaseService";
import { makeProductSaleService } from "../services/saleService";
import { makeStockService } from "../services/stockService";
import { makeUserService } from "../services/userService";
import { makeAuthMiddleware } from "./middleware/auth";
import { makeAuthRoutes } from "./routes/auth";
import { makeProductRoutes } from "./routes/products";

export async function buildApp(
  opts: {
    config?: Config;
    deps?: AppDeps;
    products?: Product[];
  } = {},
): Promise<AppWithDeps> {
  const config = opts.config ?? loadConfig();
  const redis = opts.deps?.redis ?? makeRedis({ config, logger });
  const ddb = opts.deps?.ddb ?? makeDdb({ config, logger });
  const queue = opts.deps?.queue ?? makeQueue({ config, logger });

  const products: Product[] = opts.products ?? (await ddb.listProducts()).map((r) => ({
    id: r.productId,
    name: r.name,
    description: r.description,
    emoji: r.emoji,
    price: r.price,
    originalPrice: r.originalPrice,
    stock: r.stock,
    saleStart: r.saleStart,
    saleEnd: r.saleEnd,
  }));

  const productServices = new Map<string, ProductContext>();
  for (const product of products) {
    const stockService = makeStockService({ redis, saleId: product.id });
    const saleService = makeProductSaleService({ stockService, product });
    const purchaseService = makeProductPurchaseService({
      stockService,
      saleService,
      ddb,
      queue,
      product,
    });
    productServices.set(product.id, { product, saleService, purchaseService });
  }

  const authMiddleware = makeAuthMiddleware({ config, logger });
  const userService = makeUserService({ ddb, config, logger });

  const app = express() as AppWithDeps;
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "64kb" }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/health" },
    }),
  );

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/ready", async (_req, res) => {
    try {
      await redis.ping();
      res.json({ ok: true });
    } catch (err) {
      res.status(503).json({ ok: false, err: (err as Error).message });
    }
  });

  app.use("/auth", makeAuthRoutes({ userService }));
  app.use("/products", makeProductRoutes({ productServices, authMiddleware }));

  app.use((req, res) =>
    res.status(404).json({ error: "Not found", path: req.path }),
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err: err.message, stack: err.stack }, "unhandled.error");
    res.status(500).json({ error: "Internal server error" });
  });

  app._deps = { redis, ddb, config };
  return app;
}
