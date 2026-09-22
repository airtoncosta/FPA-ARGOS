const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const malhaSource = fs.readFileSync(path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/js/malha-fina-engine.js'), 'utf8');
const penteSource = fs.readFileSync(path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/js/pente-fino-engine.js'), 'utf8');

function engineWith(files, liveWindow = {}, source = malhaSource, extraSandbox = {}) {
    const window = { crypto: crypto.webcrypto, ...liveWindow };
    const fetch = async (url, opts) => {
        if (Object.hasOwn(files, url)) {
            const v = files[url];
            if (typeof v === 'function') return v(url, opts);
            if (v && typeof v === 'object' && 'ok' in v) return v;
        }
        return {
            ok: Object.hasOwn(files, url),
            status: Object.hasOwn(files, url) ? 200 : 404,
            text: async () => JSON.stringify(files[url])
        };
    };
    vm.runInNewContext(source, { window, fetch, console, TextEncoder, ...extraSandbox });
    return window.MalhaFinaEngine || window.PenteFinoEngine;
}

function httpError(status) {
    return () => ({ ok: false, status, text: async () => 'bloqueado' });
}

function penteEngineWith(files, liveWindow = {}) {
    return engineWith(files, liveWindow, penteSource);
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

test('loadBases aplica aliases históricos versionados quando o snapshot automático não os traz', async () => {
    const body = { competencia: '202609', codigoIbge: '210120', estabelecimentos: [
        { cnes: '2458055', profissionais: [{ cns: '700000000000001', cbo: '225125' }] }
    ] };
    const ref = snapshotRef('202609', body);
    const files = {
        'audit_data/manifest.json': { cnes: {}, sigtap: {} },
        'cnes_data/auto/manifest.json': {
            scope: { municipality_ibge: '210120' },
            competencies: {
                '202609': { status: 'published', snapshot: ref, coverage: { st: true, pf: true }, counts: { quarantined: 0 } }
            }
        },
        [`cnes_data/auto/${ref.path}`]: body,
        'cnes_data/cnes_aliases_210120.json': {
            municipio_ibge: '210120',
            aliases: { '2458055': ['2387412'] }
        }
    };

    for (const load of [penteEngineWith(files), engineWith(files)]) {
        const result = await load.loadBases(['202609']);
        const unidade = result.bases['202609'].cnes.estabelecimentos.find(u => String(u.cnes) === '2458055');
        assert.ok(unidade, 'Unidade deve existir na base');
        assert.ok((unidade.aliases || []).includes('2387412'), 'Alias histórico deve ser aplicado à unidade da mesma competência');
        assert.ok(result.sources.some(s => /lias/.test(s.tipo + ' ' + s.fonte)), 'Enriquecimento de aliases deve constar nas fontes');
    }
});

test('loadBases incorpora vínculos vigentes do menu CNES na mesma competência sem remover a base publicada', async () => {
    const body = { competencia: '202609', codigoIbge: '210120', estabelecimentos: [
        { cnes: '2458055', profissionais: [{ cns: '700000000000001', cbo: '225125' }] }
    ] };
    const ref = snapshotRef('202609', body);
    const files = {
        'audit_data/manifest.json': { cnes: {}, sigtap: {} },
        'cnes_data/auto/manifest.json': {
            scope: { municipality_ibge: '210120' },
            competencies: {
                '202609': { status: 'published', snapshot: ref, coverage: { st: true, pf: true }, counts: { quarantined: 0 } }
            }
        },
        [`cnes_data/auto/${ref.path}`]: body
    };
    const liveWindow = {
        CnesModule: { state: {
            competenciaAtiva: '202609',
            estabelecimentos: [
                { cnes: '2458055', profissionais: [
                    { cns: '700000000000001', cbo: '225125' },
                    { cns: '700000000000002', cbo: '225125', nome: 'Profissional vigente' }
                ] }
            ]
        } }
    };

    for (const load of [penteEngineWith(files, liveWindow), engineWith(files, liveWindow)]) {
        const result = await load.loadBases(['202609']);
        const unidade = result.bases['202609'].cnes.estabelecimentos.find(u => String(u.cnes) === '2458055');
        const cnsList = (unidade.profissionais || []).map(p => String(p.cns || p.cnsMaster));
        assert.ok(cnsList.includes('700000000000001'), 'Vínculo da base publicada deve ser preservado');
        assert.ok(cnsList.includes('700000000000002'), 'Vínculo vigente do menu CNES deve ser incorporado na mesma competência');
        assert.ok(result.sources.some(s => /vigente|Menu CNES/i.test(s.tipo + ' ' + s.fonte + ' ' + s.estado)), 'Complemento da fonte viva deve constar nas fontes');
    }
});

test('vínculos vigentes de outra competência não são incorporados (fail-closed)', async () => {
    const body = { competencia: '202609', codigoIbge: '210120', estabelecimentos: [
        { cnes: '2458055', profissionais: [{ cns: '700000000000001', cbo: '225125' }] }
    ] };
    const ref = snapshotRef('202609', body);
    const files = {
        'audit_data/manifest.json': { cnes: {}, sigtap: {} },
        'cnes_data/auto/manifest.json': {
            scope: { municipality_ibge: '210120' },
            competencies: {
                '202609': { status: 'published', snapshot: ref, coverage: { st: true, pf: true }, counts: { quarantined: 0 } }
            }
        },
        [`cnes_data/auto/${ref.path}`]: body
    };
    const liveWindow = {
        CnesModule: { state: {
            competenciaAtiva: '202608',
            estabelecimentos: [
                { cnes: '2458055', profissionais: [{ cns: '700000000000002', cbo: '225125' }] }
            ]
        } }
    };

    for (const load of [penteEngineWith(files, liveWindow), engineWith(files, liveWindow)]) {
        const result = await load.loadBases(['202609']);
        const unidade = result.bases['202609'].cnes.estabelecimentos.find(u => String(u.cnes) === '2458055');
        const cnsList = (unidade.profissionais || []).map(p => String(p.cns || p.cnsMaster));
        assert.ok(!cnsList.includes('700000000000002'), 'Vínculo de outra competência nunca aprova lotação');
    }
});

test('loadBases busca a base CNES na API autorizada quando o estático está bloqueado (403)', async () => {
    const apiBody = {
        competencia: '202609', codigoIbge: '210120', municipio: 'BACABAL', uf: 'MA',
        source_type: 'published_snapshot',
        coverage: { st: true, pf: true }, counts: { quarantined: 0 },
        estabelecimentos: [{ cnes: '2458055', profissionais: [{ cns: '700000000000001', cbo: '225125' }] }]
    };
    const files = {
        'audit_data/manifest.json': { cnes: {}, sigtap: {} },
        'cnes_data/auto/manifest.json': httpError(403),
        '/api/cnes/bacabal?competencia=202609': { ok: true, status: 200, text: async () => JSON.stringify(apiBody), json: async () => apiBody }
    };

    for (const load of [penteEngineWith(files), engineWith(files)]) {
        const result = await load.loadBases(['202609']);
        const base = result.bases['202609'].cnes;
        assert.ok(base, 'Base deve carregar via API quando o estático está bloqueado');
        assert.strictEqual(base.competencia, '202609');
        assert.strictEqual(base.oficial, true);
        assert.strictEqual(base.completo, true);
        assert.ok((base.estabelecimentos[0].profissionais || []).some(p => String(p.cns) === '700000000000001'));
        assert.ok(result.sources.some(s => s.tipo === 'CNES' && s.estado === 'Carregado' && /api/i.test(s.fonte)), 'Fonte API deve constar com Carregado');
    }
});

test('loadBases envia Bearer da sessão ao chamar a API CNES', async () => {
    const apiBody = {
        competencia: '202609', codigoIbge: '210120',
        source_type: 'published_snapshot',
        coverage: { st: true, pf: true }, counts: { quarantined: 0 },
        estabelecimentos: [{ cnes: '2458055', profissionais: [] }]
    };
    const chamadas = [];
    const files = {
        'audit_data/manifest.json': { cnes: {}, sigtap: {} },
        'cnes_data/auto/manifest.json': httpError(403),
        '/api/cnes/bacabal?competencia=202609': (url, opts) => {
            chamadas.push({ url, auth: opts && opts.headers && opts.headers.Authorization });
            return { ok: true, status: 200, text: async () => JSON.stringify(apiBody), json: async () => apiBody };
        }
    };
    const liveWindow = {
        SupabaseConfig: { getClient: () => null, getAnonKey: () => 'anon-key-123' }
    };

    for (const load of [penteEngineWith(files, liveWindow), engineWith(files, liveWindow)]) {
        chamadas.length = 0;
        const result = await load.loadBases(['202609']);
        assert.ok(result.bases['202609'].cnes, 'Base deve carregar via API');
        assert.ok(chamadas.some(c => c.auth === 'Bearer anon-key-123'), 'API CNES deve receber Authorization Bearer, got: ' + JSON.stringify(chamadas));
    }
});

test('API 401 recorre ao estático legado da mesma competência', async () => {
    const legacy = { competencia: '202609', codigoIbge: '210120', estabelecimentos: [{ cnes: '2458055', profissionais: [] }] };
    const files = {
        'audit_data/manifest.json': {
            cnes: { '202609': { url: 'cnes_data/cnes_210120_202609.json', oficial: true, completo: true, cobertura: { profissionais: true } } },
            sigtap: {}
        },
        'cnes_data/auto/manifest.json': httpError(404),
        '/api/cnes/bacabal?competencia=202609': httpError(401),
        'cnes_data/cnes_210120_202609.json': legacy
    };

    for (const load of [penteEngineWith(files), engineWith(files)]) {
        const result = await load.loadBases(['202609']);
        assert.ok(result.bases['202609'].cnes, '401 na API deve recorrer ao estático legado');
    }
});

test('loadBases usa o estático legado quando a API está fora', async () => {
    const legacy = { competencia: '202609', codigoIbge: '210120', estabelecimentos: [{ cnes: '2458055', profissionais: [] }] };
    const files = {
        'audit_data/manifest.json': {
            cnes: { '202609': { url: 'cnes_data/cnes_210120_202609.json', oficial: true, completo: true, cobertura: { profissionais: true } } },
            sigtap: {}
        },
        'cnes_data/auto/manifest.json': httpError(404),
        '/api/cnes/bacabal?competencia=202609': httpError(503),
        'cnes_data/cnes_210120_202609.json': legacy
    };

    for (const load of [penteEngineWith(files), engineWith(files)]) {
        const result = await load.loadBases(['202609']);
        assert.ok(result.bases['202609'].cnes, 'Base deve carregar via fallback estático');
        assert.strictEqual(result.bases['202609'].cnes.oficial, true);
    }
});

test('aliases via API quando o overlay estático está bloqueado', async () => {
    const body = { competencia: '202609', codigoIbge: '210120', estabelecimentos: [
        { cnes: '2458055', profissionais: [{ cns: '700000000000001', cbo: '225125' }] }
    ] };
    const ref = snapshotRef('202609', body);
    const files = {
        'audit_data/manifest.json': { cnes: {}, sigtap: {} },
        'cnes_data/auto/manifest.json': {
            scope: { municipality_ibge: '210120' },
            competencies: {
                '202609': { status: 'published', snapshot: ref, coverage: { st: true, pf: true }, counts: { quarantined: 0 } }
            }
        },
        [`cnes_data/auto/${ref.path}`]: body,
        'cnes_data/cnes_aliases_210120.json': httpError(403),
        '/api/cnes/aliases?ibge=210120': { ok: true, status: 200, text: async () => JSON.stringify({ municipio_ibge: '210120', aliases: { '2458055': ['2387412'] } }), json: async () => ({ municipio_ibge: '210120', aliases: { '2458055': ['2387412'] } }) }
    };

    for (const load of [penteEngineWith(files), engineWith(files)]) {
        const result = await load.loadBases(['202609']);
        const unidade = result.bases['202609'].cnes.estabelecimentos.find(u => String(u.cnes) === '2458055');
        assert.ok((unidade.aliases || []).includes('2387412'), 'Alias via API deve ser aplicado');
    }
});

test('executarAuditoria aprova Regra 1 com base CNES carregada via API (cenário do usuário)', async () => {
    const apiBody = {
        competencia: '202609', codigoIbge: '210120', municipio: 'BACABAL', uf: 'MA',
        source_type: 'published_snapshot',
        coverage: { st: true, pf: true }, counts: { quarantined: 0 },
        estabelecimentos: [{ cnes: '2458055', profissionais: [{ cns: '700000000000005', cbo: '225125' }] }]
    };
    const files = {
        'audit_data/manifest.json': { cnes: {}, sigtap: {} },
        'cnes_data/auto/manifest.json': httpError(403),
        '/api/cnes/bacabal?competencia=202609': { ok: true, status: 200, text: async () => JSON.stringify(apiBody), json: async () => apiBody }
    };
    const texto = [
        '01#BPA#202609000001000001' + ' '.repeat(103),
        '03' + '2458055' + '202609' + '700000000000005' + '225125' + '20260915' + '001' + '01' + '0301010072' + ' '.repeat(15) + 'M' + ' '.repeat(6) + 'A000' + '030' + '000001'
    ].join('\r\n') + '\r\n';

    for (const source of [penteSource]) {
        const window = { crypto: crypto.webcrypto };
        const fetch = async url => {
            if (Object.hasOwn(files, url) && typeof files[url] === 'function') return files[url](url);
            if (Object.hasOwn(files, url)) {
                const v = files[url];
                if (v && typeof v === 'object' && 'ok' in v) return v;
                return { ok: true, status: 200, text: async () => JSON.stringify(v) };
            }
            return { ok: false, status: 404, text: async () => 'nf' };
        };
        const SigtapAuditApi = { load: async () => ({ bases: {}, sources: [] }) };
        const BpaAuditCore = require(path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js'));
        vm.runInNewContext(source, { window, fetch, console, TextEncoder, SigtapAuditApi, BpaAuditCore });
        const engine = window.MalhaFinaEngine || window.PenteFinoEngine;
        const res = await engine.executarAuditoria({ conteudo: texto, nomeArquivo: 'PA2458055.BPA' }, () => {});
        assert.strictEqual(res.classificacao5Regras.regra1_lotacao_cnes.ok, true, 'Regra 1 deve aprovar com a base via API');
        assert.strictEqual(res.classificacao5Regras.regra1_lotacao_cnes.status, 'CONFORME');
    }
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
