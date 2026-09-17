// test/test-bridge.js
const assert = require('node:assert');
const { WebIntelligenceBridge } = require('../lib/web-intelligence-bridge');

async function runTest() {
    console.log('Iniciando teste do WebIntelligenceBridge...');
    const bridge = new WebIntelligenceBridge();
    
    // Teste com target local ou query
    const res = await bridge.execute({
        mode: 'reach',
        query: 'SUS Bacabal Maranhao'
    });

    console.log('Resultado do Bridge:', {
        success: res.success,
        mode: res.mode,
        durationMs: res.durationMs
    });

    assert(res !== null && typeof res === 'object', 'Resultado deve ser um objeto');
    assert(res.mode === 'reach', 'Modo deve ser reach');
    console.log('TESTE DO BRIDGE CONCLUIDO COM SUCESSO!');
}

runTest().catch((err) => {
    console.error('Falha no teste do Bridge:', err);
    process.exit(1);
});
