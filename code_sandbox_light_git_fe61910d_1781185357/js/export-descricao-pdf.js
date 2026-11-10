/**
 * ARGOS — extrairDescricaoProcedimentoPdf
 * Extrai SOMENTE o nome do procedimento do HTML da celula de descricao,
 * descartando os selos de financiamento/complexidade. Sem isso, o
 * textContent vaza textos como "06"/"2" para o autotable do jsPDF e
 * cada linha do PDF fica com varias linhas de altura.
 * Fonte unica: usada por js/export.js e coberta por test/test-export-proc-descricao.js
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.extrairDescricaoProcedimentoPdf = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    function colapsar(texto) {
        return String(texto || '').replace(/\s+/g, ' ').trim();
    }

    function extrairDescricaoProcedimentoPdf(innerHTML) {
        const html = String(innerHTML || '');
        if (!html) return '';
        // Caso padrao do app.js: <div><strong>DESCRICAO</strong></div> + <div>selos</div>
        const m = html.match(/<div[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<\/div>/i);
        if (m) return colapsar(m[1].replace(/<[^>]+>/g, ''));
        // Fallback: remove blocos de selo e todo o restante das tags
        const semSelos = html.replace(/<span[^>]*\bbadge\b[^>]*>[\s\S]*?<\/span>/gi, '');
        return colapsar(semSelos.replace(/<[^>]+>/g, ''));
    }

    return extrairDescricaoProcedimentoPdf;
}));
