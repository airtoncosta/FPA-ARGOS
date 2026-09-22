const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const bpaAuditCore = require('../../code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js');
const sourceModule = fs.readFileSync(path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/js/producao-profissional-module.js'), 'utf8');

function setup() {
    const store = new Map();
    const storage = m => ({
        getItem: k => m.get(k) || null,
        setItem: (k, v) => m.set(k, v),
        removeItem: k => m.delete(k)
    });
    const ctx = {
        window: { BpaAuditCore: bpaAuditCore },
        document: {
            getElementById: () => null,
            querySelectorAll: () => []
        },
        localStorage: storage(store),
        console: { log() {}, warn() {}, error() {} }
    };
    vm.createContext(ctx);
    vm.runInContext(sourceModule, ctx);
    return { mod: ctx.window.ProducaoProfissionalModule, store, ctx };
}

test('recordProducaoProfissionais salva e consolida profissionais de BPA-I', () => {
    const { mod, store } = setup();

    const mockProducaoRecord = {
        id: 'prod-001',
        cnes: '2387439',
        estabelecimento_nome: 'HOSPITAL MATERNO INFANTIL',
        competencia: '07/2026',
        nome_arquivo: 'PAULTRAE.JUL'
    };

    const mockProducaoData = {
        cnes: '2387439',
        estabelecimentoNome: 'HOSPITAL MATERNO INFANTIL',
        competencia: '07/2026',
        nomeArquivo: 'PAULTRAE.JUL',
        profissionaisDetalhados: [
            {
                cns: '700000000000001',
                nome: 'Dr. Roberto Médico 1',
                cbo: '225125',
                cboDesc: 'Médico Clínico',
                quantidade: 200,
                atendimentos: 150,
                procedimentos: [
                    { codigo: '0205020046', quantidade: 125 },
                    { codigo: '0205020097', quantidade: 75 }
                ]
            },
            {
                cns: '700000000000002',
                nome: 'Dra. Ana Médica 2',
                cbo: '225125',
                cboDesc: 'Médica Ultrassonografista',
                quantidade: 50,
                atendimentos: 50,
                procedimentos: [
                    { codigo: '0205020186', quantidade: 50 }
                ]
            }
        ]
    };

    mod.recordProducaoProfissionais(mockProducaoRecord, mockProducaoData);

    const saved = JSON.parse(store.get(mod.storageKey) || '[]');
    assert.equal(saved.length, 2);
    assert.equal(saved[0].cns, '700000000000001');
    assert.equal(saved[0].totalQuantidade, 200);
    assert.equal(saved[1].cns, '700000000000002');
    assert.equal(saved[1].totalQuantidade, 50);
});

test('ordenacao de produtividade: quem produz mais vs quem produz menos', () => {
    const { mod } = setup();

    mod.records = [
        {
            id: 'r1',
            cns: '700000000000002',
            nome: 'Profissional Menor Produção',
            cboDesc: 'Médico',
            estabelecimento_nome: 'HMI',
            competencia: '07/2026',
            totalQuantidade: 30,
            procedimentos: [{ codigo: '0205020046', quantidade: 30 }]
        },
        {
            id: 'r2',
            cns: '700000000000001',
            nome: 'Profissional Maior Produção',
            cboDesc: 'Médico',
            estabelecimento_nome: 'HMI',
            competencia: '07/2026',
            totalQuantidade: 250,
            procedimentos: [{ codigo: '0205020046', quantidade: 250 }]
        }
    ];

    // Ordenação padrão: maior produção (quem produz mais primeiro)
    mod.filtros.ordenacao = 'maior_qtd';
    const listMaior = mod.getFilteredAndAggregatedProfissionais();
    assert.equal(listMaior[0].cns, '700000000000001');
    assert.equal(listMaior[0].totalQuantidade, 250);
    assert.equal(listMaior[1].cns, '700000000000002');
    assert.equal(listMaior[1].totalQuantidade, 30);

    // Ordenação: menor produção (quem produz menos primeiro)
    mod.filtros.ordenacao = 'menor_qtd';
    const listMenor = mod.getFilteredAndAggregatedProfissionais();
    assert.equal(listMenor[0].cns, '700000000000002');
    assert.equal(listMenor[0].totalQuantidade, 30);
    assert.equal(listMenor[1].cns, '700000000000001');
    assert.equal(listMenor[1].totalQuantidade, 250);
});

test('filtro por unidade e competencia restringe a visao do profissional', () => {
    const { mod } = setup();

    mod.records = [
        {
            id: 'r1',
            cns: '700000000000001',
            nome: 'Dr. Materno',
            estabelecimento_nome: 'HOSPITAL MATERNO INFANTIL',
            competencia: '07/2026',
            totalQuantidade: 100,
            procedimentos: []
        },
        {
            id: 'r2',
            cns: '700000000000002',
            nome: 'Dr. HMSO',
            estabelecimento_nome: 'HOSPITAL MARIA SOCORRO BRANDAO',
            competencia: '08/2026',
            totalQuantidade: 80,
            procedimentos: []
        }
    ];

    mod.filtros.unidade = 'HOSPITAL MATERNO INFANTIL';
    mod.filtros.competencia = '';
    const filteredUnidade = mod.getFilteredAndAggregatedProfissionais();
    assert.equal(filteredUnidade.length, 1);
    assert.equal(filteredUnidade[0].nome, 'Dr. Materno');

    mod.filtros.unidade = '';
    mod.filtros.competencia = '08/2026';
    const filteredComp = mod.getFilteredAndAggregatedProfissionais();
    assert.equal(filteredComp.length, 1);
    assert.equal(filteredComp[0].nome, 'Dr. HMSO');
});

test('mapeamento registro<->linha do espelho preserva totais e procedimentos', () => {
    const { mod } = setup();
    const r = {
        producao_id: 'prod-1', cnes: '2387439', competencia: '07/2026',
        cns: '700000000000001', nome: 'Dr. X', cbo: '225125',
        procedimentos: [{ codigo: '0205020046', quantidade: 3, valorUnitario: 10, valorTotal: 30 }],
        totalQuantidade: 3, totalAtendimentos: 2, totalValor: 30
    };
    const linha = mod.mapearRegistroParaLinha(r, 'prod-1', 'jessica');
    assert.equal(linha.cns_profissional, '700000000000001');
    assert.equal(linha.producao_id, 'prod-1');
    assert.deepEqual(JSON.parse(JSON.stringify(linha.procedimentos)), r.procedimentos);
    const volta = mod.mapearLinhaParaRegistro({ ...linha, id: 'uuid-9' });
    assert.equal(volta.id, 'uuid-9');
    assert.equal(volta.totalValor, 30);
    assert.equal(volta.totalAtendimentos, 2);
});

test('mescla nuvem+local: nuvem vence por chave estavel, local preenche lacunas', () => {
    const { mod } = setup();
    const nuvem = [{ id: 'c1', producao_id: 'p1', cns: 'C1', cbo: '', totalValor: 100 }];
    const local = [
        { id: 'l1', producao_id: 'p1', cns: 'C1', cbo: '', totalValor: 50 },
        { id: 'l2', producao_id: 'p2', cns: 'C2', cbo: '', totalValor: 70 }
    ];
    const merged = mod.mesclarNuvemLocal(nuvem, local);
    assert.equal(merged.length, 2);
    assert.equal(merged.find(r => r.producao_id === 'p1').totalValor, 100);
    assert.equal(merged.find(r => r.producao_id === 'p2').id, 'l2');
});

test('recordProducaoProfissionais espelha na nuvem sem quebrar o save local', async () => {
    const { mod, store, ctx } = setup();
    let apagados = 0; let inseridos = null;
    ctx.window.SupabaseConfig = {
        isConnected: () => true,
        getClient: () => ({ from: (tabela) => {
            if (tabela !== 'espelho_producao_profissional') throw new Error('tabela errada: ' + tabela);
            return {
                delete: () => ({ eq: async () => { apagados++; return { error: null }; } }),
                insert: (rows) => { inseridos = rows; return { select: async () => ({ data: rows, error: null }) }; }
            };
        } })
    };
    mod.recordProducaoProfissionais(
        { id: 'prod-1', cnes: '2387439', estabelecimento_nome: 'HMI', competencia: '07/2026', nome_arquivo: 'A.JUL', digitador_username: 'jessica' },
        { cnes: '2387439', estabelecimentoNome: 'HMI', competencia: '07/2026', nomeArquivo: 'A.JUL',
          profissionaisDetalhados: [{ cns: '700000000000001', nome: 'Dr. X', cbo: '225125', quantidade: 3, atendimentos: 2, procedimentos: [{ codigo: '0205020046', quantidade: 3 }] }] }
    );
    await new Promise(r => setTimeout(r, 50));
    const saved = JSON.parse(store.get(mod.storageKey) || '[]');
    assert.equal(saved.length, 1);
    assert.equal(apagados, 1);
    assert.equal(inseridos.length, 1);
    assert.equal(inseridos[0].cns_profissional, '700000000000001');
});
