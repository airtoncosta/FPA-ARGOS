const assert = require('assert');

// RED: parser live do README do espelho SIASUS deve extrair BDSIA + tamanhos reais
// Amostra fiel ao README live de 2026-10-05 (https://github.com/RenatoKR/SIASUS)
const README_LIVE = `
| Arquivo | Competência | Tamanho | Download |
|---------|-------------|---------|----------|
| \`BDSIA202609a.exe\` | Setembro/2026 (rev. a) | 9.4M | [⬇️ Download](https://github.com/RenatoKR/SIASUS/raw/main/bdsia/BDSIA202609a.exe) |
| \`BDSIA202608b.exe\` | Agosto/2026 (rev. b) | 9.3M | [⬇️ Download](https://github.com/RenatoKR/SIASUS/raw/main/bdsia/BDSIA202608b.exe) |
| \`BDSIA202607b.exe\` | Julho/2026 (rev. b) | 9.4M | [⬇️ Download](https://github.com/RenatoKR/SIASUS/raw/main/bdsia/BDSIA202607b.exe) |
| \`BDSIA202607a.exe\` | Julho/2026 (rev. a) | 9.1M | [⬇️ Download](https://github.com/RenatoKR/SIASUS/raw/main/bdsia/BDSIA202607a.exe) |
| \`BDSIA202606b.exe\` | Junho/2026 (rev. b) | 9.2M | [⬇️ Download](https://github.com/RenatoKR/SIASUS/raw/main/bdsia/BDSIA202606b.exe) |
| \`BDSIA202605d.exe\` | Maio/2026 (rev. d) | 9.0M | [⬇️ Download](https://github.com/RenatoKR/SIASUS/raw/main/bdsia/BDSIA202605d.exe) |
| \`BPAMAG0500.exe\` | 7.5M | [⬇️ Download](https://github.com/RenatoKR/SIASUS/raw/main/bpa/BPAMAG0500.exe) |
`;

let parser;
try {
    parser = require('../lib/siasus-mirror-parser');
} catch (e) {
    console.log('  [RED] lib/siasus-mirror-parser ainda não existe — teste falha como esperado.');
    process.exit(1);
}

console.log('  [1] Parse do README live extrai 6 BDSIA ordenados...');
const res = parser.parseSiasusReadme(README_LIVE);
assert(res && Array.isArray(res.bdsia), 'Deve retornar { bdsia: [] }');
assert.strictEqual(res.bdsia.length, 6, `Esperava 6 BDSIA, obteve ${res.bdsia.length}`);
assert.strictEqual(res.bdsia[0].arquivo, 'BDSIA202609a.exe', 'O mais recente deve ser Setembro/2026 (rev. a)');
assert.strictEqual(res.bdsia[1].arquivo, 'BDSIA202608b.exe', 'O segundo deve ser Agosto/2026 (rev. b)');

console.log('  [2] Tamanhos reais extraídos da tabela (não hardcoded)...');
assert.strictEqual(res.bdsia[0].tamanhoFormatado, '9.4 MB', `Tamanho de 202609a deve ser 9.4 MB, obteve ${res.bdsia[0].tamanhoFormatado}`);
assert.strictEqual(res.bdsia[1].tamanhoFormatado, '9.3 MB', `Tamanho de 202608b deve ser 9.3 MB, obteve ${res.bdsia[1].tamanhoFormatado}`);
assert.strictEqual(res.bdsia[3].tamanhoFormatado, '9.1 MB', `Tamanho de 202607a deve ser 9.1 MB, obteve ${res.bdsia[3].tamanhoFormatado}`);

console.log('  [3] BPA extraído...');
assert(res.bpa && res.bpa.length >= 1, 'Deve conter ao menos 1 BPA');
assert.strictEqual(res.bpa[0].arquivo, 'BPAMAG0500.exe', 'BPA vigente deve ser BPAMAG0500.exe');

console.log('  [4] Ordenação cronológica reversa...');
for (let i = 1; i < res.bdsia.length; i++) {
    assert(res.bdsia[i - 1].ordem > res.bdsia[i].ordem, `Ordem decrescente violada em ${i}`);
}

console.log('\n🎉 PARSER LIVE DO ESPELHO VALIDADO!\n');
