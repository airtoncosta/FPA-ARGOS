const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { SlidingWindowRateLimiter } = require('../lib/rate-limiter');

describe('SlidingWindowRateLimiter Core', () => {
    let limiter;

    beforeEach(() => {
        limiter = new SlidingWindowRateLimiter({ windowMs: 60000, cleanIntervalMs: 60000 });
    });

    afterEach(() => {
        if (limiter) limiter.destroy();
    });

    test('permite requisições dentro do limite configurado', () => {
        const res1 = limiter.check('test-ip', 5, 60000);
        assert.equal(res1.allowed, true);
        assert.equal(res1.remaining, 4);

        const res2 = limiter.check('test-ip', 5, 60000);
        assert.equal(res2.allowed, true);
        assert.equal(res2.remaining, 3);
    });

    test('bloqueia requisições quando o limite é excedido e calcula retryAfterSeconds', () => {
        for (let i = 0; i < 5; i++) {
            const r = limiter.check('flood-ip', 5, 60000);
            assert.equal(r.allowed, true);
        }
        const blocked = limiter.check('flood-ip', 5, 60000);
        assert.equal(blocked.allowed, false);
        assert.equal(blocked.remaining, 0);
        assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 60);
    });

    test('isola contagens entre IPs e categorias diferentes', () => {
        for (let i = 0; i < 5; i++) {
            limiter.check('ip-a', 5, 60000);
        }
        assert.equal(limiter.check('ip-a', 5, 60000).allowed, false);
        assert.equal(limiter.check('ip-b', 5, 60000).allowed, true);
    });

    test('extrai IP do cliente com suporte a proxies reversos e IPv6', () => {
        const req1 = { headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' } };
        assert.equal(limiter.getClientIp(req1), '203.0.113.195');

        const req2 = { headers: { 'x-real-ip': '198.51.100.42' } };
        assert.equal(limiter.getClientIp(req2), '198.51.100.42');

        const req3 = { headers: {}, socket: { remoteAddress: '::ffff:192.168.1.50' } };
        assert.equal(limiter.getClientIp(req3), '192.168.1.50');

        const req4 = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
        assert.equal(limiter.getClientIp(req4), '127.0.0.1');

        const req5 = { headers: {}, socket: { remoteAddress: '::1' } };
        assert.equal(limiter.getClientIp(req5), '127.0.0.1');
    });

    test('gera cabeçalhos RFC 6585 padronizados', () => {
        const resultAllowed = { allowed: true, remaining: 3, resetSeconds: 45, retryAfterSeconds: 0 };
        const headersAllowed = limiter.getHeaders(resultAllowed, 5);
        assert.equal(headersAllowed['RateLimit-Limit'], 5);
        assert.equal(headersAllowed['RateLimit-Remaining'], 3);
        assert.equal(headersAllowed['RateLimit-Reset'], 45);
        assert.equal(headersAllowed['Retry-After'], undefined);

        const resultBlocked = { allowed: false, remaining: 0, resetSeconds: 30, retryAfterSeconds: 30 };
        const headersBlocked = limiter.getHeaders(resultBlocked, 5);
        assert.equal(headersBlocked['RateLimit-Limit'], 5);
        assert.equal(headersBlocked['RateLimit-Remaining'], 0);
        assert.equal(headersBlocked['RateLimit-Reset'], 30);
        assert.equal(headersBlocked['Retry-After'], 30);
    });

    test('limpa memória expurgando buckets expirados', () => {
        const now = 1000000;
        limiter.check('stale-ip', 5, 60000, now);
        assert.equal(limiter.buckets.size, 1);

        // 3 minutos depois (180.000ms > maxIdleMs de 120.000ms)
        const deleted = limiter.cleanup(now + 180000, 120000);
        assert.equal(deleted, 1);
        assert.equal(limiter.buckets.size, 0);
    });
});
