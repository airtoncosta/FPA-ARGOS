const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357');

function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(currentDir, e.name);
        if (e.isDirectory()) {
            if (e.name !== 'node_modules' && e.name !== '.git') scan(full);
        } else if (e.name.endsWith('.html') || e.name.endsWith('.js')) {
            const content = fs.readFileSync(full, 'utf8');
            let ufffdCount = 0;
            for (let i = 0; i < content.length; i++) {
                if (content.charCodeAt(i) === 0xFFFD) ufffdCount++;
            }
            if (ufffdCount > 0) {
                console.log(`${path.relative(dir, full)}: ${ufffdCount} occurrences of \uFFFD`);
            }
        }
    }
}

scan(dir);
