const assert = require('node:assert/strict');
const path = require('node:path');

const basePath = path.resolve(__dirname, '../code_sandbox_light_git_fe61910d_1781185357');
const bpaAuditCore = require(path.join(basePath, 'js/bpa-audit-core.js'));
const penteFinoEngine = require(path.join(basePath, 'js/pente-fino-engine.js'));

async function testE2E() {
    console.log('=== Teste de Integração Ponta a Ponta: Pente Fino ARGOS 3D ===');

    // Montando 395 registros realistas como no print do usuário
    const records = [];
    const procedimentos = ['0205020143', '0205020186', '0205020046', '0205020151', '0205020054', '0205020062'];
    for (let i = 1; i <= 395; i++) {
        const proc = procedimentos[i % procedimentos.length];
        records.push({
            linha: i + 1,
            tipo: 'BPA-I',
            cnes: '2456184',
            competencia: '202608',
            cbo: '225320', // Médico em radiologia e diagnóstico por imagem
            cnsProfissional: '703203601654994', // Augusto Ventura Milhomem Torres Terceiro (válido)
            procedimento: proc,
            quantidade: 1,
            idade: 35,
            sexo: 'M',
            cid: 'R104',
            dataAtendimento: '20260810',
            nascimento: '19910101',
            servico: '115',
            classificacao: '001',
            folha: String(Math.floor(i / 20) + 1).padStart(3, '0'),
            sequencia: String((i % 20) + 1).padStart(2, '0')
        });
    }

    const bpaParsed = {
        header: { competencia: '202608', quantidade: 395 },
        records: records,
        issues: []
    };

    const basesConformes = {
        '202608': {
            cnes: {
                competencia: '202608',
                oficial: true,
                completo: true,
                cobertura: { profissionais: true, servicos: true, habilitacoes: true },
                estabelecimentos: [{
                    cnes: '2456184',
                    desabilitado: false,
                    profissionais: [{
                        cns: '703203601654994',
                        cbo: '225320',
                        ativo: true
                    }],
                    servicos: [{ codigo: '115', classificacao: '001' }],
                    habilitacoes: []
                }]
            },
            sigtap: {
                competencia: '202608',
                oficial: true,
                completo: true,
                procedimentos: Object.fromEntries(procedimentos.map(p => [p, {
                    valorSa: 15.50,
                    sexo: 'I',
                    cobertura: { cbos: true, cids: true, servicos: true, instrumentos: true, habilitacoes: true },
                    cbos: ['225320'],
                    cids: ['R104'],
                    servicos: [{ servico: '115', classificacao: '001' }],
                    instrumentos: ['02'],
                    habilitacoes: [],
                    regrasComplementares: []
                }]))
            }
        }
    };

    globalThis.BpaAuditCore = bpaAuditCore;
    const resultado = await penteFinoEngine.auditar5Regras(bpaParsed, basesConformes);
    console.log('Regras encontradas nos findings:', [...new Set(resultado.findings.map(f => f.regra + ':' + f.status))]);

    console.log(`- Registros Auditados: ${resultado.totalLinhas}`);
    console.log(`- Status Geral: ${resultado.status}`);
    console.log(`- Regra 1 (Lotação CNES): ${resultado.classificacao5Regras.regra1_lotacao_cnes.ok ? '✅ OK' : '❌ GLOSA'}`);
    console.log(`- Regra 2 (CBO x Procedimento): ${resultado.classificacao5Regras.regra2_cbo_procedimento.ok ? '✅ OK' : '❌ GLOSA'}`);
    console.log(`- Regra 3 (CID x Procedimento): ${resultado.classificacao5Regras.regra3_cid_procedimento.ok ? '✅ OK' : '❌ GLOSA'}`);
    console.log(`- Regra 4 (Serviço e Classificação): ${resultado.classificacao5Regras.regra4_servico_classificacao.ok ? '✅ OK' : '❌ GLOSA'}`);
    console.log(`- Regra 5 (Cartão SUS do Profissional): ${resultado.classificacao5Regras.regra5_cns_profissional.ok ? '✅ OK' : '❌ GLOSA'}`);
    console.log(`- Parecer Final: ${resultado.podeEnviarSemGlosa ? '🟢 ' + resultado.parecerFinal.mensagem : '🔴 ' + resultado.parecerFinal.mensagem}`);

    assert.strictEqual(resultado.totalLinhas, 395);
    assert.strictEqual(resultado.classificacao5Regras.regra1_lotacao_cnes.ok, true);
    assert.strictEqual(resultado.classificacao5Regras.regra2_cbo_procedimento.ok, true);
    assert.strictEqual(resultado.classificacao5Regras.regra3_cid_procedimento.ok, true);
    assert.strictEqual(resultado.classificacao5Regras.regra4_servico_classificacao.ok, true);
    assert.strictEqual(resultado.classificacao5Regras.regra5_cns_profissional.ok, true);
    assert.strictEqual(resultado.podeEnviarSemGlosa, true);
    assert.strictEqual(resultado.parecerFinal.mensagem, 'Pode enviar a produção sem glosa');

    console.log('\n✅ Todos os testes de integração E2E passaram com perfeição!');
}

testE2E().catch(err => {
    console.error('Falha no teste E2E:', err);
    process.exit(1);
});
