const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { uploadSnapshots } = require('../scripts/upload_cnes_snapshots_supabase');

const root = path.resolve(__dirname, '..');
const keyPath = path.join(root, 'data', 'cnes', '.snapshot-key');

test('upload somente de envelopes cifrados e verificacao dos hashes no Supabase', async t => {
    if (!fs.existsSync(keyPath)) return t.skip('chave de desenvolvimento local indisponivel');
    const key = fs.readFileSync(keyPath, 'utf8').trim();
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url: String(url), ...options });
        if (options.method === 'POST') {
            const row = JSON.parse(options.body);
            assert.equal(row.envelope.algorithm, 'aes-256-gcm');
            assert.deepEqual(Object.keys(row.envelope).sort(), ['algorithm', 'ciphertext', 'iv', 'tag', 'version']);
            assert.equal(Object.hasOwn(row, 'estabelecimentos'), false);
            return { ok: true, status: 201 };
        }
        const posted = JSON.parse(calls.at(-2).body);
        return { ok: true, json: async () => [{ blob_sha256: posted.blob_sha256, source_sha256: posted.source_sha256 }] };
    };
    const result = await uploadSnapshots({ root, url: 'https://example.supabase.co', serviceKey: 'test', key, fetchImpl });
    assert.deepEqual(result.map(row => row.competencia), ['202606', '202607', '202608']);
    assert.equal(calls.length, 6);
});

test('upload nao prossegue sem acesso de servico', async () => {
    await assert.rejects(uploadSnapshots({ root, url: 'https://example.supabase.co', serviceKey: '' }), /SERVICE_ROLE/);
});
