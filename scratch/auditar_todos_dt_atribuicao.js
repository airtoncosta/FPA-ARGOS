const fs = require('fs');

const cnesList = JSON.parse(fs.readFileSync('scratch/all_bacabal_cnes.json', 'utf8'));

async function fetchEstablishment(cnes) {
    const vco = `210120${cnes}`;
    const url = `http://cnes2.datasus.gov.br/Mod_Profissional.asp?VCo_Unidade=${vco}`;
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
        const html = await resp.text();
        const rows = [...html.matchAll(/<tr class='gradeA'>([\s\S]*?)<\/tr>/gi)];
        const profs = [];
        
        for (const r of rows) {
            const tds = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(td => 
                td[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
            );
            
            if (tds.length >= 6) {
                const nome = tds[0] || '';
                const dtEntrada = tds[1] || '';
                const cns = (tds[2] || '').replace(/\D/g, '');
                const cnsMaster = (tds[3] || '').replace(/\D/g, '');
                const dtAtribuicao = tds[4] || '';
                const cbo = tds[5] || '';
                const cboCodigo = cbo.split(' ')[0].replace(/\D/g, '');
                
                profs.push({
                    cnes: String(cnes).trim(),
                    nome,
                    cns,
                    cnsMaster,
                    cbo,
                    cboCodigo,
                    dtEntrada,
                    dtAtribuicao
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
    console.log(`AUDITORIA OFICIAL DATASUS CNESNet — DT. ATRIBUIÇÃO (BACABAL - MA)`);
    console.log(`Total de estabelecimentos para auditar: ${cnesList.length}`);
    console.log(`================================================================`);

    const concurrency = 6;
    const allAuditedProfs = [];
    let unitsWithProfs = 0;
    let totalProfsWithDt = 0;

    for (let i = 0; i < cnesList.length; i += concurrency) {
        const batch = cnesList.slice(i, i + concurrency);
        const results = await Promise.all(batch.map(c => fetchEstablishment(c)));
        
        results.forEach((profs, idx) => {
            const cnes = batch[idx];
            if (profs.length > 0) {
                unitsWithProfs++;
                allAuditedProfs.push(...profs);
                const withDt = profs.filter(p => p.dtAtribuicao).length;
                totalProfsWithDt += withDt;
                console.log(`[CNES ${cnes}] ${profs.length} profissionais auditados (${withDt} com DT. Atribuição)`);
            }
        });
        
        process.stdout.write(`Progresso: ${Math.min(i + concurrency, cnesList.length)}/${cnesList.length} estabelecimentos...\r`);
    }

    console.log(`\n================================================================`);
    console.log(`AUDITORIA CONCLUÍDA COM SUCESSO!`);
    console.log(`Total de estabelecimentos com profissionais: ${unitsWithProfs}`);
    console.log(`Total geral de vínculos/profissionais auditados: ${allAuditedProfs.length}`);
    console.log(`Total de vínculos com DT. Atribuição oficial: ${totalProfsWithDt}`);
    console.log(`================================================================`);

    // Salvar resultado bruto do município
    fs.writeFileSync('scratch/datasus_audit_dt_atribuicao_completo.json', JSON.stringify(allAuditedProfs, null, 2), 'utf8');
    
    // Criar mapa otimizado por CNES + CNS e CNES + NOME + CBO
    const mapaDtAtribuicao = {};
    allAuditedProfs.forEach(p => {
        const dt = p.dtAtribuicao || p.dtEntrada;
        if (!dt) return;
        
        // Chaves compostas para garantia total de correspondência
        if (p.cns) {
            mapaDtAtribuicao[`${p.cnes}_${p.cns}_${p.cboCodigo}`] = dt;
            mapaDtAtribuicao[`${p.cnes}_${p.cns}`] = dt;
            mapaDtAtribuicao[`CNS_${p.cns}_${p.cboCodigo}`] = dt;
            mapaDtAtribuicao[`CNS_${p.cns}`] = dt;
        }
        if (p.cnsMaster) {
            mapaDtAtribuicao[`${p.cnes}_${p.cnsMaster}_${p.cboCodigo}`] = dt;
            mapaDtAtribuicao[`${p.cnes}_${p.cnsMaster}`] = dt;
            mapaDtAtribuicao[`CNS_${p.cnsMaster}`] = dt;
        }
        const cleanNome = p.nome.toUpperCase().replace(/\s+/g, ' ').trim();
        mapaDtAtribuicao[`${p.cnes}_${cleanNome}_${p.cboCodigo}`] = dt;
        mapaDtAtribuicao[`${p.cnes}_${cleanNome}`] = dt;
    });

    // Salvar em code_sandbox_light_git_fe61910d_1781185357/cnes_data/datasus_dt_atribuicao.json
    const outDir = 'code_sandbox_light_git_fe61910d_1781185357/cnes_data';
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    const outputPath = `${outDir}/datasus_dt_atribuicao.json`;
    fs.writeFileSync(outputPath, JSON.stringify(mapaDtAtribuicao), 'utf8');
    console.log(`Mapa de DT. Atribuição salvo em: ${outputPath} (${Object.keys(mapaDtAtribuicao).length} chaves indexadas)`);

    // Mostrar uma amostra de 10 profissionais auditados
    console.log('\n--- Amostra de 10 profissionais auditados ---');
    console.log(allAuditedProfs.slice(0, 10).map(p => ({
        cnes: p.cnes,
        nome: p.nome,
        cns: p.cns,
        cbo: p.cboCodigo,
        dtAtribuicao: p.dtAtribuicao
    })));
}

runAudit().catch(err => {
    console.error('Falha na auditoria:', err);
});
