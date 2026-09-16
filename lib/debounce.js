/**
 * FPA-ARGOS - lib/debounce.js
 * Utilitário Isomórfico de Debounce para Handlers de Input e Filtros.
 *
 * Agrupa chamadas consecutivas e adia a execução até que o usuário pare de digitar,
 * eliminando travamentos de UI e re-renderizações desnecessárias.
 */

/**
 * Cria uma versão debounced da função fornecida.
 * @param {Function} fn - Função a ser postergada
 * @param {number} [delayMs=300] - Atraso em milissegundos
 * @returns {Function & { cancel: Function }}
 */
function debounce(fn, delayMs = 300) {
    let timeoutId = null;

    function debounced(...args) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            timeoutId = null;
            fn.apply(this, args);
        }, delayMs);
    }

    debounced.cancel = function() {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debounced;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { debounce };
}
