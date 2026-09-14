const https = require('https');

https.get('https://consultafns.saude.gov.br/', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('HTML size:', data.length);
        const scripts = data.match(/<script[^>]*src="([^"]+)"[^>]*>/g);
        console.log('Scripts:', scripts);
        
        // Procurar menções a api ou endpoints
        const apis = data.match(/(https?:\/\/[^"'\s]+|\/api\/[^"'\s]+)/g);
        console.log('APIs encontradas no HTML:', apis);
    });
});
