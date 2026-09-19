const fs = require('fs');
const path = require('path');

const cnesList = JSON.parse(fs.readFileSync('scratch/all_bacabal_cnes.json', 'utf8'));

async function fetchEstablishment(cnes) {
    const vco = `210120${cnes}`;
    const url = `http://cnes2.datasus.gov.br/Mod_Profissional.asp?VCo_Unidade=${vco}`;
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
        const buf = Buffer.from(await resp.arrayBuffer());
        const html = buf.toString('latin1');
        const rows = [...html.matchAll(/<tr class='gradeA'>([\s\S]*?)<\/tr>/gi)];
        const profs = [];
        
        for (const r of rows) {
            const tds = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(td => 
                td[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
            );
            
            if (tds.length >= 14) {
                const nome = (tds[0] || '').toUpperCase().trim();
                const dtEntrada = tds[1] || '';
                const cns = (tds[2] || '').replace(/\D/g, '');
                const cnsMaster = (tds[3] || '').replace(/\D/g, '');
                const dtAtribuicao = tds[4] || '';
                const cbo = tds[5] || '';
                const cboCodigo = cbo.split(' ')[0].replace(/\D/g, '');
                const chOutros = tds[6] || '0Hs.';
                const chAmb = tds[7] || '0Hs.';
                const chHosp = tds[8] || '0Hs.';
                const chTotal = tds[9] || '0Hs.';
                const atendimentoSus = (tds[10] || 'SIM').toUpperCase().trim();
                const vinculacao = (tds[11] || '').toUpperCase().trim();
                const tipoVinculo = (tds[12] || '').toUpperCase().trim();
                const subtipoVinculo = (tds[13] || '').toUpperCase().trim();
                const situacao = tds[15] || 'Ativo';
                
                profs.push({
                    cnes: String(cnes).trim(),
                    nome,
                    cns,
                    cnsMaster: cnsMaster || cns,
                    cbo,
                    cboCodigo,
                    dtEntrada,
                    dtAtribuicao,
                    chOutros,
                    chAmb,
                    chHosp,
                    chTotal,
                    atendimentoSus,
                    vinculacao,
                    tipoVinculo,
                    subtipoVinculo,
                    situacao
                });
            }
        }
        return profs;
    } catch (err) {
        console.error(`Erro ao consultar CNES ${cnes}: ${err.message}`);
        return [];
    }
}

async function runAudit() {
    console.log(`================================================================`);
    console.log(`AUDITORIA OFICIAL DATASUS CNESNet — VÍNCULOS E ESTATUTÁRIOS (BACABAL)`);
    console.log(`Total de estabelecimentos para auditar: ${cnesList.length}`);
    console.log(`================================================================`);

    const concurrency = 6;
    const allAuditedProfs = [];
    let unitsWithProfs = 0;
    const tiposStats = {};
    const subtiposStats = {};

    for (let i = 0; i < cnesList.length; i += concurrency) {
        const batch = cnesList.slice(i, i + concurrency);
        const results = await Promise.all(batch.map(c => fetchEstablishment(c)));
        
        results.forEach((profs, idx) => {
            const cnes = batch[idx];
            if (profs.length > 0) {
                unitsWithProfs++;
                allAuditedProfs.push(...profs);
                profs.forEach(p => {
                    tiposStats[p.tipoVinculo] = (tiposStats[p.tipoVinculo] || 0) + 1;
                    subtiposStats[p.subtipoVinculo] = (subtiposStats[p.subtipoVinculo] || 0) + 1;
                });
                const estatutarios = profs.filter(p => p.tipoVinculo.includes('ESTATUT')).length;
                console.log(`[CNES ${cnes}] ${profs.length} profissionais auditados (${estatutarios} estatutários efetivos)`);
            }
        });
        
        process.stdout.write(`Progresso: ${Math.min(i + concurrency, cnesList.length)}/${cnesList.length} estabelecimentos...\r`);
    }

    console.log(`\n================================================================`);
    console.log(`AUDITORIA DE VÍNCULOS CONCLUÍDA COM SUCESSO!`);
    console.log(`Total de estabelecimentos com profissionais: ${unitsWithProfs}`);
    console.log(`Total de profissionais/vínculos extraídos: ${allAuditedProfs.length}`);
    console.log(`Distribuição de Tipos de Vínculo:`, tiposStats);
    console.log(`Distribuição de Subtipos de Vínculo:`, subtiposStats);

    // Salva arquivo bruto auditado
    fs.writeFileSync('scratch/datasus_audit_vinculos_completo.json', JSON.stringify(allAuditedProfs, null, 2), 'utf8');

    // Cria mapa de busca rápida por múltiplas chaves
    const indexedMap = {};
    allAuditedProfs.forEach(p => {
        const cnes = String(p.cnes || '').trim();
        const cns = String(p.cns || '').replace(/\D/g, '');
        const cnsMaster = String(p.cnsMaster || '').replace(/\D/g, '');
        const cbo = String(p.cboCodigo || '').trim();
        const nomeNorm = String(p.nome || '').replace(/\s+/g, ' ').trim();
        const payload = {
            tipoVinculo: p.tipoVinculo,
            subtipoVinculo: p.subtipoVinculo,
            vinculacao: p.vinculacao,
            dtAtribuicao: p.dtAtribuicao,
            atendimentoSus: p.atendimentoSus
        };

        if (cnes && cns) {
            indexedMap[`${cnes}_${cns}`] = payload;
            if (cbo) indexedMap[`${cnes}_${cns}_${cbo}`] = payload;
        }
        if (cnes && cnsMaster) {
            indexedMap[`${cnes}_${cnsMaster}`] = payload;
            if (cbo) indexedMap[`${cnes}_${cnsMaster}_${cbo}`] = payload;
        }
        if (cnes && nomeNorm) {
            indexedMap[`${cnes}_${nomeNorm}`] = payload;
            if (cbo) indexedMap[`${cnes}_${nomeNorm}_${cbo}`] = payload;
        }
        if (cns) {
            indexedMap[`cns_${cns}`] = payload;
        }
        if (cnsMaster) {
            indexedMap[`cns_${cnsMaster}`] = payload;
        }
        if (nomeNorm) {
            indexedMap[`nome_${nomeNorm}`] = payload;
        }
    });

    const jsonPath = 'code_sandbox_light_git_fe61910d_1781185357/cnes_data/datasus_vinculos.json';
    fs.writeFileSync(jsonPath, JSON.stringify(indexedMap, null, 2), 'utf8');
    console.log(`Mapa indexado de vínculos salvo em ${jsonPath} (${Object.keys(indexedMap).length} chaves).`);

    // Gera arquivo JS executável para o navegador
    const jsContent = `/**
 * MAPA OFICIAL DE VÍNCULOS E SUBTIPOS DATASUS CNESNet — BACABAL / MA
 * Extraído diretamente do CNESNet Oficial (cnes2.datasus.gov.br)
 * Data de Auditoria: ${new Date().toISOString()}
 * Total de registros auditados: ${allAuditedProfs.length}
 */
(function() {
    const MAPA = ${JSON.stringify(indexedMap)};
    if (typeof window !== 'undefined') {
        window.DATASUS_VINCULOS_BACABAL = MAPA;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MAPA;
    }
})();
`;
    const jsPath = 'code_sandbox_light_git_fe61910d_1781185357/js/cnes-vinculos-bacabal.js';
    fs.writeFileSync(jsPath, jsContent, 'utf8');
    console.log(`Módulo JS cliente salvo em ${jsPath} (${(Buffer.byteLength(jsContent)/1024).toFixed(1)} KB).`);
}

runAudit();
