const https = require('https');

https.get('https://consultafns.saude.gov.br/recursos/consulta-detalhada/entidades?uf=MA', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Body:', data);
    });
});
