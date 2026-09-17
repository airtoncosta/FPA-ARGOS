const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'js', 'cnes-diff-engine.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const engine = context.window.CnesDiffEngine;

test('preserva vínculos distintos do mesmo CNS e CBO na comparação mensal', () => {
    const previous = [{ cnes: '0123456', profissionais: [
        { linkIdentity: 'link-a', cns: '700000000000001', cbo: '223505', chTotal: 20, nome: 'ANA' },
        { linkIdentity: 'link-b', cns: '700000000000001', cbo: '223505', chTotal: 10, nome: 'ANA' }
    ] }];
    const current = [{ cnes: '0123456', profissionais: [
        { linkIdentity: 'link-a', cns: '700000000000001', cbo: '223505', chTotal: 30, nome: 'ANA' },
        { linkIdentity: 'link-b', cns: '700000000000001', cbo: '223505', chTotal: 10, nome: 'ANA' }
    ] }];
    const result = engine.compararCompetencias(previous, current);

    assert.equal(result.totalAnterior, 2);
    assert.equal(result.totalAtual, 2);
    assert.equal(result.resumo.entradas, 0);
    assert.equal(result.resumo.saidas, 0);
    assert.equal(result.resumo.alteracoesCargaHoraria, 1);
});
