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

test('Regra 4: Serviços e Classificações habilitados no CNES (OK vs Glosa)', () => {
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

    // CNES sem o serviço exigido
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
    assert.strictEqual(regrasGlosa.regra4_servico_classificacao.ok, false, 'Serviço ausente no CNES deve gerar glosa');
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
