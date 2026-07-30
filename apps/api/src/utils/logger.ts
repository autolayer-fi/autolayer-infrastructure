import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.x-api-key',
      '*.delegatePrivateKey',
      '*.secret',
      '*.ciphertext',
    ],
    censor: '[REDACTED]',
  },
});
