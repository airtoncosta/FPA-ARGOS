const https = require('https');

https.get('https://consultafns.saude.gov.br/vendor/api-core/api.min.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const matches = data.match(/setBaseUrl\([^)]+\)/g);
        console.log('setBaseUrl matches:', matches);
        
        const urls = data.match(/https?:\/\/[a-zA-Z0-9.\-_:\/]+/g);
        console.log('URLs in api.min.js:', urls ? urls.slice(0, 15) : 'none');
    });
});
