async function testXls() {
    const res1 = await fetch('http://cnes2.datasus.gov.br/Mod_Profissional.asp?VCo_Unidade=2101202458055');
    const cookie = res1.headers.get('set-cookie');
    console.log('Cookie:', cookie);
    
    const res2 = await fetch('http://cnes2.datasus.gov.br/Mod_Profissional_XLS.asp', {
        headers: {
            'Cookie': cookie || ''
        }
    });
    const xlsHtml = await res2.text();
    console.log('XLS HTML length:', xlsHtml.length);
    
    // Check how many rows
    const trMatches = xlsHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    console.log('Total rows in XLS:', trMatches.length);
    
    // Find estatutarios in XLS
    const estatutarios = [];
    const contratados = [];
    trMatches.forEach(tr => {
        const text = tr.replace(/<[^>]+>/g, '\t').replace(/\s+/g, ' ');
        if (text.includes('ESTATUT')) {
            estatutarios.push(text);
        } else if (text.includes('CONTRATAD')) {
            contratados.push(text);
        }
    });
    console.log('Estatutarios count in XLS:', estatutarios.length);
    console.log('Contratados count in XLS:', contratados.length);
    console.log('Sample estatutarios:\n', estatutarios.slice(0, 10).join('\n'));
}

testXls().catch(e => console.error(e));
