const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'cnes_210120_202608.json');
const d8 = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

const map = {};
let totalVinc = 0;

d8.estabelecimentos.forEach(e => {
    (e.profissionais || []).forEach(p => {
        if (p.portaria134) {
            totalVinc++;
            const cnesStr = String(e.cnes || '').trim();
            const cnsClean = String(p.cns || '').replace(/\D/g, '');
            const cboClean = String(p.cbo || '').split(' ')[0].replace(/\D/g, '');
            const nomeClean = String(p.nome || '').toUpperCase().replace(/\s+/g, ' ').trim();

            const entry = {
                cnes: cnesStr,
                cns: cnsClean,
                cbo: cboClean,
                nome: nomeClean,
                portaria134: 'Artigo 2º',
                portaria134Fonte: 'CNES_OFICIAL',
                artigo: 'Artigo 2º'
            };

            map[cnesStr + '_' + cnsClean] = entry;
            if (cboClean) map[cnesStr + '_' + cnsClean + '_' + cboClean] = entry;
            map[cnesStr + '_' + nomeClean] = entry;
            if (cboClean) map[cnesStr + '_' + nomeClean + '_' + cboClean] = entry;
            map['cns_' + cnsClean] = entry;
        }
    });
});

const out1 = path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'datasus_portaria134.json');
fs.writeFileSync(out1, JSON.stringify(map, null, 2), 'utf8');

const cnesDataDir = path.join(__dirname, '..', 'cnes_data');
if (fs.existsSync(cnesDataDir)) {
    const out2 = path.join(cnesDataDir, 'datasus_portaria134.json');
    fs.writeFileSync(out2, JSON.stringify(map, null, 2), 'utf8');
}

const jsContent = '/**\n * MAPA OFICIAL PORTARIA 134 CNESNet (ARTIGO 2º) — BACABAL / MA\n * Extraído diretamente do CNESNet Oficial DATASUS\n */\n(function() {\n    const MAPA = ' + JSON.stringify(map, null, 2) + ';\n    if (typeof window !== "undefined") {\n        window.DATASUS_PORTARIA134_BACABAL = MAPA;\n    }\n    if (typeof module !== "undefined" && module.exports) {\n        module.exports = MAPA;\n    }\n})();\n';

const outJs = path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'js', 'cnes-portaria134-bacabal.js');
fs.writeFileSync(outJs, jsContent, 'utf8');

console.log('Gerado mapa com sucesso!');
console.log('Total de vinculos mapeados:', totalVinc);
console.log('Total de chaves no mapa:', Object.keys(map).length);
console.log('Arquivo JS salvo em:', outJs);
