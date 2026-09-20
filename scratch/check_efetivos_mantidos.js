const fs = require('fs');
const file = 'code_sandbox_light_git_fe61910d_1781185357/cnes_data/cnes_210120_202608.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const moduleContent = fs.readFileSync('code_sandbox_light_git_fe61910d_1781185357/js/cnes-module.js', 'utf8');

const m = moduleContent.match(/CNES_BACABAL_MANTIDOS_49\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
const setMantidos = new Set();
if (m) {
  m[1].split(',').forEach(s => {
    const clean = s.replace(/['"\s]/g, '');
    if (clean) setMantidos.add(clean);
  });
}

let efMantidos = 0;
let efTotal = 0;
let empPubMantidos = 0;
let empPubTotal = 0;

data.estabelecimentos.forEach(e => {
  const isM = setMantidos.has(e.cnes);
  (e.profissionais || []).forEach(p => {
    const t = (p.tipoVinculo || '').toUpperCase();
    if (t.includes('ESTATUT')) {
      efTotal++;
      if (isM) efMantidos++;
    }
    if (t.includes('EMPREGADO PUBLICO') || t.includes('EMPREGO PUBLICO')) {
      empPubTotal++;
      if (isM) empPubMantidos++;
    }
  });
});

console.log('Estatutarios Efetivos -> Total:', efTotal, 'in mantidos:', efMantidos);
console.log('Empregados Publicos -> Total:', empPubTotal, 'in mantidos:', empPubMantidos);
