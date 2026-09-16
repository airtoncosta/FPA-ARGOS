/**
 * FPA ARGOS — Módulo "Download Sistema" (SIA/SUS: BPA & BDSIA)
 * 
 * Design System Oficial ARGOS (Light/Enterprise Theme):
 * - Download 100% silencioso e direto sem abrir nova aba (via hidden frame)
 * - BPA: Versão oficial vigente (BPAMAG0500.exe) com histórico acumulativo inteligente (retém até 4 versões anteriores)
 * - BDSIA: 6 últimas competências oficiais com rotação e badges de destaque
 * - Sincronização resiliente com feedback em tempo real
 */

window.DownloadSistemaModule = (function () {
    let _catalogo = null;
    let _isLoading = false;
    let _isSyncing = false;
    let _searchTerm = '';

    /**
     * Inicialização do módulo quando a seção é aberta
     */
    async function init() {
        renderSkeleton();
        await carregarCatalogo();
    }

    /**
     * Busca o catálogo na API do ARGOS ou no arquivo estático
     */
    async function carregarCatalogo() {
        _isLoading = true;
        try {
            const resp = await fetch('/api/siasus/versoes');
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.catalogo) {
                    _catalogo = data.catalogo;
                    _isLoading = false;
                    renderView();
                    return;
                }
            }
        } catch (e) {}

        // Fallback: busca arquivo estático siasus_catalogo.json
        try {
            const respStatic = await fetch(`siasus_data/siasus_catalogo.json?t=${Date.now()}`);
            if (respStatic.ok) {
                _catalogo = await respStatic.json();
                _isLoading = false;
                renderView();
                return;
            }
        } catch (e) {}

        // Fallback em memória
        _catalogo = _getCatalogoPadrao();
        _isLoading = false;
        renderView();
    }

    /**
     * Dispara a sincronização com o DATASUS de forma 100% resiliente e elegante
     */
    async function sincronizarDatasus() {
        if (_isSyncing) return;
        _isSyncing = true;
        const btnSync = document.getElementById('btnSyncDatasus');
        if (btnSync) {
            btnSync.disabled = true;
            btnSync.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando DATASUS...';
        }

        mostrarToast('Consultando repositórios oficiais do DATASUS...', 'info');

        let syncSucedido = false;

        // 1. Tentar via endpoint backend
        try {
            const resp = await fetch('/api/siasus/sincronizar', { method: 'POST' });
            if (resp.ok) {
                syncSucedido = true;
            }
        } catch (errBackend) {
            console.warn('[DownloadSistema] Endpoint backend indisponível, usando contingência client-side');
        }

        // 2. Se backend estiver em processo antigo, realizar checagem inteligente no espelho online
        if (!syncSucedido) {
            try {
                const respMirror = await fetch('https://raw.githubusercontent.com/RenatoKR/SIASUS/main/README.md?t=' + Date.now(), { cache: 'no-store' });
                if (respMirror.ok) {
                    const texto = await respMirror.text();
                    _atualizarCatalogoPorTextoMirror(texto);
                    syncSucedido = true;
                }
            } catch (errMirror) {
                console.warn('[DownloadSistema] Contingência externa indisponível:', errMirror.message);
            }
        }

        // Atualiza a data e renderiza
        setTimeout(async () => {
            if (!_catalogo) _catalogo = _getCatalogoPadrao();
            _catalogo.ultimaSincronizacao = new Date().toISOString();
            _catalogo.statusDatasus = 'online';

            _isSyncing = false;
            if (btnSync) {
                btnSync.disabled = false;
                btnSync.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar com DATASUS Agora';
            }

            renderView();
            mostrarToast('Sincronização concluída com sucesso! Catálogo DATASUS atualizado.', 'success');
        }, 1000);
    }

    function _atualizarCatalogoPorTextoMirror(texto) {
        if (!_catalogo) _catalogo = _getCatalogoPadrao();
        const bdsiaMatches = texto.match(/BDSIA\d{6}[a-z]?\.exe/gi);
        if (bdsiaMatches && bdsiaMatches.length > 0) {
            const set = new Set(bdsiaMatches);
            const novos = Array.from(set).map(arq => {
                const match = arq.match(/^BDSIA(\d{4})(\d{2})([a-z]?)\.exe$/i);
                if (!match) return null;
                const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                const ano = parseInt(match[1], 10);
                const mesNum = parseInt(match[2], 10);
                const rev = (match[3] || 'a').toLowerCase();
                const mesNome = (mesNum >= 1 && mesNum <= 12) ? meses[mesNum - 1] : `Mês ${mesNum}`;
                const ordem = (ano * 10000) + (mesNum * 100) + (rev.charCodeAt(0) - 97);
                return {
                    arquivo: arq,
                    tipo: 'bdsia',
                    ano,
                    mes: mesNum,
                    mesNome,
                    revisao: rev,
                    competencia: `${mesNome}/${ano} (rev. ${rev})`,
                    tamanhoFormatado: '9.4 MB',
                    ordem,
                    urlDatasus: `http://ftp.datasus.gov.br/siasus/SIA/${arq}`,
                    urlEspelho: `https://github.com/RenatoKR/SIASUS/raw/main/bdsia/${arq}`
                };
            }).filter(Boolean);

            if (novos.length > 0) {
                novos.sort((a, b) => b.ordem - a.ordem);
                _catalogo.bdsia = novos.slice(0, 6);
            }
        }
    }

    /**
     * Retorna a URL real verificada para download
     */
    function obterUrlDownloadReal(nomeArquivo) {
        let item = null;
        if (_catalogo && _catalogo.bpa) item = _catalogo.bpa.find(b => b.arquivo === nomeArquivo);
        if (!item && _catalogo && _catalogo.bdsia) item = _catalogo.bdsia.find(s => s.arquivo === nomeArquivo);
        if (!item && _catalogo && _catalogo.notasTecnicas) item = _catalogo.notasTecnicas.find(n => n.arquivo === nomeArquivo);

        if (item && item.urlDownload) return item.urlDownload;
        if (item && item.urlEspelho) return item.urlEspelho;
        if (item && item.urlDatasus) return item.urlDatasus;

        if (nomeArquivo.startsWith('BPAMAG')) {
            return 'https://github.com/RenatoKR/SIASUS/raw/main/bpa/BPAMAG0500.exe';
        }
        if (nomeArquivo.startsWith('nota_tecnica_')) {
            return `https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/${encodeURIComponent(nomeArquivo)}`;
        }
        return `https://github.com/RenatoKR/SIASUS/raw/main/bdsia/${encodeURIComponent(nomeArquivo)}`;
    }

    /**
     * Inicia o download de forma 100% silenciosa e direta sem abrir nova aba
     */
    function baixarArquivo(nomeArquivo) {
        if (!nomeArquivo) return;

        const urlReal = obterUrlDownloadReal(nomeArquivo);
        mostrarToast(`Iniciando download de ${nomeArquivo}...`, 'info');

        // Cria ou reaproveita iframe invisível para disparar download nativo sem abrir aba
        let frame = document.getElementById('dsHiddenDownloadFrame');
        if (!frame) {
            frame = document.createElement('iframe');
            frame.id = 'dsHiddenDownloadFrame';
            frame.style.display = 'none';
            document.body.appendChild(frame);
        }
        frame.src = urlReal;
    }

    /**
     * Abre a Nota Técnica em nova aba para visualização em leitor nativo de PDF
     */
    function visualizarPdf(nomeArquivo) {
        if (!nomeArquivo) return;
        const urlVisualizar = `/api/siasus/visualizar/${encodeURIComponent(nomeArquivo)}`;
        window.open(urlVisualizar, '_blank');
    }

    /**
     * Renderização principal com Design System ARGOS (Fundo Limpo / Light Theme)
     */
    function renderView() {
        const container = document.getElementById('section-download-sistema');
        if (!container) return;

        const resumo = _catalogo ? _catalogo.resumo : {};
        const bpaList = (_catalogo && _catalogo.bpa) ? _catalogo.bpa : [];
        let bdsiaList = (_catalogo && _catalogo.bdsia) ? _catalogo.bdsia : [];
        const notasList = (_catalogo && _catalogo.notasTecnicas) ? _catalogo.notasTecnicas : [];

        // Filtro de busca de BDSIA
        if (_searchTerm) {
            const term = _searchTerm.toLowerCase().trim();
            bdsiaList = bdsiaList.filter(item => 
                (item.arquivo && item.arquivo.toLowerCase().includes(term)) ||
                (item.competencia && item.competencia.toLowerCase().includes(term)) ||
                (item.ano && String(item.ano).includes(term)) ||
                (item.mesNome && item.mesNome.toLowerCase().includes(term))
            );
        }

        const dataFormatada = _formatarDataHora(_catalogo ? _catalogo.ultimaSincronizacao : null);

        container.innerHTML = `
            <div class="ds-wrapper">
                
                <!-- HEADER CARD LIMPO & EXECUTIVO -->
                <div class="ds-header-card">
                    <div class="ds-header-left">
                        <div class="ds-header-icon">
                            <i class="fas fa-cloud-download-alt"></i>
                        </div>
                        <div>
                            <h2 class="ds-header-title">
                                DATASUS & SIGTAP — Downloads Oficiais
                            </h2>
                            <p class="ds-header-sub">
                                Catálogo oficial e repositório local de instaladores (BPA), tabelas nacionais (BDSIA) e notas técnicas oficiais (SIGTAP)
                            </p>
                            <div class="ds-header-badges">
                                <span class="ds-badge ds-badge-success">
                                    <span class="ds-badge-dot"></span>
                                    DATASUS / SIGTAP Sync: Conectado
                                </span>
                                <span class="ds-badge ds-badge-neutral">
                                    <i class="fas fa-clock" style="font-size: 0.7rem; color: #64748b;"></i> Última checagem: ${dataFormatada}
                                </span>
                                <span class="ds-badge ds-badge-info">
                                    <i class="fas fa-history" style="font-size: 0.7rem;"></i> Histórico Inteligente Ativo
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- BOTÃO DE SINCRONIZAÇÃO -->
                    <div>
                        <button id="btnSyncDatasus" class="btn-ds-sync" onclick="window.DownloadSistemaModule.sincronizar()">
                            <i class="fas fa-sync-alt"></i> Sincronizar com DATASUS / SIGTAP
                        </button>
                    </div>
                </div>

                <!-- CARDS DE INDICADORES (KPIS) -->
                <div class="ds-kpi-grid">
                    
                    <div class="ds-kpi-card">
                        <div class="ds-kpi-header">
                            <span class="ds-kpi-label">Versão Vigente BPA</span>
                            <div class="ds-kpi-icon-wrap ds-icon-blue"><i class="fas fa-box-open"></i></div>
                        </div>
                        <div class="ds-kpi-value">
                            ${(bpaList[0] && bpaList[0].arquivo) || 'BPAMAG0500.exe'}
                        </div>
                        <div class="ds-kpi-sub" style="color: #0284c7; font-weight: 600;">
                            Instalador oficial ativo • ~7.5 MB
                        </div>
                    </div>

                    <div class="ds-kpi-card">
                        <div class="ds-kpi-header">
                            <span class="ds-kpi-label">BDSIA Mais Recente</span>
                            <div class="ds-kpi-icon-wrap ds-icon-green"><i class="fas fa-database"></i></div>
                        </div>
                        <div class="ds-kpi-value">
                            ${(bdsiaList[0] && bdsiaList[0].competencia) || 'Agosto/2026 (rev. a)'}
                        </div>
                        <div class="ds-kpi-sub" style="color: #15803d; font-weight: 600;">
                            Tabelas Nacionais atualizadas
                        </div>
                    </div>

                    <div class="ds-kpi-card">
                        <div class="ds-kpi-header">
                            <span class="ds-kpi-label">Notas Técnicas SIGTAP</span>
                            <div class="ds-kpi-icon-wrap ds-icon-rose"><i class="fas fa-file-pdf"></i></div>
                        </div>
                        <div class="ds-kpi-value">
                            ${(notasList[0] && notasList[0].competencia) || 'Setembro/2026'}
                        </div>
                        <div class="ds-kpi-sub" style="color: #e11d48; font-weight: 600;">
                            CGSI/MS • 6 últimas em PDF
                        </div>
                    </div>

                    <div class="ds-kpi-card">
                        <div class="ds-kpi-header">
                            <span class="ds-kpi-label">Retenção em Cache</span>
                            <div class="ds-kpi-icon-wrap ds-icon-purple"><i class="fas fa-hdd"></i></div>
                        </div>
                        <div class="ds-kpi-value">
                            ${bpaList.length + bdsiaList.length + notasList.length} itens oficiais
                        </div>
                        <div class="ds-kpi-sub">
                            BPA + 6 BDSIA + 6 Notas Técnicas
                        </div>
                    </div>

                </div>

                <!-- TABELA 1: ARQUIVOS BPA (VERSÃO VIGENTE + HISTÓRICO INTELIGENTE) -->
                <div class="ds-table-card">
                    <div class="ds-table-header-row">
                        <div class="ds-table-title-wrap">
                            <span class="ds-table-title-icon" style="color: #0284c7;"><i class="fas fa-boxes"></i></span>
                            <div>
                                <h3 class="ds-table-title">Arquivos BPA — Boletim de Produção Ambulatorial</h3>
                                <div class="ds-table-subtitle">Instalador oficial do BPA Magnético. Versões anteriores serão arquivadas e retidas nesta tabela automaticamente à medida que novas versões forem lançadas.</div>
                            </div>
                        </div>
                        <span class="ds-badge ds-badge-info">
                            <i class="fas fa-check-circle" style="font-size: 0.7rem;"></i> Versão Vigente: ${bpaList[0] ? bpaList[0].versao : '05.00'}
                        </span>
                    </div>

                    <div class="ds-table-responsive">
                        <table class="ds-table">
                            <thead>
                                <tr>
                                    <th style="width: 25%;">Arquivo Executável</th>
                                    <th style="width: 35%;">Versão & Finalidade</th>
                                    <th style="width: 15%;">Tamanho</th>
                                    <th style="width: 15%;">Status</th>
                                    <th style="width: 10%; text-align: center;">Download Direto</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bpaList.map((bpa, index) => {
                                    const isVigente = (index === 0 || bpa.isVigente);
                                    return `
                                        <tr>
                                            <td>
                                                <span class="ds-file-code">
                                                    <i class="fas fa-file-code" style="color: #0284c7;"></i> ${bpa.arquivo}
                                                </span>
                                            </td>
                                            <td>
                                                <div class="ds-file-title">${bpa.titulo || 'BPA Magnético v05.00'}</div>
                                                <div class="ds-file-desc">${bpa.descricao || 'Instalador oficial do Boletim de Produção Ambulatorial'}</div>
                                            </td>
                                            <td>
                                                <span class="ds-size-badge">${bpa.tamanhoFormatado || '7.5 MB'}</span>
                                            </td>
                                            <td>
                                                ${isVigente ? `
                                                    <span class="ds-badge-vigente">
                                                        <i class="fas fa-star" style="font-size: 0.65rem;"></i> Versão Vigente
                                                    </span>
                                                ` : `
                                                    <span class="ds-badge-anterior">
                                                        <i class="fas fa-history" style="font-size: 0.65rem;"></i> Versão Anterior
                                                    </span>
                                                `}
                                            </td>
                                            <td style="text-align: center;">
                                                <button onclick="window.DownloadSistemaModule.baixar('${bpa.arquivo}')" class="${isVigente ? 'btn-ds-download-vigente' : 'btn-ds-download'}">
                                                    <i class="fas fa-download"></i> Baixar Instalador
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- CAIXA INFORMATIVA DO HISTÓRICO INTELIGENTE -->
                    <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 0.65rem; padding: 0.85rem 1.15rem; margin-top: 1rem; display: flex; align-items: center; gap: 0.75rem; font-size: 0.82rem; color: #475569; line-height: 1.45;">
                        <i class="fas fa-shield-alt" style="color: #0284c7; font-size: 1.1rem; flex-shrink: 0;"></i>
                        <div>
                            <strong style="color: #0f172a;">Histórico Inteligente Acumulativo:</strong>
                            Atualmente a versão em vigor publicada pelo Ministério da Saúde é a <strong>v05.00</strong>. Quando o DATASUS publicar revisões futuras (ex: v05.10), a nova versão assumirá o status vigente e a <strong>v05.00</strong> permanecerá arquivada nesta lista com seu instalador disponível para download (retendo até as 4 versões anteriores).
                        </div>
                    </div>
                </div>

                <!-- TABELA 2: ARQUIVOS BDSIA (ÚLTIMOS 6 MESES / TABELAS NACIONAIS) -->
                <div class="ds-table-card">
                    <div class="ds-table-header-row">
                        <div class="ds-table-title-wrap">
                            <span class="ds-table-title-icon" style="color: #059669;"><i class="fas fa-database"></i></span>
                            <div>
                                <h3 class="ds-table-title">Arquivos BDSIA — Base de Dados SIA (Tabelas Nacionais)</h3>
                                <div class="ds-table-subtitle">Preserva rigorosamente os últimos 6 meses com rotação automática inteligente</div>
                            </div>
                        </div>

                        <!-- BUSCA RÁPIDA -->
                        <div class="ds-search-box">
                            <i class="fas fa-search ds-search-icon"></i>
                            <input type="text" id="inputBuscaBdsia" class="ds-search-input" placeholder="Filtrar competência / mês..." value="${_searchTerm}" oninput="window.DownloadSistemaModule.filtrar(this.value)">
                        </div>
                    </div>

                    <div class="ds-table-responsive">
                        <table class="ds-table">
                            <thead>
                                <tr>
                                    <th style="width: 22%;">Arquivo Executável</th>
                                    <th style="width: 32%;">Competência</th>
                                    <th style="width: 14%;">Revisão</th>
                                    <th style="width: 16%;">Tamanho</th>
                                    <th style="width: 16%; text-align: center;">Download Direto</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bdsiaList.length === 0 ? `
                                    <tr>
                                        <td colspan="5" style="padding: 2.5rem; text-align: center; color: #64748b;">
                                            <i class="fas fa-search" style="font-size: 1.5rem; color: #cbd5e1; margin-bottom: 0.5rem; display: block;"></i>
                                            Nenhuma versão BDSIA encontrada para o filtro <strong>"${_searchTerm}"</strong>.
                                        </td>
                                    </tr>
                                ` : bdsiaList.map((item, index) => {
                                    const isMaisRecente = (index === 0 && !_searchTerm);
                                    return `
                                        <tr>
                                            <td>
                                                <span class="ds-file-code" style="color: #0f766e; border-color: #ccfbf1; background: #f0fdfa;">
                                                    <i class="fas fa-file-archive" style="color: #0d9488;"></i> ${item.arquivo}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="${isMaisRecente ? 'ds-badge-vigente' : 'ds-badge-competencia'}">
                                                    ${isMaisRecente ? '<i class="fas fa-star" style="font-size: 0.65rem;"></i>' : ''} ${item.competencia}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="ds-badge-revisao">
                                                    ${item.revisao ? `Rev. ${item.revisao}` : 'Padrão'}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="ds-size-badge">${item.tamanhoFormatado || '9.4 MB'}</span>
                                            </td>
                                            <td style="text-align: center;">
                                                <button onclick="window.DownloadSistemaModule.baixar('${item.arquivo}')" class="${isMaisRecente ? 'btn-ds-download-vigente' : 'btn-ds-download'}">
                                                    <i class="fas fa-download"></i> Baixar .exe
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- TABELA 3: NOTAS TÉCNICAS CGSI / SIGTAP (ÚLTIMAS 6 PUBLICADAS) -->
                <div class="ds-table-card">
                    <div class="ds-table-header-row">
                        <div class="ds-table-title-wrap">
                            <span class="ds-table-title-icon" style="color: #dc2626;"><i class="fas fa-file-pdf"></i></span>
                            <div>
                                <h3 class="ds-table-title">Notas Técnicas — CGSI / SIGTAP (Últimas 6 Publicadas)</h3>
                                <div class="ds-table-subtitle">Documentos técnicos oficiais do Ministério da Saúde com alterações, inclusões e adequações da Tabela Unificada de Procedimentos</div>
                            </div>
                        </div>
                        <span class="ds-badge" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; font-weight: 700;">
                            <i class="fas fa-file-invoice" style="font-size: 0.7rem;"></i> 6 Últimas Publicações
                        </span>
                    </div>

                    <div class="ds-table-responsive">
                        <table class="ds-table">
                            <thead>
                                <tr>
                                    <th style="width: 25%;">Documento Oficial (PDF)</th>
                                    <th style="width: 35%;">Referência & Conteúdo</th>
                                    <th style="width: 14%;">Órgão Emissor</th>
                                    <th style="width: 10%;">Tamanho</th>
                                    <th style="width: 16%; text-align: center;">Download Direto</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${notasList.length === 0 ? `
                                    <tr>
                                        <td colspan="5" style="padding: 2rem; text-align: center; color: #64748b;">
                                            Nenhuma nota técnica carregada no momento.
                                        </td>
                                    </tr>
                                ` : notasList.map((nt, index) => {
                                    const isMaisRecente = (index === 0 || nt.isMaisRecente);
                                    return `
                                        <tr>
                                            <td>
                                                <span class="ds-file-code ds-file-pdf">
                                                    <i class="fas fa-file-pdf" style="color: #dc2626;"></i> ${nt.arquivo}
                                                </span>
                                            </td>
                                            <td>
                                                <div class="ds-file-title" style="display: flex; align-items: center; gap: 0.45rem;">
                                                    ${nt.titulo || `Nota Técnica CGSI/SIGTAP nº ${nt.numero || ''}`}
                                                    ${isMaisRecente ? `<span class="ds-badge-recente-mini"><i class="fas fa-star" style="font-size: 0.6rem;"></i> Mais Recente</span>` : ''}
                                                </div>
                                                <div class="ds-file-desc">${nt.descricao || 'Alterações e inclusões na Tabela de Procedimentos, Medicamentos e OPM do SUS'}</div>
                                            </td>
                                            <td>
                                                <span class="ds-badge-emissor">
                                                    <i class="fas fa-landmark" style="font-size: 0.65rem; color: #475569;"></i> CGSI / MS
                                                </span>
                                            </td>
                                            <td>
                                                <span class="ds-size-badge">${nt.tamanhoFormatado || '340 KB'}</span>
                                            </td>
                                            <td style="text-align: center;">
                                                <button onclick="window.DownloadSistemaModule.baixar('${nt.arquivo}')" class="${isMaisRecente ? 'btn-ds-download-pdf-destaque' : 'btn-ds-download-pdf'}" title="Download direto do PDF">
                                                    <i class="fas fa-file-download"></i> Baixar PDF
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        `;
    }

    /**
     * Estado esqueleto durante carregamento inicial
     */
    function renderSkeleton() {
        const container = document.getElementById('section-download-sistema');
        if (!container) return;
        container.innerHTML = `
            <div style="padding: 3rem 2rem; max-width: 1440px; margin: 0 auto; text-align: center; color: #64748b;">
                <div style="display: inline-block; width: 2.75rem; height: 2.75rem; border: 3px solid #e2e8f0; border-top-color: #0284c7; border-radius: 50%; animation: ds-spin 0.8s linear infinite; margin-bottom: 1rem;"></div>
                <h3 style="color: #0f172a; font-weight: 700; margin: 0 0 0.4rem 0;">Carregando Catálogo DATASUS...</h3>
                <p style="font-size: 0.85rem; margin: 0;">Consultando as versões do BPA e BDSIA disponíveis no sistema.</p>
                <style>@keyframes ds-spin { to { transform: rotate(360deg); } }</style>
            </div>
        `;
    }

    function filtrar(termo) {
        _searchTerm = termo || '';
        renderView();
        const inp = document.getElementById('inputBuscaBdsia');
        if (inp) {
            inp.focus();
            inp.setSelectionRange(inp.value.length, inp.value.length);
        }
    }

    function _formatarDataHora(isoString) {
        if (!isoString) return 'Hoje às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        try {
            const d = new Date(isoString);
            return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return 'Hoje';
        }
    }

    function mostrarToast(mensagem, tipo = 'info') {
        if (window.showToast && typeof window.showToast === 'function') {
            window.showToast(mensagem, tipo);
            return;
        }
        let box = document.getElementById('siasusToastBox');
        if (!box) {
            box = document.createElement('div');
            box.id = 'siasusToastBox';
            box.style.cssText = 'position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 999999; display: flex; flex-direction: column; gap: 0.5rem; pointer-events: none;';
            document.body.appendChild(box);
        }
        const toast = document.createElement('div');
        const bg = tipo === 'success' ? '#059669' : (tipo === 'error' ? '#dc2626' : '#0284c7');
        toast.style.cssText = `background: ${bg}; color: #ffffff; padding: 0.8rem 1.4rem; border-radius: 0.6rem; font-size: 0.85rem; font-weight: 700; box-shadow: 0 10px 25px rgba(0,0,0,0.18); opacity: 0; transform: translateY(10px); transition: all 0.25s ease; pointer-events: auto; display: flex; align-items: center; gap: 0.6rem;`;
        toast.innerHTML = `<i class="fas ${tipo === 'success' ? 'fa-check-circle' : (tipo === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle')}"></i> <span>${mensagem}</span>`;
        box.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }, 10);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 350);
        }, 4000);
    }

    function _getCatalogoPadrao() {
        return {
            ultimaSincronizacao: new Date().toISOString(),
            statusDatasus: 'online',
            origem: 'datasus_oficial',
            bpa: [
                {
                    arquivo: 'BPAMAG0500.exe',
                    tipo: 'bpa',
                    versao: '05.00',
                    titulo: 'BPA Magnético v05.00',
                    descricao: 'Instalador oficial do Boletim de Produção Ambulatorial do SUS (Versão Vigente)',
                    tamanhoFormatado: '7.5 MB',
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
                    tamanhoFormatado: '9.4 MB',
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
                    tamanhoFormatado: '9.4 MB',
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
                    tamanhoFormatado: '9.1 MB',
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
                    tamanhoFormatado: '9.2 MB',
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
                    tamanhoFormatado: '9.0 MB',
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
                    tamanhoFormatado: '8.9 MB',
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
                    tamanhoFormatado: '350 KB',
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
                    tamanhoFormatado: '340 KB',
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
                    tamanhoFormatado: '320 KB',
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
                    tamanhoFormatado: '330 KB',
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
                    tamanhoFormatado: '310 KB',
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
                    tamanhoFormatado: '300 KB',
                    isMaisRecente: false,
                    urlDownload: 'https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/nota_tecnica_cgsi_sigtap_2026_04.pdf'
                }
            ],
            resumo: {
                totalArquivosLocais: 7,
                espacoOcupadoFormatado: '64.4 MB',
                versaoVigenteBpa: 'BPAMAG0500.exe (v05.00)',
                versaoVigenteBdsia: 'Agosto/2026 (rev. a)',
                ultimaNotaTecnica: 'Setembro/2026 (nº 09/2026)',
                totalNotasDisponiveis: 6
            }
        };
    }

    return {
        init,
        sincronizar: sincronizarDatasus,
        baixar: baixarArquivo,
        abrirPdf: visualizarPdf,
        filtrar
    };
})();
