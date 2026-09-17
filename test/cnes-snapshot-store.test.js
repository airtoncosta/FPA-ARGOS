const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readPublishedSnapshot } = require('../lib/cnes-snapshot-store');

function createStoreRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'argos-cnes-store-'));
    fs.mkdirSync(path.join(root, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'auto', 'snapshots'), { recursive: true });
    return root;
}

function writeSnapshot(root, competence, body, revision = 1) {
    const autoDir = path.join(root, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'auto');
    const content = JSON.stringify(body);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const relative = path.join('snapshots', competence, `rev-${revision}-${hash}.json`);
    const file = path.join(autoDir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return { path: relative.replaceAll(path.sep, '/'), sha256: hash };
}

function writeManifest(root, manifest) {
    const file = path.join(root, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'auto', 'manifest.json');
    fs.writeFileSync(file, JSON.stringify(manifest));
}

function manifestFor(activeCompetence, entries, extra = {}) {
    return {
        scope: { municipality_ibge: '210120' },
        active_competence: activeCompetence,
        competencies: entries,
        ...extra
    };
}

test('retorna snapshot publicado da competência ativa', () => {
    const root = createStoreRoot();
    const snapshot = { competencia: '202608', codigoIbge: '210120', estabelecimentos: [{ cnes: '012001' }] };
    const ref = writeSnapshot(root, '202608', snapshot);
    writeManifest(root, manifestFor('202608', {
        '202608': {
            status: 'published',
            snapshot: ref,
            coverage: { establishments: true, professionals: true },
            counts: { establishments: 1, professionals: 0 }
        }
    }));

    assert.deepEqual(readPublishedSnapshot(root), snapshot);
});

test('retorna a competência solicitada quando ela está publicada', () => {
    const root = createStoreRoot();
    const older = { competencia: '202607', codigoIbge: '210120', estabelecimentos: [{ cnes: '012007' }] };
    const current = { competencia: '202608', codigoIbge: '210120', estabelecimentos: [{ cnes: '012008' }] };
    const olderRef = writeSnapshot(root, '202607', older);
    const currentRef = writeSnapshot(root, '202608', current);
    writeManifest(root, manifestFor('202608', {
        '202607': { status: 'published', snapshot: olderRef },
        '202608': { status: 'published', snapshot: currentRef }
    }));

    assert.deepEqual(readPublishedSnapshot(root, '202607'), older);
});

test('recusa manifesto fora do escopo de Bacabal', () => {
    const root = createStoreRoot();
    const snapshot = { competencia: '202608', codigoIbge: '999999', estabelecimentos: [] };
    const ref = writeSnapshot(root, '202608', snapshot);
    writeManifest(root, manifestFor('202608', {
        '202608': { status: 'published', snapshot: ref }
    }, { scope: { municipality_ibge: '999999' } }));

    assert.equal(readPublishedSnapshot(root), null);
});

test('recusa snapshot não publicado, caminho externo ou hash divergente', () => {
    const root = createStoreRoot();
    const snapshot = { competencia: '202608', codigoIbge: '210120', estabelecimentos: [] };
    const ref = writeSnapshot(root, '202608', snapshot);
    const manifest = manifestFor('202608', {
        '202608': { status: 'staged', snapshot: ref }
    });
    writeManifest(root, manifest);
    assert.equal(readPublishedSnapshot(root), null);

    manifest.competencies['202608'] = {
        status: 'published',
        snapshot: { path: '../manifest.json', sha256: ref.sha256 }
    };
    writeManifest(root, manifest);
    assert.equal(readPublishedSnapshot(root), null);

    manifest.competencies['202608'] = {
        status: 'published',
        snapshot: { ...ref, sha256: '0'.repeat(64) }
    };
    writeManifest(root, manifest);
    assert.equal(readPublishedSnapshot(root), null);
});

test('retorna null quando não existe manifesto novo, permitindo fallback legado', () => {
    const root = createStoreRoot();
    assert.equal(readPublishedSnapshot(root), null);
});

test('recusa snapshot sem escopo e competência explícitos', () => {
    const root = createStoreRoot();
    const snapshot = { estabelecimentos: [{ cnes: '0123456' }] };
    const ref = writeSnapshot(root, '202608', snapshot);
    writeManifest(root, manifestFor('202608', {
        '202608': { status: 'published', snapshot: ref }
    }));
    assert.equal(readPublishedSnapshot(root), null);
});
