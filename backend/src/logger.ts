import pino, { type Logger } from 'pino';
import pretty from 'pino-pretty';

const stream = process.env.STAGE === 'local'
  ? pretty({ singleLine: true, sync: true })
  : undefined;

const logger: Logger = pino(
  { 
    level: process.env.LOG_LEVEL || 'info', 
    base: { service: 'flash-sale', stage: process.env.STAGE || 'local' } 
  },
  stream,
);

export default logger;
