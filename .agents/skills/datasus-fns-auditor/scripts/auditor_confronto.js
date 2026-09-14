/**
 * DATASUS & FNS AUDITOR — auditor_confronto.js
 * Script especialista em cruzamento e auditoria: FPA ARGOS vs. Portaria GM/MS vs. FNS
 */

const FnsClient = require('./fns_client');
const path = require('path');
const fs = require('fs');

// Carregar tetos da Portaria GM/MS 10.146
function getPortariaTeto(ibge) {
    const candidates = [
        path.resolve(__dirname, '../../../../code_sandbox_light_git_fe61910d_1781185357/municipio do MA da portaria 10146.txt'),
        path.resolve(__dirname, '../../../code_sandbox_light_git_fe61910d_1781185357/municipio do MA da portaria 10146.txt'),
        path.resolve(process.cwd(), 'code_sandbox_light_git_fe61910d_1781185357/municipio do MA da portaria 10146.txt')
    ];
    let portariaPath = candidates.find(p => fs.existsSync(p));
    if (!portariaPath) return null;

    const content = fs.readFileSync(portariaPath, 'utf8');
    const lines = content.split('\n');
    for (const l of lines) {
        const parts = l.trim().split(';');
        if (parts[1] === String(ibge)) {
            const parseNum = s => parseFloat((s || '0').replace(/\./g, '').replace(',', '.')) || 0;
            return {
                uf: parts[0],
                ibge: parts[1],
                nome: parts[2],
                gestao: parts[3],
                tetoMacSemSamu: parseNum(parts[4]),
                samu: parseNum(parts[5]),
                total: parseNum(parts[6])
            };
        }
    }
    return null;
}

async function auditar(ibge = '210120', ano = '2026', uf = 'MA') {
    const client = new FnsClient();
    const portaria = getPortariaTeto(ibge);

    console.log(`\n======================================================================`);
    console.log(` RELATÓRIO DE AUDITORIA E COTEJAMENTO FEDERAL SUS: IBGE ${ibge}`);
    console.log(` Exercício: ${ano} | Município: ${portaria ? portaria.nome : 'NÃO IDENTIFICADO'} (${uf})`);
    console.log(`======================================================================\n`);

    if (portaria) {
        console.log(`[1] PROGRAMAÇÃO REGULATÓRIA (PORTARIA GM/MS 10.146):`);
        console.log(`    - Teto MAC Base (Sem SAMU): R$ ${portaria.tetoMacSemSamu.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
        console.log(`    - Custeio Federal SAMU:     R$ ${portaria.samu.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
        console.log(`    - TETO ANUAL REGULATÓRIO:   R$ ${portaria.total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
    } else {
        console.log(`[1] PROGRAMAÇÃO REGULATÓRIA: Município não localizado na Portaria 10.146.`);
    }

    try {
        const entidade = await client.getEntidadeFms(ibge, ano, uf);
        const blocos = await client.getRepasseBloco(ibge, ano, uf);
        const acoes = await client.getDetalheAcoes(ibge, ano, entidade ? entidade.cpfCnpj : null, uf);

        let totalCusteioFns = 0;
        let totalMacFns = 0;
        let macEmendas = 0;
        let macExtraordinario = 0;
        let macSamu = 0;
        let macOrdinario = 0;

        blocos.forEach(b => {
            if (b.codigo === 10) totalCusteioFns += b.vlTotal;
        });

        acoes.forEach(a => {
            const desc = a.descricao.toUpperCase();
            const val = Number(a.valorLiquido) || 0;
            const isMac = (a.grupoAcao && a.grupoAcao.nome.includes('COMPLEXIDADE')) || (a.componenteBloco && a.componenteBloco.nome.includes('COMPLEXIDADE'));

            if (isMac) {
                totalMacFns += val;
                if (desc.includes('EMENDA')) {
                    macEmendas += val;
                } else if (desc.includes('SAMU')) {
                    macSamu += val;
                } else if (desc.includes('REDUÇÃO DAS FILAS') || desc.includes('PORTARIA GM/MS') || desc.includes('EXTRA')) {
                    macExtraordinario += val;
                } else {
                    macOrdinario += val;
                }
            }
        });

        console.log(`\n[2] CRÉDITOS EFETIVADOS NO FUNDO MUNICIPAL DE SAÚDE (FNS / BANCO DO BRASIL):`);
        console.log(`    - Total Custeio Geral FMS:  R$ ${totalCusteioFns.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
        console.log(`    - TOTAL CRÉDITO MAC:        R$ ${totalMacFns.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
        console.log(`      • Limite Base Ordinário:  R$ ${macOrdinario.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
        console.log(`      • Emendas Parlamentares:  R$ ${macEmendas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
        console.log(`      • Aportes Extraordinários:R$ ${macExtraordinario.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
        console.log(`      • SAMU 192 Repassado:     R$ ${macSamu.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);

        console.log(`\n[3] DIAGNÓSTICO DE AUDITORIA E COTEJAMENTO:`);
        if (portaria) {
            const diferencaTotal = totalMacFns - portaria.total;
            if (diferencaTotal >= 0) {
                console.log(`    🟢 CRÉDITO SUPERIOR AO TETO FIXO DA PORTARIA (+ R$ ${diferencaTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})})`);
                console.log(`       O município captou R$ ${(macEmendas + macExtraordinario).toLocaleString('pt-BR', {minimumFractionDigits: 2})} em emendas e aportes adicionais.`);
                console.log(`       Parecer: Se o sistema FPA ARGOS acusar excedente de teto da produção faturada em relação`);
                console.log(`       à Portaria 10.146, NÃO PROCEDER GLOSA antes de confrontar com os R$ ${totalMacFns.toLocaleString('pt-BR', {minimumFractionDigits: 2})} creditados.`);
            } else {
                console.log(`    🟡 CRÉDITO EM CURSO: R$ ${Math.abs(diferencaTotal).toLocaleString('pt-BR', {minimumFractionDigits: 2})} a integralizar no exercício.`);
            }
        }

    } catch (e) {
        console.error('Erro na auditoria:', e.message);
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    auditar(args[0] || '210120', args[1] || '2026', args[2] || 'MA');
}

module.exports = { auditar };
