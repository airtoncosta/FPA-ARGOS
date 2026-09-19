const fs = require('fs');

const cnesList = JSON.parse(fs.readFileSync('scratch/all_bacabal_cnes.json', 'utf8'));

async function checkUnit(cnes) {
    const vco = `210120${cnes}`;
    const url = `http://cnes2.datasus.gov.br/Mod_Profissional.asp?VCo_Unidade=${vco}`;
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const html = await resp.text();
        if (!html.includes('dcontexto') && !html.includes('exclamation') && !html.includes('Artigo')) {
            return [];
        }
        
        const trRegex = /<tr class='gradeA'>([\s\S]*?)<\/tr>/gi;
        let m;
        const portariaProfs = [];
        
        while ((m = trRegex.exec(html)) !== null) {
            const tr = m[1];
            if (!tr.includes('dcontexto') && !tr.includes('exclamation') && !tr.includes('Artigo')) continue;
            
            const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            const tds = [];
            let tdMatch;
            while ((tdMatch = tdRegex.exec(tr)) !== null) {
                tds.push(tdMatch[1].trim());
            }
            
            if (tds.length >= 14) {
                const lastTd = tds[tds.length - 1];
                if (lastTd.includes('exclamation') || lastTd.includes('Artigo') || lastTd.includes('dcontexto')) {
                    const nome = tds[0].replace(/<[^>]+>/g, '').trim().toUpperCase();
                    const cns = (tds[2] || '').replace(/<[^>]+>/g, '').replace(/\D/g, '');
                    const cbo = (tds[5] || '').replace(/<[^>]+>/g, '').trim();
                    
                    let artigo = 'Artigo 2º';
                    const spanMatch = lastTd.match(/<span>(.*?)<\/span>/i);
                    if (spanMatch && spanMatch[1]) {
                        artigo = spanMatch[1].replace(/&nbsp;/g, ' ').trim();
                    }
                    
                    portariaProfs.push({
                        cnes,
                        nome,
                        cns,
                        cbo,
                        artigo: artigo || 'Artigo 2º'
                    });
                }
            }
        }
        return portariaProfs;
    } catch (e) {
        return [];
    }
}

async function run() {
    console.log(`Iniciando auditoria completa de Portaria 134 em todos os ${cnesList.length} estabelecimentos de Bacabal...`);
    const allPortaria = [];
    const concurrency = 6;
    
    for (let i = 0; i < cnesList.length; i += concurrency) {
        const slice = cnesList.slice(i, i + concurrency);
        const results = await Promise.all(slice.map(c => checkUnit(c)));
        results.forEach(res => {
            if (res && res.length > 0) {
                allPortaria.push(...res);
                console.log(` -> CNES ${res[0].cnes}: ${res.length} profissional(is) com Portaria 134!`);
            }
        });
        process.stdout.write(`\rProcessado: ${Math.min(i + concurrency, cnesList.length)}/${cnesList.length}...`);
    }
    
    console.log(`\n\n=== RESULTADO AUDITORIA GERAL PORTARIA 134 ===`);
    console.log(`Total geral de profissionais na Portaria 134 em Bacabal: ${allPortaria.length}`);
    fs.writeFileSync('scratch/portaria134_municipio_completo.json', JSON.stringify(allPortaria, null, 2), 'utf8');
    console.log(JSON.stringify(allPortaria, null, 2));
}

run().catch(e => console.error(e));
