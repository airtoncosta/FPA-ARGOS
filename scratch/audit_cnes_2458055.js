const fs = require('fs');

async function fetchUnitXls(cnes) {
    const vco = `210120${cnes}`;
    const pageUrl = `http://cnes2.datasus.gov.br/Mod_Profissional.asp?VCo_Unidade=${vco}`;
    const res1 = await fetch(pageUrl);
    const cookie = res1.headers.get('set-cookie');
    
    const xlsUrl = 'http://cnes2.datasus.gov.br/Mod_Profissional_XLS.asp';
    const res2 = await fetch(xlsUrl, {
        headers: { 'Cookie': cookie || '' }
    });
    const html = await res2.text();
    
    // Parse HTML table rows
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    const records = [];
    
    while ((match = trRegex.exec(html)) !== null) {
        const tr = match[1];
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdMatch;
        const tds = [];
        while ((tdMatch = tdRegex.exec(tr)) !== null) {
            let t = tdMatch[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
            tds.push(t);
        }
        if (tds.length >= 10 && tds[0] && tds[0] !== 'Nome do Profissional' && !tds[0].includes('Consulta Estabelecimento')) {
            // Colunas no XLS:
            // 0: Nome
            // 1: CNS Master
            // 2: Dt Atribuicao
            // 3: CBO
            // 4: CH Amb
            // 5: CH Hosp
            // 6: CH Outros
            // 7: CH Total
            // 8: Atende SUS
            // 9: Vinculacao
            // 10: Tipo
            // 11: Subtipo
            // 12: Situacao
            // 13: Portaria 134
            records.push({
                nome: tds[0],
                cns: tds[1].replace(/\D/g, ''),
                dtAtribuicao: tds[2],
                cboCompleto: tds[3],
                cbo: (tds[3] || '').split(' ')[0].replace(/\D/g, ''),
                chAmb: tds[4],
                chHosp: tds[5],
                chOutros: tds[6],
                chTotal: tds[7],
                atendeSus: tds[8],
                vinculacao: tds[9],
                tipo: tds[10],
                subtipo: tds[11],
                situacao: tds[12]
            });
        }
    }
    return records;
}

(async () => {
    const records = await fetchUnitXls('2458055');
    console.log(`Unidade 2458055 total registros: ${records.length}`);
    const estatutarios = records.filter(r => r.tipo.includes('ESTATUT') || r.subtipo.includes('SERVIDOR'));
    console.log(`Total Estatutários em 2458055: ${estatutarios.length}`);
    console.log('Todos os estatutários de 2458055:');
    estatutarios.forEach(e => console.log(`- ${e.nome} | CNS: ${e.cns} | CBO: ${e.cboCompleto} | Tipo: ${e.tipo} | Subtipo: ${e.subtipo}`));
})();
