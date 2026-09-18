const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createMunicipioHandler } = require('../api/cnes/municipio');

function createStoreRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'argos-cnes-vercel-'));
    return root;
}

async function encryptedDetails({ competence }) {
    if (competence && competence !== '202608') return null;
    const snapshot = { competencia: '202608', codigoIbge: '210120', estabelecimentos: [{ cnes: '0123456' }] };
    return {
        snapshot,
        competence: '202608',
        competencies: [{ codigo: '202608', label: '08/2026', vigente: true }],
        manifest: { competencies: { '202608': { status: 'published' } } }
    };
}

async function request(handler, { url, authorization } = {}) {
    const headers = authorization ? { authorization } : {};
    const req = { method: 'GET', url: url || '/api/cnes/municipio?ibge=210120&competencia=202608', headers };
    const result = { status: null, headers: {}, body: '' };
    const res = {
        setHeader(name, value) { result.headers[name.toLowerCase()] = value; },
        writeHead(status, headersArg) { result.status = status; Object.assign(result.headers, Object.fromEntries(Object.entries(headersArg || {}).map(([k, v]) => [k.toLowerCase(), v]))); },
        end(body) { result.body = String(body || ''); }
    };
    await handler(req, res);
    return { ...result, json: JSON.parse(result.body) };
}

test('municipio Vercel exige token antes de revelar snapshot CNES', async () => {
    const root = createStoreRoot();
    const handler = createMunicipioHandler({
        rootDir: root,
        authorizeRequest: async () => ({ authorized: false, code: 'CNES_AUTH_REQUIRED' }),
        readSnapshotDetails: encryptedDetails
    });

    const response = await request(handler);

    assert.equal(response.status, 401);
    assert.equal(response.json.code, 'CNES_AUTH_REQUIRED');
    assert.equal(response.headers['cache-control'], 'no-store');
});

test('municipio Vercel entrega apenas competência publicada ao cliente autorizado', async () => {
    const root = createStoreRoot();
    const handler = createMunicipioHandler({ rootDir: root, authorizeRequest: async () => ({ authorized: true }), readSnapshotDetails: encryptedDetails });

    const response = await request(handler, { authorization: 'Bearer user-session' });

    assert.equal(response.status, 200);
    assert.equal(response.json.competenciaPadrao, '202608');
    assert.equal(response.json.source_type, 'published_snapshot');
    assert.equal(response.headers['cache-control'], 'private, no-store');
});

test('municipio Vercel retorna erro explícito quando a competência não está publicada', async () => {
    const root = createStoreRoot();
    const handler = createMunicipioHandler({ rootDir: root, authorizeRequest: async () => ({ authorized: true }), readSnapshotDetails: encryptedDetails });

    const response = await request(handler, {
        url: '/api/cnes/municipio?ibge=210120&competencia=202607',
        authorization: 'Bearer user-session'
    });

    assert.equal(response.status, 404);
    assert.equal(response.json.code, 'CNES_COMPETENCE_UNAVAILABLE');
});

test('municipio Vercel informa indisponibilidade do armazenamento sem confundir com competência ausente', async () => {
    const root = createStoreRoot();
    const handler = createMunicipioHandler({
        rootDir: root,
        snapshotKey: 'a'.repeat(64),
        authorizeRequest: async () => ({ authorized: true })
    });

    const response = await request(handler, { authorization: 'Bearer user-session' });

    assert.equal(response.status, 503);
    assert.equal(response.json.code, 'CNES_SNAPSHOT_STORE_UNAVAILABLE');
});
