// Cache policy: HTML is always revalidated (the inline script bundle is
// content-hashed, so a stale cached index.html would otherwise keep loading
// old JS/CSS forever). Hashed /_astro/* assets can be cached immutably.
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const res = await next();
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('text/html')) {
    res.headers.set('cache-control', 'no-cache');
  } else if (context.url.pathname.startsWith('/_astro/')) {
    res.headers.set('cache-control', 'public, max-age=31536000, immutable');
  }
  return res;
});
