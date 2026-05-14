import Redis from 'ioredis';
import type { Config, AppLogger } from '../interfaces';

export function makeRedis({
  config,
  logger,
}: {
  config: Config;
  logger: AppLogger;
}): Redis {
  const client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  client.on('error', (err: Error) =>
    logger.error({ err: err.message }, 'redis.error')
  );
  client.on('connect', () => logger.info('redis.connected'));
  return client;
}
