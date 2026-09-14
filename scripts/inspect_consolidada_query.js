const https = require('https');

https.get('https://consultafns.saude.gov.br/app/pages/consolidada/controllers/consolidadaController.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const matches = data.match(/(?:consolidadaService|cGet|consultar)[^;{}]{0,100}/g);
        console.log('Matches in consolidadaController:', matches);
        
        // Procurar a função de consulta ou pesquisar
        const idx = data.indexOf('consolidadaService');
        if (idx !== -1) {
            console.log('\nSnippet:\n', data.substring(idx - 100, idx + 600));
        }
    });
});
