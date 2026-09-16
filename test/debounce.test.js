const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { debounce } = require('../lib/debounce');

describe('Debounce Utility Core', () => {
    test('atrasa a execução e agrupa chamadas rápidas em uma única invocação', async () => {
        let callCount = 0;
        let lastArg = null;

        const debouncedFn = debounce((val) => {
            callCount++;
            lastArg = val;
        }, 50);

        debouncedFn('a');
        debouncedFn('b');
        debouncedFn('c');

        assert.equal(callCount, 0, 'Não deve executar imediatamente');

        await new Promise(r => setTimeout(r, 80));

        assert.equal(callCount, 1, 'Deve executar apenas uma vez');
        assert.equal(lastArg, 'c', 'Deve receber o último argumento passado');
    });

    test('permite cancelar a execução pendente com .cancel()', async () => {
        let executed = false;
        const debouncedFn = debounce(() => {
            executed = true;
        }, 40);

        debouncedFn();
        debouncedFn.cancel();

        await new Promise(r => setTimeout(r, 60));
        assert.equal(executed, false, 'Chamada cancelada não deve executar');
    });

    test('preserva o contexto `this` na execução', async () => {
        const obj = {
            val: 42,
            getVal: null
        };

        let result = null;
        obj.getVal = debounce(function() {
            result = this.val;
        }, 30);

        obj.getVal();

        await new Promise(r => setTimeout(r, 50));
        assert.equal(result, 42);
    });
});
