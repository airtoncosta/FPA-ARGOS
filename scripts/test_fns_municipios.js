const https = require('https');

https.get('https://consultafns.saude.gov.br/recursos/municipios/uf/MA', {
    headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json, text/plain, */*'
    }
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Len:', data.length);
        try {
            const parsed = JSON.parse(data);
            console.log('Total municípios no MA:', parsed.length);
            const bacabal = parsed.find(m => m.noMunicipio && m.noMunicipio.toUpperCase().includes('BACABAL'));
            console.log('Bacabal:', bacabal);
        } catch(e) {
            console.log('Snippet:', data.substring(0, 300));
        }
    });
});
