const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Edge Functions Rate Limiter Integration & Integrity', () => {
    test('garante que o helper Deno _shared/rate-limiter.ts existe e contém a lógica de sliding window', () => {
        const filePath = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357/supabase/functions/_shared/rate-limiter.ts');
        assert.ok(fs.existsSync(filePath), '_shared/rate-limiter.ts deve existir');
        const content = fs.readFileSync(filePath, 'utf8');
        assert.ok(content.includes('checkEdgeRateLimit'), 'deve exportar checkEdgeRateLimit');
        assert.ok(content.includes('RATE_LIMIT_EXCEEDED'), 'deve conter código de erro RATE_LIMIT_EXCEEDED');
        assert.ok(content.includes('RateLimit-Limit'), 'deve incluir header RateLimit-Limit');
        assert.ok(content.includes('Retry-After'), 'deve incluir header Retry-After');
    });

    test('garante que sign-in/index.ts e enviar-bpa-email/index.ts chamam o rate limiter na borda', () => {
        const signInPath = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357/supabase/functions/sign-in/index.ts');
        const bpaPath = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357/supabase/functions/enviar-bpa-email/index.ts');

        const signInContent = fs.readFileSync(signInPath, 'utf8');
        const bpaContent = fs.readFileSync(bpaPath, 'utf8');

        assert.ok(signInContent.includes('checkEdgeRateLimit'), 'sign-in deve chamar checkEdgeRateLimit');
        assert.ok(signInContent.includes('sign-in'), 'sign-in deve usar categoria sign-in');

        assert.ok(bpaContent.includes('checkEdgeRateLimit'), 'enviar-bpa-email deve chamar checkEdgeRateLimit');
        assert.ok(bpaContent.includes('enviar-bpa-email'), 'enviar-bpa-email deve usar categoria enviar-bpa-email');
    });
});
