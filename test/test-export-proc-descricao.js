const assert = require('assert');

// RED: a descricao que vai para o PDF deve conter SOMENTE o nome do procedimento,
// sem os textos dos selos (financiamento/complexidade) que estufam a altura das linhas.
// HTML fiel ao template de app.js (linhas 1818-1825).
const CELULA_COM_SELOS = `<div><strong>ATENDIMENTO DE URGENCIA EM ATENCAO ESPECIALIZADA</strong></div>
                <div style="margin-top: 4px; display: inline-flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                    <span class="badge" style="font-size: 0.68rem;" title="Financiamento: ..."><i class="fas fa-coins" style="margin-right: 3px;"></i>06</span>
                    <span class="badge" style="font-size: 0.68rem;" title="Complexidade: ...">2</span>
                </div>`;

const CELULA_SEM_SELOS = `<div><strong>CONSULTA MEDICA EM ATENCAO ESPECIALIZADA</strong></div>`;

let extrair;
try {
    extrair = require('../code_sandbox_light_git_fe61910d_1781185357/js/export-descricao-pdf');
} catch (e) {
    console.log('  [RED] helper extrairDescricaoProcedimentoPdf ainda nao existe — falha esperada.');
    process.exit(1);
}

console.log('  [1] Remove textos dos selos (06, 2)...');
const r1 = extrair(CELULA_COM_SELOS);
assert.strictEqual(r1, 'ATENDIMENTO DE URGENCIA EM ATENCAO ESPECIALIZADA', `Obteve: ${JSON.stringify(r1)}`);

console.log('  [2] Celula sem selos passa intacta...');
const r2 = extrair(CELULA_SEM_SELOS);
assert.strictEqual(r2, 'CONSULTA MEDICA EM ATENCAO ESPECIALIZADA', `Obteve: ${JSON.stringify(r2)}`);

console.log('  [3] Resultado em linha unica (sem quebras que estufam a linha do PDF)...');
assert(!/[\n\r]/.test(r1), 'Descricao do PDF nao pode conter quebras de linha');

console.log('\n  EXTRACAO DE DESCRICAO PARA PDF VALIDADA!\n');
