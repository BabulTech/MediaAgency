/** Fixed-window limiter. Per process: put a shared limiter at the proxy when running several instances. */
export function rateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string) => {
    const t = now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      if (hits.size > 50000) hits.clear();
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

export function securityMiddleware(limit = 600) {
  const allow = rateLimiter(limit, 60000);
  return (req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    if (req.method !== 'OPTIONS' && !allow(req.ip ?? 'unknown')) {
      res.status(429).json({ code: 'RATE_LIMITED' });
      return;
    }
    next();
  };
}
