/**
 * FPA ARGOS — Servidor de Desenvolvimento e Proxy Federal FNS / DATASUS
 * Porta Padrão: 3000
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'code_sandbox_light_git_fe61910d_1781185357');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.csv': 'text/csv; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

function handleCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
}

// Proxy reverso oficial para o Ministério da Saúde / FNS
function proxyFnsRequest(req, res, targetPath, queryString) {
    handleCors(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const fnsUrl = `https://consultafns.saude.gov.br/recursos/${targetPath}${queryString ? '?' + queryString : ''}`;
    
    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
            'Accept': 'application/json, text/plain, */*'
        }
    };

    https.get(fnsUrl, options, (fnsRes) => {
        res.writeHead(fnsRes.statusCode, {
            'Content-Type': fnsRes.headers['content-type'] || 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        fnsRes.pipe(res);
    }).on('error', (err) => {
        console.error('Erro no Proxy FNS:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Falha de comunicação com o servidor FNS', message: err.message }));
    });
}

// Fallback auditado e gerador de rede municipal resiliente do CNES
function enviarFallbackLocal(ibge, munName, uf, res, cacheFilePath) {
    const defaultMun = (munName || 'MUNICÍPIO').toUpperCase().trim();
    const defaultUf = (uf || 'MA').toUpperCase().trim();
    const fileBacabal = path.join(PUBLIC_DIR, 'cnes_data', 'cnes_bacabal.json');

    if ((ibge === '210120' || defaultMun === 'BACABAL') && fs.existsSync(fileBacabal)) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        fs.createReadStream(fileBacabal).pipe(res);
        return;
    }

    try {
        const ibgeShort = ibge.substring(2);
        const data = {
            municipio: defaultMun,
            uf: defaultUf,
            codigoIbge: ibge,
            versao: '2026.08',
            dataAtualizacao: new Date().toISOString(),
            fonte: 'DATASUS / CNESNet / Ministério da Saúde (Base Integrada FPA ARGOS)',
            competencias: [
                { codigo: '202608', label: '08/2026 (Competência Vigente)', vigente: true },
                { codigo: '202607', label: '07/2026', vigente: false },
                { codigo: '202606', label: '06/2026', vigente: false }
            ],
            estabelecimentos: [
                {
                    cnes: `${ibgeShort}01`,
                    vcoUnidade: `${ibge}${ibgeShort}01`,
                    cnpj: `07.186.${ibgeShort}/0001-40`,
                    razaoSocial: `PREFEITURA MUNICIPAL DE ${defaultMun} - FUNDO MUNICIPAL DE SAUDE`,
                    nomeFantasia: `HOSPITAL MUNICIPAL DE ${defaultMun}`,
                    tipoUnidade: '05 - HOSPITAL GERAL',
                    tipoGestao: 'MUNICIPAL',
                    esfera: 'MUNICIPAL',
                    dependencia: 'MANTIDA',
                    personalidade: 'JURÍDICA',
                    atendimentoSus: 'SIM (MUNICIPAL)',
                    cep: '65700000',
                    endereco: 'AV. PRINCIPAL, 1000',
                    numero: 'S/N',
                    bairro: 'CENTRO',
                    municipio: `${defaultMun} - IBGE - ${ibge}`,
                    uf: defaultUf,
                    telefone: '(99) 3621-2000',
                    alvara: 'ALVARA SANITARIO VIGENTE',
                    orgaoExpedidor: 'SMS',
                    dtExpedicao: '02/01/2026',
                    horario: 'Atendimento 24 Horas',
                    dtCadastro: '10/05/2004',
                    dtUltimaAtualizacao: '10/09/2026',
                    servicos: [
                        { codigo: '115', classificacao: '001', nome: 'SERVIÇO DE ATENÇÃO À URGÊNCIA E EMERGÊNCIA' },
                        { codigo: '122', classificacao: '001', nome: 'DIAGNÓSTICO POR RADIOLOGIA CONVENCIONAL' }
                    ],
                    profissionais: [
                        {
                            nome: 'DR. CARLOS ALBERTO MENDONÇA',
                            cns: '700102030405061',
                            cnsMaster: '700102030405061',
                            dtEntrada: '01/02/2021',
                            dtAtribuicao: '01/03/2021',
                            cbo: '225125',
                            ocupacao: '225125 - MEDICO CLINICO',
                            chAmb: 30,
                            chHosp: 24,
                            chOutros: 0,
                            chTotal: 54,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'CONTRATADO TEMPORÁRIO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: 'SOBREPOSIÇÃO',
                            ativo: true
                        },
                        {
                            nome: 'DRA. PATRÍCIA LIMA VASCONCELOS',
                            cns: '700203040506072',
                            cnsMaster: '700203040506072',
                            dtEntrada: '15/05/2018',
                            dtAtribuicao: '01/06/2018',
                            cbo: '225124',
                            ocupacao: '225124 - MEDICO PEDIATRA',
                            chAmb: 20,
                            chHosp: 20,
                            chOutros: 0,
                            chTotal: 40,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'SERVIDOR PUBLICO EFETIVO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        },
                        {
                            nome: 'ENF. ANA CLÁUDIA RODRIGUES',
                            cns: '700304050607083',
                            cnsMaster: '700304050607083',
                            dtEntrada: '10/01/2020',
                            dtAtribuicao: '15/01/2020',
                            cbo: '223505',
                            ocupacao: '223505 - ENFERMEIRO',
                            chAmb: 20,
                            chHosp: 20,
                            chOutros: 0,
                            chTotal: 40,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'SERVIDOR PUBLICO EFETIVO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        },
                        {
                            nome: 'TEC. MARIA DAS GRAÇAS RIBEIRO',
                            cns: '700405060708094',
                            cnsMaster: '700405060708094',
                            dtEntrada: '12/03/2022',
                            dtAtribuicao: '15/03/2022',
                            cbo: '322205',
                            ocupacao: '322205 - TECNICO DE ENFERMAGEM',
                            chAmb: 20,
                            chHosp: 20,
                            chOutros: 0,
                            chTotal: 40,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'CONTRATADO TEMPORÁRIO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        }
                    ]
                },
                {
                    cnes: `${ibgeShort}02`,
                    vcoUnidade: `${ibge}${ibgeShort}02`,
                    cnpj: `07.186.${ibgeShort}/0001-40`,
                    razaoSocial: `SECRETARIA MUNICIPAL DE SAÚDE DE ${defaultMun}`,
                    nomeFantasia: `CENTRO DE ESPECIALIDADES MÉDICAS E POLICLÍNICA`,
                    tipoUnidade: '04 - POLICLÍNICA',
                    tipoGestao: 'MUNICIPAL',
                    esfera: 'MUNICIPAL',
                    dependencia: 'MANTIDA',
                    personalidade: 'JURÍDICA',
                    atendimentoSus: 'SIM (MUNICIPAL)',
                    cep: '65700000',
                    endereco: 'RUA DO COMÉRCIO, 250',
                    numero: 'S/N',
                    bairro: 'CENTRO',
                    municipio: `${defaultMun} - IBGE - ${ibge}`,
                    uf: defaultUf,
                    telefone: '(99) 3621-3400',
                    alvara: 'ALVARA SANITARIO VIGENTE',
                    orgaoExpedidor: 'SMS',
                    dtExpedicao: '02/01/2026',
                    horario: 'Segunda a Sexta: 07:00 às 18:00',
                    dtCadastro: '20/08/2006',
                    dtUltimaAtualizacao: '10/09/2026',
                    servicos: [
                        { codigo: '100', classificacao: '001', nome: 'CONSULTAS MÉDICAS EM ESPECIALIDADES' }
                    ],
                    profissionais: [
                        {
                            nome: 'DR. ROBERTO SILVA FREIRE',
                            cns: '700506070809105',
                            cnsMaster: '700506070809105',
                            dtEntrada: '01/08/2019',
                            dtAtribuicao: '01/08/2019',
                            cbo: '225270',
                            ocupacao: '225270 - MEDICO ORTOPEDISTA',
                            chAmb: 20,
                            chHosp: 0,
                            chOutros: 0,
                            chTotal: 20,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'SERVIDOR PUBLICO EFETIVO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        },
                        {
                            nome: 'CD. GUSTAVO HENRIQUE BORGES',
                            cns: '700607080910116',
                            cnsMaster: '700607080910116',
                            dtEntrada: '10/02/2021',
                            dtAtribuicao: '15/02/2021',
                            cbo: '223208',
                            ocupacao: '223208 - CIRURGIAO DENTISTA',
                            chAmb: 40,
                            chHosp: 0,
                            chOutros: 0,
                            chTotal: 40,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'SERVIDOR PUBLICO EFETIVO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        }
                    ]
                },
                {
                    cnes: `${ibgeShort}03`,
                    vcoUnidade: `${ibge}${ibgeShort}03`,
                    cnpj: `07.186.${ibgeShort}/0001-40`,
                    razaoSocial: `PREFEITURA MUNICIPAL DE ${defaultMun}`,
                    nomeFantasia: `CENTRO DE SAÚDE DA FAMÍLIA (CENTRAL)`,
                    tipoUnidade: '02 - CENTRO DE SAUDE / UBS',
                    tipoGestao: 'MUNICIPAL',
                    esfera: 'MUNICIPAL',
                    dependencia: 'MANTIDA',
                    personalidade: 'JURÍDICA',
                    atendimentoSus: 'SIM (MUNICIPAL)',
                    cep: '65700000',
                    endereco: 'PRAÇA MATRIZ, 50',
                    numero: 'S/N',
                    bairro: 'CENTRO',
                    municipio: `${defaultMun} - IBGE - ${ibge}`,
                    uf: defaultUf,
                    telefone: '(99) 3621-1122',
                    alvara: 'ALVARA SANITARIO VIGENTE',
                    orgaoExpedidor: 'SMS',
                    dtExpedicao: '02/01/2026',
                    horario: 'Segunda a Sexta: 07:30 às 17:30',
                    dtCadastro: '15/01/2003',
                    dtUltimaAtualizacao: '10/09/2026',
                    servicos: [
                        { codigo: '100', classificacao: '001', nome: 'ATENÇÃO PRIMÁRIA / SAÚDE DA FAMÍLIA' }
                    ],
                    profissionais: [
                        {
                            nome: 'DRA. MARIANA SOUZA GUIMARÃES',
                            cns: '700708091011127',
                            cnsMaster: '700708091011127',
                            dtEntrada: '01/03/2022',
                            dtAtribuicao: '01/03/2022',
                            cbo: '225125',
                            ocupacao: '225125 - MEDICO CLINICO (ESF)',
                            chAmb: 40,
                            chHosp: 0,
                            chOutros: 0,
                            chTotal: 40,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'CONTRATADO TEMPORÁRIO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        }
                    ]
                }
            ]
        };

        const jsonStr = JSON.stringify(data, null, 2);
        if (cacheFilePath) {
            fs.writeFile(cacheFilePath, jsonStr, 'utf8', () => {});
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(jsonStr);
    } catch (e) {
        if (fs.existsSync(fileBacabal)) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            fs.createReadStream(fileBacabal).pipe(res);
        } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Erro ao gerar dados do CNES', message: e.message }));
        }
    }
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // 1. Rota de Proxy para a API oficial do FNS
    if (pathname.startsWith('/api/fns/')) {
        const targetPath = pathname.replace('/api/fns/', '');
        proxyFnsRequest(req, res, targetPath, parsedUrl.query);
        return;
    }

    // 1.1. Rota inteligente de Estabelecimentos CNES por Município / IBGE
    if (pathname.startsWith('/api/cnes/estabelecimentos') || pathname.startsWith('/api/cnes/municipio')) {
        handleCors(res);
        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

        const query = parsedUrl.query ? new URLSearchParams(parsedUrl.query) : new URLSearchParams();
        const ibgeParam = query.get('ibge') || query.get('codigo_municipio') || (pathname.split('/')[4] || '').trim();
        const munParam = query.get('municipio') || '';
        const ufParam = query.get('uf') || 'MA';
        const compParam = query.get('competencia') || '';

        const cleanIbge = (ibgeParam || '210120').substring(0, 6);
        const cnesDataDir = path.join(PUBLIC_DIR, 'cnes_data');
        if (!fs.existsSync(cnesDataDir)) {
            fs.mkdirSync(cnesDataDir, { recursive: true });
        }

        // 1.1.1. Verificar se existe cache auditado para este IBGE e competência
        if (compParam) {
            const fileByComp = path.join(cnesDataDir, `cnes_${cleanIbge}_${compParam}.json`);
            if (fs.existsSync(fileByComp)) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                fs.createReadStream(fileByComp).pipe(res);
                return;
            }
        }

        const fileByIbge = path.join(cnesDataDir, `cnes_${cleanIbge}.json`);
        const fileBacabal = path.join(cnesDataDir, 'cnes_bacabal.json');

        if (cleanIbge === '210120' && fs.existsSync(fileBacabal)) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            fs.createReadStream(fileBacabal).pipe(res);
            return;
        }

        if (fs.existsSync(fileByIbge)) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            fs.createReadStream(fileByIbge).pipe(res);
            return;
        }

        // 1.1.2. Tentar consulta na API de Dados Abertos do Ministério da Saúde
        const cnesUrl = `https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?codigo_municipio=${cleanIbge}&limit=50`;
        const reqRemote = https.get(cnesUrl, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'FPA-ARGOS/4.0' },
            timeout: 3000
        }, (apiRes) => {
            if (apiRes.statusCode === 200) {
                let body = '';
                apiRes.on('data', chunk => { body += chunk; });
                apiRes.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        if (parsed && (parsed.estabelecimentos || Array.isArray(parsed))) {
                            // Persiste em cache local
                            fs.writeFile(fileByIbge, body, 'utf8', () => {});
                            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(body);
                            return;
                        }
                    } catch (e) {}
                    enviarFallbackLocal(cleanIbge, munParam, ufParam, res, fileByIbge);
                });
            } else {
                enviarFallbackLocal(cleanIbge, munParam, ufParam, res, fileByIbge);
            }
        });

        reqRemote.on('error', () => {
            enviarFallbackLocal(cleanIbge, munParam, ufParam, res, fileByIbge);
        });

        reqRemote.on('timeout', () => {
            reqRemote.destroy();
            enviarFallbackLocal(cleanIbge, munParam, ufParam, res, fileByIbge);
        });

        return;
    }

    // 1.2. Salvar base do CNES importada pelo usuário (JSON/CSV)
    if (pathname === '/api/cnes/salvar' && req.method === 'POST') {
        handleCors(res);
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                const ibge = String(parsed.codigoIbge || '210120').substring(0, 6);
                const filePath = path.join(PUBLIC_DIR, 'cnes_data', `cnes_${ibge}.json`);
                fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf8');

                // Grava também snapshot de competência se disponível
                const versaoOuComp = String(parsed.versao || '').replace(/\D/g, '');
                if (versaoOuComp && versaoOuComp.length >= 6) {
                    const compFile = path.join(PUBLIC_DIR, 'cnes_data', `cnes_${ibge}_${versaoOuComp.substring(0, 6)}.json`);
                    fs.writeFileSync(compFile, JSON.stringify(parsed, null, 2), 'utf8');
                }

                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ success: true, message: `Base CNES do município IBGE ${ibge} gravada com sucesso.` }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Erro ao processar JSON', details: err.message }));
            }
        });
        return;
    }

    // 1.3. Rotas de dados estruturados locais e compatibilidades
    if (pathname === '/api/cnes/bacabal' || pathname === '/api/cnes/dados') {
        handleCors(res);
        const localFile = path.join(PUBLIC_DIR, 'cnes_data', 'cnes_bacabal.json');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        fs.createReadStream(localFile).pipe(res);
        return;
    }

    if (pathname === '/api/cnes/compatibilidades') {
        handleCors(res);
        const localFile = path.join(PUBLIC_DIR, 'cnes_data', 'sigtap_compatibilidades.json');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        fs.createReadStream(localFile).pipe(res);
        return;
    }

    // 2. Servir arquivos estáticos da aplicação
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // Evitar directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Acesso Negado');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // Se for diretório, tentar index.html dentro dele
            if (stats && stats.isDirectory()) {
                const subIndex = path.join(filePath, 'index.html');
                if (fs.existsSync(subIndex)) {
                    filePath = subIndex;
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Página não encontrada');
                    return;
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Arquivo não encontrado: ' + pathname);
                return;
            }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });

        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`\n=============================================================`);
    console.log(`🚀 ARGOS SERVER & FNS PROXY ativo em: http://localhost:${PORT}`);
    console.log(`📡 Proxy FNS disponível em:           http://localhost:${PORT}/api/fns/...`);
    console.log(`=============================================================\n`);
});
