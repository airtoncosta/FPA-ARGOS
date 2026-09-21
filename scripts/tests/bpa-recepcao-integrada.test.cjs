const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const basePath = path.resolve(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357');
const bpaModule = require(path.join(basePath, 'js/bpa-module.js'));

test('lookupProfissional reconhece profissional em unidade com aliases históricos na competência', () => {
    bpaModule.cnesBaseCache = {
        competencia: '202608',
        estabelecimentos: [{
            cnes: '2458055',
            nomeFantasia: 'HOSPITAL MARIA SOCORRO BRANDAO',
            aliases: ['2387412'],
            profissionais: [{
                nome: 'JOSE AMORIM PEREIRA FILHO',
                cns: '700505151875353',
                cbo: '225320',
                ocupacao: 'MEDICO RADIOLOGISTA'
            }]
        }]
    };

    const res = bpaModule.lookupProfissional('700505151875353', '2387412');
    assert.ok(res, 'Profissional deve ser encontrado');
    assert.strictEqual(res.nome, 'JOSE AMORIM PEREIRA FILHO');
    assert.strictEqual(res.vinculadoUnidade, true, 'Deve confirmar vínculo na unidade pelo alias');
});

test('lookupProfissional aponta GLOSA quando o profissional NÃO tem vínculo na unidade na competência', () => {
    bpaModule.cnesBaseCache = {
        competencia: '202608',
        estabelecimentos: [
            {
                cnes: '2458055',
                nomeFantasia: 'HOSPITAL MARIA SOCORRO BRANDAO',
                aliases: ['2387412'],
                profissionais: []
            },
            {
                cnes: '2389165',
                nomeFantasia: 'POLICLINICA DE BACABAL',
                profissionais: [{
                    nome: 'MARIA DA SILVA MEDICA',
                    cns: '701100000000001',
                    cbo: '225125',
                    ocupacao: 'MEDICO CLINICO'
                }]
            }
        ]
    };

    // Consulta para o Hospital Maria Socorro Brandão (2458055 / 2387412)
    // O profissional está cadastrado apenas na Policlínica, NÃO no Hospital
    const res = bpaModule.lookupProfissional('701100000000001', '2387412');
    assert.ok(res, 'Profissional é localizado no município');
    assert.strictEqual(res.nome, 'MARIA DA SILVA MEDICA');
    assert.strictEqual(res.vinculadoUnidade, false, 'Deve apontar que NÃO possui vínculo nesta unidade (GLOSA)');
});

test('formatProfissionaisAmostra exibe os 15 dígitos do CNS sem máscara e lista procedimentos e total', () => {
    const profs = [{
        nome: 'AMANDA ALMEIDA MIRANDA',
        cns: '700001311387700',
        cbo: '225320',
        cboDesc: '225320 - MEDICO RADIOLOGISTA',
        vinculadoUnidade: true,
        quantidade: 342,
        procedimentos: [
            { codigo: '0206030037', quantidade: 69 },
            { codigo: '0206010079', quantidade: 67 }
        ]
    }];

    const htmlCards = bpaModule.formatProfissionaisAmostra(profs);
    assert.ok(htmlCards.length === 1);
    const card = htmlCards[0];
    assert.ok(card.includes('700001311387700'), 'Deve conter os 15 dígitos exatos do CNS');
    assert.ok(!card.includes('700*********700'), 'Não deve conter máscara com asteriscos');
    assert.ok(card.includes('0206030037'), 'Deve listar o procedimento 0206030037');
    assert.ok(card.includes('69'), 'Deve exibir a quantidade 69');
    assert.ok(card.includes('342 atendimentos'), 'Deve exibir a quantidade total de 342');
    assert.ok(card.includes('Vínculo Confirmado no CNES'), 'Deve conter o selo de vínculo confirmado');
});

test('formatProfissionaisAmostra sinaliza GLOSA em vermelho quando profissional não tem vínculo na unidade', () => {
    const profs = [{
        nome: 'PROFISSIONAL SEM VINCULO',
        cns: '709900000000099',
        cbo: '225125',
        cboDesc: '225125 - MEDICO',
        vinculadoUnidade: false,
        quantidade: 50,
        procedimentos: [{ codigo: '0301010072', quantidade: 50 }]
    }];

    const htmlCards = bpaModule.formatProfissionaisAmostra(profs);
    assert.ok(htmlCards.length === 1);
    const card = htmlCards[0];
    assert.ok(card.includes('709900000000099'), 'Deve exibir os 15 dígitos do CNS');
    assert.ok(card.includes('Glosa') || card.includes('Sem Vínculo') || card.includes('sem vínculo'), 'Deve sinalizar glosa ou sem vínculo na unidade');
});

test('parseBpaFile calcula valor financeiro estimado da produção em R$ com base no SIGTAP', () => {
    const { file, line } = require('./bpa-audit.test.cjs');
    // Tomografia 0206010079 com 2 quantidades (2 x 97.44 = 194.88)
    const rawContent = file([line({ proc: '0206010079', qtd: '000002' })]);
    const fakeFile = { name: 'PATOMO08.AGO', size: 1024 };

    const parsed = bpaModule.parseBpaFile(fakeFile, rawContent);
    assert.ok(parsed.totalAtendimentos >= 1, 'Deve ter atendimentos calculados');
    assert.ok(typeof parsed.valorTotalEstimado === 'number' && parsed.valorTotalEstimado > 0, 'Deve calcular valor numérico estimado');
    assert.ok(parsed.valorTotalFormatado.includes('R$'), 'Deve conter símbolo de Real formatado');
    assert.ok(!parsed.valorTotalFormatado.includes('Disponível após auditoria'), 'Não deve postergar a exibição do valor');
});

