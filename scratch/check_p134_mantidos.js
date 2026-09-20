const fs = require('fs');
const file = 'code_sandbox_light_git_fe61910d_1781185357/cnes_data/cnes_210120_202608.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const moduleContent = fs.readFileSync('code_sandbox_light_git_fe61910d_1781185357/js/cnes-module.js', 'utf8');

// Match CNES_BACABAL_MANTIDOS_49
const m = moduleContent.match(/CNES_BACABAL_MANTIDOS_49\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
const setMantidos = new Set();
if (m) {
  m[1].split(',').forEach(s => {
    const clean = s.replace(/['"\s]/g, '');
    if (clean) setMantidos.add(clean);
  });
}

console.log('Mantidos set size:', setMantidos.size);

let inMantidos = 0;
let outsideMantidos = 0;

data.estabelecimentos.forEach(e => {
  (e.profissionais || []).forEach(p => {
    if (p.portaria134Fonte === 'CNES_OFICIAL' || (p.portaria134 && p.portaria134.includes('Artigo'))) {
      const isM = setMantidos.has(e.cnes);
      if (isM) inMantidos++;
      else outsideMantidos++;
      console.log(`CNES ${e.cnes} (Mantido: ${isM}) | ${e.nomeFantasia} | Prof: ${p.nome} | P134: ${p.portaria134}`);
    }
  });
});

console.log(`\nP134 in mantidos: ${inMantidos}, P134 outside mantidos: ${outsideMantidos}`);
