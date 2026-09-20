/**
 * Testes Unitários do Motor SiasusSyncService
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { SiasusSyncService } = require('../lib/siasus-sync-service');

console.log('🧪 Iniciando testes de SiasusSyncService...');

const testBaseDir = path.join(__dirname, 'scratch_siasus_test');
try {
    fs.rmSync(testBaseDir, { recursive: true, force: true });
} catch (e) {}

const service = new SiasusSyncService({
    baseDir: testBaseDir,
    retentionBdsia: 6
});

// 1. Teste de Parser de Arquivo BPA
console.log('  [1] Testando parser de BPA...');
const bpaParsed = service.parseBpaFilename('BPAMAG0500.exe');
assert(bpaParsed !== null, 'Deveria fazer parse de BPAMAG0500.exe');
assert.strictEqual(bpaParsed.versao, '05.00');
assert.strictEqual(bpaParsed.ordem, 500);

const bpaInvalido = service.parseBpaFilename('BPAMAG.exe');
assert.strictEqual(bpaInvalido, null, 'Arquivo sem padrão deve retornar null');

const bpaFicticio = service.parseBpaFilename('BPAMAG2601.exe');
assert.strictEqual(bpaFicticio, null, 'Arquivo fictício com ano 2026 deve ser rejeitado como null');
console.log('  ✅ Parser de BPA validado com sucesso.');

// 2. Teste de Parser de Arquivo BDSIA
console.log('  [2] Testando parser de BDSIA...');
const bdsia1 = service.parseBdsiaFilename('BDSIA202608a.exe');
assert(bdsia1 !== null, 'Deveria fazer parse de BDSIA202608a.exe');
assert.strictEqual(bdsia1.ano, 2026);
assert.strictEqual(bdsia1.mes, 8);
assert.strictEqual(bdsia1.mesNome, 'Agosto');
assert.strictEqual(bdsia1.revisao, 'a');
assert.strictEqual(bdsia1.competencia, 'Agosto/2026 (rev. a)');

const bdsia2 = service.parseBdsiaFilename('BDSIA202607b.exe');
assert(bdsia2 !== null);
assert.strictEqual(bdsia2.mesNome, 'Julho');
assert.strictEqual(bdsia2.revisao, 'b');
assert.strictEqual(bdsia2.competencia, 'Julho/2026 (rev. b)');

// Verifica que Agosto é mais recente que Julho
assert(bdsia1.ordem > bdsia2.ordem, 'Agosto/2026 deve ter ordem superior a Julho/2026');

// Verifica que revisão b é mais recente que revisão a no mesmo mês
const bdsia2a = service.parseBdsiaFilename('BDSIA202607a.exe');
assert(bdsia2.ordem > bdsia2a.ordem, 'Julho rev. b deve ter ordem superior a Julho rev. a');
console.log('  ✅ Parser e ordenação cronológica de BDSIA validados.');

// 3. Teste de Rotação Estrita das 6 Versões
console.log('  [3] Testando lógica de retenção de 6 versões...');
const listaExemplo = [
    service.parseBdsiaFilename('BDSIA202608a.exe'),
    service.parseBdsiaFilename('BDSIA202607b.exe'),
    service.parseBdsiaFilename('BDSIA202607a.exe'),
    service.parseBdsiaFilename('BDSIA202606b.exe'),
    service.parseBdsiaFilename('BDSIA202605d.exe'),
    service.parseBdsiaFilename('BDSIA202604d.exe'),
    service.parseBdsiaFilename('BDSIA202603a.exe'),
    service.parseBdsiaFilename('BDSIA202602a.exe')
];

listaExemplo.sort((a, b) => b.ordem - a.ordem);
const mantidas = listaExemplo.slice(0, 6);
assert.strictEqual(mantidas.length, 6, 'Devem restar exatamente 6 versões');
assert.strictEqual(mantidas[0].arquivo, 'BDSIA202608a.exe', 'A mais recente deve ser Agosto/2026');
assert.strictEqual(mantidas[5].arquivo, 'BDSIA202604d.exe', 'A 6ª deve ser Abril/2026');
console.log('  ✅ Retenção e corte das 6 versões validados.');

// 4. Teste de Formatação de Bytes
console.log('  [4] Testando formatação de tamanho...');
assert.strictEqual(service._formatBytes(10485760), '10.0 MB');
assert.strictEqual(service._formatBytes(9856614), '9.4 MB');
assert.strictEqual(service._formatBytes(512000), '500 KB');
console.log('  ✅ Formatação de bytes validada.');

// 5. Teste de Catálogo Inicial
console.log('  [5] Testando geração do catálogo...');
const cat = service.getCatalogo();
assert(cat.bpa && cat.bpa.length > 0, 'Deve conter arquivos BPA');
assert(cat.bdsia && cat.bdsia.length >= 6, 'Deve conter ao menos 6 arquivos BDSIA');
assert(cat.resumo, 'Deve conter resumo de estado');
console.log('  ✅ Catálogo estruturado com sucesso.');

// 6. Teste de Sanitização Ativa de Catálogo Contaminado (Expurgo de Versões Fictícias como BPAMAG2601)
console.log('  [6] Testando expurgo e sanitização ativa de versões fictícias...');
const catalogoContaminado = {
    ultimaSincronizacao: new Date().toISOString(),
    statusDatasus: 'espelho',
    origem: 'teste',
    bpa: [
        {
            arquivo: 'BPAMAG2601.exe',
            tipo: 'bpa',
            versao: '26.01',
            titulo: 'BPA Magnético v26.01',
            ordem: 2601,
            isVigente: true
        },
        {
            arquivo: 'BPAMAG0500.exe',
            tipo: 'bpa',
            versao: '05.00',
            titulo: 'BPA Magnético v05.00',
            ordem: 500,
            isVigente: false
        }
    ],
    bdsia: [
        {
            arquivo: 'BDSIA202608a.exe',
            tipo: 'bdsia',
            ordem: 20260800,
            competencia: 'Agosto/2026 (rev. a)'
        }
    ]
};

// Grava catálogo contaminado no disco do ambiente de teste
fs.writeFileSync(service.catalogoPath, JSON.stringify(catalogoContaminado, null, 2), 'utf8');

// Chama getCatalogo e verifica se BPAMAG2601.exe foi purgado e BPAMAG0500.exe reassumiu vigência
const catHigienizado = service.getCatalogo();
const arquivosBpa = catHigienizado.bpa.map(b => b.arquivo);
assert(!arquivosBpa.includes('BPAMAG2601.exe'), 'BPAMAG2601.exe DEVE ser purgado do catálogo');
assert(arquivosBpa.includes('BPAMAG0500.exe'), 'BPAMAG0500.exe deve ser mantido');
assert.strictEqual(catHigienizado.bpa[0].arquivo, 'BPAMAG0500.exe', 'BPAMAG0500.exe deve ser a versão vigente');
assert.strictEqual(catHigienizado.bpa[0].isVigente, true, 'BPAMAG0500.exe deve estar marcada como vigente');
assert.strictEqual(catHigienizado.resumo.versaoVigenteBpa, 'BPAMAG0500.exe', 'Resumo deve apontar para BPAMAG0500.exe');
console.log('  ✅ Expurgo e sanitização de versões fictícias validados com sucesso.');

// Limpeza de diretório temporário de testes
try {
    fs.rmSync(testBaseDir, { recursive: true, force: true });
} catch (e) {}

console.log('\n🎉 TODOS OS TESTES DO SIASUS-SYNC-SERVICE PASSARAM COM SUCESSO!\n');
