const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357');

function extractBrokenWords(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const broken = new Set();
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('\uFFFD')) {
            const words = line.match(/\S*\uFFFD\S*/g) || [];
            words.forEach(w => broken.add(w.replace(/[<>"'`;:,(){}[\]]/g, '')));
        }
    }
    return [...broken];
}

console.log('--- INDEX.HTML BROKEN WORDS ---');
console.log(extractBrokenWords(path.join(basePath, 'index.html')).sort().join('\n'));

console.log('\n--- BPA-MODULE.JS BROKEN WORDS ---');
console.log(extractBrokenWords(path.join(basePath, 'js/bpa-module.js')).sort().join('\n'));
