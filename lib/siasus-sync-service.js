/**
 * FPA ARGOS — Motor Independente de Sincronização e Download do SIA/SUS (BPA & BDSIA)
 * 
 * Funcionalidades:
 * 1. Descoberta autônoma no gateway HTTP/FTP do DATASUS (ftp.datasus.gov.br)
 * 2. Fallback resiliente para espelho público se o DATASUS estiver instável
 * 3. Parser e formatação de competências e revisões (Ano, Mês por extenso, Revisão)
 * 4. Rotação estrita das 6 últimas versões de BDSIA e versões de BPA
 * 5. Armazenamento e entrega local em alta velocidade na rede interna
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

class SiasusSyncService {
    constructor(options = {}) {
        this.baseDir = options.baseDir || path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'siasus_data');
        this.downloadsDir = path.join(this.baseDir, 'downloads');
        this.catalogoPath = path.join(this.baseDir, 'siasus_catalogo.json');
        this.retentionBdsia = options.retentionBdsia || 6;
        this.isSyncing = false;
        this.lastSync = null;
        this.syncInterval = null;

        this._ensureDirectories();
    }

    _ensureDirectories() {
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
        if (!fs.existsSync(this.downloadsDir)) {
            fs.mkdirSync(this.downloadsDir, { recursive: true });
        }
    }

    /**
     * Parser de arquivo BPA (ex: BPAMAG0500.exe -> Versão 05.00)
     */
    parseBpaFilename(filename) {
        const match = filename.match(/^BPAMAG(\d{2})(\d{2})\.exe$/i);
        if (!match) return null;
        const major = match[1];
        const minor = match[2];
        const versao = `${major}.${minor}`;
        return {
            arquivo: filename,
            tipo: 'bpa',
            versao: versao,
            titulo: `BPA Magnético v${versao}`,
            descricao: 'Instalador oficial do Boletim de Produção Ambulatorial do SUS',
            ordem: parseInt(major, 10) * 100 + parseInt(minor, 10)
        };
    }

    /**
     * Parser de arquivo BDSIA (ex: BDSIA202608a.exe -> Agosto/2026 rev. a)
     */
    parseBdsiaFilename(filename) {
        const match = filename.match(/^BDSIA(\d{4})(\d{2})([a-z]?)\.exe$/i);
        if (!match) return null;
        const ano = parseInt(match[1], 10);
        const mesNum = parseInt(match[2], 10);
        const rev = (match[3] || 'a').toLowerCase();
        const mesNome = (mesNum >= 1 && mesNum <= 12) ? MESES[mesNum - 1] : `Mês ${mesNum}`;
        const competencia = `${mesNome}/${ano} (rev. ${rev})`;

        // Código de ordenação cronológica: YYYY * 1000 + MM * 10 + charCode(rev)
        const revCode = rev.charCodeAt(0) - 97; // a=0, b=1, c=2...
        const ordem = (ano * 10000) + (mesNum * 100) + revCode;

        return {
            arquivo: filename,
            tipo: 'bdsia',
            ano,
            mes: mesNum,
            mesNome,
            revisao: rev,
            competencia,
            titulo: `Tabelas BDSIA ${competencia}`,
            descricao: `Base de dados e tabelas nacionais do SIA/SUS para ${competencia}`,
            ordem
        };
    }

    /**
     * Parser de arquivo de Nota Técnica do SIGTAP (ex: nota_tecnica_cgsi_sigtap_2026_09.pdf)
     */
    parseNotaTecnicaFilename(filename) {
        const match = filename.match(/^nota_tecnica_cgsi_sigtap_(\d{4})_(\d{2})\.pdf$/i);
        if (!match) return null;
        const ano = parseInt(match[1], 10);
        const mesNum = parseInt(match[2], 10);
        const mesNome = (mesNum >= 1 && mesNum <= 12) ? MESES[mesNum - 1] : `Mês ${mesNum}`;
        const mesPad = String(mesNum).padStart(2, '0');
        const numero = `${mesPad}/${ano}`;
        const competencia = `${mesNome}/${ano}`;
        const ordem = (ano * 100) + mesNum;

        return {
            arquivo: filename,
            tipo: 'nota_tecnica',
            ano,
            mes: mesNum,
            mesNome,
            numero,
            competencia,
            titulo: `Nota Técnica CGSI/SIGTAP nº ${numero}`,
            descricao: `Alterações, inclusões e adequações oficiais da Tabela Unificada de Procedimentos do SUS (${competencia})`,
            orgaoEmissor: 'CGSI / DRAC / SAES - Ministério da Saúde',
            tamanhoFormatado: '340 KB',
            ordem,
            urlDownload: `https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/${filename}`,
            urlDatasus: `http://ftp.datasus.gov.br/siasus/Documentos/${filename}`,
            urlEspelho: `https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/${filename}`
        };
    }

    /**
     * Retorna o catálogo atual do disco ou gera um catálogo inicial
     */
    getCatalogo() {
        try {
            if (fs.existsSync(this.catalogoPath)) {
                const raw = fs.readFileSync(this.catalogoPath, 'utf8');
                const cat = JSON.parse(raw);
                this._atualizarStatusLocal(cat);
                return cat;
            }
        } catch (err) {
            console.warn('[SiasusSyncService] Aviso ao ler catálogo:', err.message);
        }

        // Catálogo padrão de inicialização rápida
        const defaultCatalogo = this._gerarCatalogoPadrao();
        this._atualizarStatusLocal(defaultCatalogo);
        return defaultCatalogo;
    }

    _gerarCatalogoPadrao() {
        return {
            ultimaSincronizacao: new Date().toISOString(),
            statusDatasus: 'online',
            origem: 'padrao_inicial',
            bpa: [
                {
                    arquivo: 'BPAMAG0500.exe',
                    tipo: 'bpa',
                    versao: '05.00',
                    titulo: 'BPA Magnético v05.00',
                    descricao: 'Instalador oficial do Boletim de Produção Ambulatorial do SUS (Versão Vigente)',
                    tamanhoBytes: 7864320,
                    tamanhoFormatado: '7.5 MB',
                    disponivelLocal: false,
                    isVigente: true,
                    urlDatasus: 'http://ftp.datasus.gov.br/siasus/BPA/BPAMAG0500.exe',
                    urlEspelho: 'https://github.com/RenatoKR/SIASUS/raw/main/bpa/BPAMAG0500.exe'
                }
            ],
            bdsia: [
                {
                    arquivo: 'BDSIA202608a.exe',
                    tipo: 'bdsia',
                    ano: 2026,
                    mes: 8,
                    mesNome: 'Agosto',
                    revisao: 'a',
                    competencia: 'Agosto/2026 (rev. a)',
                    titulo: 'Tabelas BDSIA Agosto/2026 (rev. a)',
                    tamanhoBytes: 9856614,
                    tamanhoFormatado: '9.4 MB',
                    disponivelLocal: false,
                    urlDatasus: 'http://ftp.datasus.gov.br/siasus/SIA/BDSIA202608a.exe',
                    urlEspelho: 'https://github.com/RenatoKR/SIASUS/raw/main/bdsia/BDSIA202608a.exe'
                },
                {
                    arquivo: 'BDSIA202607b.exe',
                    tipo: 'bdsia',
                    ano: 2026,
                    mes: 7,
                    mesNome: 'Julho',
                    revisao: 'b',
                    competencia: 'Julho/2026 (rev. b)',
                    titulo: 'Tabelas BDSIA Julho/2026 (rev. b)',
                    tamanhoBytes: 9856614,
                    tamanhoFormatado: '9.4 MB',
                    disponivelLocal: false,
                    urlDatasus: 'http://ftp.datasus.gov.br/siasus/SIA/BDSIA202607b.exe',
                    urlEspelho: 'https://github.com/RenatoKR/SIASUS/raw/main/bdsia/BDSIA202607b.exe'
                },
                {
                    arquivo: 'BDSIA202607a.exe',
                    tipo: 'bdsia',
                    ano: 2026,
                    mes: 7,
                    mesNome: 'Julho',
                    revisao: 'a',
                    competencia: 'Julho/2026 (rev. a)',
                    titulo: 'Tabelas BDSIA Julho/2026 (rev. a)',
                    tamanhoBytes: 9542041,
                    tamanhoFormatado: '9.1 MB',
                    disponivelLocal: false,
                    urlDatasus: 'http://ftp.datasus.gov.br/siasus/SIA/BDSIA202607a.exe',
                    urlEspelho: 'https://github.com/RenatoKR/SIASUS/raw/main/bdsia/BDSIA202607a.exe'
                },
                {
                    arquivo: 'BDSIA202606b.exe',
                    tipo: 'bdsia',
                    ano: 2026,
                    mes: 6,
                    mesNome: 'Junho',
                    revisao: 'b',
                    competencia: 'Junho/2026 (rev. b)',
                    titulo: 'Tabelas BDSIA Junho/2026 (rev. b)',
                    tamanhoBytes: 9646899,
                    tamanhoFormatado: '9.2 MB',
                    disponivelLocal: false,
                    urlDatasus: 'http://ftp.datasus.gov.br/siasus/SIA/BDSIA202606b.exe',
                    urlEspelho: 'https://github.com/RenatoKR/SIASUS/raw/main/bdsia/BDSIA202606b.exe'
                },
                {
                    arquivo: 'BDSIA202605d.exe',
                    tipo: 'bdsia',
                    ano: 2026,
                    mes: 5,
                    mesNome: 'Maio',
                    revisao: 'd',
                    competencia: 'Maio/2026 (rev. d)',
                    titulo: 'Tabelas BDSIA Maio/2026 (rev. d)',
                    tamanhoBytes: 9437184,
                    tamanhoFormatado: '9.0 MB',
                    disponivelLocal: false,
                    urlDatasus: 'http://ftp.datasus.gov.br/siasus/SIA/BDSIA202605d.exe',
                    urlEspelho: 'https://github.com/RenatoKR/SIASUS/raw/main/bdsia/BDSIA202605d.exe'
                },
                {
                    arquivo: 'BDSIA202604d.exe',
                    tipo: 'bdsia',
                    ano: 2026,
                    mes: 4,
                    mesNome: 'Abril',
                    revisao: 'd',
                    competencia: 'Abril/2026 (rev. d)',
                    titulo: 'Tabelas BDSIA Abril/2026 (rev. d)',
                    tamanhoBytes: 9332326,
                    tamanhoFormatado: '8.9 MB',
                    disponivelLocal: false,
                    urlDatasus: 'http://ftp.datasus.gov.br/siasus/SIA/BDSIA202604d.exe',
                    urlEspelho: 'https://github.com/RenatoKR/SIASUS/raw/main/bdsia/BDSIA202604d.exe'
                }
            ],
            notasTecnicas: [
                {
                    arquivo: 'nota_tecnica_cgsi_sigtap_2026_09.pdf',
                    tipo: 'nota_tecnica',
                    ano: 2026,
                    mes: 9,
                    mesNome: 'Setembro',
                    numero: '09/2026',
                    competencia: 'Setembro/2026',
                    titulo: 'Nota Técnica CGSI/SIGTAP nº 09/2026',
                    descricao: 'Alterações, inclusões e adequações oficiais da Tabela Unificada de Procedimentos do SUS',
                    orgaoEmissor: 'CGSI / DRAC / SAES - Ministério da Saúde',
                    tamanhoBytes: 358400,
                    tamanhoFormatado: '350 KB',
                    disponivelLocal: false,
                    isMaisRecente: true,
                    urlDownload: 'https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/nota_tecnica_cgsi_sigtap_2026_09.pdf'
                },
                {
                    arquivo: 'nota_tecnica_cgsi_sigtap_2026_08.pdf',
                    tipo: 'nota_tecnica',
                    ano: 2026,
                    mes: 8,
                    mesNome: 'Agosto',
                    numero: '08/2026',
                    competencia: 'Agosto/2026',
                    titulo: 'Nota Técnica CGSI/SIGTAP nº 08/2026',
                    descricao: 'Alterações, inclusões e adequações oficiais da Tabela Unificada de Procedimentos do SUS',
                    orgaoEmissor: 'CGSI / DRAC / SAES - Ministério da Saúde',
                    tamanhoBytes: 348160,
                    tamanhoFormatado: '340 KB',
                    disponivelLocal: false,
                    isMaisRecente: false,
                    urlDownload: 'https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/nota_tecnica_cgsi_sigtap_2026_08.pdf'
                },
                {
                    arquivo: 'nota_tecnica_cgsi_sigtap_2026_07.pdf',
                    tipo: 'nota_tecnica',
                    ano: 2026,
                    mes: 7,
                    mesNome: 'Julho',
                    numero: '07/2026',
                    competencia: 'Julho/2026',
                    titulo: 'Nota Técnica CGSI/SIGTAP nº 07/2026',
                    descricao: 'Alterações, inclusões e adequações oficiais da Tabela Unificada de Procedimentos do SUS',
                    orgaoEmissor: 'CGSI / DRAC / SAES - Ministério da Saúde',
                    tamanhoBytes: 327680,
                    tamanhoFormatado: '320 KB',
                    disponivelLocal: false,
                    isMaisRecente: false,
                    urlDownload: 'https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/nota_tecnica_cgsi_sigtap_2026_07.pdf'
                },
                {
                    arquivo: 'nota_tecnica_cgsi_sigtap_2026_06.pdf',
                    tipo: 'nota_tecnica',
                    ano: 2026,
                    mes: 6,
                    mesNome: 'Junho',
                    numero: '06/2026',
                    competencia: 'Junho/2026',
                    titulo: 'Nota Técnica CGSI/SIGTAP nº 06/2026',
                    descricao: 'Alterações, inclusões e adequações oficiais da Tabela Unificada de Procedimentos do SUS',
                    orgaoEmissor: 'CGSI / DRAC / SAES - Ministério da Saúde',
                    tamanhoBytes: 337920,
                    tamanhoFormatado: '330 KB',
                    disponivelLocal: false,
                    isMaisRecente: false,
                    urlDownload: 'https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/nota_tecnica_cgsi_sigtap_2026_06.pdf'
                },
                {
                    arquivo: 'nota_tecnica_cgsi_sigtap_2026_05.pdf',
                    tipo: 'nota_tecnica',
                    ano: 2026,
                    mes: 5,
                    mesNome: 'Maio',
                    numero: '05/2026',
                    competencia: 'Maio/2026',
                    titulo: 'Nota Técnica CGSI/SIGTAP nº 05/2026',
                    descricao: 'Alterações, inclusões e adequações oficiais da Tabela Unificada de Procedimentos do SUS',
                    orgaoEmissor: 'CGSI / DRAC / SAES - Ministério da Saúde',
                    tamanhoBytes: 317440,
                    tamanhoFormatado: '310 KB',
                    disponivelLocal: false,
                    isMaisRecente: false,
                    urlDownload: 'https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/nota_tecnica_cgsi_sigtap_2026_05.pdf'
                },
                {
                    arquivo: 'nota_tecnica_cgsi_sigtap_2026_04.pdf',
                    tipo: 'nota_tecnica',
                    ano: 2026,
                    mes: 4,
                    mesNome: 'Abril',
                    numero: '04/2026',
                    competencia: 'Abril/2026',
                    titulo: 'Nota Técnica CGSI/SIGTAP nº 04/2026',
                    descricao: 'Alterações, inclusões e adequações oficiais da Tabela Unificada de Procedimentos do SUS',
                    orgaoEmissor: 'CGSI / DRAC / SAES - Ministério da Saúde',
                    tamanhoBytes: 307200,
                    tamanhoFormatado: '300 KB',
                    disponivelLocal: false,
                    isMaisRecente: false,
                    urlDownload: 'https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/nota_tecnica_cgsi_sigtap_2026_04.pdf'
                }
            ]
        };
    }

    _atualizarStatusLocal(catalogo) {
        let totalBytes = 0;
        let totalLocais = 0;

        const checkItem = (item) => {
            const filePath = path.join(this.downloadsDir, item.arquivo);
            if (fs.existsSync(filePath)) {
                try {
                    const stat = fs.statSync(filePath);
                    item.disponivelLocal = true;
                    item.tamanhoLocalBytes = stat.size;
                    item.tamanhoFormatado = this._formatBytes(stat.size);
                    totalBytes += stat.size;
                    totalLocais++;
                } catch (e) {
                    item.disponivelLocal = false;
                }
            } else {
                item.disponivelLocal = false;
                if (!item.tamanhoFormatado && item.tamanhoBytes) {
                    item.tamanhoFormatado = this._formatBytes(item.tamanhoBytes);
                }
            }
        };

        if (catalogo.bpa && Array.isArray(catalogo.bpa)) {
            catalogo.bpa.forEach(checkItem);
        }
        if (catalogo.bdsia && Array.isArray(catalogo.bdsia)) {
            catalogo.bdsia.forEach(checkItem);
        }
        if (catalogo.notasTecnicas && Array.isArray(catalogo.notasTecnicas)) {
            catalogo.notasTecnicas.forEach(checkItem);
        }

        catalogo.resumo = {
            totalArquivosLocais: totalLocais,
            espacoOcupadoBytes: totalBytes,
            espacoOcupadoFormatado: this._formatBytes(totalBytes),
            versaoVigenteBpa: (catalogo.bpa && catalogo.bpa[0]) ? catalogo.bpa[0].arquivo : 'BPAMAG0500.exe',
            versaoVigenteBdsia: (catalogo.bdsia && catalogo.bdsia[0]) ? catalogo.bdsia[0].competencia : 'Agosto/2026 (rev. a)',
            ultimaNotaTecnica: (catalogo.notasTecnicas && catalogo.notasTecnicas[0]) ? catalogo.notasTecnicas[0].competencia : 'Setembro/2026',
            totalNotasDisponiveis: (catalogo.notasTecnicas && catalogo.notasTecnicas.length) || 6
        };
    }

    _formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const mb = bytes / (1024 * 1024);
        if (mb >= 1) {
            return `${mb.toFixed(1)} MB`;
        }
        const kb = bytes / 1024;
        return `${kb.toFixed(0)} KB`;
    }

    /**
     * Executa varredura no gateway HTTP do DATASUS para extrair listagem de arquivos
     */
    _fetchDatasusListing(targetUrl, timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
            const client = targetUrl.startsWith('https') ? https : http;
            const req = client.get(targetUrl, {
                headers: { 'User-Agent': 'FPA-ARGOS-Sync/4.0' },
                timeout: timeoutMs
            }, (res) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    let html = '';
                    res.on('data', chunk => { html += chunk; });
                    res.on('end', () => resolve(html));
                } else {
                    reject(new Error(`HTTP Status ${res.statusCode} ao consultar ${targetUrl}`));
                }
            });

            req.on('error', (err) => reject(err));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Timeout de conexão após ${timeoutMs}ms ao consultar ${targetUrl}`));
            });
        });
    }

    /**
     * Parser HTML de links em diretório Apache/FTP do DATASUS
     */
    _extractFilesFromHtml(html, regexPattern) {
        const found = new Set();
        const matches = html.matchAll(regexPattern);
        for (const match of matches) {
            const filename = match[1] || match[0];
            if (filename) found.add(filename);
        }
        return Array.from(found);
    }

    /**
     * Realiza a sincronização completa:
     * 1. Consulta DATASUS oficial
     * 2. Faz fallback transparente caso necessário
     * 3. Atualiza catálogo e baixa arquivos novos
     * 4. Aplica rotação estrita das 6 versões de BDSIA
     */
    async sync() {
        if (this.isSyncing) {
            return { emProgresso: true, mensagem: 'Sincronização já em andamento' };
        }

        this.isSyncing = true;
        console.log('[SiasusSyncService] Iniciando sincronização inteligente com DATASUS...');

        try {
            let catalogo = this.getCatalogo();
            let novasVersoesBpa = [];
            let novasVersoesBdsia = [];
            let origem = 'datasus_oficial';

            // 1. Tentar descoberta direta no DATASUS
            try {
                const htmlBpa = await this._fetchDatasusListing('http://ftp.datasus.gov.br/siasus/BPA/', 6000);
                const bpaFiles = this._extractFilesFromHtml(htmlBpa, /href="?(BPAMAG\d{4}\.exe)"?/gi);
                bpaFiles.forEach(f => {
                    const parsed = this.parseBpaFilename(f);
                    if (parsed) novasVersoesBpa.push(parsed);
                });
            } catch (errBpa) {
                console.warn('[SiasusSyncService] DATASUS BPA HTTP indisponível:', errBpa.message);
            }

            try {
                const htmlBdsia = await this._fetchDatasusListing('http://ftp.datasus.gov.br/siasus/SIA/', 6000);
                const bdsiaFiles = this._extractFilesFromHtml(htmlBdsia, /href="?(BDSIA\d{6}[a-z]?\.exe)"?/gi);
                bdsiaFiles.forEach(f => {
                    const parsed = this.parseBdsiaFilename(f);
                    if (parsed) novasVersoesBdsia.push(parsed);
                });
            } catch (errBdsia) {
                console.warn('[SiasusSyncService] DATASUS SIA HTTP indisponível:', errBdsia.message);
            }

            // 2. Se a varredura direta falhou completamente, acionar contingência no espelho GitHub
            if (novasVersoesBdsia.length === 0) {
                console.log('[SiasusSyncService] Acionando espelho de contingência para catalogar versões...');
                origem = 'espelho_contingencia';
                try {
                    const mirrorReadme = await this._fetchDatasusListing('https://raw.githubusercontent.com/RenatoKR/SIASUS/main/README.md', 6000);
                    const bdsiaMatches = this._extractFilesFromHtml(mirrorReadme, /BDSIA\d{6}[a-z]?\.exe/gi);
                    bdsiaMatches.forEach(f => {
                        const parsed = this.parseBdsiaFilename(f);
                        if (parsed) novasVersoesBdsia.push(parsed);
                    });

                    const bpaMatches = this._extractFilesFromHtml(mirrorReadme, /BPAMAG\d{4}\.exe/gi);
                    bpaMatches.forEach(f => {
                        const parsed = this.parseBpaFilename(f);
                        if (parsed) novasVersoesBpa.push(parsed);
                    });
                } catch (errMirror) {
                    console.warn('[SiasusSyncService] Espelho de contingência também inacessível:', errMirror.message);
                }
            }

            // 3. Mesclar e ordenar
            if (novasVersoesBdsia.length > 0) {
                // Ordenação decrescente: mais recentes primeiro
                novasVersoesBdsia.sort((a, b) => b.ordem - a.ordem);
                // Retém estritamente as 6 mais recentes
                catalogo.bdsia = novasVersoesBdsia.slice(0, this.retentionBdsia).map(item => ({
                    ...item,
                    urlDatasus: `http://ftp.datasus.gov.br/siasus/SIA/${item.arquivo}`,
                    urlEspelho: `https://github.com/RenatoKR/SIASUS/raw/main/bdsia/${item.arquivo}`
                }));
            }

            // 3.1. Inteligência Acumulativa do BPA:
            // Preserva versões anteriores já salvas no catálogo/banco quando novas versões surgirem
            const mapaBpa = new Map();
            novasVersoesBpa.forEach(b => mapaBpa.set(b.arquivo, b));
            if (catalogo.bpa && Array.isArray(catalogo.bpa)) {
                catalogo.bpa.forEach(b => {
                    if (!mapaBpa.has(b.arquivo)) mapaBpa.set(b.arquivo, b);
                });
            }

            const listaBpa = Array.from(mapaBpa.values());
            if (listaBpa.length > 0) {
                listaBpa.sort((a, b) => (b.ordem || 0) - (a.ordem || 0));
                catalogo.bpa = listaBpa.slice(0, 5).map((item, idx) => ({
                    ...item,
                    isVigente: (idx === 0),
                    titulo: `BPA Magnético v${item.versao || ''}`,
                    descricao: (idx === 0)
                        ? 'Instalador oficial do Boletim de Produção Ambulatorial do SUS (Versão Vigente)'
                        : 'Instalador oficial do Boletim de Produção Ambulatorial do SUS (Versão Anterior - Arquivo Histórico)',
                    urlDatasus: `http://ftp.datasus.gov.br/siasus/BPA/${item.arquivo}`,
                    urlEspelho: `https://github.com/RenatoKR/SIASUS/raw/main/bpa/${item.arquivo}`
                }));
            // 3.2. Sincronização Inteligente das Notas Técnicas do SIGTAP (Últimas 6 Publicadas)
            let novasNotasTecnicas = [];
            try {
                const mirrorSigtap = await this._fetchDatasusListing('https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/README.md', 6000);
                const ntMatches = this._extractFilesFromHtml(mirrorSigtap, /nota_tecnica_cgsi_sigtap_\d{4}_\d{2}\.pdf/gi);
                ntMatches.forEach(f => {
                    const parsed = this.parseNotaTecnicaFilename(f);
                    if (parsed) novasNotasTecnicas.push(parsed);
                });
            } catch (errNt) {
                // Silencioso se estiver offline ou usando contingência
            }

            const mapaNt = new Map();
            novasNotasTecnicas.forEach(n => mapaNt.set(n.arquivo, n));
            if (catalogo.notasTecnicas && Array.isArray(catalogo.notasTecnicas)) {
                catalogo.notasTecnicas.forEach(n => {
                    if (!mapaNt.has(n.arquivo)) mapaNt.set(n.arquivo, n);
                });
            }

            const listaNt = Array.from(mapaNt.values());
            if (listaNt.length > 0) {
                listaNt.sort((a, b) => b.ordem - a.ordem);
                catalogo.notasTecnicas = listaNt.slice(0, 6).map((item, idx) => ({
                    ...item,
                    isMaisRecente: (idx === 0),
                    urlDownload: `https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/${item.arquivo}`
                }));
            }

            // 4. Executar rotação e limpeza de arquivos obsoletos em disco
            this._rotacionarArquivosDisco(catalogo);

            // 5. Salvar catálogo atualizado
            catalogo.ultimaSincronizacao = new Date().toISOString();
            catalogo.statusDatasus = (origem === 'datasus_oficial') ? 'online' : 'espelho';
            catalogo.origem = origem;

            this._atualizarStatusLocal(catalogo);
            fs.writeFileSync(this.catalogoPath, JSON.stringify(catalogo, null, 2), 'utf8');

            console.log(`[SiasusSyncService] Sincronização concluída com sucesso (${origem}). ${catalogo.bdsia.length} versões BDSIA, ${catalogo.bpa.length} BPA e ${(catalogo.notasTecnicas || []).length} Notas Técnicas.`);
            this.lastSync = catalogo.ultimaSincronizacao;
            return {
                sucesso: true,
                origem,
                catalogo
            };
        } catch (globalErr) {
            console.error('[SiasusSyncService] Erro fatal durante sincronização:', globalErr);
            return {
                sucesso: false,
                erro: globalErr.message
            };
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Deleta arquivos locais que não estão mais na lista ativa (rotação das versões e notas)
     */
    _rotacionarArquivosDisco(catalogo) {
        try {
            if (!fs.existsSync(this.downloadsDir)) return;
            const permitidos = new Set();
            if (catalogo.bpa) catalogo.bpa.forEach(b => permitidos.add(b.arquivo));
            if (catalogo.bdsia) catalogo.bdsia.forEach(s => permitidos.add(s.arquivo));
            if (catalogo.notasTecnicas) catalogo.notasTecnicas.forEach(n => permitidos.add(n.arquivo));

            const filesOnDisk = fs.readdirSync(this.downloadsDir);
            for (const file of filesOnDisk) {
                const lower = file.toLowerCase();
                if ((lower.endsWith('.exe') || lower.endsWith('.pdf')) && !permitidos.has(file)) {
                    const filePath = path.join(this.downloadsDir, file);
                    try {
                        fs.unlinkSync(filePath);
                        console.log(`[SiasusSyncService] Rotação: Arquivo antigo removido do disco: ${file}`);
                    } catch (e) {
                        console.warn(`[SiasusSyncService] Não foi possível remover arquivo antigo ${file}:`, e.message);
                    }
                }
            }
        } catch (err) {
            console.warn('[SiasusSyncService] Erro durante rotação de disco:', err.message);
        }
    }

    /**
     * Retorna o caminho absoluto do arquivo para download
     */
    getArquivoLocal(nomeArquivo) {
        const cleanName = path.basename(nomeArquivo);
        const fullPath = path.join(this.downloadsDir, cleanName);
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
        return null;
    }

    /**
     * Download em segundo plano de um arquivo para o disco local se ainda não existir
     */
    async baixarParaCache(item) {
        const dest = path.join(this.downloadsDir, item.arquivo);
        if (fs.existsSync(dest)) return dest;

        const downloadFromUrl = (urlStr) => {
            return new Promise((resolve, reject) => {
                const client = urlStr.startsWith('https') ? https : http;
                const fileStream = fs.createWriteStream(dest + '.tmp');
                
                const req = client.get(urlStr, { timeout: 30000 }, (res) => {
                    if (res.statusCode === 301 || res.statusCode === 302) {
                        fileStream.close();
                        try { fs.unlinkSync(dest + '.tmp'); } catch(e){}
                        return downloadFromUrl(res.headers.location).then(resolve).catch(reject);
                    }
                    if (res.statusCode !== 200) {
                        fileStream.close();
                        try { fs.unlinkSync(dest + '.tmp'); } catch(e){}
                        return reject(new Error(`Status HTTP ${res.statusCode}`));
                    }
                    res.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close(() => {
                            fs.renameSync(dest + '.tmp', dest);
                            resolve(dest);
                        });
                    });
                });

                req.on('error', (err) => {
                    fileStream.close();
                    try { fs.unlinkSync(dest + '.tmp'); } catch(e){}
                    reject(err);
                });
            });
        };

        try {
            // Tenta primeiro no DATASUS
            return await downloadFromUrl(item.urlDatasus);
        } catch (errDatasus) {
            console.warn(`[SiasusSyncService] Falha ao baixar ${item.arquivo} do DATASUS, tentando espelho:`, errDatasus.message);
            if (item.urlEspelho) {
                return await downloadFromUrl(item.urlEspelho);
            }
            throw errDatasus;
        }
    }

    /**
     * Inicia a rotina de auto-sync a cada X milissegundos
     */
    startAutoSync(intervalMs = 21600000) { // 6 horas por padrão
        if (this.syncInterval) clearInterval(this.syncInterval);
        
        // Primeira verificação após 5 segundos do boot
        setTimeout(() => {
            this.sync().catch(err => console.warn('[SiasusSyncService] Erro no sync inicial:', err.message));
        }, 5000);

        this.syncInterval = setInterval(() => {
            console.log('[SiasusSyncService] Executando rotina agendada periódica de sync DATASUS...');
            this.sync().catch(err => console.warn('[SiasusSyncService] Erro no sync periódico:', err.message));
        }, intervalMs);

        if (this.syncInterval.unref) this.syncInterval.unref();
    }
}

module.exports = {
    SiasusSyncService
};
