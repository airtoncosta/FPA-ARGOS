const fs = require('fs');

const profs = JSON.parse(fs.readFileSync('scratch/datasus_audit_dt_atribuicao_completo.json', 'utf8'));

const map = {};
profs.forEach(p => {
    const dt = p.dtAtribuicao || p.dtEntrada;
    if (!dt) return;
    const cns = (p.cns || '').replace(/\D/g, '');
    const cbo = (p.cboCodigo || '').replace(/\D/g, '');
    const nome = (p.nome || '').toUpperCase().replace(/\s+/g, ' ').trim();
    
    if (cns && cbo) map[`${p.cnes}_${cns}_${cbo}`] = dt;
    if (cns) map[`${p.cnes}_${cns}`] = dt;
    if (nome && cbo) map[`${p.cnes}_${nome}_${cbo}`] = dt;
    if (nome) map[`${p.cnes}_${nome}`] = dt;
    if (cns) map[`CNS_${cns}`] = dt;
});

const fileContent = `/**
 * Mapeamento Oficial de DT. ATRIBUIÇÃO DATASUS CNESNet — Bacabal/MA
 * Total de registros auditados: ${profs.length}
 */
(function() {
    const target = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
    target.DATASUS_DT_ATRIBUICAO_BACABAL = ${JSON.stringify(map)};
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = target.DATASUS_DT_ATRIBUICAO_BACABAL;
    }
})();
`;

fs.writeFileSync('code_sandbox_light_git_fe61910d_1781185357/js/cnes-dt-atribuicao-bacabal.js', fileContent, 'utf8');
console.log('Successfully written universal cnes-dt-atribuicao-bacabal.js');
console.log('Total keys:', Object.keys(map).length);
