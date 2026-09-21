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
