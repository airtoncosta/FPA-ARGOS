const fs = require('fs');
const path = require('path');
const vm = require('vm');

const diffSource = fs.readFileSync('code_sandbox_light_git_fe61910d_1781185357/js/cnes-diff-engine.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(diffSource, context);
const engine = context.window.CnesDiffEngine;

const data07 = JSON.parse(fs.readFileSync('code_sandbox_light_git_fe61910d_1781185357/cnes_data/cnes_210120_202607.json', 'utf8'));
const data08 = JSON.parse(fs.readFileSync('code_sandbox_light_git_fe61910d_1781185357/cnes_data/cnes_210120_202608.json', 'utf8'));

const diff = engine.compararCompetencias(data07.estabelecimentos, data08.estabelecimentos, {
  competenciaAnterior: '07/2026',
  competenciaAtual: '08/2026'
});

console.log('Resumo atual do diff:', diff.resumo);
console.log('alertasPortaria134 length:', diff.detalhes.alertasPortaria134.length);
console.log('First 3 alertasPortaria134:', JSON.stringify(diff.detalhes.alertasPortaria134.slice(0, 3), null, 2));
