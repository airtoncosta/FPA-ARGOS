const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const basePath = path.resolve(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357');
const bpaAuditCore = require(path.join(basePath, 'js/bpa-audit-core.js'));
const penteFinoEngine = require(path.join(basePath, 'js/pente-fino-engine.js'));

test('Pente Fino Engine exporta módulo e mantém compatibilidade com MalhaFinaEngine', () => {
    assert.ok(penteFinoEngine, 'PenteFinoEngine deve estar definido');
    assert.strictEqual(typeof penteFinoEngine.executar, 'function');
    assert.strictEqual(typeof penteFinoEngine.auditar5Regras, 'function');
    assert.strictEqual(typeof penteFinoEngine.classificar5Regras, 'function');
});

test('Regra 1: Lotação do profissional no CNES (OK vs Glosa)', () => {
    // Caso 1: Com vínculo ativo no CNES
    const bpaOk = {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2456184', competencia: '202608',
            cbo: '225320', cnsProfissional: '703203601654994', procedimento: '0205020143',
            quantidade: 1, idade: 30, sexo: 'M', cid: 'R104', dataAtendimento: '20260810',
            nascimento: '19960101', servico: '115', classificacao: '001', folha: '001', sequencia: '01'
        }]
    };
    const basesOk = {
        '202608': {
            cnes: {
                competencia: '202608', oficial: true, completo: true,
                estabelecimentos: [{
                    cnes: '2456184',
                    desabilitado: false,
                    profissionais: [{ cns: '703203601654994', cbo: '225320', ativo: true }]
                }]
            }
        }
    };
    const auditResOk = bpaAuditCore.audit(bpaOk, basesOk);
    const regrasOk = penteFinoEngine.classificar5Regras(auditResOk);
    assert.strictEqual(regrasOk.regra1_lotacao_cnes.ok, true, 'Profissional ativo no CNES deve passar');

    // Caso 2: Profissional não lotado no CNES da unidade (Glosa)
    const basesSemVinculo = {
        '202608': {
            cnes: {
                competencia: '202608', oficial: true, completo: true,
                estabelecimentos: [{
                    cnes: '2456184',
                    desabilitado: false,
                    profissionais: [] // Sem este profissional
                }]
            }
        }
    };
    const auditResGlosa = bpaAuditCore.audit(bpaOk, basesSemVinculo);
    const regrasGlosa = penteFinoEngine.classificar5Regras(auditResGlosa);
    assert.strictEqual(regrasGlosa.regra1_lotacao_cnes.ok, false, 'Profissional sem vínculo deve gerar glosa');
});

test('Regra 2: CBO habilitado ao procedimento (OK vs Glosa)', () => {
    const bpa = {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2456184', competencia: '202608',
            cbo: '225320', cnsProfissional: '703203601654994', procedimento: '0205020143',
            quantidade: 1, idade: 30, sexo: 'M', cid: 'R104', dataAtendimento: '20260810',
            nascimento: '19960101', servico: '115', classificacao: '001', folha: '001', sequencia: '01'
        }]
    };
    // Base SIGTAP autorizando CBO 225320
    const basesOk = {
        '202608': {
            sigtap: {
                competencia: '202608', oficial: true, completo: true,
                procedimentos: {
                    '0205020143': {
                        cobertura: { cbos: true },
                        cbos: ['225320', '225325']
                    }
                }
            }
        }
    };
    const resOk = bpaAuditCore.audit(bpa, basesOk);
    const regrasOk = penteFinoEngine.classificar5Regras(resOk);
    assert.strictEqual(regrasOk.regra2_cbo_procedimento.ok, true, 'CBO autorizado no SIGTAP deve passar');

    // Base SIGTAP onde o CBO 225320 NÃO é autorizado
    const basesIncomp = {
        '202608': {
            sigtap: {
                competencia: '202608', oficial: true, completo: true,
                procedimentos: {
                    '0205020143': {
                        cobertura: { cbos: true },
                        cbos: ['225120'] // Apenas outro CBO
                    }
                }
            }
        }
    };
    const resGlosa = bpaAuditCore.audit(bpa, basesIncomp);
    const regrasGlosa = penteFinoEngine.classificar5Regras(resGlosa);
    assert.strictEqual(regrasGlosa.regra2_cbo_procedimento.ok, false, 'CBO não autorizado no SIGTAP deve gerar glosa');
});

test('Regra 3: CID habilitado para o procedimento (OK vs Glosa)', () => {
    const bpa = {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2456184', competencia: '202608',
            cbo: '225320', cnsProfissional: '703203601654994', procedimento: '0205020143',
            quantidade: 1, idade: 30, sexo: 'M', cid: 'R104', dataAtendimento: '20260810',
            nascimento: '19960101', servico: '115', classificacao: '001', folha: '001', sequencia: '01'
        }]
    };
    // Base SIGTAP autorizando CID R104
    const basesOk = {
        '202608': {
            sigtap: {
                competencia: '202608', oficial: true, completo: true,
                procedimentos: {
                    '0205020143': {
                        cobertura: { cids: true },
                        cids: ['R104', 'K800']
                    }
                }
            }
        }
    };
    const resOk = bpaAuditCore.audit(bpa, basesOk);
    const regrasOk = penteFinoEngine.classificar5Regras(resOk);
    assert.strictEqual(regrasOk.regra3_cid_procedimento.ok, true, 'CID autorizado deve passar');

    // Base SIGTAP onde CID R104 não é autorizado
    const basesIncomp = {
        '202608': {
            sigtap: {
                competencia: '202608', oficial: true, completo: true,
                procedimentos: {
                    '0205020143': {
                        cobertura: { cids: true },
                        cids: ['Z000']
                    }
                }
            }
        }
    };
    const resGlosa = bpaAuditCore.audit(bpa, basesIncomp);
    const regrasGlosa = penteFinoEngine.classificar5Regras(resGlosa);
    assert.strictEqual(regrasGlosa.regra3_cid_procedimento.ok, false, 'CID incompatível deve gerar glosa');
});

test('Regra 4: Serviços e Classificações habilitados no SIGTAP (independente do CNES)', () => {
    const bpa = {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2456184', competencia: '202608',
            cbo: '225320', cnsProfissional: '703203601654994', procedimento: '0205020143',
            quantidade: 1, idade: 30, sexo: 'M', cid: 'R104', dataAtendimento: '20260810',
            nascimento: '19960101', servico: '115', classificacao: '001', folha: '001', sequencia: '01'
        }]
    };
    // CNES com serviço 115/001 e SIGTAP exigindo 115/001
    const basesOk = {
        '202608': {
            cnes: {
                competencia: '202608', oficial: true, completo: true,
                cobertura: { servicos: true },
                estabelecimentos: [{
                    cnes: '2456184',
                    servicos: [{ codigo: '115', classificacao: '001' }]
                }]
            },
            sigtap: {
                competencia: '202608', oficial: true, completo: true,
                procedimentos: {
                    '0205020143': {
                        cobertura: { servicos: true },
                        servicos: [{ servico: '115', classificacao: '001' }]
                    }
                }
            }
        }
    };
    const resOk = bpaAuditCore.audit(bpa, basesOk);
    const regrasOk = penteFinoEngine.classificar5Regras(resOk);
    assert.strictEqual(regrasOk.regra4_servico_classificacao.ok, true, 'Serviço/classificação presente no CNES deve passar');

    // CNES sem o serviço exigido não altera uma regra exclusivamente SIGTAP.
    const basesSemServico = {
        '202608': {
            cnes: {
                competencia: '202608', oficial: true, completo: true,
                cobertura: { servicos: true },
                estabelecimentos: [{
                    cnes: '2456184',
                    servicos: [{ codigo: '120', classificacao: '002' }] // Outro serviço
                }]
            },
            sigtap: {
                competencia: '202608', oficial: true, completo: true,
                procedimentos: {
                    '0205020143': {
                        cobertura: { servicos: true },
                        servicos: [{ servico: '115', classificacao: '001' }]
                    }
                }
            }
        }
    };
    const resGlosa = bpaAuditCore.audit(bpa, basesSemServico);
    const regrasGlosa = penteFinoEngine.classificar5Regras(resGlosa);
    assert.strictEqual(regrasGlosa.regra4_servico_classificacao.ok, true, 'Serviço/classificação presente no SIGTAP não depende da cobertura CNES');
});

test('Regra 5: Cartão SUS (CNS) do profissional (OK vs Glosa)', () => {
    // CNS válido
    const bpaOk = {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2456184', competencia: '202608',
            cbo: '225320', cnsProfissional: '703203601654994', procedimento: '0205020143',
            quantidade: 1, idade: 30, sexo: 'M', dataAtendimento: '20260810',
            folha: '001', sequencia: '01'
        }]
    };
    const resOk = bpaAuditCore.audit(bpaOk, {});
    const regrasOk = penteFinoEngine.classificar5Regras(resOk);
    assert.strictEqual(regrasOk.regra5_cns_profissional.ok, true, 'CNS com dígito verificador correto deve passar');

    // CNS inválido
    const bpaInvalido = {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2456184', competencia: '202608',
            cbo: '225320', cnsProfissional: '111111111111111', procedimento: '0205020143',
            quantidade: 1, idade: 30, sexo: 'M', dataAtendimento: '20260810',
            folha: '001', sequencia: '01'
        }]
    };
    const resGlosa = bpaAuditCore.audit(bpaInvalido, {});
    const regrasGlosa = penteFinoEngine.classificar5Regras(resGlosa);
    assert.strictEqual(regrasGlosa.regra5_cns_profissional.ok, false, 'CNS fictício/inválido deve gerar glosa');
});

test('Parecer Final: podeEnviarSemGlosa se e somente se as 5 regras forem OK', () => {
    // 5 regras OK
    const statusOk = penteFinoEngine.avaliarParecerFinal({
        regra1_lotacao_cnes: { ok: true, glosas: [] },
        regra2_cbo_procedimento: { ok: true, glosas: [] },
        regra3_cid_procedimento: { ok: true, glosas: [] },
        regra4_servico_classificacao: { ok: true, glosas: [] },
        regra5_cns_profissional: { ok: true, glosas: [] }
    });
    assert.strictEqual(statusOk.podeEnviarSemGlosa, true);
    assert.strictEqual(statusOk.mensagem, 'Pode enviar a produção sem glosa');

    // 1 regra com glosa
    const statusGlosa = penteFinoEngine.avaliarParecerFinal({
        regra1_lotacao_cnes: { ok: false, glosas: [{ linha: 2, motivo: 'Sem vínculo' }] },
        regra2_cbo_procedimento: { ok: true, glosas: [] },
        regra3_cid_procedimento: { ok: true, glosas: [] },
        regra4_servico_classificacao: { ok: true, glosas: [] },
        regra5_cns_profissional: { ok: true, glosas: [] }
    });
    assert.strictEqual(statusGlosa.podeEnviarSemGlosa, false);
    assert.strictEqual(statusGlosa.totalGlosas, 1);
});

test('parecer bloqueia NAO_VERIFICADO, ALERTA, duplicidade e estrutura', () => {
    const result = penteFinoEngine.classificar5Regras({
        status: 'INCONCLUSIVO',
        findings: [
            { regra: 'CID', status: 'NAO_VERIFICADO' },
            { regra: 'DUPLICIDADE', status: 'ALERTA' },
            { regra: 'ESTRUTURA', status: 'NAO_CONFORME' }
        ]
    });
    assert.strictEqual(result.podeEnviarSemGlosa, false);
    assert.strictEqual(result.parecer.status, 'BLOQUEADO');
});

test('Caso Real Usuário: Hospital Maria Socorro Brandão, Dra. Amanda Almeida Miranda 07/2026 (Regra 1 OK)', () => {
    const fs = require('fs');
    const cnes202607 = JSON.parse(fs.readFileSync(path.join(basePath, 'cnes_data/cnes_210120_202607.json'), 'utf8'));

    const bpaProducao = {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2458055', competencia: '202607',
            cbo: '225320', cnsProfissional: '700001311387700', procedimento: '0206010079',
            quantidade: 1, idade: 35, sexo: 'M', dataAtendimento: '20260715',
            folha: '001', sequencia: '01', servico: '121', classificacao: '003'
        }]
    };

    const basesReal = {
        '202607': {
            cnes: { ...cnes202607, oficial: true, completo: true }
        }
    };

    const res = bpaAuditCore.audit(bpaProducao, basesReal);
    const regras = penteFinoEngine.classificar5Regras(res);
    assert.strictEqual(regras.regra1_lotacao_cnes.ok, true, 'Dra. Amanda Almeida Miranda deve estar com vínculo OK no HMSO em 07/2026');
    assert.strictEqual(regras.regra1_lotacao_cnes.totalGlosas, 0);

    // Também deve reconhecer pelo código histórico 2387412 (alias)
    const bpaAlias = {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2387412', competencia: '202607',
            cbo: '225320', cnsProfissional: '700001311387700', procedimento: '0206010079',
            quantidade: 1, idade: 35, sexo: 'M', dataAtendimento: '20260715',
            folha: '001', sequencia: '01', servico: '121', classificacao: '003'
        }]
    };
    const resAlias = bpaAuditCore.audit(bpaAlias, basesReal);
    const regrasAlias = penteFinoEngine.classificar5Regras(resAlias);
    assert.strictEqual(regrasAlias.regra1_lotacao_cnes.ok, true, 'Deve reconhecer HMSO pelo CNES alias 2387412');
});

test('Caso Real Usuário: Procedimento 0206010079 Tomografia do Crânio - Serviço/Classificação SIGTAP (Regra 4)', () => {
    const fs = require('fs');
    const cnes202607 = JSON.parse(fs.readFileSync(path.join(basePath, 'cnes_data/cnes_210120_202607.json'), 'utf8'));

    const baseSigtapTomo = {
        '202607': {
            cnes: { ...cnes202607, oficial: true, completo: true },
            sigtap: {
                competencia: '202607', oficial: true, completo: true,
                procedimentos: {
                    '0206010079': {
                        codigo: '0206010079',
                        nome: 'TOMOGRAFIA COMPUTADORIZADA DO CRANIO',
                        cobertura: { servicos: true, cbos: true, instrumentos: true },
                        instrumentos: ['02', '01'],
                        cbos: ['225320', '223260'],
                        servicos: [
                            { servico: '121', classificacao: '003' },
                            { servico: '121', classificacao: '009' }
                        ]
                    }
                }
            }
        }
    };

    // Caso A: Informou 121/003 (Tomografia computadorizada) -> OK
    const bpa121003 = {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2458055', competencia: '202607',
            cbo: '225320', cnsProfissional: '700001311387700', procedimento: '0206010079',
            quantidade: 1, idade: 35, sexo: 'M', dataAtendimento: '20260715',
            folha: '001', sequencia: '01', servico: '121', classificacao: '003'
        }]
    };
    const resA = bpaAuditCore.audit(bpa121003, baseSigtapTomo);
    const regrasA = penteFinoEngine.classificar5Regras(resA);
    assert.strictEqual(regrasA.regra4_servico_classificacao.ok, true, 'Serviço 121/003 é habilitado no SIGTAP para 0206010079');

    // Caso B: Informou 121/009 (Tomografia por telemedicina) -> OK
    const bpa121009 = {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2458055', competencia: '202607',
            cbo: '225320', cnsProfissional: '700001311387700', procedimento: '0206010079',
            quantidade: 1, idade: 35, sexo: 'M', dataAtendimento: '20260715',
            folha: '001', sequencia: '01', servico: '121', classificacao: '009'
        }]
    };
    const resB = bpaAuditCore.audit(bpa121009, baseSigtapTomo);
    const regrasB = penteFinoEngine.classificar5Regras(resB);
    assert.strictEqual(regrasB.regra4_servico_classificacao.ok, true, 'Serviço 121/009 é habilitado no SIGTAP para 0206010079');

    // Caso C: Informou serviço incompatível fora do SIGTAP (ex: 122/001 ou 999/999) -> GLOSA
    const bpaInvalido = {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2458055', competencia: '202607',
            cbo: '225320', cnsProfissional: '700001311387700', procedimento: '0206010079',
            quantidade: 1, idade: 35, sexo: 'M', dataAtendimento: '20260715',
            folha: '001', sequencia: '01', servico: '999', classificacao: '999'
        }]
    };
    const resC = bpaAuditCore.audit(bpaInvalido, baseSigtapTomo);
    const regrasC = penteFinoEngine.classificar5Regras(resC);
    assert.strictEqual(regrasC.regra4_servico_classificacao.ok, false, 'Serviço 999/999 fora do SIGTAP deve gerar glosa');
});

test('Caso Real Completo: Produção 07/2026 com Dra. Amanda e Tomografia 121/003 aprova 100% no Pente Fino', () => {
    const fs = require('fs');
    const cnes202607 = JSON.parse(fs.readFileSync(path.join(basePath, 'cnes_data/cnes_210120_202607.json'), 'utf8'));

    const bpaLote = {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2458055', competencia: '202607',
            cbo: '225320', cnsProfissional: '700001311387700', procedimento: '0206010079',
            quantidade: 1, idade: 35, sexo: 'M', nascimento: '19910715', dataAtendimento: '20260715',
            folha: '001', sequencia: '01', servico: '121', classificacao: '003'
        }]
    };

    const bases = {
        '202607': {
            cnes: { ...cnes202607, oficial: true, completo: true },
            sigtap: {
                competencia: '202607', oficial: true, completo: true,
                procedimentos: {
                    '0206010079': {
                        codigo: '0206010079',
                        nome: 'TOMOGRAFIA COMPUTADORIZADA DO CRANIO',
                        sexo: 'I',
                        idade: { min: 0, max: 1560, unidade: 'meses' },
                        limiteQuantidade: { aplicavel: false },
                        valorSa: 97.44,
                        instrumentos: ['02', '01'],
                        cbos: ['225320', '223260'],
                        cids: [],
                        servicos: [
                            { servico: '121', classificacao: '003' },
                            { servico: '121', classificacao: '009' }
                        ],
                        regrasComplementares: [],
                        cobertura: { instrumentos: true, cbos: true, cids: true, servicos: true, regrasComplementares: true }
                    }
                }
            }
        }
    };

    const res = bpaAuditCore.audit(bpaLote, bases);
    const c5 = penteFinoEngine.classificar5Regras(res);

    assert.strictEqual(c5.regra1_lotacao_cnes.ok, true, 'Regra 1 deve ser OK');
    assert.strictEqual(c5.regra2_cbo_procedimento.ok, true, 'Regra 2 deve ser OK');
    assert.strictEqual(c5.regra3_cid_procedimento.ok, true, 'Regra 3 deve ser OK');
    assert.strictEqual(c5.regra4_servico_classificacao.ok, true, 'Regra 4 deve ser OK');
    assert.strictEqual(c5.regra5_cns_profissional.ok, true, 'Regra 5 deve ser OK');
    assert.strictEqual(c5.podeEnviarSemGlosa, true, 'Lote aprovado deve ter podeEnviarSemGlosa = true');
    assert.strictEqual(c5.parecer.mensagem, 'Pode enviar a produção sem glosa');
});

test('PenteFinoEngine exporta renderizarResultados e getUltimoResultado publicamente', () => {
    assert.strictEqual(typeof penteFinoEngine.renderizarResultados, 'function');
    assert.strictEqual(typeof penteFinoEngine.getUltimoResultado, 'function');
    assert.strictEqual(typeof penteFinoEngine.executarAuditoria, 'function');
});

test('mascararCns oculta miolo de 9 dígitos preservando prefixo e sufixo de 3 dígitos', () => {
    const bpaModule = require(path.join(basePath, 'js/bpa-module.js'));
    assert.strictEqual(penteFinoEngine.mascararCns('700000000000005'), '700*********005');
    assert.strictEqual(bpaModule.mascararCns('700000000000005'), '700*********005');
});

test('BpaModule bloqueia envio sem auditoria ou com fingerprint divergente, e libera na recepção integrada com apontamentos', async () => {
    const bpaModule = require(path.join(basePath, 'js/bpa-module.js'));
    bpaModule.filePendingUpload = { nomeArquivo: 'test.bpa', fingerprint: 'hash123' };

    // 1. Sem auditoria executada -> Bloqueado
    bpaModule.auditApproval = null;
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), false);
    assert.strictEqual(await bpaModule.handleFormSubmit(), false);

    // 2. Auditoria realizada com apontamentos -> Liberado para Recepção Integrada
    bpaModule.auditApproval = { fingerprint: 'hash123', podeEnviarSemGlosa: false, status: 'COM_APONTAMENTOS' };
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), true);

    // 3. Auditoria com fingerprint divergente (arquivo alterado) -> Bloqueado
    bpaModule.auditApproval = { fingerprint: 'hashOutro', podeEnviarSemGlosa: true };
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), false);
    assert.strictEqual(await bpaModule.handleFormSubmit(), false);
});

test('BpaModule permite envio apenas após aprovação com o mesmo fingerprint e limpa na troca', () => {
    const bpaModule = require(path.join(basePath, 'js/bpa-module.js'));
    bpaModule.filePendingUpload = { nomeArquivo: 'test.bpa', fingerprint: 'hash123' };
    bpaModule.auditApproval = { fingerprint: 'hash123', approvedAt: Date.now(), podeEnviarSemGlosa: true };
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), true);

    // Troca de arquivo limpa aprovação
    bpaModule.handleFileSelect({ name: 'novo.txt', size: 10 });
    assert.strictEqual(bpaModule.auditApproval, null);
    assert.strictEqual(bpaModule.canSubmitPendingUpload(), false);
});

test('botão 3D de envio direto roteia para BpaModule.handleFormSubmit()', () => {
    const penteFino3D = require(path.join(basePath, 'js/pente-fino-3d-renderer.js'));
    let submitChamado = false;
    global.window = global.window || {};
    global.window.BpaModule = {
        handleFormSubmit: () => {
            submitChamado = true;
            return true;
        }
    };

    penteFino3D.confirmarEnvioDireto();
    assert.strictEqual(submitChamado, true, 'confirmarEnvioDireto do 3D Renderer deve invocar BpaModule.handleFormSubmit');
});

function basesCompletasComRegras(regrasComplementares) {
    return {
        '202608': {
            cnes: {
                competencia: '202608', oficial: true, completo: true,
                cobertura: { profissionais: true, servicos: true, habilitacoes: true },
                estabelecimentos: [{
                    cnes: '2456184',
                    profissionais: [{ cns: '703203601654994', cbo: '225320', ativo: true }]
                }]
            },
            sigtap: {
                competencia: '202608', oficial: true, completo: true,
                procedimentos: {
                    '0205020143': {
                        valorSa: 15.50,
                        sexo: 'I',
                        idade: { min: 0, max: 130, unidade: 'anos' },
                        limiteQuantidade: { aplicavel: false },
                        cobertura: { cbos: true, cids: true, servicos: true, instrumentos: true, regrasComplementares: true },
                        cbos: ['225320'],
                        cids: ['R104'],
                        servicos: [],
                        instrumentos: ['02'],
                        habilitacoes: [],
                        regrasComplementares
                    }
                }
            }
        }
    };
}

function registroConsultaLimpa() {
    return {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2456184', competencia: '202608',
            cbo: '225320', cnsProfissional: '703203601654994', procedimento: '0205020143',
            quantidade: 1, idade: 35, sexo: 'M', cid: 'R104', dataAtendimento: '20260810',
            nascimento: '19910101', servico: '', classificacao: '',
            folha: '001', sequencia: '01', cpfPaciente: '', cnsPaciente: ''
        }]
    };
}

test('atributos informativos do SIGTAP (PMAE, modalidade, financiamento, compatibilidades) com cobertura completa não bloqueiam o parecer', () => {
    const informativos = [
        { tipo: 'informativo', codigo: '053', fonte: 'Programa Mais Acesso a Especialistas (PMAE)' },
        { tipo: 'informativo', codigo: '060', fonte: 'Componente Complementar - Modalidade 3' },
        { tipo: 'informativo', codigo: '0014', fonte: 'CONDICIONA O TIPO DE FINANCIAMENTO EM MAC' },
        { tipo: 'informativo', codigo: 'compat', fonte: 'Compatibilidade com outro procedimento' }
    ];
    const res = bpaAuditCore.audit(registroConsultaLimpa(), basesCompletasComRegras(informativos));
    assert.strictEqual(res.findings.some(f => f.regra === 'REGRAS_COMPLEMENTARES'), false, 'Atributo informativo com cobertura completa não gera pendência');
    assert.ok((res.checks.REGRAS_COMPLEMENTARES?.NAO_APLICAVEL || 0) >= 1, 'Atributo informativo é registrado como não aplicável por linha');
    assert.strictEqual(res.status, 'CONFORME');
    const c5 = penteFinoEngine.classificar5Regras(res);
    assert.strictEqual(c5.podeEnviarSemGlosa, true, 'Lote limpo com atributos informativos pode ser enviado sem glosa');
    assert.strictEqual(c5.parecer.status, 'APROVADO');
});

test('regra complementar de tipo desconhecido mantém fail-closed (NAO_VERIFICADO)', () => {
    const res = bpaAuditCore.audit(registroConsultaLimpa(), basesCompletasComRegras([{ tipo: 'desconhecida' }]));
    assert.ok(res.findings.some(f => f.regra === 'REGRAS_COMPLEMENTARES' && f.status === 'NAO_VERIFICADO'), 'Tipo desconhecido continua inconclusivo');
    assert.strictEqual(res.status, 'INCONCLUSIVO');
});

test('CPF obrigatório ausente gera ATRIBUTO_COMPLEMENTAR NAO_CONFORME com orientação corretiva', () => {
    const res = bpaAuditCore.audit(
        registroConsultaLimpa(),
        basesCompletasComRegras([{ tipo: 'campoObrigatorio', campo: 'cpfPaciente', fonte: 'Obrigatório CPF' }])
    );
    const achado = res.findings.find(f => f.regra === 'ATRIBUTO_COMPLEMENTAR');
    assert.ok(achado, 'Deve apontar o campo obrigatório ausente');
    assert.strictEqual(achado.status, 'NAO_CONFORME');
    assert.ok(/339/.test(achado.mensagem), 'Mensagem deve orientar onde preencher o CPF (posições 339-349 do BPA-I), got: ' + achado.mensagem);
});

test('parecer é INCONCLUSIVO (não BLOQUEADO por glosa) quando há apenas pendências', () => {
    const result = penteFinoEngine.classificar5Regras({
        status: 'INCONCLUSIVO',
        findings: [{ regra: 'CID', status: 'NAO_VERIFICADO' }]
    });
    assert.strictEqual(result.podeEnviarSemGlosa, false);
    assert.strictEqual(result.parecer.status, 'INCONCLUSIVO');
    assert.strictEqual(result.parecer.totalGlosas, 0, 'Pendência de verificação não é glosa definitiva');
    assert.strictEqual(result.parecer.totalPendencias, 1);
});

function basesServico(paresServico) {
    return {
        '202608': {
            sigtap: {
                competencia: '202608', oficial: true, completo: true,
                procedimentos: {
                    '0205020143': {
                        cobertura: { servicos: true },
                        servicos: paresServico
                    }
                }
            }
        }
    };
}

function registroServico(servico, classificacao) {
    return {
        records: [{
            linha: 2, tipo: 'BPA-I', cnes: '2456184', competencia: '202608',
            cbo: '225320', cnsProfissional: '703203601654994', procedimento: '0205020143',
            quantidade: 1, idade: 30, sexo: 'M', cid: 'R104', dataAtendimento: '20260810',
            nascimento: '19910101', servico, classificacao, folha: '001', sequencia: '01'
        }]
    };
}

test('Regra 4: par numérico da fonte oficial equivale ao par do layout (só elimina diferença de tipo JSON)', () => {
    const res = bpaAuditCore.audit(
        registroServico('121', '003'),
        basesServico([{ servico: 121, classificacao: 3 }])
    );
    assert.ok(!res.findings.some(f => f.regra === 'SERVICO_INFORMADO' && f.status === 'NAO_CONFORME'), 'Par 121/003 numérico da fonte equivale ao par do layout');
    assert.ok((res.checks.SERVICO_INFORMADO?.CONFORME || 0) >= 1);
});

test('Regra 4: par fora da lista habilitada no SIGTAP gera glosa', () => {
    const res = bpaAuditCore.audit(
        registroServico('999', '999'),
        basesServico([{ servico: '121', classificacao: '003' }])
    );
    const achado = res.findings.find(f => f.regra === 'SERVICO_INFORMADO');
    assert.ok(achado, 'Deve apontar o par incompatível');
    assert.strictEqual(achado.status, 'NAO_CONFORME');
});

test('Regra 4: procedimento sem exigência de serviço é NAO_APLICAVEL mesmo com par informado', () => {
    const res = bpaAuditCore.audit(registroServico('121', '003'), basesServico([]));
    assert.ok(!res.findings.some(f => f.regra === 'SERVICO_INFORMADO'), 'Sem exigência não há apontamento');
    assert.ok((res.checks.SERVICO_CLASSIFICACAO?.NAO_APLICAVEL || 0) >= 1);
});

test('Regra 4: BPA-C registra NAO_APLICAVEL em vez de aprovação silenciosa', () => {
    const res = bpaAuditCore.audit({
        records: [{
            linha: 2, tipo: 'BPA-C', cnes: '2456184', competencia: '202608',
            cbo: '225125', procedimento: '0205020143', quantidade: '000120',
            idade: '030', folha: '001', sequencia: '01'
        }]
    }, basesServico([{ servico: '121', classificacao: '003' }]));
    assert.ok(!res.findings.some(f => f.regra === 'SERVICO_INFORMADO'), 'BPA-C não informa par por linha');
    assert.ok((res.checks.SERVICO_INFORMADO?.NAO_APLICAVEL || 0) >= 1, 'BPA-C deve registrar não aplicabilidade explícita');
});

test('parecer BLOQUEADO conta como glosa apenas NAO_CONFORME confirmado', () => {
    const result = penteFinoEngine.classificar5Regras({
        status: 'NAO_CONFORME',
        findings: [
            { regra: 'CNS_PROFISSIONAL', status: 'NAO_CONFORME' },
            { regra: 'CID', status: 'NAO_VERIFICADO' }
        ]
    });
    assert.strictEqual(result.podeEnviarSemGlosa, false);
    assert.strictEqual(result.parecer.status, 'BLOQUEADO');
    assert.strictEqual(result.parecer.totalGlosas, 1, 'Somente o NAO_CONFORME confirmado conta como glosa');
    assert.strictEqual(result.parecer.totalPendencias, 1);
});

test('filtro por regra isola apenas os achados da Regra 4 (servico/classificacao)', () => {
    assert.strictEqual(typeof penteFinoEngine.filtrarRegra, 'function');
    assert.strictEqual(typeof penteFinoEngine.limparFiltroRegra, 'function');
    assert.strictEqual(typeof penteFinoEngine.findingsDaRegra, 'function');
    const findings = [
        { regra: 'SERVICO_INFORMADO', status: 'NAO_CONFORME', linha: 10 },
        { regra: 'SERVICO_CLASSIFICACAO', status: 'NAO_VERIFICADO', linha: 11 },
        { regra: 'CBO_SIGTAP', status: 'NAO_CONFORME', linha: 12 },
        { regra: 'CID', status: 'NAO_CONFORME', linha: 13 }
    ];
    const daRegra4 = penteFinoEngine.findingsDaRegra(findings, 'regra4_servico_classificacao');
    assert.deepStrictEqual(daRegra4.map(f => f.linha), [10, 11]);
    penteFinoEngine.limparFiltroRegra();
    assert.strictEqual(penteFinoEngine.getFiltroRegra(), '');
    penteFinoEngine.filtrarRegra('regra4_servico_classificacao');
    assert.strictEqual(penteFinoEngine.getFiltroRegra(), 'regra4_servico_classificacao');
    penteFinoEngine.limparFiltroRegra();
});

test('pendência de catálogo parcial traz frase objetiva com ação (Regra 4)', () => {
    const bpa = {
        records: [{
            linha: 188, tipo: 'BPA-I', cnes: '2456184', competencia: '202607',
            cbo: '225320', cnsProfissional: '703203601654994', procedimento: '0205020061',
            quantidade: 1, idade: 30, sexo: 'M', cid: 'R104', dataAtendimento: '20260710',
            nascimento: '19950101', servico: '115', classificacao: '001', folha: '001', sequencia: '01'
        }]
    };
    // Base parcial via API: válida, mas incompleta e sem o procedimento.
    const bases = {
        '202607': {
            sigtap: { competencia: '202607', validada: true, completo: false, procedimentos: {} }
        }
    };
    const res = bpaAuditCore.audit(bpa, bases);
    const achado = res.findings.find(f => f.regra === 'PROCEDIMENTO_VIGENTE');
    assert.ok(achado, 'Deve apontar a vigência não verificada do procedimento');
    assert.strictEqual(achado.status, 'NAO_VERIFICADO');
    assert.ok(achado.mensagem.includes('0205020061'), 'Mensagem deve citar o procedimento, got: ' + achado.mensagem);
    assert.ok(achado.mensagem.includes('202607'), 'Mensagem deve citar a competência, got: ' + achado.mensagem);
    assert.ok(achado.esperado && achado.encontrado, 'Esperado/encontrado devem vir preenchidos');
    assert.ok(achado.orientacao, 'Deve trazer o que fazer (orientação de ação)');
});

test('resumoRegra separa glosa confirmada de pendência a conferir', () => {
    assert.strictEqual(typeof penteFinoEngine.resumoRegra, 'function');
    const resumo = penteFinoEngine.resumoRegra({ glosas: [
        { status: 'NAO_CONFORME' },
        { status: 'NAO_VERIFICADO' },
        { status: 'ALERTA' }
    ]});
    assert.deepStrictEqual(resumo, { confirmadas: 1, pendencias: 2, total: 3 });
    assert.deepStrictEqual(penteFinoEngine.resumoRegra({ glosas: [] }), { confirmadas: 0, pendencias: 0, total: 0 });
});

test('3D renderer abre diagnostico repassando a regra clicada ao engine', () => {
    const penteFino3D = require(path.join(basePath, 'js/pente-fino-3d-renderer.js'));
    assert.strictEqual(typeof penteFino3D.abrirDiagnosticoCompleto, 'function');
    let regraRecebida = null;
    const g = typeof globalThis !== 'undefined' ? globalThis : {};
    const origWindow = g.window;
    const origEngine = g.PenteFinoEngine;
    g.window = g.window || {};
    g.PenteFinoEngine = {
        filtrarRegra: (codigo) => { regraRecebida = codigo; },
        renderizarResultados: () => {}
    };
    g.window.PenteFinoEngine = g.PenteFinoEngine;
    if (typeof document === 'undefined') {
        g.document = { getElementById: () => null };
    }
    penteFino3D.abrirDiagnosticoCompleto('regra4_servico_classificacao');
    assert.strictEqual(regraRecebida, 'regra4_servico_classificacao');
    if (origEngine === undefined) delete g.PenteFinoEngine; else g.PenteFinoEngine = origEngine;
    if (origWindow === undefined) delete g.window; else g.window = origWindow;
});
