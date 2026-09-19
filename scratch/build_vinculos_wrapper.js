const fs = require('fs');

async function main() {
    const cnesList = ['4347633', '4772822'];
    const allAudited = JSON.parse(fs.readFileSync('scratch/datasus_audit_vinculos_completo.json', 'utf8'));
    const map = JSON.parse(fs.readFileSync('code_sandbox_light_git_fe61910d_1781185357/cnes_data/datasus_vinculos.json', 'utf8'));

    for (const cnes of cnesList) {
        const url = `http://cnes2.datasus.gov.br/Mod_Profissional.asp?VCo_Unidade=210120${cnes}`;
        try {
            const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
            const buf = Buffer.from(await resp.arrayBuffer());
            const html = buf.toString('latin1');
            const rows = [...html.matchAll(/<tr class='gradeA'>([\s\S]*?)<\/tr>/gi)];
            for (const r of rows) {
                const tds = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(td => 
                    td[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
                );
                if (tds.length >= 14) {
                    const nome = (tds[0] || '').toUpperCase().trim();
                    const cns = (tds[2] || '').replace(/\D/g, '');
                    const cnsMaster = (tds[3] || '').replace(/\D/g, '') || cns;
                    const dtAtribuicao = tds[4] || '';
                    const cbo = tds[5] || '';
                    const cboCodigo = cbo.split(' ')[0].replace(/\D/g, '');
                    const atendimentoSus = (tds[10] || 'SIM').toUpperCase().trim();
                    const vinculacao = (tds[11] || '').toUpperCase().trim();
                    const tipoVinculo = (tds[12] || '').toUpperCase().trim();
                    const subtipoVinculo = (tds[13] || '').toUpperCase().trim();
                    const situacao = tds[15] || 'Ativo';

                    const obj = { cnes, nome, cns, cnsMaster, cbo, cboCodigo, dtAtribuicao, atendimentoSus, vinculacao, tipoVinculo, subtipoVinculo, situacao };
                    allAudited.push(obj);

                    const payload = { tipoVinculo, subtipoVinculo, vinculacao, dtAtribuicao, atendimentoSus };
                    if (cnes && cns) map[`${cnes}_${cns}`] = payload;
                    if (cnes && cnsMaster) map[`${cnes}_${cnsMaster}`] = payload;
                    if (cns) map[`cns_${cns}`] = payload;
                    if (cnsMaster) map[`cns_${cnsMaster}`] = payload;
                    if (nome) map[`nome_${nome}`] = payload;
                }
            }
        } catch (e) {
            console.warn(`Erro ao buscar CNES ${cnes}:`, e.message);
        }
    }

    fs.writeFileSync('scratch/datasus_audit_vinculos_completo.json', JSON.stringify(allAudited, null, 2), 'utf8');
    fs.writeFileSync('code_sandbox_light_git_fe61910d_1781185357/cnes_data/datasus_vinculos.json', JSON.stringify(map, null, 2), 'utf8');

    const header = `/**
 * MAPA OFICIAL DE VÍNCULOS E SUBTIPOS DATASUS CNESNet — BACABAL / MA
 * Extraído diretamente do CNESNet Oficial (cnes2.datasus.gov.br)
 * Total de registros auditados: ${allAudited.length}
 */\n`;
    const body = `(function() {\n    const MAPA = ${JSON.stringify(map)};\n    if (typeof window !== 'undefined') {\n        window.DATASUS_VINCULOS_BACABAL = MAPA;\n    }\n    if (typeof module !== 'undefined' && module.exports) {\n        module.exports = MAPA;\n    }\n})();\n`;
    fs.writeFileSync('code_sandbox_light_git_fe61910d_1781185357/js/cnes-vinculos-bacabal.js', header + body, 'utf8');

    console.log(`Auditoria completa finalizada: ${allAudited.length} registros auditados. Arquivo JS atualizado.`);
}

main();
