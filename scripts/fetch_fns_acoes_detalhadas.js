const https = require('https');

function fetchDetalhe(ano) {
    return new Promise(resolve => {
        const qs = new URLSearchParams({
            page: '1',
            count: '100',
            ano: String(ano),
            estado: 'MA',
            municipio: '210120',
            cpfCnpjUg: '07186334000140'
        }).toString();
        const url = 'https://consultafns.saude.gov.br/recursos/consulta-detalhada/detalhe-acao?' + qs;
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(d));
                } catch(e) {
                    resolve({ error: e.message, raw: d.substring(0, 300) });
                }
            });
        }).on('error', err => resolve({ error: err.message }));
    });
}

async function run() {
    for (const ano of [2026, 2025, 2024]) {
        const data = await fetchDetalhe(ano);
        console.log(`\n============================== ANO ${ano} (Total itens: ${data.resultado ? data.resultado.dados.length : 0}) ==============================`);
        if (data && data.resultado && data.resultado.dados) {
            data.resultado.dados.forEach(d => {
                const grupo = d.grupoAcao ? d.grupoAcao.nome : (d.componenteBloco ? d.componenteBloco.nome : 'Outro');
                const val = Number(d.valorLiquido) || 0;
                console.log(`[${grupo}] ${d.descricao} -> R$ ${val.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
            });
        } else {
            console.log('Erro ou vazio:', data);
        }
    }
}
run();
