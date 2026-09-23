const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const basePath = path.resolve(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357');

function memoryLocalStorage() {
    const store = {};
    return {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        _store: store
    };
}

test('renomeação de usuário propaga para o mapa de responsáveis do BPA', async () => {
    global.window = global.window || {};
    global.localStorage = memoryLocalStorage();
    const bpaModule = require(path.join(basePath, 'js/bpa-module.js'));
    assert.strictEqual(typeof bpaModule.aplicarRenomeacaoEmMapa, 'function');
    assert.strictEqual(typeof bpaModule.renomearResponsavel, 'function');

    const antigo = 'CAROLINA CARNEIRO DAMASCENO SOUZA';
    const novo = 'Carolina Souza';

    // Função pura: troca só os valores iguais ao antigo, preserva chaves e demais nomes.
    const { map, trocas } = bpaModule.aplicarRenomeacaoEmMapa(
        { '7916647': antigo, APAE: antigo, '1234567': 'Outra Pessoa', X: 'Não atribuído' },
        antigo,
        novo
    );
    assert.strictEqual(trocas, 2);
    assert.strictEqual(map['7916647'], novo);
    assert.strictEqual(map.APAE, novo);
    assert.strictEqual(map['1234567'], 'Outra Pessoa');
    assert.strictEqual(map.X, 'Não atribuído');

    // Persistência: renomear grava o mapa atualizado e retorna a contagem.
    global.localStorage.setItem(bpaModule.responsaveisKey, JSON.stringify({ '7916647': antigo, APAE: antigo }));
    const feitas = await bpaModule.renomearResponsavel(antigo, novo);
    assert.strictEqual(feitas, 2);
    const salvo = JSON.parse(global.localStorage.getItem(bpaModule.responsaveisKey));
    assert.strictEqual(salvo['7916647'], novo);
    assert.strictEqual(salvo.APAE, novo);

    // Nome inexistente: retorna 0 e não altera nada.
    const nada = await bpaModule.renomearResponsavel('Nome Que Não Existe', novo);
    assert.strictEqual(nada, 0);
});

test('mapa de responsáveis não ressuscita nome antigo como padrão', () => {
    global.window = global.window || {};
    global.localStorage = memoryLocalStorage();
    delete require.cache[require.resolve(path.join(basePath, 'js/bpa-module.js'))];
    const bpaModule = require(path.join(basePath, 'js/bpa-module.js'));
    const map = bpaModule.getResponsaveisMap();
    const valores = Object.values(map).map(v => String(v).toLowerCase());
    assert.ok(!valores.some(v => v.includes('carolina carneiro damasceno souza')), 'Default antigo não deve reaparecer, got: ' + JSON.stringify(map));
});
