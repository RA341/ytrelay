import { Context, Next } from 'hono';
import { logger } from './logger';

export async function authMiddleware(c: Context, next: Next) {
  logger.info(`Incoming request: ${c.req.method} ${c.req.url}`);
  const apiKey = process.env.API_KEY;

  if (apiKey) {
    const headerApiKey = c.req.header('x-api-key');

    if (!headerApiKey || headerApiKey !== apiKey) {
      logger.warn('Unauthorized access attempt', { ip: c.req.ip, method: c.req.method, url: c.req.url });
      return c.json({ error: 'Unauthorized' }, 401);
    }
    logger.info('API Key authenticated successfully', { ip: c.req.ip, method: c.req.method, url: c.req.url });
  } else {
    logger.info('API_KEY environment variable not set. Skipping authentication.', { method: c.req.method, url: c.req.url });
  }

  await next();
}
