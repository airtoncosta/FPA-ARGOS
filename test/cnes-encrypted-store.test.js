const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { packageSnapshots, readEncryptedSnapshotDetails, readEncryptedCatalog } = require('../lib/cnes-encrypted-store');

function inTemporaryRepository(callback) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'argos-cnes-encrypted-'));
    return Promise.resolve().then(() => callback(root)).finally(() => {
        const resolved = path.resolve(root);
        if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('temporary path escaped');
        fs.rmSync(resolved, { recursive: true, force: true });
    });
}

function fixture(root) {
    const auto = path.join(root, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'auto');
    const relative = 'snapshots/202608/rev-1-source.json';
    const snapshot = {
        codigoIbge: '210120', competencia: '202608', estabelecimentos: [
            { cnes: '0123456', profissionais: [{ cns: '700000000000001', nome: 'ANA TESTE', cbo: '223505', chTotal: 40 }] }
        ]
    };
    const bytes = Buffer.from(JSON.stringify(snapshot));
    fs.mkdirSync(path.dirname(path.join(auto, relative)), { recursive: true });
    fs.writeFileSync(path.join(auto, relative), bytes);
    fs.writeFileSync(path.join(auto, 'manifest.json'), JSON.stringify({
        schema_version: 1, scope: { municipality_ibge: '210120', uf: 'MA' }, active_competence: '202608',
        competencies: { '202608': {
            revision: 1, status: 'published', published_at: '2026-09-18T00:00:00Z',
            source: 'DATASUS_FTP', snapshot: { path: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
            counts: { establishments: 1, professionals: 1, professional_links: 1, quarantined: 0 },
            coverage: { st: true, pf: true }
        } }
    }));
    return snapshot;
}

test('packages identifiable CNES records encrypted and reads them with the correct key', async () => {
    await inTemporaryRepository(async root => {
        const expected = fixture(root);
        const key = crypto.randomBytes(32).toString('hex');
        const manifest = packageSnapshots({ root, key });
        const output = path.join(root, 'data', 'cnes-encrypted');
        const catalog = await readEncryptedCatalog({ root });
        const encrypted = fs.readFileSync(path.join(output, manifest.competencies['202608'].blob.path), 'utf8');
        assert.equal(encrypted.includes('700000000000001'), false);
        assert.equal(encrypted.includes('ANA TESTE'), false);
        assert.equal(JSON.stringify(catalog).includes('700000000000001'), false);
        const result = await readEncryptedSnapshotDetails({ root, competence: '202608', key });
        assert.deepEqual(result.snapshot, expected);
        assert.equal(result.competence, '202608');
    });
});

test('rejects tampered blobs and wrong keys without leaking data', async () => {
    await inTemporaryRepository(async root => {
        fixture(root);
        const key = crypto.randomBytes(32).toString('hex');
        const manifest = packageSnapshots({ root, key });
        const wrong = crypto.randomBytes(32).toString('hex');
        assert.equal(await readEncryptedSnapshotDetails({ root, competence: '202608', key: wrong }), null);
        const blob = path.join(root, 'data', 'cnes-encrypted', manifest.competencies['202608'].blob.path);
        fs.appendFileSync(blob, '\n');
        assert.equal(await readEncryptedSnapshotDetails({ root, competence: '202608', key }), null);
    });
});

test('does not package inferred Portaria 134 labels as official data', async () => {
    await inTemporaryRepository(root => {
        fixture(root);
        const auto = path.join(root, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'auto');
        const manifest = JSON.parse(fs.readFileSync(path.join(auto, 'manifest.json'), 'utf8'));
        const source = path.join(auto, manifest.competencies['202608'].snapshot.path);
        const data = JSON.parse(fs.readFileSync(source, 'utf8'));
        data.estabelecimentos[0].profissionais[0].portaria134 = 'SOBREPOSICAO';
        const bytes = Buffer.from(JSON.stringify(data));
        fs.writeFileSync(source, bytes);
        manifest.competencies['202608'].snapshot.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        fs.writeFileSync(path.join(auto, 'manifest.json'), JSON.stringify(manifest));
        assert.throws(() => packageSnapshots({ root, key: crypto.randomBytes(32).toString('hex') }), /Portaria 134/);
    });
});
