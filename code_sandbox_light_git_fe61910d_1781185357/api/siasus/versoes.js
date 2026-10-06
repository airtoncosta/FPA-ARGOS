/**
 * FPA ARGOS — API Serverless: GET /api/siasus/versoes
 * Retorna o catálogo BPA/BDSIA SEMPRE atualizado a partir do espelho live
 * https://github.com/RenatoKR/SIASUS (README.md atualizado diariamente via Actions).
 * Funciona na Vercel (sem filesystem persistente, sem setInterval).
 * Self-contained: não depende de lib externa para garantir bundling serverless.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const SIASUS_README = 'https://raw.githubusercontent.com/RenatoKR/SIASUS/main/README.md';
const SIGTAP_README = 'https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/README.md';

function fmtTamanho(raw, fallback) {
    if (!raw) return fallback;
    const m = String(raw).trim().match(/^([\d.,]+)\s*([MK])?/i);
    if (!m) return fallback;
    const num = m[1].replace(',', '.');
    const unit = (m[2] || 'M').toUpperCase();
    return unit === 'K' ? `${num} KB` : `${num} MB`;
}

function parseSiasusReadme(texto) {
    const bdsiaMap = new Map();
    const bpaMap = new Map();
    if (texto && typeof texto === 'string') {
        const linhas = texto.split('\n').filter(l => /\.exe/i.test(l));
        for (const linha of linhas) {
            const cols = linha.split('|').map(c => c.replace(/`/g, '').trim()).filter(Boolean);
            if (!cols.length) continue;
            const arqCol = cols.find(c => /\.exe$/i.test(c));
            if (!arqCol) continue;
            const arqMatch = arqCol.match(/(BPAMAG\d{4}\.exe|BDSIA\d{6}[a-z]?\.exe)/i);
            if (!arqMatch) continue;
            const arquivo = arqMatch[1];
            const tamCol = cols.find(c => /^\d+([.,]\d+)?\s*[MK]$/i.test(c));
            const compCol = cols.find(c => /rev\./i.test(c));
            if (/^BDSIA/i.test(arquivo)) {
                const m = arquivo.match(/^BDSIA(\d{4})(\d{2})([a-z]?)\.exe$/i);
                if (!m) continue;
                const ano = parseInt(m[1], 10), mesNum = parseInt(m[2], 10), rev = (m[3] || 'a').toLowerCase();
                const mesNome = (mesNum >= 1 && mesNum <= 12) ? MESES[mesNum - 1] : `Mês ${mesNum}`;
                const competencia = compCol || `${mesNome}/${ano} (rev. ${rev})`;
                const ordem = (ano * 10000) + (mesNum * 100) + (rev.charCodeAt(0) - 97);
                if (!bdsiaMap.has(arquivo)) bdsiaMap.set(arquivo, {
                    arquivo, tipo: 'bdsia', ano, mes: mesNum, mesNome, revisao: rev, competencia,
                    titulo: `Tabelas BDSIA ${competencia}`,
                    descricao: `Base de dados e tabelas nacionais do SIA/SUS para ${competencia}`,
                    tamanhoFormatado: fmtTamanho(tamCol, '9.4 MB'), ordem,
                    urlDatasus: `http://ftp.datasus.gov.br/siasus/SIA/${arquivo}`,
                    urlEspelho: `https://github.com/RenatoKR/SIASUS/raw/main/bdsia/${arquivo}`
                });
            } else {
                const m = arquivo.match(/^BPAMAG(\d{2})(\d{2})\.exe$/i);
                if (!m || parseInt(m[1], 10) >= 20) continue;
                const versao = `${m[1]}.${m[2]}`;
                if (!bpaMap.has(arquivo)) bpaMap.set(arquivo, {
                    arquivo, tipo: 'bpa', versao, titulo: `BPA Magnético v${versao}`,
                    descricao: 'Instalador oficial do Boletim de Produção Ambulatorial do SUS',
                    tamanhoFormatado: fmtTamanho(tamCol, '7.5 MB'),
                    ordem: parseInt(m[1], 10) * 100 + parseInt(m[2], 10), isVigente: true,
                    urlDatasus: `http://ftp.datasus.gov.br/siasus/BPA/${arquivo}`,
                    urlEspelho: `https://github.com/RenatoKR/SIASUS/raw/main/bpa/${arquivo}`
                });
            }
        }
        if (bdsiaMap.size === 0) {
            const nomes = texto.match(/BDSIA\d{6}[a-z]?\.exe/gi) || [];
            for (const n of new Set(nomes)) {
                const m = n.match(/^BDSIA(\d{4})(\d{2})([a-z]?)\.exe$/i);
                if (!m || bdsiaMap.has(n)) continue;
                const ano = parseInt(m[1], 10), mesNum = parseInt(m[2], 10), rev = (m[3] || 'a').toLowerCase();
                const mesNome = (mesNum >= 1 && mesNum <= 12) ? MESES[mesNum - 1] : `Mês ${mesNum}`;
                const competencia = `${mesNome}/${ano} (rev. ${rev})`;
                bdsiaMap.set(n, {
                    arquivo: n, tipo: 'bdsia', ano, mes: mesNum, mesNome, revisao: rev, competencia,
                    titulo: `Tabelas BDSIA ${competencia}`,
                    descricao: `Base de dados e tabelas nacionais do SIA/SUS para ${competencia}`,
                    tamanhoFormatado: '9.4 MB', ordem: (ano * 10000) + (mesNum * 100) + (rev.charCodeAt(0) - 97),
                    urlDatasus: `http://ftp.datasus.gov.br/siasus/SIA/${n}`,
                    urlEspelho: `https://github.com/RenatoKR/SIASUS/raw/main/bdsia/${n}`
                });
            }
        }
    }
    const bdsia = Array.from(bdsiaMap.values()).sort((a, b) => b.ordem - a.ordem).slice(0, 6);
    const bpa = Array.from(bpaMap.values()).sort((a, b) => b.ordem - a.ordem).slice(0, 5);
    bpa.forEach((b, i) => { b.isVigente = (i === 0); });
    return { bpa, bdsia };
}

function parseSigtapReadme(texto) {
    const map = new Map();
    if (!texto || typeof texto !== 'string') return [];
    const nomes = texto.match(/nota_tecnica_cgsi_sigtap_\d{4}_\d{2}\.pdf/gi) || [];
    for (const n of new Set(nomes)) {
        const m = n.match(/nota_tecnica_cgsi_sigtap_(\d{4})_(\d{2})\.pdf/i);
        if (!m) continue;
        const ano = parseInt(m[1], 10), mesNum = parseInt(m[2], 10);
        const mesNome = (mesNum >= 1 && mesNum <= 12) ? MESES[mesNum - 1] : `Mês ${mesNum}`;
        const numero = `${String(mesNum).padStart(2, '0')}/${ano}`;
        map.set(n, {
            arquivo: n, tipo: 'nota_tecnica', ano, mes: mesNum, mesNome, numero,
            competencia: `${mesNome}/${ano}`,
            titulo: `Nota Técnica CGSI/SIGTAP nº ${numero}`,
            descricao: 'Alterações, inclusões e adequações oficiais da Tabela Unificada de Procedimentos do SUS',
            orgaoEmissor: 'CGSI / DRAC / SAES - Ministério da Saúde',
            tamanhoFormatado: '340 KB', ordem: (ano * 100) + mesNum,
            urlDownload: `https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/${n}`
        });
    }
    return Array.from(map.values()).sort((a, b) => b.ordem - a.ordem).slice(0, 6)
        .map((n, i) => ({ ...n, isMaisRecente: i === 0 }));
}

function fetchText(targetUrl, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const req = https.get(targetUrl, { headers: { 'User-Agent': 'FPA-ARGOS-Serverless/4.0' }, timeout: timeoutMs }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let next = res.headers.location;
                if (!next.startsWith('http')) next = new URL(next, targetUrl).href;
                res.resume();
                return fetchText(next, timeoutMs).then(resolve, reject);
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} em ${targetUrl}`));
            }
            let body = '';
            res.on('data', c => { body += c; });
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout em ${targetUrl}`)); });
    });
}

function lerCatalogoEstatico() {
    try {
        const p = path.join(__dirname, '..', '..', 'siasus_data', 'siasus_catalogo.json');
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {}
    return null;
}

async function montarCatalogoLive() {
    const estatico = lerCatalogoEstatico();
    let bpa = (estatico && estatico.bpa) || [];
    let bdsia = (estatico && estatico.bdsia) || [];
    let notasTecnicas = (estatico && estatico.notasTecnicas) || [];
    let origem = 'estatico';
    try {
        const readme = await fetchText(SIASUS_README, 8000);
        const parsed = parseSiasusReadme(readme);
        if (parsed.bdsia.length > 0) { bdsia = parsed.bdsia; origem = 'github_live'; }
        if (parsed.bpa.length > 0) { bpa = parsed.bpa; origem = 'github_live'; }
    } catch (e) {}
    try {
        const sigtap = await fetchText(SIGTAP_README, 8000);
        const nts = parseSigtapReadme(sigtap);
        if (nts.length > 0) { notasTecnicas = nts; origem = origem === 'github_live' ? 'github_live' : 'github_live'; }
    } catch (e) {}
    return {
        ultimaSincronizacao: new Date().toISOString(),
        statusDatasus: origem === 'github_live' ? 'online' : 'espelho',
        origem,
        bpa, bdsia, notasTecnicas,
        resumo: {
            versaoVigenteBpa: (bpa[0] && bpa[0].arquivo) || 'BPAMAG0500.exe',
            versaoVigenteBdsia: (bdsia[0] && bdsia[0].competencia) || '',
            ultimaNotaTecnica: (notasTecnicas[0] && notasTecnicas[0].competencia) || '',
            totalNotasDisponiveis: notasTecnicas.length
        }
    };
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
    if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Método não permitido' }));
        return;
    }
    try {
        const catalogo = await montarCatalogoLive();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, catalogo }));
    } catch (err) {
        const estatico = lerCatalogoEstatico();
        if (estatico) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, catalogo: estatico, fallback: true }));
            return;
        }
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
    }
};
module.exports.montarCatalogoLive = montarCatalogoLive;
module.exports.parseSiasusReadme = parseSiasusReadme;
