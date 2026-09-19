const fs = require('fs');

const ALL_CNES = [
  '0049018', '0152862', '0423041',
  '0423084', '0465283', '0475262',
  '0664219', '0666114', '0751812',
  '0777250', '0843016', '0843024',
  '2457989', '2457997', '2458004',
  '2458012', '2458039', '2458047',
  '2458055', '2460033', '2460041',
  '2460068', '2460076', '2460084',
  '2460106'
];

async function checkPortaria134() {
    console.log('=== AUDITANDO PORTARIA 134 EM TODOS OS 25 ESTABELECIMENTOS DE BACABAL ===');
    const portaria134List = [];

    for (let i = 0; i < ALL_CNES.length; i++) {
        const cnes = ALL_CNES[i];
        const vco = `210120${cnes}`;
        const url = `http://cnes2.datasus.gov.br/Mod_Profissional.asp?VCo_Unidade=${vco}`;
        
        try {
            const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
            const html = await resp.text();
            
            const trRegex = /<tr class='gradeA'>([\s\S]*?)<\/tr>/gi;
            let m;
            let countUnit = 0;
            
            while ((m = trRegex.exec(html)) !== null) {
                const tr = m[1];
                const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                const tds = [];
                let tdMatch;
                while ((tdMatch = tdRegex.exec(tr)) !== null) {
                    tds.push(tdMatch[1].trim());
                }
                
                if (tds.length >= 14) {
                    const lastTd = tds[tds.length - 1];
                    const hasPortaria134 = lastTd.includes('exclamation') || 
                                          lastTd.includes('Artigo') || 
                                          lastTd.includes('134') || 
                                          lastTd.includes('dcontexto');
                    
                    if (hasPortaria134) {
                        const nome = tds[0].replace(/<[^>]+>/g, '').trim().toUpperCase();
                        const cns = (tds[2] || '').replace(/<[^>]+>/g, '').replace(/\D/g, '');
                        const cbo = (tds[5] || '').replace(/<[^>]+>/g, '').trim();
                        
                        // Extrai texto do artigo se houver
                        let artigo = 'Artigo 2º';
                        const spanMatch = lastTd.match(/<span>(.*?)<\/span>/i);
                        if (spanMatch && spanMatch[1]) {
                            artigo = spanMatch[1].replace(/&nbsp;/g, ' ').trim();
                        }
                        
                        portaria134List.push({
                            cnes,
                            nome,
                            cns,
                            cbo,
                            artigo: artigo || 'Artigo 2º',
                            rawHtml: lastTd
                        });
                        countUnit++;
                    }
                }
            }
            console.log(`[${i + 1}/${ALL_CNES.length}] CNES ${cnes}: ${countUnit} profissionais na Portaria 134`);
        } catch (err) {
            console.warn(`[${i + 1}/${ALL_CNES.length}] CNES ${cnes} erro:`, err.message);
        }
        await new Promise(r => setTimeout(r, 400));
    }

    console.log(`\n=== RESUMO PORTARIA 134 DATASUS ===`);
    console.log(`Total de profissionais com Portaria 134 oficial: ${portaria134List.length}`);
    fs.writeFileSync('scratch/portaria134_datasus.json', JSON.stringify(portaria134List, null, 2), 'utf8');
    console.log('Salvo em scratch/portaria134_datasus.json');
    console.log(JSON.stringify(portaria134List, null, 2));
}

checkPortaria134().catch(e => console.error(e));
