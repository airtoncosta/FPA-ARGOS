const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const basePath = path.resolve(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357');
const bpaModule = require(path.join(basePath, 'js/bpa-module.js'));

function createBpaLine(over = {}) {
    const r = { tipo: '03', cnes: '1234567', comp: '202608', cns: '700000000000005', cbo: '225125', dt: '20260815', seq: '01', proc: '0301010072', sexo: 'M', cid: 'A000', idade: '030', qtd: '000001', nasc: '19960801', servico: '', classificacao: '', ...over };
    const a = Array(349).fill(' ');
    const put = (pos, value) => [...value].forEach((c, i) => a[pos - 1 + i] = c);
    put(1, r.tipo); put(3, r.cnes); put(10, r.comp); put(16, r.cns); put(31, r.cbo); put(37, r.dt); put(45, '001'); put(48, r.seq); put(50, r.proc); put(75, r.sexo); put(82, r.cid); put(86, r.idade); put(89, r.qtd); put(110, 'BPA'); put(143, r.nasc); put(160, r.servico); put(163, r.classificacao);
    return a.join('');
}

function createBpaFile(rows) {
    const a = Array(130).fill(' ');
    const put = (p, v) => [...v].forEach((c, i) => a[p - 1 + i] = c);
    put(1, '01#BPA#'); put(8, '202608'); put(14, String(rows.length).padStart(6, '0')); put(20, '000001');
    const sum = rows.reduce((s, r) => s + BigInt(r.slice(49, 59)) + BigInt(r.slice(88, 94)), 0n);
    put(26, String(Number(sum % 1111n) + 1111));
    return a.join('') + '\r\n' + rows.join('\r\n') + '\r\n';
}

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
    const res = bpaModule.lookupProfissional('701100000000001', '2387412', '202608');
    assert.ok(res, 'Profissional é localizado no município');
    assert.strictEqual(res.nome, 'MARIA DA SILVA MEDICA');
    assert.strictEqual(res.vinculadoUnidade, false, 'Deve apontar que NÃO possui vínculo nesta unidade (GLOSA)');
    assert.strictEqual(res.isGlosa, true, 'isGlosa deve ser true');
    assert.ok(res.motivoGlosa.includes('outra unidade'), 'Deve indicar lotação em outra unidade');
});

test('lookupProfissional aponta GLOSA quando a base carregada não confere com a competência da produção', () => {
    bpaModule.cnesBaseCache = {
        competencia: '202607', // Base de Julho
        estabelecimentos: [{
            cnes: '2458055',
            nomeFantasia: 'HOSPITAL MARIA SOCORRO BRANDAO',
            aliases: ['2387412'],
            profissionais: [{
                nome: 'MEDICO JULHO APENAS',
                cns: '702200000000002',
                cbo: '225125',
                ocupacao: 'MEDICO CLINICO'
            }]
        }]
    };

    // Produção referente a Agosto/2026 (202608), mas a base disponível é 202607
    const res = bpaModule.lookupProfissional('702200000000002', '2387412', '202608');
    assert.ok(res, 'Profissional é retornado para diagnóstico');
    assert.strictEqual(res.vinculadoCompetencia, false, 'Não deve validar vínculo fora da competência');
    assert.strictEqual(res.isGlosa, true, 'Deve gerar glosa por competência');
});

test('parseBpaFile reconhece dinamicamente TODOS os profissionais do arquivo com 15 dígitos e aponta glosa se sem vínculo', () => {
    bpaModule.cnesBaseCache = {
        competencia: '202608',
        estabelecimentos: [
            {
                cnes: '2458055',
                nomeFantasia: 'HOSPITAL MARIA SOCORRO BRANDAO',
                aliases: ['2387412'],
                profissionais: [
                    {
                        nome: 'CARLOS AUGUSTO MEDICO',
                        cns: '700505151875353',
                        cbo: '225320',
                        ocupacao: 'MEDICO RADIOLOGISTA'
                    }
                ]
            },
            {
                cnes: '2389165',
                nomeFantasia: 'POLICLINICA DE BACABAL',
                profissionais: [
                    {
                        nome: 'VANESSA LIMA MEDICA',
                        cns: '701100000000001',
                        cbo: '225125',
                        ocupacao: 'MEDICO CLINICO'
                    }
                ]
            }
        ]
    };

    const rawContent = createBpaFile([
        createBpaLine({ cnes: '2387412', cns: '700505151875353', proc: '0206010079', qtd: '000005' }),
        createBpaLine({ cnes: '2387412', cns: '701100000000001', proc: '0206030037', qtd: '000003' }),
        createBpaLine({ cnes: '2387412', cns: '709900000000099', proc: '0206010079', qtd: '000002' })
    ]);

    const fakeFile = { name: 'PATOMO_MULTI_PROFS.AGO', size: 2048 };
    const parsed = bpaModule.parseBpaFile(fakeFile, rawContent);

    // Deve reconhecer TODOS os 3 profissionais sem omitir nenhum
    assert.strictEqual(parsed.profissionaisDetalhados.length, 3, 'Deve listar exatamente todos os 3 profissionais presentes no arquivo');

    const profCarlos = parsed.profissionaisDetalhados.find(p => p.cns === '700505151875353');
    assert.ok(profCarlos, 'Dr. Carlos deve estar presente');
    assert.strictEqual(profCarlos.nome, 'CARLOS AUGUSTO MEDICO');
    assert.strictEqual(profCarlos.vinculadoUnidade, true, 'Dr. Carlos deve ter vínculo confirmado');
    assert.strictEqual(profCarlos.isGlosa, false, 'Dr. Carlos não tem glosa');
    assert.strictEqual(profCarlos.quantidade, 5);

    const profVanessa = parsed.profissionaisDetalhados.find(p => p.cns === '701100000000001');
    assert.ok(profVanessa, 'Dra. Vanessa deve estar presente');
    assert.strictEqual(profVanessa.nome, 'VANESSA LIMA MEDICA');
    assert.strictEqual(profVanessa.vinculadoUnidade, false, 'Dra. Vanessa deve ser glosada por lotação em outro CNES');
    assert.strictEqual(profVanessa.isGlosa, true, 'Dra. Vanessa deve ter isGlosa=true');
    assert.strictEqual(profVanessa.quantidade, 3);

    const profDesconhecido = parsed.profissionaisDetalhados.find(p => p.cns === '709900000000099');
    assert.ok(profDesconhecido, 'Profissional desconhecido deve estar presente');
    assert.strictEqual(profDesconhecido.vinculadoUnidade, false, 'Profissional desconhecido não tem vínculo');
    assert.strictEqual(profDesconhecido.isGlosa, true, 'Profissional desconhecido deve ter isGlosa=true');
    assert.strictEqual(profDesconhecido.quantidade, 2);

    // Amostra de cartões HTML formatados
    assert.strictEqual(parsed.profissionaisAmostra.length, 3, 'Amostra deve conter 3 cartões');
    const htmlCards = parsed.profissionaisAmostra.join('\n');
    assert.ok(htmlCards.includes('Vínculo Confirmado no CNES'), 'Deve conter badge de vínculo confirmado para Dr. Carlos');
    assert.ok(htmlCards.includes('Glosa: Profissional lotado em outra unidade') || htmlCards.includes('Sem Vínculo nesta Unidade'), 'Deve conter glosa para Dra. Vanessa');
    assert.ok(htmlCards.includes('Glosa: Profissional não localizado no CNES'), 'Deve conter glosa para desconhecido');
    assert.ok(htmlCards.includes('700505151875353') && htmlCards.includes('701100000000001') && htmlCards.includes('709900000000099'), 'Todos os 3 CNS devem estar com os 15 dígitos completos visíveis');
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
    // Tomografia 0206010079 com 2 quantidades (2 x 97.44 = 194.88)
    const rawContent = createBpaFile([createBpaLine({ proc: '0206010079', qtd: '000002' })]);
    const fakeFile = { name: 'PATOMO08.AGO', size: 1024 };

    const parsed = bpaModule.parseBpaFile(fakeFile, rawContent);
    assert.ok(parsed.totalAtendimentos >= 1, 'Deve ter atendimentos calculados');
    assert.ok(typeof parsed.valorTotalEstimado === 'number' && parsed.valorTotalEstimado > 0, 'Deve calcular valor numérico estimado');
    assert.ok(parsed.valorTotalFormatado.includes('R$'), 'Deve conter símbolo de Real formatado');
    assert.ok(!parsed.valorTotalFormatado.includes('Disponível após auditoria'), 'Não deve postergar a exibição do valor');
});

test('canSubmitPendingUpload bloqueia ANTES da auditoria e libera APÓS a auditoria (mesmo com apontamentos)', () => {
    bpaModule.filePendingUpload = { fingerprint: 'sha_test_123', totalLinhas: 10 };

    // Caso 1: Sem auditoria executada -> Bloqueado
    bpaModule.auditApproval = null;
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), false, 'Deve bloquear antes da auditoria');

    // Caso 2: Auditado com 100% de conformidade -> Liberado
    bpaModule.auditApproval = {
        fingerprint: 'sha_test_123',
        status: 'CONFORME',
        podeEnviarSemGlosa: true
    };
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), true, 'Deve liberar após aprovação');

    // Caso 3: Auditado com apontamentos de risco -> Liberado (Recepção Integrada)
    bpaModule.auditApproval = {
        fingerprint: 'sha_test_123',
        status: 'COM_APONTAMENTOS',
        podeEnviarSemGlosa: false,
        totalApontamentos: 3
    };
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), true, 'Deve liberar lote com apontamentos para recepção integrada');

    // Caso 4: Fingerprint divergente (arquivo trocado) -> Bloqueado
    bpaModule.auditApproval = {
        fingerprint: 'sha_outro_arquivo',
        status: 'CONFORME',
        podeEnviarSemGlosa: true
    };
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), false, 'Deve bloquear se o arquivo foi alterado');
});
