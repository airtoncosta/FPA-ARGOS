const map = require('../code_sandbox_light_git_fe61910d_1781185357/js/cnes-dt-atribuicao-bacabal.js');
global.window = { DATASUS_DT_ATRIBUICAO_BACABAL: map };

function resolverDtAtribuicaoOficial(cnes, cns, nome, cbo) {
    const map = global.window.DATASUS_DT_ATRIBUICAO_BACABAL;
    if (!map) return '';
    const cnesStr = String(cnes || '').trim();
    const cnsClean = String(cns || '').replace(/\D/g, '');
    const cboClean = String(cbo || '').split(' ')[0].replace(/\D/g, '');
    const nomeClean = String(nome || '').toUpperCase().replace(/\s+/g, ' ').trim();

    return (cnesStr && cnsClean && cboClean && map[`${cnesStr}_${cnsClean}_${cboClean}`])
        || (cnesStr && cnsClean && map[`${cnesStr}_${cnsClean}`])
        || (cnesStr && nomeClean && cboClean && map[`${cnesStr}_${nomeClean}_${cboClean}`])
        || (cnesStr && nomeClean && map[`${cnesStr}_${nomeClean}`])
        || (cnsClean && cboClean && map[`CNS_${cnsClean}_${cboClean}`])
        || (cnsClean && map[`CNS_${cnsClean}`])
        || '';
}

function obterDataAtribuicao(p, isHtml = true) {
    if (!p) return '-';
    let raw = p.dtAtribuicao || p.dt_atribuicao || p.data_atribuicao || '';
    if (!raw) {
        raw = resolverDtAtribuicaoOficial(p.cnes || p.codigo_cnes || p.co_cnes || p.codigoCnes, p.cns || p.cnsMaster, p.nome, p.cbo);
    }
    if (!raw) {
        raw = p.dtEntrada || p.dt_entrada || '';
    }
    if (!raw) return '-';
    const s = String(raw).trim();
    if (!s || s === '-') return '-';

    let dataStr = '';
    let horaStr = String(p.hrAtribuicao || p.horaAtribuicao || p.hr_atribuicao || '').trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const parts = s.substring(0, 10).split('-');
        dataStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
        const rest = s.substring(10).trim().replace(/^T/, '').trim();
        if (/^\d{2}:\d{2}(:\d{2})?/.test(rest) && !horaStr) {
            horaStr = rest.substring(0, 8);
        }
    } else if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
        dataStr = s.substring(0, 10);
        const rest = s.substring(10).trim();
        if (/^\d{2}:\d{2}(:\d{2})?/.test(rest) && !horaStr) {
            horaStr = rest.substring(0, 8);
        }
    } else {
        dataStr = s;
    }

    if (!isHtml) {
        return horaStr ? `${dataStr} ${horaStr}` : dataStr;
    }

    if (dataStr && horaStr) {
        return `<div class="cnes-dt-wrapper"><span class="cnes-dt-date">${dataStr}</span><span class="cnes-dt-time">${horaStr}</span></div>`;
    }
    return `<div class="cnes-dt-wrapper"><span class="cnes-dt-date">${dataStr}</span></div>`;
}

const p1 = { cnes: '2458055', cns: '706808780425123', cbo: '322205', nome: 'ADEQUILDA JARDIM BELO' };
const p2 = { cnes: '2458055', cns: '707606292710994', cbo: '223505', nome: 'ADRIANA TEIXEIRA DO NASCIMENTO' };
const p3 = { cnes: '7230478', cns: '707607279686997', cbo: '225125', nome: 'JOSE LEITE CARNEIRO JUNIOR' };

console.log('p1 (Date only, HTML):', obterDataAtribuicao(p1, true));
console.log('p1 (Date only, Excel):', obterDataAtribuicao(p1, false));
console.log('p2 (Date + Time, HTML):', obterDataAtribuicao(p2, true));
console.log('p2 (Date + Time, Excel):', obterDataAtribuicao(p2, false));
console.log('p3 (SAMU, Date + Time, HTML):', obterDataAtribuicao(p3, true));
console.log('p3 (SAMU, Date + Time, Excel):', obterDataAtribuicao(p3, false));
