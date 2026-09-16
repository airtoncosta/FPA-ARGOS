/**
 * FPA-ARGOS — Supabase Edge Functions Shared Rate Limiter (Deno / TypeScript)
 * Weighted Sliding Window Counter per IP address.
 */

interface Bucket {
  prevCount: number;
  currCount: number;
  windowStart: number;
}

const memoryBuckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  response?: Response;
  remaining?: number;
  resetSeconds?: number;
}

export function checkEdgeRateLimit(
  req: Request,
  category: string,
  maxRequests: number = 5,
  windowMs: number = 60000,
  corsHeaders: Record<string, string> = { "Access-Control-Allow-Origin": "*" }
): RateLimitResult {
  const xForwarded = req.headers.get("x-forwarded-for");
  let ip = "";
  if (xForwarded) {
    ip = xForwarded.split(",")[0].trim();
  } else if (req.headers.get("x-real-ip")) {
    ip = req.headers.get("x-real-ip")!.trim();
  } else {
    ip = "127.0.0.1";
  }

  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }
  if (ip === "::1") {
    ip = "127.0.0.1";
  }

  const key = `${category}:${ip}`;
  const now = Date.now();

  let bucket = memoryBuckets.get(key);
  if (!bucket) {
    bucket = { prevCount: 0, currCount: 0, windowStart: now };
    memoryBuckets.set(key, bucket);
  }

  const elapsed = now - bucket.windowStart;
  if (elapsed >= windowMs) {
    bucket.prevCount = elapsed < 2 * windowMs ? bucket.currCount : 0;
    bucket.currCount = 0;
    bucket.windowStart = now;
  }

  const elapsedCurrent = now - bucket.windowStart;
  const weight = Math.max(0, (windowMs - elapsedCurrent) / windowMs);
  const estimated = Math.floor(bucket.prevCount * weight) + bucket.currCount;

  const resetSeconds = Math.max(1, Math.ceil((windowMs - elapsedCurrent) / 1000));

  if (estimated >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetSeconds,
      response: new Response(
        JSON.stringify({
          success: false,
          error: "Too Many Requests",
          code: "RATE_LIMIT_EXCEEDED",
          message: `Limite de tentativas excedido na nuvem (${category}). Aguarde ${resetSeconds}s.`,
          category,
          retryAfterSeconds: resetSeconds,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Retry-After": String(resetSeconds),
            "RateLimit-Limit": String(maxRequests),
            "RateLimit-Remaining": "0",
            "RateLimit-Reset": String(resetSeconds),
          },
        }
      ),
    };
  }

  bucket.currCount += 1;
  const remaining = Math.max(0, maxRequests - (estimated + 1));

  return {
    allowed: true,
    remaining,
    resetSeconds,
  };
}
