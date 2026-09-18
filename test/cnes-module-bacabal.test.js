const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publicJs = path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'js');
const moduleSource = fs.readFileSync(path.join(publicJs, 'cnes-module.js'), 'utf8');
const diffSource = fs.readFileSync(path.join(publicJs, 'cnes-diff-engine.js'), 'utf8');

function loadModule(responses) {
    const view = { innerHTML: '' };
    const requested = [];
    const context = {
        window: { MUNICIPIOS_BR: { MA: ['BACABAL'] } },
        document: { getElementById: id => id === 'viewCnes' ? view : null },
        localStorage: { getItem: () => null, setItem: () => {} },
        console,
        fetch: async url => {
            requested.push(url);
            const competence = new URL(url, 'http://localhost').searchParams.get('competencia') || 'active';
            const payload = responses[competence];
            return payload ? { ok: true, json: async () => payload } : { ok: false, status: 404 };
        }
    };
    vm.runInNewContext(diffSource, context);
    vm.runInNewContext(moduleSource, context);
    return { module: context.window.CnesModule, view, requested, context };
}

function published(competence, hours, competencies) {
    return {
        source_type: 'published_snapshot',
        codigoIbge: '210120',
        competencia: competence,
        competenciaPadrao: competence,
        competencias: competencies,
        estabelecimentos: [{ cnes: '0123456', nomeFantasia: 'UNIDADE TESTE', profissionais: [
            { linkIdentity: 'same-link', cns: '700000000000001', cbo: '223505', nome: 'ANA', chAmb: hours, chTotal: hours }
        ] }]
    };
}

test('Bacabal compara competências publicadas sem simular o mês anterior', async () => {
    const competencies = [{ codigo: '202608', label: '08/2026' }, { codigo: '202607', label: '07/2026' }];
    const { module, view, requested, context } = loadModule({
        active: published('202608', 30, competencies),
        '202607': published('202607', 20, competencies)
    });
    context.window.CnesDiffEngine.simularCompetenciaAnterior = () => { throw new Error('simulação indevida'); };

    await module.carregarDados();
    await module.abrirMovimentacoes();

    assert.ok(requested.some(url => url.includes('competencia=202607')));
    assert.match(view.innerHTML, /07\/2026/);
    assert.match(view.innerHTML, /08\/2026/);
    assert.match(view.innerHTML, /AUMENTO/);
    assert.doesNotMatch(view.innerHTML, /risco glosa|Portaria 134 \/ Glosa/i);
});

test('Bacabal com um único mês publicado exibe ausência de comparação', async () => {
    const competencies = [{ codigo: '202608', label: '08/2026' }];
    const { module, view, context } = loadModule({ active: published('202608', 30, competencies) });
    context.window.CnesDiffEngine.simularCompetenciaAnterior = () => { throw new Error('simulação indevida'); };

    await module.carregarDados();
    await module.abrirMovimentacoes();

    assert.match(view.innerHTML, /Ainda não há outra competência publicada/);
});

test('não transforma carga horária municipal incompleta em alerta ou Artigo 2º', () => {
    const { module } = loadModule({});
    const horas = new Map([['700000000000001', 84]]);
    const vinculos = new Map([['700000000000001', 2]]);

    const status = module.obterStatusPortaria134({
        cns: '700000000000001',
        chTotal: 44,
        portaria134: 'SOBREPOSIÇÃO (>60h)'
    }, horas, vinculos);

    assert.equal(status.alerta, false);
    assert.equal(status.oficial.alerta, false);
    assert.equal(status.triagem.alerta, false);
    assert.doesNotMatch(status.html, /Artigo 2º/i);
});

test('exibe Artigo 2º somente quando a anotação tem fonte oficial CNES', () => {
    const { module } = loadModule({});
    const status = module.obterStatusPortaria134({
        cns: '700000000000001',
        chTotal: 44,
        portaria134: 'Artigo 2º',
        portaria134Fonte: 'CNES_OFICIAL',
        portaria134Competencia: '202608'
    });

    assert.equal(status.alerta, true);
    assert.equal(status.oficial.alerta, true);
    assert.match(status.html, /Artigo 2º/i);
    assert.equal(status.triagem.alerta, false);
});

test('ficha cadastral reúne todos os vínculos do mesmo CNS', async () => {
    const competencies = [{ codigo: '202608', label: '08/2026' }];
    const payload = published('202608', 44, competencies);
    payload.estabelecimentos[0].nomeFantasia = 'UNIDADE A';
    payload.estabelecimentos[0].profissionais[0].portaria134 = 'SOBREPOSIÇÃO';
    payload.estabelecimentos[0].profissionais[0].portaria134Fonte = '';
    payload.estabelecimentos.push({
        cnes: '0765432',
        nomeFantasia: 'UNIDADE B',
        profissionais: [{
            linkIdentity: 'other-link',
            cns: '700000000000001',
            cbo: '223505',
            nome: 'ANA',
            chAmb: 20,
            chTotal: 20
        }]
    });
    const { module, view } = loadModule({ active: payload });

    await module.carregarDados();
    module.abrirDetalhesProfissional('700000000000001');

    assert.match(view.innerHTML, /UNIDADE A/);
    assert.match(view.innerHTML, /UNIDADE B/);
});

test('mapeia código PF conhecido e não inventa contratação ausente', () => {
    const { module } = loadModule({});

    assert.equal(
        module.formatarTipoVinculo({ codigoVinculacao: '010101' }),
        '010101 — ESTATUTÁRIO EFETIVO / SERVIDOR PRÓPRIO'
    );
    assert.match(module.formatarTipoVinculo({ codigoVinculacao: '999999' }), /não catalogado/);
    assert.equal(module.formatarTipoVinculo({}), 'Não informado');
});
