const fs = require('fs');
const file = 'code_sandbox_light_git_fe61910d_1781185357/cnes_data/cnes_210120_202608.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

// Check how professionals are structured
const profs = [];
data.estabelecimentos.forEach(e => {
  (e.profissionais || []).forEach(p => {
    profs.push({ ...p, estabCnes: e.cnes, estabNome: e.nomeFantasia });
  });
});

console.log('Total profs:', profs.length);

// Group by p.tipoVinculo
const byTipo = {};
profs.forEach(p => {
  const t = p.tipoVinculo || 'VAZIO';
  if (!byTipo[t]) byTipo[t] = [];
  byTipo[t].push(p);
});

for (const t of Object.keys(byTipo)) {
  console.log(`Tipo: "${t}" -> Count: ${byTipo[t].length}`);
  const sample = byTipo[t][0];
  console.log(`   Sample: ${sample.nome} | vinculacao: ${sample.vinculacao} | subtipo: ${sample.subtipo} | cbo: ${sample.cbo}`);
}
