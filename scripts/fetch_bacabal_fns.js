const https = require('https');

function fetchFns(ano) {
    return new Promise((resolve) => {
        const query = new URLSearchParams({
            page: '1',
            count: '50',
            ano: String(ano),
            sgUf: 'MA',
            coMunicipioIbge: '210120'
        }).toString();
        const url = 'https://consultafns.saude.gov.br/recursos/consulta-consolidada/repasse-bloco?' + query;
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json, text/plain, */*'
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    resolve({ error: e.message, data: data.substring(0, 300) });
                }
            });
        }).on('error', err => resolve({ error: err.message }));
    });
}

async function main() {
    for (const ano of [2024, 2025, 2026]) {
        const res = await fetchFns(ano);
        console.log(`\n=================== ANO ${ano} ===================`);
        if (res && res.resultado) {
            res.resultado.forEach(bloco => {
                console.log(`\n>>> BLOCO: [${bloco.codigo}] ${bloco.nome} | Total: R$ ${bloco.vlTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
                if (bloco.repasses && Array.isArray(bloco.repasses)) {
                    bloco.repasses.forEach(rep => {
                        console.log(`   - Grupo: ${rep.nome} | Total: R$ ${rep.vlTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})} (Líquido: R$ ${rep.vlLiquido.toLocaleString('pt-BR', {minimumFractionDigits: 2})})`);
                    });
                }
            });
        }
    }
}

main();
