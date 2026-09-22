const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');

const TEST_PORT = 3907;
let serverInstance;

before(async () => {
    process.env.PORT = String(TEST_PORT);
    process.env.CNES_SYNC_ENABLED = '0';
    process.env.SIASUS_SYNC_ENABLED = '0';
    serverInstance = require('../server.js').server;
    await new Promise(resolve => setTimeout(resolve, 200));
});

after(async () => {
    if (serverInstance && serverInstance.listening) {
        await new Promise(resolve => serverInstance.close(resolve));
    }
});

test('bloqueia arquivo CNES legado servido diretamente como estático', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/cnes_data/cnes_bacabal.json`);

    assert.equal(response.status, 403);
});

test('bloqueia manifesto e snapshots CNES do diretório estático', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/cnes_data/auto/manifest.json`);

    assert.equal(response.status, 403);
});

test('bloqueia API CNES sem sessão autenticada', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/api/cnes/bacabal?competencia=202608`);

    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'CNES_AUTH_REQUIRED');
});

test('bloqueia overlay de aliases servido diretamente como estático', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/cnes_data/cnes_aliases_210120.json`);

    assert.equal(response.status, 403);
});

test('bloqueia API de aliases sem sessão autenticada', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/api/cnes/aliases?ibge=210120`);

    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'CNES_AUTH_REQUIRED');
});
