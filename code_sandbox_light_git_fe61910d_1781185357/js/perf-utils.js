/**
 * FPA-ARGOS - js/perf-utils.js
 * Utilitários de Alta Performance & Skeleton Screens para a Interface.
 *
 * 1. window.debounce: Elimina engasgos em inputs de busca e filtros pesados.
 * 2. window.renderSkeletonCards: Cria cards de shimmer durante carregamento.
 * 3. window.renderSkeletonTable: Cria linhas de tabela skeleton anti-layout-shift.
 */

(function(window) {
    'use strict';

    /**
     * Adia a execução da função até que o usuário pare de digitar.
     * @param {Function} fn
     * @param {number} [delayMs=300]
     * @returns {Function}
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

    /**
     * Renderiza cards skeleton com efeito shimmer no container especificado.
     * @param {string|HTMLElement} container - ID do elemento ou nó DOM
     * @param {number} [count=4] - Quantidade de cards
     */
    function renderSkeletonCards(container, count = 4) {
        const el = typeof container === 'string' ? document.getElementById(container) : container;
        if (!el) return;

        let html = '';
        for (let i = 0; i < count; i++) {
            html += `
                <div class="skeleton-card">
                    <div class="skeleton-shimmer skeleton-line" style="width: 50%; height: 18px;"></div>
                    <div class="skeleton-shimmer skeleton-line" style="width: 85%; height: 14px;"></div>
                    <div class="skeleton-shimmer skeleton-line" style="width: 65%; height: 14px;"></div>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.35rem;">
                        <div class="skeleton-shimmer skeleton-line" style="width: 30%; height: 26px; border-radius: 4px;"></div>
                        <div class="skeleton-shimmer skeleton-line" style="width: 30%; height: 26px; border-radius: 4px;"></div>
                    </div>
                </div>
            `;
        }
        el.innerHTML = html;
    }

    /**
     * Renderiza linhas de tabela skeleton com efeito shimmer.
     * @param {string|HTMLElement} tbody - ID do elemento tbody ou nó DOM
     * @param {number} [rows=5] - Quantidade de linhas
     * @param {number} [cols=4] - Quantidade de colunas
     */
    function renderSkeletonTable(tbody, rows = 5, cols = 4) {
        const el = typeof tbody === 'string' ? document.getElementById(tbody) : tbody;
        if (!el) return;

        let html = '';
        for (let r = 0; r < rows; r++) {
            html += '<tr>';
            for (let c = 0; c < cols; c++) {
                const width = 45 + ((r * 17 + c * 29) % 45);
                html += `<td><div class="skeleton-shimmer skeleton-line" style="width: ${width}%; height: 16px;"></div></td>`;
            }
            html += '</tr>';
        }
        el.innerHTML = html;
    }

    window.debounce = debounce;
    window.renderSkeletonCards = renderSkeletonCards;
    window.renderSkeletonTable = renderSkeletonTable;

})(typeof window !== 'undefined' ? window : globalThis);
