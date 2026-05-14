import pino, { type Logger } from 'pino';

const logger: Logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'flash-sale', stage: process.env.STAGE || 'local' },
  ...(process.env.STAGE === 'local'
    ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
    : {}),
});

export default logger;
