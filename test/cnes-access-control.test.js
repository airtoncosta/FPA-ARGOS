const test = require('node:test');
const assert = require('node:assert/strict');

const { createCnesAuthorizer } = require('../lib/cnes-access-control');

test('recusa CNES sem bearer token sem chamar o provedor de autenticação', async () => {
    let calls = 0;
    const authorize = createCnesAuthorizer({
        supabaseUrl: 'https://example.supabase.co',
        anonKey: 'anon-key',
        fetchImpl: async () => { calls += 1; return { ok: true }; }
    });

    const result = await authorize({ headers: {} });

    assert.deepEqual(result, { authorized: false, code: 'CNES_AUTH_REQUIRED' });
    assert.equal(calls, 0);
});

test('recusa CNES quando a validação de sessão não está configurada', async () => {
    const authorize = createCnesAuthorizer({ supabaseUrl: '', anonKey: '' });

    const result = await authorize({ headers: { authorization: 'Bearer user-session' } });

    assert.deepEqual(result, { authorized: false, code: 'CNES_AUTH_NOT_CONFIGURED' });
});

test('valida sessão Supabase no servidor antes de liberar CNES', async () => {
    const calls = [];
    const authorize = createCnesAuthorizer({
        supabaseUrl: 'https://project.supabase.co/',
        anonKey: 'anon-key',
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return { ok: true };
        }
    });

    const result = await authorize({ headers: { authorization: 'Bearer user-session' } });

    assert.deepEqual(result, { authorized: true });
    assert.deepEqual(calls, [{
        url: 'https://project.supabase.co/auth/v1/user',
        options: {
            headers: {
                apikey: 'anon-key',
                Authorization: 'Bearer user-session'
            }
        }
    }]);
});

test('recusa sessão Supabase inválida sem devolver detalhes do provedor', async () => {
    const authorize = createCnesAuthorizer({
        supabaseUrl: 'https://project.supabase.co',
        anonKey: 'anon-key',
        fetchImpl: async () => ({ ok: false })
    });

    const result = await authorize({ headers: { authorization: 'Bearer expired-session' } });

    assert.deepEqual(result, { authorized: false, code: 'CNES_AUTH_REQUIRED' });
});
