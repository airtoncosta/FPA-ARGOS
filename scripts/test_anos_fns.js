const https = require('https');

async function getRepasseAno(ano) {
    return new Promise((resolve) => {
        const query = new URLSearchParams({
            page: '1', count: '50', ano: String(ano), sgUf: 'MA', coMunicipioIbge: '210120'
        }).toString();
        const url = `https://consultafns.saude.gov.br/recursos/consulta-consolidada/repasse-bloco?${query}`;
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ ano, status: res.statusCode, json });
                } catch(e) {
                    resolve({ ano, status: res.statusCode, raw: data.substring(0, 200) });
                }
            });
        }).on('error', err => resolve({ ano, error: err.message }));
    });
}

async function run() {
    for (const ano of [2024, 2025, 2026]) {
        const r = await getRepasseAno(ano);
        console.log(`\n=== ANO ${ano} [Status ${r.status}] ===`);
        if (r.json && r.json.resultado) {
            r.json.resultado.forEach(bloco => {
                console.log(`- ${bloco.nome}: Total R$ ${bloco.vlTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
                bloco.repasses.forEach(sub => {
                    console.log(`    ↳ ${sub.nome}: R$ ${sub.vlTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
                });
            });
        } else {
            console.log('Sem dados ou resposta:', r);
        }
    }
}
run();
