const fs = require('fs');

const inputFile = 'C:\\FPA ARGOS\\TabelaUnificada_202606_v2606091427\\tb_procedimento.txt';
const outputFile = 'js/sigtap.js';

console.log('Reading ' + inputFile + '...');
const content = fs.readFileSync(inputFile, 'latin1');
const lines = content.split(/\r?\n/);

console.log(`Found ${lines.length} lines.`);

const sigtap = {};

for (const line of lines) {
    if (line.trim() === '') continue;
    
    // According to layout:
    // CO_PROCEDIMENTO: 1 to 10
    // NO_PROCEDIMENTO: 11 to 260
    const code = line.substring(0, 10).trim();
    const name = line.substring(10, 260).trim();
    
    if (code && name) {
        sigtap[code] = name;
    }
}

console.log(`Extracted ${Object.keys(sigtap).length} procedures.`);

const outContent = `// Gerado automaticamente a partir de tb_procedimento.txt
const SIGTAP = ${JSON.stringify(sigtap, null, 4)};

// Expor globalmente para os scripts
window.SIGTAP = SIGTAP;
`;

fs.writeFileSync(outputFile, outContent, 'utf8');
console.log('Saved to ' + outputFile);
