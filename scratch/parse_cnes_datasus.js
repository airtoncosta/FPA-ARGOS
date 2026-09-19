const fs = require('fs');

async function parseUnit(vcoUnidade) {
    console.log(`Buscando unidade ${vcoUnidade}...`);
    const resp = await fetch(`http://cnes2.datasus.gov.br/Mod_Profissional.asp?VCo_Unidade=${vcoUnidade}`);
    const html = await resp.text();
    
    // Procura linhas com células td
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    const profs = [];
    
    while ((match = trRegex.exec(html)) !== null) {
        const trContent = match[1];
        if (!trContent.includes('dcontexto') && !trContent.includes('CNS')) continue;
        
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdMatch;
        const tds = [];
        while ((tdMatch = tdRegex.exec(trContent)) !== null) {
            let text = tdMatch[1]
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            tds.push(text);
        }
        
        if (tds.length >= 12 && tds[0] && tds[0] !== 'Nome do Profissional' && !tds[0].includes('Esta informação')) {
            profs.push(tds);
        }
    }
    
    console.log(`Total de profissionais extraídos para ${vcoUnidade}: ${profs.length}`);
    if (profs.length > 0) {
        console.log('Primeiras 3 linhas:');
        profs.slice(0, 3).forEach((p, idx) => console.log(`[${idx}]`, p));
        
        const tipos = {};
        const estatutarios = [];
        profs.forEach(p => {
            // Em Mod_Profissional.asp as colunas são:
            // 0: Nome, 1: CNS, 2: Dt. Atribuição, 3: CBO, 4: CBO Desc, 5: Amb, 6: Hosp, 7: Outros, 8: Total, 9: SUS, 10: Vinculação, 11: Tipo, 12: Subtipo
            const tipo = p[11] || p[10] || '';
            const subtipo = p[12] || p[11] || '';
            const chave = `${tipo} | ${subtipo}`;
            tipos[chave] = (tipos[chave] || 0) + 1;
            if (tipo.includes('ESTATUT') || subtipo.includes('SERVIDOR')) {
                estatutarios.push({ nome: p[0], cns: p[1], cbo: p[3], tipo, subtipo });
            }
        });
        console.log('Distribuição de tipos:', tipos);
        console.log(`Total de estatutários: ${estatutarios.length}`);
        console.log('Exemplos de estatutários:', estatutarios.slice(0, 5));
    }
    return profs;
}

parseUnit('2101202458055').catch(err => console.error(err));
