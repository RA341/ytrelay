import { Context, Next } from 'hono';

export async function authMiddleware(c: Context, next: Next) {
  const apiKey = process.env.API_KEY;

  if (apiKey) {
    const headerApiKey = c.req.header('x-api-key');

    if (!headerApiKey || headerApiKey !== apiKey) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }

  await next();
}
