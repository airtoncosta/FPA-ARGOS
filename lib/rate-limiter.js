/**
 * FPA-ARGOS — Sliding Window Counter Rate Limiter
 * Zero-dependency, thread-safe within event loop, memory-bounded.
 */

class SlidingWindowRateLimiter {
    constructor(options = {}) {
        this.defaultWindowMs = options.windowMs || 60000;
        this.buckets = new Map();

        // Expurgador periódico de memória (coleta de lixo ativa com .unref())
        const cleanIntervalMs = options.cleanIntervalMs || 300000;
        this.cleanupTimer = setInterval(() => this.cleanup(), cleanIntervalMs);
        if (this.cleanupTimer && typeof this.cleanupTimer.unref === 'function') {
            this.cleanupTimer.unref();
        }
    }

    getClientIp(req) {
        if (!req) return '127.0.0.1';
        const xForwarded = req.headers && req.headers['x-forwarded-for'];
        let ip = '';
        if (typeof xForwarded === 'string' && xForwarded.trim()) {
            ip = xForwarded.split(',')[0].trim();
        } else if (req.headers && req.headers['x-real-ip']) {
            ip = String(req.headers['x-real-ip']).trim();
        } else if (req.socket && req.socket.remoteAddress) {
            ip = req.socket.remoteAddress;
        } else if (req.connection && req.connection.remoteAddress) {
            ip = req.connection.remoteAddress;
        }
        ip = ip || '127.0.0.1';
        if (ip.startsWith('::ffff:')) {
            ip = ip.substring(7);
        }
        if (ip === '::1') {
            ip = '127.0.0.1';
        }
        return ip;
    }

    check(key, maxRequests, windowMs = this.defaultWindowMs, now = Date.now()) {
        let bucket = this.buckets.get(key);
        if (!bucket) {
            bucket = {
                prevCount: 0,
                currCount: 0,
                windowStart: now
            };
            this.buckets.set(key, bucket);
        }

        const elapsed = now - bucket.windowStart;
        if (elapsed >= windowMs) {
            bucket.prevCount = (elapsed < 2 * windowMs) ? bucket.currCount : 0;
            bucket.currCount = 0;
            bucket.windowStart = now;
        }

        const elapsedInCurrentWindow = now - bucket.windowStart;
        const weight = Math.max(0, (windowMs - elapsedInCurrentWindow) / windowMs);
        const estimatedRequests = Math.floor(bucket.prevCount * weight) + bucket.currCount;

        const resetSeconds = Math.max(1, Math.ceil((windowMs - elapsedInCurrentWindow) / 1000));

        if (estimatedRequests >= maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetSeconds: resetSeconds,
                retryAfterSeconds: resetSeconds
            };
        }

        bucket.currCount += 1;
        const remaining = Math.max(0, maxRequests - (estimatedRequests + 1));

        return {
            allowed: true,
            remaining: remaining,
            resetSeconds: resetSeconds,
            retryAfterSeconds: 0
        };
    }

    getHeaders(result, maxRequests) {
        const headers = {
            'RateLimit-Limit': maxRequests,
            'RateLimit-Remaining': result.remaining,
            'RateLimit-Reset': result.resetSeconds
        };
        if (!result.allowed && result.retryAfterSeconds > 0) {
            headers['Retry-After'] = result.retryAfterSeconds;
        }
        return headers;
    }

    cleanup(now = Date.now(), maxIdleMs = 120000) {
        let deleted = 0;
        for (const [key, bucket] of this.buckets.entries()) {
            if (now - bucket.windowStart > maxIdleMs) {
                this.buckets.delete(key);
                deleted++;
            }
        }
        return deleted;
    }

    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.buckets.clear();
    }
}

module.exports = { SlidingWindowRateLimiter };
