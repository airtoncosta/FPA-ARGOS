const fs = require('fs');
const file = 'code_sandbox_light_git_fe61910d_1781185357/cnes_data/cnes_210120_202608.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

let mapaVinculosLocal = null;
const mapFile = 'code_sandbox_light_git_fe61910d_1781185357/cnes_data/datasus_vinculos.json';
if (fs.existsSync(mapFile)) mapaVinculosLocal = JSON.parse(fs.readFileSync(mapFile, 'utf8'));

function resolverVinculoOficial(cnes, cns, nome, cbo) {
    const map = mapaVinculosLocal;
    if (!map) return null;
    const cnesStr = String(cnes || '').trim();
    const cnsClean = String(cns || '').replace(/\D/g, '');
    const cboClean = String(cbo || '').split(' ')[0].replace(/\D/g, '');
    const nomeClean = String(nome || '').toUpperCase().replace(/\s+/g, ' ').trim();

    return (cnesStr && cnsClean && cboClean && map[`${cnesStr}_${cnsClean}_${cboClean}`])
        || (cnesStr && cnsClean && map[`${cnesStr}_${cnsClean}`])
        || (cnesStr && nomeClean && cboClean && map[`${cnesStr}_${nomeClean}_${cboClean}`])
        || (cnesStr && nomeClean && map[`${cnesStr}_${nomeClean}`])
        || (cnsClean && cboClean && (map[`cns_${cnsClean}_${cboClean}`] || map[`${cnsClean}_${cboClean}`]))
        || (cnsClean && (map[`cns_${cnsClean}`] || map[cnsClean]))
        || (nomeClean && (map[`nome_${nomeClean}`] || map[nomeClean]))
        || null;
}

let diffCount = 0;
data.estabelecimentos.forEach(e => {
  (e.profissionais || []).forEach(p => {
    const pWithCnes = { ...p, cnes: e.cnes };
    const oficial = resolverVinculoOficial(pWithCnes.cnes, p.cnsMaster || p.cns, p.nome, p.cbo);
    const jsonTipo = p.tipoVinculo;
    const resolvedTipo = oficial && oficial.tipoVinculo;
    if (resolvedTipo && jsonTipo && resolvedTipo !== jsonTipo) {
      diffCount++;
      if (diffCount <= 10) {
        console.log(`CNES ${e.cnes} | ${p.nome} | JSON: "${jsonTipo}" | Resolved: "${resolvedTipo}"`);
      }
    }
  });
});

console.log('Total differences between JSON and resolverVinculoOficial:', diffCount);
