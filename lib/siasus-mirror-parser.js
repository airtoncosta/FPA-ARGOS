/**
 * FPA ARGOS — Parser live do README espelho SIASUS (GitHub RenatoKR/SIASUS)
 * Fonte única de verdade para BPA + BDSIA com tamanhos reais da tabela markdown.
 * Reutilizado pelo backend (serverless) e espelhado no frontend (download-sistema-module.js).
 */

const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function _fmtTamanho(raw) {
    if (!raw) return null;
    const m = String(raw).trim().match(/^([\d.,]+)\s*([MK])?/i);
    if (!m) return null;
    const num = m[1].replace(',', '.');
    const unit = (m[2] || 'M').toUpperCase();
    return unit === 'K' ? `${num} KB` : `${num} MB`;
}

function _parseBdsiaRow(arquivo, competenciaRaw, tamanhoRaw) {
    const match = arquivo.match(/^BDSIA(\d{4})(\d{2})([a-z]?)\.exe$/i);
    if (!match) return null;
    const ano = parseInt(match[1], 10);
    const mesNum = parseInt(match[2], 10);
    const rev = (match[3] || 'a').toLowerCase();
    const mesNome = (mesNum >= 1 && mesNum <= 12) ? MESES[mesNum - 1] : `Mês ${mesNum}`;
    const competencia = (competenciaRaw && /rev\./i.test(competenciaRaw))
        ? competenciaRaw.trim()
        : `${mesNome}/${ano} (rev. ${rev})`;
    const ordem = (ano * 10000) + (mesNum * 100) + (rev.charCodeAt(0) - 97);
    return {
        arquivo,
        tipo: 'bdsia',
        ano,
        mes: mesNum,
        mesNome,
        revisao: rev,
        competencia,
        titulo: `Tabelas BDSIA ${competencia}`,
        descricao: `Base de dados e tabelas nacionais do SIA/SUS para ${competencia}`,
        tamanhoFormatado: _fmtTamanho(tamanhoRaw) || '9.4 MB',
        ordem,
        urlDatasus: `http://ftp.datasus.gov.br/siasus/SIA/${arquivo}`,
        urlEspelho: `https://github.com/RenatoKR/SIASUS/raw/main/bdsia/${arquivo}`
    };
}

function _parseBpaRow(arquivo, tamanhoRaw) {
    const match = arquivo.match(/^BPAMAG(\d{2})(\d{2})\.exe$/i);
    if (!match) return null;
    if (parseInt(match[1], 10) >= 20) return null; // rejeita fictícios tipo BPAMAG2601
    const versao = `${match[1]}.${match[2]}`;
    return {
        arquivo,
        tipo: 'bpa',
        versao,
        titulo: `BPA Magnético v${versao}`,
        descricao: 'Instalador oficial do Boletim de Produção Ambulatorial do SUS',
        tamanhoFormatado: _fmtTamanho(tamanhoRaw) || '7.5 MB',
        ordem: parseInt(match[1], 10) * 100 + parseInt(match[2], 10),
        isVigente: true,
        urlDatasus: `http://ftp.datasus.gov.br/siasus/BPA/${arquivo}`,
        urlEspelho: `https://github.com/RenatoKR/SIASUS/raw/main/bpa/${arquivo}`
    };
}

/**
 * Extrai BPA + BDSIA do markdown do README do espelho.
 * Suporta linhas de tabela com ou sem crases e com tamanhos reais.
 */
function parseSiasusReadme(texto) {
    const bdsiaMap = new Map();
    const bpaMap = new Map();
    if (!texto || typeof texto !== 'string') return { bpa: [], bdsia: [] };

    // Linhas de tabela markdown contendo .exe
    const linhas = texto.split('\n').filter(l => /\.exe/i.test(l));
    for (const linha of linhas) {
        // Divide por | e limpa crases/espaços
        const cols = linha.split('|').map(c => c.replace(/`/g, '').trim()).filter(Boolean);
        if (cols.length === 0) continue;
        const arqCol = cols.find(c => /\.exe$/i.test(c));
        if (!arqCol) continue;
        const arqMatch = arqCol.match(/(BPAMAG\d{4}\.exe|BDSIA\d{6}[a-z]?\.exe)/i);
        if (!arqMatch) continue;
        const arquivo = arqMatch[1];

        // Tamanho: primeira coluna com padrão "9.4M" / "7.5M"
        const tamCol = cols.find(c => /^\d+([.,]\d+)?\s*[MK]$/i.test(c));
        // Competência: coluna com "/" e "rev" (só BDSIA tem)
        const compCol = cols.find(c => /rev\./i.test(c));

        if (/^BDSIA/i.test(arquivo)) {
            const item = _parseBdsiaRow(arquivo, compCol, tamCol);
            if (item && !bdsiaMap.has(item.arquivo)) bdsiaMap.set(item.arquivo, item);
        } else if (/^BPAMAG/i.test(arquivo)) {
            const item = _parseBpaRow(arquivo, tamCol);
            if (item && !bpaMap.has(item.arquivo)) bpaMap.set(item.arquivo, item);
        }
    }

    // Fallback: se nenhuma linha de tabela casou (README em outro formato),
    // extrai ao menos os nomes dos arquivos e deriva o resto.
    if (bdsiaMap.size === 0) {
        const nomes = texto.match(/BDSIA\d{6}[a-z]?\.exe/gi) || [];
        for (const n of new Set(nomes)) {
            const item = _parseBdsiaRow(n, null, null);
            if (item && !bdsiaMap.has(item.arquivo)) bdsiaMap.set(item.arquivo, item);
        }
    }
    if (bpaMap.size === 0) {
        const nomes = texto.match(/BPAMAG\d{4}\.exe/gi) || [];
        for (const n of new Set(nomes)) {
            const item = _parseBpaRow(n, null);
            if (item && !bpaMap.has(item.arquivo)) bpaMap.set(item.arquivo, item);
        }
    }

    const bdsia = Array.from(bdsiaMap.values()).sort((a, b) => b.ordem - a.ordem).slice(0, 6);
    const bpa = Array.from(bpaMap.values()).sort((a, b) => b.ordem - a.ordem).slice(0, 5);
    bpa.forEach((b, i) => { b.isVigente = (i === 0); });
    return { bpa, bdsia };
}

module.exports = { parseSiasusReadme };
