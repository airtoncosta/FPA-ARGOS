const https = require('https');

// Testando detalhamento por ação ou parcela
async function testDetalhamento() {
    const endpoints = [
        `https://consultafns.saude.gov.br/recursos/consulta-consolidada/repasse-acao?ano=2026&sgUf=MA&coMunicipioIbge=210120&coBloco=10`,
        `https://consultafns.saude.gov.br/recursos/consulta-consolidada/repasse-acao?ano=2026&sgUf=MA&coMunicipioIbge=210120&coBloco=10&coGrupo=14`,
        `https://consultafns.saude.gov.br/recursos/consulta-detalhada/detalhe-pagamento?ano=2026&sgUf=MA&coMunicipioIbge=210120`,
        `https://consultafns.saude.gov.br/recursos/consulta-detalhada/detalhe-pagamento?ano=2026&ibge=210120`
    ];

    for (const u of endpoints) {
        await new Promise(res => {
            https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
                let d = '';
                r.on('data', c => d += c);
                r.on('end', () => {
                    console.log(`[${r.statusCode}] ${u}`);
                    if (r.statusCode === 200) {
                        console.log('  Data:', d.substring(0, 300));
                    }
                    res();
                });
            }).on('error', () => res());
        });
    }
}
testDetalhamento();
