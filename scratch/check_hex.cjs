const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357');

const file = path.join(basePath, 'index.html');
let content = fs.readFileSync(file, 'utf8');

// Test replacing 'Regula\uFFFDo' with 'Regulação'
console.log('Before count:', (content.match(/\uFFFD/g) || []).length);

// Let's inspect where \uFFFD is in the sidebar
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('\uFFFD') && i < 160) {
        console.log(`Line ${i+1}: ${lines[i].trim()}`);
        console.log('Hex codes of line:', [...lines[i].trim()].map(c => c.charCodeAt(0).toString(16)).join(' '));
    }
}
