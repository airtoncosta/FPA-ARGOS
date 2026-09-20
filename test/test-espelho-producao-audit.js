/**
 * Suíte de Testes Automatizados - Auditoria de Produção Profissional e Espelho de Produção
 * Valida a regra de ouro do SUS: Atendimentos (pacientes únicos na data) vs Procedimentos (volume de faturamento).
 * Valida resolução de nomes no CNES e sincronização de ciclo de vida (exclusão).
 */

const assert = require('assert');

// Mock simples para simular ambiente do módulo no Node.js
global.window = global;
global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
};

// Carrega o módulo ProducaoProfissionalModule
require('../code_sandbox_light_git_fe61910d_1781185357/js/producao-profissional-module.js');

const moduleRef = global.ProducaoProfissionalModule;
assert(moduleRef, 'ProducaoProfissionalModule deve estar definido no global.');

console.log('🧪 Iniciando testes de auditoria de Produção Profissional (Espelho de Produção)...');

// Injeta mock de CNES para testes de resolução
moduleRef.cnesCache = {
    estabelecimentos: [
        {
            cnes: '2387412',
            nomeFantasia: 'HOSPITAL MARIA DO SOCORRO BRANDAO',
            profissionais: [
                {
                    cns: '700123456789012',
                    nome: 'DR. CARLOS ALBERTO SILVA',
                    cbo: '225125',
                    ocupacao: '225125 - MEDICO CLINICO',
                    situacao: 'Ativo'
                }
            ]
        }
    ]
};

// Mock de SIGTAP
moduleRef.sigtapCache = {
    '0204010178': {
        codigo: '0204010178',
        nome: 'DOSAGEM DE GLICOSE',
        vl_sa: 1.85
    },
    '0301010072': {
        codigo: '0301010072',
        nome: 'CONSULTA MEDICA EM ATENCAO ESPECIALIZADA',
        vl_sa: 10.00
    },
    '0301100039': {
        codigo: '0301100039',
        nome: 'ELETROCARDIOGRAMA',
        vl_sa: 5.50
    }
};

// =========================================================================
// TESTE 1: 1 paciente com Qtd 5 do mesmo procedimento no mesmo dia
// DEVE resultar em: 1 Atendimento e 5 Procedimentos
// =========================================================================
console.log('  [1] Testando 1 paciente com Qtd 5 do mesmo procedimento no mesmo dia...');
const recordsTeste1 = [
    {
        linha: 2,
        tipo: 'BPA-I',
        cnes: '2387412',
        competencia: '202607',
        cnsProfissional: '700123456789012',
        cbo: '225125',
        dataAtendimento: '20260715',
        folha: '001',
        sequencia: '01',
        procedimento: '0204010178', // Glicose
        quantidade: '5',
        cnsPaciente: '898000123456789'
    }
];

const res1 = moduleRef.aggregateProfissionais(
    recordsTeste1,
    '2387412',
    'HOSPITAL MARIA DO SOCORRO BRANDAO',
    '202607',
    'prod_001',
    'BPA_TESTE_1.txt'
);

assert.strictEqual(res1.length, 1, 'Deve retornar exatamente 1 profissional');
assert.strictEqual(res1[0].totalAtendimentos, 1, 'Deve contabilizar exatamente 1 atendimento');
assert.strictEqual(res1[0].totalQuantidade, 5, 'Deve contabilizar 5 procedimentos executados');
assert.strictEqual(res1[0].totalValor, 9.25, 'Valor total deve ser 5 x 1.85 = 9.25');
assert.strictEqual(res1[0].nome, 'DR. CARLOS ALBERTO SILVA', 'Deve resolver o nome correto do CNES');
assert.strictEqual(res1[0].vinculoConfirmado, true, 'Vínculo no CNES deve estar confirmado');
console.log('  ✅ Teste 1 passou: 1 atendimento e 5 procedimentos.');

// =========================================================================
// TESTE 2: 1 paciente com 3 procedimentos diferentes no mesmo atendimento/dia
// DEVE resultar em: 1 Atendimento e 3 Procedimentos
// =========================================================================
console.log('  [2] Testando 1 paciente com 3 procedimentos diferentes na mesma data...');
const recordsTeste2 = [
    {
        linha: 2,
        tipo: 'BPA-I',
        cnes: '2387412',
        competencia: '202607',
        cnsProfissional: '700123456789012',
        cbo: '225125',
        dataAtendimento: '20260715',
        folha: '001',
        sequencia: '01',
        procedimento: '0301010072', // Consulta
        quantidade: '1',
        cnsPaciente: '898000123456789'
    },
    {
        linha: 3,
        tipo: 'BPA-I',
        cnes: '2387412',
        competencia: '202607',
        cnsProfissional: '700123456789012',
        cbo: '225125',
        dataAtendimento: '20260715',
        folha: '001',
        sequencia: '01',
        procedimento: '0301100039', // ECG
        quantidade: '1',
        cnsPaciente: '898000123456789'
    },
    {
        linha: 4,
        tipo: 'BPA-I',
        cnes: '2387412',
        competencia: '202607',
        cnsProfissional: '700123456789012',
        cbo: '225125',
        dataAtendimento: '20260715',
        folha: '001',
        sequencia: '01',
        procedimento: '0204010178', // Glicose
        quantidade: '1',
        cnsPaciente: '898000123456789'
    }
];

const res2 = moduleRef.aggregateProfissionais(
    recordsTeste2,
    '2387412',
    'HOSPITAL MARIA DO SOCORRO BRANDAO',
    '202607',
    'prod_002',
    'BPA_TESTE_2.txt'
);

assert.strictEqual(res2.length, 1);
assert.strictEqual(res2[0].totalAtendimentos, 1, '3 procedimentos no mesmo dia para mesmo paciente é 1 atendimento');
assert.strictEqual(res2[0].totalQuantidade, 3, 'Total de procedimentos deve ser 3');
assert.strictEqual(res2[0].procedimentos.length, 3, 'Devem constar os 3 códigos detalhados');
console.log('  ✅ Teste 2 passou: 1 atendimento com 3 procedimentos distintos.');

// =========================================================================
// TESTE 3: 2 pacientes distintos atendidos no mesmo dia
// DEVE resultar em: 2 Atendimentos
// =========================================================================
console.log('  [3] Testando 2 pacientes distintos no mesmo dia...');
const recordsTeste3 = [
    {
        linha: 2,
        tipo: 'BPA-I',
        cnes: '2387412',
        competencia: '202607',
        cnsProfissional: '700123456789012',
        cbo: '225125',
        dataAtendimento: '20260715',
        folha: '001',
        sequencia: '01',
        procedimento: '0301010072',
        quantidade: '1',
        cnsPaciente: '898000123456789'
    },
    {
        linha: 3,
        tipo: 'BPA-I',
        cnes: '2387412',
        competencia: '202607',
        cnsProfissional: '700123456789012',
        cbo: '225125',
        dataAtendimento: '20260715',
        folha: '001',
        sequencia: '02',
        procedimento: '0301010072',
        quantidade: '1',
        cnsPaciente: '898999999999999' // Outro paciente
    }
];

const res3 = moduleRef.aggregateProfissionais(
    recordsTeste3,
    '2387412',
    'HOSPITAL MARIA DO SOCORRO BRANDAO',
    '202607',
    'prod_003',
    'BPA_TESTE_3.txt'
);

assert.strictEqual(res3[0].totalAtendimentos, 2, '2 pacientes diferentes devem totalizar 2 atendimentos');
assert.strictEqual(res3[0].totalQuantidade, 2);
console.log('  ✅ Teste 3 passou: 2 pacientes distintos = 2 atendimentos.');

// =========================================================================
// TESTE 4: Profissional sem vínculo no CNES daquela unidade
// DEVE gerar alerta de auditoria preventivo
// =========================================================================
console.log('  [4] Testando CNS sem vínculo no CNES da unidade...');
const recordsTeste4 = [
    {
        linha: 2,
        tipo: 'BPA-I',
        cnes: '2387412',
        competencia: '202607',
        cnsProfissional: '700999999999999', // CNS inexistente no CNES deste hospital
        cbo: '225125',
        dataAtendimento: '20260715',
        folha: '001',
        sequencia: '01',
        procedimento: '0301010072',
        quantidade: '1',
        cnsPaciente: '898000123456789'
    }
];

const res4 = moduleRef.aggregateProfissionais(
    recordsTeste4,
    '2387412',
    'HOSPITAL MARIA DO SOCORRO BRANDAO',
    '202607',
    'prod_004',
    'BPA_TESTE_4.txt'
);

assert.strictEqual(res4[0].vinculoConfirmado, false);
assert.strictEqual(res4[0].vinculoAlerta, true, 'Deve sinalizar alerta de ausência de vínculo no CNES');
console.log('  ✅ Teste 4 passou: Alerta de auditoria preventiva disparado.');

// =========================================================================
// TESTE 5: Expurgo na Exclusão da Produção BPA
// =========================================================================
console.log('  [5] Testando remoção em cascata (removeProducao)...');
moduleRef.records = [
    { id: 'rec_1', producao_id: 'prod_A', cns: '111' },
    { id: 'rec_2', producao_id: 'prod_B', cns: '222' },
    { id: 'rec_3', producao_id: 'prod_A', cns: '333' }
];
localStorage.setItem(moduleRef.storageKey, JSON.stringify(moduleRef.records));

moduleRef.removeProducao('prod_A');
assert.strictEqual(moduleRef.records.length, 1, 'Deve restar apenas 1 registro após exclusão');
assert.strictEqual(moduleRef.records[0].producao_id, 'prod_B');

const stored = JSON.parse(localStorage.getItem(moduleRef.storageKey));
assert.strictEqual(stored.length, 1, 'LocalStorage deve ser sincronizado');
console.log('  ✅ Teste 5 passou: Expurgo em cascata executado com sucesso.');

// =========================================================================
// TESTE 6: Resolução de Nomes e Vínculos dos 5 Fisioterapeutas (CNES 3889157)
// =========================================================================
console.log('  [6] Testando resolução de profissionais do CNES 3889157 (Fisioterapia)...');
const fs = require('fs');
const path = require('path');

// Carrega dicionário de CBO e módulos
require('../code_sandbox_light_git_fe61910d_1781185357/js/cbo.js');
require('../code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js');
require('../code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js');

const cnesFile = path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'cnes_210120_202608.json');
const realCnesSnapshot = JSON.parse(fs.readFileSync(cnesFile, 'utf8'));

global.ArgosCnesBase = realCnesSnapshot;
global.BpaModule.cnesBaseCache = realCnesSnapshot;
moduleRef.cnesCache = realCnesSnapshot;

const fisioCnsExpected = [
    { cns: '705004668985258', nome: 'NATALIA FERNANDA LOPES DA SILVA' },
    { cns: '708900714581412', nome: 'PATRICIA DE SOUSA CAMPOS' },
    { cns: '700009586731108', nome: 'FRANCILIA DA SILVA FEITOSA' },
    { cns: '700001863296209', nome: 'VALBERTTHYLENY ALVES LISBOA' },
    { cns: '700202904540329', nome: 'ALANA AIDA DA SILVA REIS' }
];

for (const expected of fisioCnsExpected) {
    const profBpa = global.BpaModule.lookupProfissional(expected.cns, '3889157');
    assert(profBpa, `Profissional ${expected.cns} deve ser encontrado no BpaModule`);
    assert.strictEqual(profBpa.nome, expected.nome, `Nome do profissional no BpaModule deve ser ${expected.nome}`);
    assert.strictEqual(profBpa.vinculadoUnidade, true, `Profissional deve estar vinculado ao CNES 3889157`);

    const profEspelho = moduleRef.lookupProfissional(expected.cns, '3889157');
    assert(profEspelho, `Profissional ${expected.cns} deve ser encontrado no ProducaoProfissionalModule`);
    assert.strictEqual(profEspelho.nome, expected.nome, `Nome no Espelho deve ser ${expected.nome}`);
    assert.strictEqual(profEspelho.vinculadoUnidade, true);
}
console.log('  ✅ Teste 6 passou: Todos os 5 profissionais de Fisioterapia resolvidos pelo nome no CNES.');

// =========================================================================
// TESTE 7: Renderização da Amostra do Modal de Upload com Nome e Vínculo
// =========================================================================
console.log('  [7] Testando renderização enriquecida no preview do modal BPA...');
const amostraInput = fisioCnsExpected.map(p => {
    const info = global.BpaModule.lookupProfissional(p.cns, '3889157');
    return {
        cns: p.cns,
        nome: info.nome,
        cbo: info.cbo,
        cboDesc: info.ocupacao,
        quantidade: 100,
        vinculadoUnidade: info.vinculadoUnidade,
        procedimentos: [{ codigo: '0302050019', quantidade: 50 }]
    };
});

const htmlResult = global.BpaModule.formatProfissionaisAmostra(amostraInput);
assert.strictEqual(htmlResult.length, 5);
assert.ok(htmlResult[0].includes('NATALIA FERNANDA LOPES DA SILVA'), 'Preview deve conter o nome em destaque');
assert.ok(htmlResult[0].includes('CNS 705004668985258'), 'Preview deve conter o CNS');
assert.ok(htmlResult[0].includes('Vínculo Confirmado no CNES'), 'Preview deve conter badge de vínculo confirmado');
assert.ok(htmlResult[0].includes('0302050019'), 'Preview deve conter procedimentos');
console.log('  ✅ Teste 7 passou: Formatação do preview do modal BPA exibe nomes e vínculos perfeitamente.');

// =========================================================================
// TESTE 8: Auto-detecção da Unidade CNES 3889157 (Fisioterapia de Bacabal)
// =========================================================================
console.log('  [8] Testando auto-detecção da unidade CNES 3889157...');
global.sessionStorage = {
    getItem(k) {
        if (k === 'argos_user') return JSON.stringify({ username: 'admin', role: 'ADM', nome: 'Administrador' });
        return null;
    }
};
const unidades = global.BpaModule.getUnidadesSistema();
const fisioUnit = unidades.find(u => String(u.cnes || '').replace(/\D/g, '') === '3889157');
assert(fisioUnit, 'Unidade 3889157 deve constar no catálogo getUnidadesSistema()');
assert.ok(fisioUnit.nome.includes('FISIOTERAPIA'), 'Nome da unidade deve conter FISIOTERAPIA');
console.log('  ✅ Teste 8 passou: Unidade CNES 3889157 identificada como CENTRO DE FISIOTERAPIA DE BACABAL.');

console.log('\n🎉 TODOS OS TESTES DE AUDITORIA DO ESPELHO DE PRODUÇÃO PASSARAM COM SUCESSO!\n');

