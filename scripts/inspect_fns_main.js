const https = require('https');

https.get('https://consultafns.saude.gov.br/app/main.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('main.js size:', data.length);
        const matches = data.match(/['"][^'"]*(?:api|service|repasse|consulta|rest)[^'"]*['"]/gi);
        console.log('Matches:', matches ? matches.slice(0, 30) : 'none');
        
        // Procurar caminhos de views / services
        const paths = data.match(/paths\s*:\s*\{([^}]+)\}/);
        if (paths) console.log('Paths:', paths[1].substring(0, 500));
    });
});
