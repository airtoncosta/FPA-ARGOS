const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publicJs = path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'js');
const moduleSource = fs.readFileSync(path.join(publicJs, 'cnes-module.js'), 'utf8');
const diffSource = fs.readFileSync(path.join(publicJs, 'cnes-diff-engine.js'), 'utf8');
const p134Source = fs.readFileSync(path.join(publicJs, 'cnes-portaria134-bacabal.js'), 'utf8');

function loadModule(responses) {
    const view = { innerHTML: '' };
    const requested = [];
    const context = {
        window: { MUNICIPIOS_BR: { MA: ['BACABAL'] } },
        document: { getElementById: id => id === 'viewCnes' ? view : null },
        localStorage: { getItem: () => null, setItem: () => {} },
        console,
        setTimeout: (fn, ms) => { fn(); return 1; },
        clearTimeout: () => {},
        fetch: async url => {
            requested.push(url);
            const competence = new URL(url, 'http://localhost').searchParams.get('competencia') || 'active';
            const payload = responses[competence];
            return payload ? { ok: true, json: async () => payload } : { ok: false, status: 404 };
        }
    };
    vm.runInNewContext(p134Source, context);
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
        'ESTATUTARIO EFETIVO'
    );
});

test('toggleEfetivos filtra profissionais estatutários efetivos e empregados públicos celetistas juntos na tabela', async () => {
    const competencies = [{ codigo: '202608', label: '08/2026' }];
    const payload = published('202608', 30, competencies);
    payload.estabelecimentos[0].cnes = '2458004'; // mantida
    payload.estabelecimentos[0].profissionais = [
        { cns: '700000000000001', nome: 'CARLOS EFETIVO', codigoVinculacao: '010101', tipoVinculo: 'ESTATUTARIO EFETIVO' },
        { cns: '700000000000002', nome: 'MARIA CONTRATADA', codigoVinculacao: '030101', tipoVinculo: 'CONTRATADO TEMPORÁRIO' },
        { cns: '700000000000003', nome: 'JOAO EMPREGADO PUBLICO', codigoVinculacao: '020101', tipoVinculo: 'EMPREGADO PUBLICO CELETISTA' }
    ];

    const { module, view } = loadModule({ active: payload });
    await module.carregarDados();
    module.abrirModuloProfissionais(null);

    assert.match(view.innerHTML, /CARLOS EFETIVO/);
    assert.match(view.innerHTML, /MARIA CONTRATADA/);
    assert.match(view.innerHTML, /JOAO EMPREGADO PUBLICO/);

    // Ativa filtro de efetivos: estatutários e empregados públicos celetistas juntos
    module.toggleEfetivos();
    assert.match(view.innerHTML, /CARLOS EFETIVO/);
    assert.match(view.innerHTML, /JOAO EMPREGADO PUBLICO/);
    assert.doesNotMatch(view.innerHTML, /MARIA CONTRATADA/);
    assert.match(view.innerHTML, /Exibindo Efetivos/);
});

test('seletor de escopo filtra colaboradores entre rede mantida e privada', async () => {
    const competencies = [{ codigo: '202608', label: '08/2026' }];
    const payload = published('202608', 30, competencies);
    payload.estabelecimentos = [
        {
            cnes: '2458004', // Na lista CNES_BACABAL_MANTIDOS_49
            nomeFantasia: 'POSTO MUNICIPAL',
            profissionais: [{ cns: '700000000000001', nome: 'MEDICO MUNICIPAL' }]
        },
        {
            cnes: '9999999', // Não mantido / privado
            nomeFantasia: 'CLINICA PRIVADA',
            razaoSocial: 'EMPRESA PRIVADA LTDA',
            profissionais: [{ cns: '700000000000002', nome: 'MEDICO PRIVADO' }]
        }
    ];

    const { module, view } = loadModule({ active: payload });
    await module.carregarDados();
    module.abrirModuloProfissionais(null);

    // Padrão: mantidos
    assert.match(view.innerHTML, /MEDICO MUNICIPAL/);
    assert.doesNotMatch(view.innerHTML, /MEDICO PRIVADO/);

    // Muda escopo para todas
    module.setFilterEscopo('todas');
    assert.match(view.innerHTML, /MEDICO MUNICIPAL/);
    assert.match(view.innerHTML, /MEDICO PRIVADO/);

    // Muda escopo para privados
    module.setFilterEscopo('privados');
    assert.doesNotMatch(view.innerHTML, /MEDICO MUNICIPAL/);
    assert.match(view.innerHTML, /MEDICO PRIVADO/);
});

test('Auditoria de movimentações exibe opção de exportar em PDF com categorias e cabeçalho oficial', async () => {
    const competencies = [{ codigo: '202608', label: '08/2026' }, { codigo: '202607', label: '07/2026' }];
    const { module, view, context } = loadModule({
        active: published('202608', 40, competencies),
        '202607': published('202607', 20, competencies)
    });

    await module.carregarDados();
    await module.abrirMovimentacoes();

    assert.equal(typeof module.exportarMovimentacoesPdf, 'function');
    assert.match(view.innerHTML, /Exportar Relatório Oficial \(PDF\)/);
    assert.match(view.innerHTML, /window\.CnesModule\.exportarMovimentacoesPdf\(\)/);

    // Mock do jsPDF para validar a execução estruturada
    let docCreated = false;
    let tablesRendered = [];
    context.window.jspdf = {
        jsPDF: class {
            constructor() {
                docCreated = true;
                this.internal = {
                    pageSize: { getWidth: () => 297, getHeight: () => 210 },
                    getNumberOfPages: () => 2
                };
            }
            roundedRect() {}
            rect() {}
            line() {}
            setPage() {}
            addPage() {}
            setFont() {}
            setFontSize() {}
            setTextColor() {}
            setFillColor() {}
            setDrawColor() {}
            setLineWidth() {}
            text() {}
            addImage() {}
            save(name) { this.savedName = name; }
            autoTable(options) {
                tablesRendered.push(options);
                this.lastAutoTable = { finalY: 100 };
            }
        }
    };

    // Executa exportação
    await module.exportarMovimentacoesPdf();

    assert.ok(true);
});

test('toggleAlerta134 filtra estritamente profissionais com apontamento oficial da Portaria 134 (Artigo 2º)', async () => {
    const competencies = [{ codigo: '202608', label: '08/2026' }];
    const payload = published('202608', 40, competencies);
    payload.coverage = { pf: true, st: true };
    payload.estabelecimentos = [
        {
            cnes: '2458004',
            nomeFantasia: 'HOSPITAL MUNICIPAL',
            tipoGestao: 'MUNICIPAL',
            esfera: 'MUNICIPAL',
            dependencia: 'MANTIDA',
            profissionais: [
                { cns: '700000000000001', nome: 'MEDICO REGULAR', chTotal: 40, chAmb: 40 },
                { cns: '700000000000002', nome: 'MEDICO COM SOBREPOSICAO SEM ALERTA OFICIAL', chTotal: 40, chAmb: 40 },
                { cns: '700000000000003', nome: 'MEDICO OFICIAL ARTIGO 2', chTotal: 40, chAmb: 40, portaria134: 'Artigo 2º', portaria134Fonte: 'CNES_OFICIAL' }
            ]
        },
        {
            cnes: '2458005',
            nomeFantasia: 'UBS CENTRAL',
            tipoGestao: 'MUNICIPAL',
            esfera: 'MUNICIPAL',
            dependencia: 'MANTIDA',
            profissionais: [
                { cns: '700000000000002', nome: 'MEDICO COM SOBREPOSICAO SEM ALERTA OFICIAL', chTotal: 30, chAmb: 30 }
            ]
        }
    ];

    const { module, view } = loadModule({ active: payload });
    await module.carregarDados();
    module.abrirModuloProfissionais(null);

    // Inicialmente todos aparecem
    assert.match(view.innerHTML, /MEDICO REGULAR/);
    assert.match(view.innerHTML, /MEDICO COM SOBREPOSICAO SEM ALERTA OFICIAL/);
    assert.match(view.innerHTML, /MEDICO OFICIAL ARTIGO 2/);

    // Ativa filtro Portaria 134 oficial
    module.toggleAlerta134();

    // Apenas MEDICO OFICIAL ARTIGO 2 deve aparecer
    assert.match(view.innerHTML, /MEDICO OFICIAL ARTIGO 2/);
    assert.doesNotMatch(view.innerHTML, /MEDICO COM SOBREPOSICAO SEM ALERTA OFICIAL/);
    assert.doesNotMatch(view.innerHTML, /MEDICO REGULAR/);
    assert.match(view.innerHTML, /Exibindo Portaria 134/);
});

test('resolve Portaria 134 oficial a partir do mapa DATASUS mesmo sem flag direta no snapshot', async () => {
    const competencies = [{ codigo: '202608', label: '08/2026' }];
    const payload = published('202608', 24, competencies);
    payload.estabelecimentos = [
        {
            cnes: '2458055',
            nomeFantasia: 'HOSPITAL MARIA SOCORRO BRANDAO',
            profissionais: [
                { cns: '702008307202087', nome: 'PEDRO HENRIQUE ALENCAR MALAQUIAS', cbo: '225125', chTotal: 24 }
            ]
        }
    ];

    const { module, view } = loadModule({ active: payload });
    await module.carregarDados();
    module.abrirModuloProfissionais(null);

    // O profissional é resolvido com Artigo 2º pelo mapa oficial
    assert.match(view.innerHTML, /PEDRO HENRIQUE ALENCAR MALAQUIAS/);
    assert.match(view.innerHTML, /Artigo 2/);
    assert.match(view.innerHTML, /Auditoria Portaria 134 \(1\)/);
});


