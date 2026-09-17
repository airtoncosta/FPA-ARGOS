const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/js/malha-fina-engine.js'), 'utf8');

function engineWith(files) {
    const window = { crypto: crypto.webcrypto };
    const fetch = async url => ({
        ok: Object.hasOwn(files, url),
        status: Object.hasOwn(files, url) ? 200 : 404,
        text: async () => JSON.stringify(files[url])
    });
    vm.runInNewContext(source, { window, fetch, console, TextEncoder });
    return window.MalhaFinaEngine;
}

function snapshotRef(competence, body) {
    const sha256 = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
    return { path: `snapshots/${competence}/rev-1-${sha256}.json`, sha256 };
}

test('auditoria BPA lê CNES automático somente da competência publicada', async () => {
    const body = { competencia: '202609', codigoIbge: '210120', estabelecimentos: [
        { cnes: '1234567', profissionais: [{ cns: '700000000000001', cbo: '225125' }] }
    ] };
    const ref = snapshotRef('202609', body);
    const engine = engineWith({
        'audit_data/manifest.json': { cnes: {}, sigtap: {} },
        'cnes_data/auto/manifest.json': {
            scope: { municipality_ibge: '210120', uf: 'MA' },
            competencies: {
                '202609': {
                    status: 'published',
                    source: 'DATASUS_FTP',
                    snapshot: ref,
                    coverage: { st: true, pf: true, services: false, habilitations: false },
                    counts: { establishments: 1, professional_links: 1, quarantined: 0 }
                }
            }
        },
        [`cnes_data/auto/${ref.path}`]: body
    });

    const result = await engine.loadBases(['202609', '202608']);
    assert.equal(result.bases['202609'].cnes.competencia, '202609');
    assert.equal(result.bases['202609'].cnes.oficial, true);
    assert.equal(result.bases['202609'].cnes.completo, true);
    assert.equal(result.bases['202609'].cnes.cobertura.servicos, false);
    assert.equal(result.bases['202608'].cnes, undefined);
});

test('auditoria não declara cobertura completa quando PF ou quarentena estão pendentes', async () => {
    const body = { competencia: '202609', codigoIbge: '210120', estabelecimentos: [] };
    const ref = snapshotRef('202609', body);
    const engine = engineWith({
        'audit_data/manifest.json': { cnes: {}, sigtap: {} },
        'cnes_data/auto/manifest.json': {
            scope: { municipality_ibge: '210120' },
            competencies: {
                '202609': {
                    status: 'published', source: 'DATASUS_FTP',
                    snapshot: ref,
                    coverage: { st: true, pf: false },
                    counts: { quarantined: 2 }
                }
            }
        },
        [`cnes_data/auto/${ref.path}`]: body
    });

    const result = await engine.loadBases(['202609']);
    assert.equal(result.bases['202609'].cnes.completo, false);
    assert.equal(result.bases['202609'].cnes.cobertura.profissionais, false);
});

test('auditoria rejeita snapshot automático de outro município', async () => {
    const body = { competencia: '202609', codigoIbge: '999999', estabelecimentos: [] };
    const ref = snapshotRef('202609', body);
    const engine = engineWith({
        'audit_data/manifest.json': { cnes: {}, sigtap: {} },
        'cnes_data/auto/manifest.json': {
            scope: { municipality_ibge: '210120' },
            competencies: {
                '202609': {
                    status: 'published', source: 'DATASUS_FTP',
                    snapshot: ref,
                    coverage: { st: true, pf: true }, counts: { quarantined: 0 }
                }
            }
        },
        [`cnes_data/auto/${ref.path}`]: body
    });

    const result = await engine.loadBases(['202609']);
    assert.equal(result.bases['202609'].cnes, undefined);
    assert.ok(result.sources.some(item => item.tipo === 'CNES' && item.estado === 'Indisponível'));
});

test('auditoria rejeita snapshot cujo SHA-256 diverge do manifesto', async () => {
    const declared = { competencia: '202609', codigoIbge: '210120', estabelecimentos: [{ cnes: '1234567', profissionais: [] }] };
    const tampered = { competencia: '202609', codigoIbge: '210120', estabelecimentos: [{ cnes: '7654321', profissionais: [] }] };
    const ref = snapshotRef('202609', declared);
    const engine = engineWith({
        'audit_data/manifest.json': { cnes: {}, sigtap: {} },
        'cnes_data/auto/manifest.json': {
            scope: { municipality_ibge: '210120' },
            competencies: { '202609': { status: 'published', snapshot: ref, coverage: { st: true, pf: true }, counts: { quarantined: 0 } } }
        },
        [`cnes_data/auto/${ref.path}`]: tampered
    });

    const result = await engine.loadBases(['202609']);
    assert.equal(result.bases['202609'].cnes, undefined);
});
