/**
 * ARGOS — app.js v4.0
 * Lógica principal da aplicação — SIA/SUS Multi-Município
 */

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
    bindNavigation();
    bindFilters();
    bindImport();
    bindImportSigtap();
    bindImportPortaria();
    bindArgosIA();
    bindModals();
    bindLimparDados();
    bindLogoUpload();
    bindReports();
    bindSupabase(); // Inicializa o controle do modal e ações do Supabase

    // Carregar dados do banco de dados ou fallback para empty/demo
    try {
        const savedSigtap = await AppDB.getItem('SIGTAP_DB');
        if (savedSigtap) {
            window.SIGTAP = { ...(window.SIGTAP || {}), ...savedSigtap };
        }

        // Se conectado ao Supabase, tenta sincronizar SIGTAP e Logo antes de carregar o faturamento local
        if (SupabaseConfig.isConnected()) {
            try {
                showToast('🔄 Sincronizando dados do Supabase...', 'info');
                
                // 1. Carregar Logo do Supabase
                const cloudLogo = await SupabaseService.loadLogo();
                if (cloudLogo) {
                    localStorage.setItem('argos_custom_logo', cloudLogo);
                    updateLogoPreview();
                }

                // Carregar Histórico de Logos do Supabase
                const cloudHistory = await SupabaseService.loadLogoHistory();
                if (cloudHistory && Array.isArray(cloudHistory) && cloudHistory.length > 0) {
                    let localHistory = await AppDB.getItem('logos_history') || [];
                    let merged = [...new Set([...cloudHistory, ...localHistory])].slice(0, 10);
                    await AppDB.setItem('logos_history', merged);
                    renderLogoHistory();
                }

                // 2. Carregar SIGTAP do Supabase
                const cloudSigtap = await SupabaseService.loadSigtap();
                if (cloudSigtap && Object.keys(cloudSigtap).length > 0) {
                    window.SIGTAP = { ...(window.SIGTAP || {}), ...cloudSigtap };
                    await AppDB.setItem('SIGTAP_DB', window.SIGTAP);
                    
                    const sigtapMeta = await AppDB.getItem('sigtap_meta') || { fileName: 'Nuvem Supabase', importDate: 'Sincronizado' };
                    await AppDB.setItem('sigtap_meta', sigtapMeta);
                }

                // 3. Carregar Portaria do Supabase
                try {
                    const cloudPortaria = await SupabaseService.loadPortariaDb();
                    if (cloudPortaria && Object.keys(cloudPortaria).length > 0) {
                        const localPortaria = await AppDB.getItem('PORTARIA_DB') || {};
                        const mergedPortaria = { ...localPortaria, ...cloudPortaria };
                        await AppDB.setItem('PORTARIA_DB', mergedPortaria);
                    }
                } catch (portariaCloudErr) {
                    console.error("Erro ao carregar portaria do Supabase na inicialização:", portariaCloudErr);
                }

                // Indica que o Supabase está conectado e ativo mudando a aparência do botão
                const btnCloud = document.getElementById('btnConfigSupabase');
                if (btnCloud) {
                    btnCloud.style.backgroundColor = 'rgba(62, 207, 142, 0.15)';
                    btnCloud.style.borderColor = '#3ecf8e';
                }
            } catch (cloudErr) {
                console.error("Erro de sincronização inicial com Supabase:", cloudErr);
                showToast('⚠️ Erro ao sincronizar dados da nuvem. Usando local...', 'warn');
            }
        }

        // Configurar aba de importação de portaria (visível para ADM ou Superintendente com perm_importar)
        const userSession = JSON.parse(sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user') || 'null');
        const tabImportPortaria = document.getElementById('tabImportPortaria');
        if (tabImportPortaria) {
            if (userSession && (userSession.role === 'ADM' || (userSession.role === 'SUPERINTENDENTE' && userSession.perm_importar))) {
                tabImportPortaria.classList.remove('hidden');
            } else {
                tabImportPortaria.classList.add('hidden');
            }
        }

        // Inicializar UI multi-município (v4.0)
        if (window.MunicipioContext) {
            await MunicipioContext.initUI();
        }

        // CARREGAR DADOS: tentar município ativo do Supabase, senão fallback local
        let dadosCarregados = false;
        const municipioAtivo = window.MunicipioContext ? MunicipioContext.getAtivo() : null;
        let autoLoadId = municipioAtivo ? municipioAtivo.id : null;

        // Auto-carregar o município vinculado para GERENTE se não houver contexto ativo
        if (!autoLoadId && userSession && userSession.role === 'GERENTE' && userSession.municipio_vinculado && SupabaseConfig.isConnected()) {
             const parts = userSession.municipio_vinculado.split('-');
             const nomeMun = parts[0].trim();
             const ufMun = parts.length > 1 ? parts[1].trim() : '';
             try {
                 autoLoadId = await SupabaseService.registrarMunicipio(nomeMun, ufMun);
             } catch(e) {
                 console.error('Erro ao obter id do municipio vinculado', e);
             }
        }

        if (autoLoadId && SupabaseConfig.isConnected()) {
            // Tentar carregar do município ativo previamente salvo
            try {
                dadosCarregados = await MunicipioContext.carregarMunicipio(autoLoadId);
            } catch (ctxErr) {
                console.error('Erro ao carregar município ativo do Supabase:', ctxErr);
            }
        }

        if (!dadosCarregados) {
            // Fallback: Carregar do IndexedDB local
            const savedDatasets = await AppDB.getItem('datasets');
            if (savedDatasets && savedDatasets.length > 0) {
                window.datasets = savedDatasets;
                const agg = buildAggregatedData(window.datasets);
                await PortariaModule.loadPortariaForMunicipio(agg.municipio, agg.uf);
                loadData(agg);
                showToast(`✅ ${window.datasets.length} competência(s) carregada(s) do banco local!`, 'success');
            } else {
                window.datasets = [];
                loadData(getEmptyData());

                const isVisitor = userSession && userSession.role === 'VISITANTE';
                const hasVinculado = userSession && userSession.municipio_vinculado;
                if (!isVisitor && !hasVinculado) {
                    showModal('modalImportar');
                    showToast('💡 Nenhum dado salvo. Importe um arquivo ou carregue os dados de demonstração.', 'info');
                } else {
                    showToast('💡 Nenhum dado de faturamento foi encontrado no banco de dados local.', 'info');
                }
            }
        }

        await renderArquivosManager();
        
        // Inicializar o estado visual correto da aba ativa
        navigateTo('teto-mac');
    } catch(e) {
        console.error("Exceção na inicialização:", e);
        // Apresenta uma mensagem de aviso mais amigável, conforme solicitado
        showToast('ℹ️ Verificação de cache local concluída.', 'info');
    }
});

function bindLimparDados() {
    document.getElementById('btnLimparDados')?.addEventListener('click', async () => {
        if (confirm('Tem certeza que deseja apagar todos os dados de faturamento do banco local? Essa ação não pode ser desfeita.')) {
            // Limpar cache do município ativo (v4.0)
            const municipioAtivo = window.MunicipioContext ? MunicipioContext.getAtivo() : null;
            if (municipioAtivo && municipioAtivo.id) {
                await AppDB.removeItem('datasets_' + municipioAtivo.id);
            }
            await AppDB.removeItem('datasets');
            window.datasets = [];
            APP_STATE.data = null;
            APP_STATE.filteredData = null;
            
            try {
                const imports = await AppDB.getItem('imported_files') || [];
                const sigtapOnly = imports.filter(i => i.type === 'SIGTAP');
                await AppDB.setItem('imported_files', sigtapOnly);
                await renderArquivosManager();
            } catch (err) {
                console.error("Erro ao limpar histórico:", err);
            }
            
            loadData(getEmptyData());

            // MENSAGEM CORPORATIVA E PROFISSIONAL
            const overlay = document.createElement('div');
            overlay.className = 'premium-success-overlay';
            overlay.innerHTML = `
                <div class="corporate-success-card">
                    <div class="corporate-success-header">
                        <i class="fas fa-check-circle corporate-success-icon"></i>
                        <h3 class="corporate-success-title">Limpeza de Dados Concluída</h3>
                    </div>
                    <div class="corporate-success-body">
                        <p class="corporate-success-text">
                            O cache local de faturamento foi apagado com sucesso. Os registros antigos foram removidos do ambiente para garantir a integridade das novas análises.
                        </p>
                        <div class="corporate-success-step">
                            <i class="fas fa-info-circle"></i>
                            <span><strong>Próximo passo:</strong> Selecione um município a partir dos arquivos importados para carregar uma nova base de dados.</span>
                        </div>
                    </div>
                    <div class="corporate-success-footer">
                        <button id="btnPremiumContinue" class="btn-corporate-continue">
                            Avançar para Seleção <i class="fas fa-arrow-right"></i>
                        </button>
                    </div>
                </div>
                <style>
                    .premium-success-overlay {
                        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                        background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px);
                        display: flex; align-items: center; justify-content: center; z-index: 999999;
                        animation: fadeInOverlay 0.3s ease forwards;
                    }
                    .corporate-success-card {
                        background: #ffffff;
                        border-radius: 10px;
                        width: 100%; max-width: 460px;
                        box-shadow: 0 20px 40px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
                        overflow: hidden;
                        font-family: 'Inter', sans-serif;
                        animation: slideUpCard 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    }
                    .corporate-success-header {
                        background: #f8fafc;
                        padding: 22px 24px 18px;
                        border-bottom: 1px solid #e2e8f0;
                        display: flex; align-items: center; gap: 12px;
                    }
                    .corporate-success-icon {
                        font-size: 26px; color: #10b981;
                    }
                    .corporate-success-title {
                        color: #0f172a; font-size: 1.2rem; font-weight: 700; margin: 0;
                        letter-spacing: -0.3px;
                    }
                    .corporate-success-body {
                        padding: 24px;
                    }
                    .corporate-success-text {
                        color: #475569; font-size: 0.95rem; line-height: 1.55; margin: 0 0 20px 0;
                    }
                    .corporate-success-step {
                        background: #f0f9ff; border: 1px solid #bae6fd; border-left: 3px solid #0ea5e9;
                        padding: 14px 16px; border-radius: 6px;
                        display: flex; align-items: flex-start; gap: 12px;
                        color: #0369a1; font-size: 0.9rem; line-height: 1.5;
                    }
                    .corporate-success-step i { margin-top: 3px; font-size: 1.1rem; }
                    .corporate-success-footer {
                        padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0;
                        display: flex; justify-content: flex-end;
                    }
                    .btn-corporate-continue {
                        background: #0A4B8C; color: white; border: none;
                        padding: 10px 22px; border-radius: 6px; font-size: 0.95rem; font-weight: 600;
                        cursor: pointer; transition: all 0.2s;
                        display: flex; align-items: center; gap: 8px;
                    }
                    .btn-corporate-continue:hover {
                        background: #083c70; transform: translateY(-1px); box-shadow: 0 4px 8px -1px rgba(10, 75, 140, 0.25);
                    }
                    @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes slideUpCard { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                </style>
            `;
            document.body.appendChild(overlay);

            document.getElementById('btnPremiumContinue').addEventListener('click', () => {
                overlay.style.animation = 'fadeInOverlay 0.3s ease reverse forwards';
                setTimeout(() => {
                    overlay.remove();
                    showModal('modalImportar');
                }, 300);
            });
        }
    });
}

async function renderLogoHistory() {
    const list = document.getElementById('logoHistoryList');
    const container = document.getElementById('logoHistoryContainer');
    if (!list || !container) return;

    try {
        // Verifica perfil do usuário logado
        const userStr = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        let isGerenteRestrito = false;
        let vinculado = null;
        if (userStr) {
            try { 
                const currentUser = JSON.parse(userStr);
                if (currentUser.role === 'GERENTE' && !currentUser.acesso_multi_municipio && currentUser.municipio_vinculado) {
                    isGerenteRestrito = true;
                    vinculado = currentUser.municipio_vinculado;
                }
            } catch(e){}
        }

        if (isGerenteRestrito) {
            container.style.display = 'none';
            return;
        }

        let history = await AppDB.getItem('logos_history') || [];

        if (!history || history.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        list.innerHTML = '';
        
        const activeLogo = localStorage.getItem('argos_custom_logo');

        history.forEach(base64 => {
            const wrapper = document.createElement('div');
            wrapper.className = 'logo-history-item-wrapper';

            const img = document.createElement('img');
            img.src = base64;
            img.className = 'logo-history-item';
            if (activeLogo === base64) img.classList.add('active');

            const btnDelete = document.createElement('div');
            btnDelete.className = 'logo-history-delete';
            btnDelete.innerHTML = '<i class="fas fa-times"></i>';
            if (isGerenteRestrito) {
                btnDelete.style.display = 'none';
            }

            btnDelete.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Tem certeza que deseja remover esta logomarca do histórico?')) {
                    const newHistory = history.filter(h => h !== base64);
                    await AppDB.setItem('logos_history', newHistory);
                    
                    if (SupabaseConfig.isConnected()) {
                        try {
                            await SupabaseService.saveLogoHistory(newHistory);
                        } catch (err) {
                            console.error("Erro ao sincronizar histórico excluído com Supabase", err);
                        }
                    }
                    
                    // Se excluiu a logo ativa do histórico, a logo principal continua intacta.
                    // Para apagá-la do sistema de vez, ele usa o botão "Excluir" principal.
                    renderLogoHistory();
                }
            });

            img.addEventListener('click', async () => {
                localStorage.setItem('argos_custom_logo', base64);
                updateLogoPreview();
                renderLogoHistory();

                if (SupabaseConfig.isConnected()) {
                    showLoading('Ativando logomarca na nuvem...');
                    try {
                        const ativo = window.MunicipioContext ? MunicipioContext.getAtivo() : null;
                        if (ativo && ativo.id) {
                            await SupabaseService.saveLogoPorMunicipio(ativo.id, base64);
                        } else {
                            await SupabaseService.saveLogo(base64);
                        }
                        const user = JSON.parse(sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user') || '{}');
                        if (user.username) {
                            await SupabaseService.logAction(user.username, 'ARQUIVOS', 'MUDANCA_LOGO', 'Logomarca do PDF alterada pelo histórico.');
                        }
                        hideLoading();
                        showToast('✅ Logomarca alterada com sucesso na Nuvem!', 'success');
                    } catch (err) {
                        console.error("Erro ao salvar logo no Supabase:", err);
                        hideLoading();
                        showToast('⚠️ Logo ativada LOCALMENTE, erro ao enviar para nuvem.', 'warn');
                    }
                } else {
                    showToast('✅ Logomarca ativada com sucesso LOCALMENTE!', 'success');
                }
            });

            wrapper.appendChild(img);
            wrapper.appendChild(btnDelete);
            list.appendChild(wrapper);
        });
    } catch (e) {
        console.error("Erro ao carregar histórico de logos", e);
        container.style.display = 'none';
    }
}

function updateLogoPreview() {
    const customLogo = localStorage.getItem('argos_custom_logo');
    const previewBox = document.getElementById('logoPreviewBox');
    const placeholder = document.getElementById('logoPreviewPlaceholder');
    const previewImg = document.getElementById('logoPreviewImage');
    
    if (previewBox && placeholder && previewImg) {
        if (customLogo) {
            previewImg.src = customLogo;
            previewImg.classList.remove('hidden');
            placeholder.classList.add('hidden');
        } else {
            previewImg.src = '';
            previewImg.classList.add('hidden');
            placeholder.classList.remove('hidden');
        }
    }
}

function bindLogoUpload() {
    const btnUpload = document.getElementById('btnUploadLogo');
    const btnExcluir = document.getElementById('btnExcluirLogo');
    const input = document.getElementById('fileLogoInput');
    if (!input) return;

    updateLogoPreview();
    renderLogoHistory();

    // v4.0: Abrir modal de seleção UF/Município antes do upload
    btnUpload?.addEventListener('click', () => {
        if (SupabaseConfig.isConnected() && window.MunicipioContext) {
            const userSession = MunicipioContext.getUserSession();
            const isGerenteRestrito = userSession && userSession.role === 'GERENTE' && !userSession.acesso_multi_municipio && userSession.municipio_vinculado;
            
            if (isGerenteRestrito) {
                // Usuário restrito: Pula o modal e vai direto para o upload usando o município vinculado
                const parts = userSession.municipio_vinculado.split('-');
                window._logoMunicipioSelecionado = { 
                    municipio: parts[0].trim(),
                    uf: parts.length > 1 ? parts[1].trim() : ''
                };
                input.click();
            } else {
                showModal('modalSelecionarMunicipioLogo');
            }
        } else {
            // Sem Supabase: comportamento legado
            input.click();
        }
    });


    btnExcluir?.addEventListener('click', async () => {
        if (confirm('Tem certeza que deseja excluir a logomarca do PDF?')) {
            localStorage.removeItem('argos_custom_logo');
            updateLogoPreview();
            renderLogoHistory();

            if (SupabaseConfig.isConnected()) {
                try {
                    const ativo = window.MunicipioContext ? MunicipioContext.getAtivo() : null;
                    if (ativo && ativo.id) {
                        await SupabaseService.clearLogoPorMunicipio(ativo.id);
                    } else {
                        await SupabaseService.deleteLogo();
                    }
                    const user = JSON.parse(sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user') || '{}');
                    if (user.username) {
                        await SupabaseService.logAction(user.username, 'ARQUIVOS', 'EXCLUSAO_LOGO', 'Logomarca do PDF excluída.');
                    }
                } catch (err) {
                    console.error("Erro ao excluir logo no Supabase:", err);
                }
            }

            showToast('✅ Logomarca removida com sucesso!', 'success');
        }
    });

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const base64 = event.target.result;
                
                // Add to history
                let history = await AppDB.getItem('logos_history') || [];
                history = history.filter(h => h !== base64);
                history.unshift(base64);
                if (history.length > 10) history.pop();
                await AppDB.setItem('logos_history', history);

                localStorage.setItem('argos_custom_logo', base64);
                updateLogoPreview();
                renderLogoHistory();

                // v4.0: Salvar logo vinculada ao município selecionado
                if (SupabaseConfig.isConnected()) {
                    showLoading('Salvando logomarca na nuvem...');
                    try {
                        const logoMunicipio = window._logoMunicipioSelecionado;
                        if (logoMunicipio && logoMunicipio.uf && logoMunicipio.municipio) {
                            const municipioId = await MunicipioContext.registrarOuObterMunicipio(logoMunicipio.municipio, logoMunicipio.uf);
                            if (municipioId) {
                                await SupabaseService.saveLogoPorMunicipio(municipioId, base64);
                            }
                            window._logoMunicipioSelecionado = null;
                        } else {
                            // Fallback: salvar na tabela global (comportamento legado)
                            await SupabaseService.saveLogo(base64);
                        }
                        await SupabaseService.saveLogoHistory(history);
                        const user = JSON.parse(sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user') || '{}');
                        if (user.username) {
                            const desc = logoMunicipio ? `Logo vinculada a ${logoMunicipio.municipio}-${logoMunicipio.uf}` : 'Nova logomarca enviada.';
                            await SupabaseService.logAction(user.username, 'ARQUIVOS', 'UPLOAD_LOGO', desc);
                        }
                        hideLoading();
                        showToast('✅ Logomarca salva com sucesso na Nuvem!', 'success');
                    } catch (err) {
                        console.error("Erro ao salvar logo no Supabase:", err);
                        hideLoading();
                        showToast('⚠️ Logo salva LOCALMENTE, erro ao enviar para nuvem.', 'warn');
                    }
                } else {
                    showToast('✅ Logomarca salva com sucesso LOCALMENTE!', 'success');
                }
            } catch(err) {
                console.error(err);
                showToast('❌ Erro: Imagem muito grande para salvar no navegador.', 'error');
            }
        };
        reader.readAsDataURL(file);
    });
}

/* =========================================================
   NAVEGAÇÃO ENTRE SEÇÕES
   ========================================================= */
function bindNavigation() {
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            navigateTo(section);
        });
    });
}

function navigateTo(section) {
    if (!section) return;
    // Atualizar nav
    document.querySelectorAll('.nav-item[data-section]').forEach(i => i.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
    if (navItem) navItem.classList.add('active');

    // Atualizar seções
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    const sectionEl = document.getElementById(`section-${section}`);
    if (sectionEl) sectionEl.classList.add('active');

    APP_STATE.activeSection = section;

    // Ocultar ou Mostrar a barra de filtros dependendo da seção
    const filterBar = document.getElementById('filter-bar');
    if (filterBar) {
        if (section === 'minha-conta' || section === 'usuarios' || section === 'relatorios' || section === 'arquivos') {
            filterBar.style.display = 'none';
        } else {
            filterBar.style.display = 'flex';
        }
        
        // Ativar o modo sticky (deslizante) apenas no módulo Produção Ambulatorial
        if (section === 'producao-ambulatorial') {
            filterBar.classList.add('is-sticky');
        } else {
            filterBar.classList.remove('is-sticky');
        }
    }

    // Re-renderizar gráficos se necessário
    if (APP_STATE.data) {
        const d = getFilteredData();
        if (section === 'eficiencia') {
            setTimeout(() => {
                ChartModule.renderEficienciaBar(d);
                ChartModule.renderStatusDist(d);
            }, 50);
        }
        if (section === 'regulacao') {
            setTimeout(() => ChartModule.renderRegulacao(d), 50);
        }
        if (section === 'cbo') {
            setTimeout(() => ChartModule.renderCbo(d), 50);
        }
        if (section === 'arquivos') {
            setTimeout(() => renderArquivosManager(), 50);
        }
    }
}

/* =========================================================
   CARREGAMENTO DE DADOS
   ========================================================= */
function getEmptyData() {
    return {
        unidades: [],
        faturamentoMensal: [],
        procedimentos: [],
        cbos: [],
        resumo: { qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0, valApresentado: 0, valAprovado: 0, valGlosado: 0, pctAprovacaoQtd: 0, pctGlosaQtd: 0, totalUnidades: 0, pctAprovacaoVal: 0, pctGlosaVal: 0 },
        competencia: 'Sem dados'
    };
}

function loadData(data) {
    APP_STATE.data = data;
    APP_STATE.filteredData = data;
    populateFilterUnidades(data);
    populateFilterProcedimentosCbo(data);
    populateFilterMesAno();
    renderAll(data);
    document.getElementById('lblCompetencia').textContent = data.competencia || 'Sem competência';

    const lblMunicipio = document.getElementById('lblMunicipio');
    if (lblMunicipio) {
        if (!data.municipio || data.competencia === 'Sem dados') {
            lblMunicipio.textContent = 'SEM MUNICIPIO IMPORTADO';
        } else {
            lblMunicipio.textContent = `${data.municipio} — ${data.uf}`;
        }
    }

    const lblConsolidado = document.getElementById('lblConsolidadoGeral');
    if (lblConsolidado) {
        if (!data.municipio || data.competencia === 'Sem dados') {
            lblConsolidado.textContent = 'Consolidado Geral de Produção Ambulatorial — Sem Dados';
        } else {
            lblConsolidado.textContent = `Consolidado Geral de Produção Ambulatorial — ${data.municipio}/${data.uf} — ${data.competencia}`;
        }
    }

    const lblRanking = document.getElementById('lblRankingDesempenho');
    if (lblRanking) {
        if (data.competencia === 'Sem dados') {
            lblRanking.textContent = 'Ranking de Desempenho — Sem Dados';
        } else {
            lblRanking.textContent = `Ranking de Desempenho — ${data.competencia}`;
        }
    }
}

function setFilterStatus(status) {
    const el = document.getElementById('filterStatus');
    if (el) {
        el.value = status;
        document.getElementById('btnAplicarFiltros')?.click();
        
        // Se estiver na tela Executivo e clicar no filtro, pode ser útil pular para a tela de unidades, ou apenas avisar
        showToast(`Filtro aplicado: Status ${status}`, 'info');
        // Rolar suavemente até o topo para ver que a tabela mudou ou apenas manter onde está.
    }
}

function aggregateLinhas(linhas, cmpFallback, anoFallback, municipioFallback, ufFallback) {
    let uMap = {};
    let mesMap = {};
    let pMap = {};
    let cboMap = {};
    
    let totalQtdApresentada = 0, totalQtdAprovada = 0, totalQtdGlosada = 0;
    let totalValApresentado = 0, totalValAprovado = 0, totalValGlosado = 0;

    linhas.forEach(l => {
        if (!uMap[l.uId]) uMap[l.uId] = { id: l.uId, cnes: l.uCnes, nome: l.uNome, tipo: 'Unidade', qtdApresentada:0, qtdAprovada:0, qtdGlosada:0, valApresentado:0, valAprovado:0, valGlosado:0, glosaPorMes:{} };
        uMap[l.uId].qtdApresentada += l.qtdApresentada;
        uMap[l.uId].qtdAprovada += l.qtdAprovada;
        uMap[l.uId].qtdGlosada += l.qtdGlosada;
        uMap[l.uId].valApresentado += l.valApresentado;
        uMap[l.uId].valAprovado += l.valAprovado;
        uMap[l.uId].valGlosado += l.valGlosado;
        uMap[l.uId].glosaPorMes[l.cmp] = (uMap[l.uId].glosaPorMes[l.cmp] || 0) + l.valGlosado;

        if (!mesMap[l.cmp]) mesMap[l.cmp] = { mes: l.mes, nomeMes: l.cmp, competencia: l.cmp, qtdApresentada:0, qtdAprovada:0, qtdGlosada:0, valApresentado:0, valAprovado:0, valGlosado:0, valoresPorUnidade:{} };
        mesMap[l.cmp].qtdApresentada += l.qtdApresentada;
        mesMap[l.cmp].valApresentado += l.valApresentado;
        mesMap[l.cmp].qtdAprovada += l.qtdAprovada;
        mesMap[l.cmp].valAprovado += l.valAprovado;
        mesMap[l.cmp].qtdGlosada += l.qtdGlosada;
        mesMap[l.cmp].valGlosado += l.valGlosado;
        
        if (!pMap[l.proc]) {
            const cleanCode = l.proc.replace(/\D/g, '');
            pMap[l.proc] = { 
                codigo: l.proc, 
                descricao: window.SIGTAP?.[cleanCode] || 'Proc '+l.proc, 
                qtdAprovada: 0, 
                valAprovado: 0, 
                valUnitario: 0,
                cbos: {} 
            };
        }
        pMap[l.proc].qtdAprovada += l.qtdAprovada;
        pMap[l.proc].valAprovado += l.valAprovado;

        if (l.cbo && l.cbo.match(/^[a-zA-Z0-9]{6}$/)) {
            const cboCode = l.cbo;
            if (!pMap[l.proc].cbos[cboCode]) {
                const descCbo = window.CBO_DICTIONARY?.[cboCode] || 'CBO ' + cboCode;
                pMap[l.proc].cbos[cboCode] = { codigo: cboCode, descricao: descCbo, qtdAprovada: 0, valAprovado: 0 };
            }
            pMap[l.proc].cbos[cboCode].qtdAprovada += l.qtdAprovada;
            pMap[l.proc].cbos[cboCode].valAprovado += l.valAprovado;

            if (!cboMap[cboCode]) {
                cboMap[cboCode] = { 
                    codigo: cboCode, 
                    descricao: window.CBO_DICTIONARY?.[cboCode] || 'CBO '+cboCode, 
                    qtdAprovada: 0, 
                    valAprovado: 0,
                    procedimentos: {} 
                };
            }
            cboMap[cboCode].qtdAprovada += l.qtdAprovada;
            cboMap[cboCode].valAprovado += l.valAprovado;
            
            if (!cboMap[cboCode].procedimentos[l.proc]) {
                const cleanCode = l.proc.replace(/\D/g, '');
                const descProc = window.SIGTAP?.[cleanCode] || 'Proc ' + l.proc;
                cboMap[cboCode].procedimentos[l.proc] = { codigo: l.proc, descricao: descProc, qtdAprovada: 0, valAprovado: 0 };
            }
            cboMap[cboCode].procedimentos[l.proc].qtdAprovada += l.qtdAprovada;
            cboMap[cboCode].procedimentos[l.proc].valAprovado += l.valAprovado;
        }

        totalQtdApresentada += l.qtdApresentada;
        totalQtdAprovada += l.qtdAprovada;
        totalQtdGlosada += l.qtdGlosada;
        totalValApresentado += l.valApresentado;
        totalValAprovado += l.valAprovado;
        totalValGlosado += l.valGlosado;
    });

    let unidades = Object.values(uMap);
    unidades.forEach(u => {
        u.pctAprovacaoQtd = u.qtdApresentada > 0 ? (u.qtdAprovada / u.qtdApresentada * 100) : 0;
        u.pctAprovacaoVal = u.valApresentado > 0 ? (u.valAprovado / u.valApresentado * 100) : (u.qtdAprovada > 0 ? 100 : 0);
    });
    unidades.sort((a,b) => b.valAprovado - a.valAprovado);
    unidades.forEach((u,i) => { u.rank = i+1; u.pctDoTotal = totalValAprovado > 0 ? (u.valAprovado/totalValAprovado*100) : 0; });

    let faturamentoMensal = Object.values(mesMap).sort((a,b) => a.competencia.localeCompare(b.competencia));
    faturamentoMensal.forEach(m => m.pctAprovado = m.valApresentado > 0 ? (m.valAprovado / m.valApresentado * 100) : 0);

    let procedimentos = Object.values(pMap).map(p => {
        p.cbos = Object.values(p.cbos).sort((a,b) => b.valAprovado - a.valAprovado);
        if (p.qtdAprovada > 0) p.valUnitario = p.valAprovado / p.qtdAprovada;
        return p;
    }).sort((a,b) => b.valAprovado - a.valAprovado);

    let cbos = Object.values(cboMap).map(c => {
        c.procedimentos = Object.values(c.procedimentos).sort((a,b) => b.valAprovado - a.valAprovado);
        return c;
    }).sort((a,b) => b.valAprovado - a.valAprovado);

    const resumo = {
        qtdApresentada: totalQtdApresentada, qtdAprovada: totalQtdAprovada, qtdGlosada: totalQtdGlosada,
        valApresentado: totalValApresentado, valAprovado: totalValAprovado, valGlosado: totalValGlosado,
        pctAprovacaoQtd: totalQtdApresentada > 0 ? (totalQtdAprovada/totalQtdApresentada*100):0,
        pctGlosaQtd: totalQtdApresentada > 0 ? (totalQtdGlosada/totalQtdApresentada*100):0,
        pctAprovacaoVal: totalValApresentado > 0 ? (totalValAprovado/totalValApresentado*100):0,
        pctGlosaVal: totalValApresentado > 0 ? (totalValGlosado/totalValApresentado*100):0,
        totalUnidades: unidades.length
    };

    return {
        competencia: cmpFallback,
        ano: anoFallback,
        municipio: municipioFallback,
        uf: ufFallback,
        unidades, faturamentoMensal, procedimentos, cbos, resumo
    };
}

function getFilteredData() {
    if (!APP_STATE.data) return null;
    if (!window.datasets || window.datasets.length === 0) return APP_STATE.data;
    
    const f = APP_STATE.filters;
    const hasLinhas = window.datasets.some(d => d.linhas && d.linhas.length > 0);
    const needsLinhas = (f.procedimento !== 'all' || f.cbo !== 'all');

    if (needsLinhas && !hasLinhas) {
        showToast('Para usar filtros de Procedimento ou CBO, limpe a base de dados e reimporte o arquivo TXT.', 'warning');
    }

    if (hasLinhas) {
        let linhas = [];
        window.datasets.forEach(d => {
            let dtLinhas = d.linhas || [];
            
            if (f.ano !== 'all') {
                dtLinhas = dtLinhas.filter(l => {
                    const lAno = l.cmp ? l.cmp.split('/')[1] : String(d.ano);
                    return lAno === String(f.ano);
                });
            }

            if (f.mes !== 'all') {
                dtLinhas = dtLinhas.filter(l => {
                    const lMes = l.mes || (l.cmp ? l.cmp.split('/')[0] : '');
                    return lMes === f.mes;
                });
            }
            if (dtLinhas.length > 0) {
                linhas = linhas.concat(dtLinhas);
            }
        });

        if (linhas.length === 0) {
            return {
                competencia: f.mes !== 'all' ? `${f.mes}/${f.ano !== 'all' ? f.ano : (window.datasets[0] ? window.datasets[0].ano : '')}` : '',
                ano: f.ano,
                municipio: window.datasets[0] ? window.datasets[0].municipio : '',
                uf: window.datasets[0] ? window.datasets[0].uf : '',
                unidades: [], faturamentoMensal: [], procedimentos: [], cbos: [],
                resumo: { qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0, valApresentado: 0, valAprovado: 0, valGlosado: 0, pctAprovacaoQtd: 0, pctGlosaQtd: 0, totalUnidades: 0 }
            };
        }

        if (f.unidade !== 'all') linhas = linhas.filter(l => l.uId === f.unidade);
        if (f.procedimento !== 'all') linhas = linhas.filter(l => l.proc === f.procedimento);
        if (f.cbo !== 'all') linhas = linhas.filter(l => l.cbo === f.cbo);

        if (linhas.length === 0) {
            return {
                competencia: f.mes !== 'all' ? `${f.mes}/${f.ano !== 'all' ? f.ano : (window.datasets[0] ? window.datasets[0].ano : '')}` : '',
                ano: f.ano,
                municipio: window.datasets[0] ? window.datasets[0].municipio : '',
                uf: window.datasets[0] ? window.datasets[0].uf : '',
                unidades: [], faturamentoMensal: [], procedimentos: [], cbos: [],
                resumo: { qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0, valApresentado: 0, valAprovado: 0, valGlosado: 0, pctAprovacaoQtd: 0, pctGlosaQtd: 0, totalUnidades: 0 }
            };
        }

        const cmpRef = linhas[0].cmp || (window.datasets[0] ? window.datasets[0].competencia : '');
        const anoRef = linhas[0].cmp ? linhas[0].cmp.split('/')[1] : (window.datasets[0] ? window.datasets[0].ano : '');
        let agg = aggregateLinhas(linhas, cmpRef, anoRef, window.datasets[0] ? window.datasets[0].municipio : '', window.datasets[0] ? window.datasets[0].uf : '');
        
        if (f.status !== 'all') {
            const statusMatchUnits = agg.unidades.filter(u => classificarStatus(u.pctAprovacaoVal).status === f.status.toUpperCase()).map(u => u.id);
            const newLinhas = linhas.filter(l => statusMatchUnits.includes(l.uId));
            
            if (newLinhas.length !== linhas.length) {
                if (newLinhas.length === 0) {
                    agg.unidades = [];
                    agg.faturamentoMensal = [];
                    agg.procedimentos = [];
                    agg.cbos = [];
                    agg.resumo = { qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0, valApresentado: 0, valAprovado: 0, valGlosado: 0, pctAprovacaoQtd: 0, pctGlosaQtd: 0, totalUnidades: 0 };
                } else {
                    agg = aggregateLinhas(newLinhas, cmpRef, anoRef, window.datasets[0] ? window.datasets[0].municipio : '', window.datasets[0] ? window.datasets[0].uf : '');
                }
            }
        }
        return agg;
    }

    // Fallback original
    let dts = window.datasets;
    if (f.mes !== 'all') {
        dts = dts.filter(d => {
            return d.faturamentoMensal && d.faturamentoMensal.some(m => {
                const mesVal = m.mes || (m.nomeMes ? m.nomeMes.split('/')[0] : '');
                return mesVal === f.mes;
            });
        });
    }
    if (f.ano !== 'all') {
        dts = dts.filter(d => {
            if (String(d.ano) === String(f.ano) || (d.competencia && d.competencia.endsWith('/' + f.ano))) return true;
            if (d.faturamentoMensal && d.faturamentoMensal.length > 0) {
                return d.faturamentoMensal.some(m => {
                    const mAno = m.competencia ? m.competencia.split('/')[1] : (m.nomeMes && m.nomeMes.includes('/') ? m.nomeMes.split('/')[1] : '');
                    return mAno === String(f.ano);
                });
            }
            return false;
        });
    }
    
    let agg = buildAggregatedData(dts);
    if (!agg) agg = { ...APP_STATE.data, unidades: [], faturamentoMensal: [], procedimentos: [], cbos: [], resumo: { qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0, valApresentado: 0, valAprovado: 0, valGlosado: 0, pctAprovacaoQtd: 0, pctGlosaQtd: 0, totalUnidades: 0 }};

    let unidades = [...agg.unidades];
    let faturamento = [...agg.faturamentoMensal];
    let procedimentos = [...agg.procedimentos];
    let cbos = [...(agg.cbos || [])];

    let validUnitIds = null;
    
    if (f.status !== 'all') {
        validUnitIds = unidades.filter(u => classificarStatus(u.pctAprovacaoVal).status === f.status.toUpperCase()).map(u => u.id);
    }
    
    if (f.unidade !== 'all') {
        if (validUnitIds === null) {
            validUnitIds = [f.unidade];
        } else {
            validUnitIds = validUnitIds.includes(f.unidade) ? [f.unidade] : [];
        }
    }

    if (validUnitIds !== null) {
        unidades = unidades.filter(u => validUnitIds.includes(u.id));

        faturamento = faturamento.map(m => {
            let val = { valApresentado: 0, valAprovado: 0, valGlosado: 0, qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0 };
            validUnitIds.forEach(uId => {
                if (m.valoresPorUnidade && m.valoresPorUnidade[uId]) {
                    val.valApresentado += m.valoresPorUnidade[uId].valApresentado || 0;
                    val.valAprovado += m.valoresPorUnidade[uId].valAprovado || 0;
                    val.valGlosado += m.valoresPorUnidade[uId].valGlosado || 0;
                    val.qtdApresentada += m.valoresPorUnidade[uId].qtdApresentada || 0;
                    val.qtdAprovada += m.valoresPorUnidade[uId].qtdAprovada || 0;
                    val.qtdGlosada += m.valoresPorUnidade[uId].qtdGlosada || 0;
                }
            });
            return { ...m, ...val, pctAprovado: val.valApresentado > 0 ? (val.valAprovado / val.valApresentado * 100) : 0 };
        });

        procedimentos = procedimentos.map(p => {
            let val = { valAprovado: 0, qtdAprovada: 0 };
            validUnitIds.forEach(uId => {
                if (p.valoresPorUnidade && p.valoresPorUnidade[uId]) {
                    val.valAprovado += p.valoresPorUnidade[uId].valAprovado || 0;
                    val.qtdAprovada += p.valoresPorUnidade[uId].qtdAprovada || 0;
                }
            });
            return { ...p, ...val };
        }).filter(p => p.valAprovado > 0 || p.qtdAprovada > 0).sort((a,b) => b.valAprovado - a.valAprovado);

        cbos = cbos.map(c => {
            let val = { valAprovado: 0, qtdAprovada: 0 };
            validUnitIds.forEach(uId => {
                if (c.valoresPorUnidade && c.valoresPorUnidade[uId]) {
                    val.valAprovado += c.valoresPorUnidade[uId].valAprovado || 0;
                    val.qtdAprovada += c.valoresPorUnidade[uId].qtdAprovada || 0;
                }
            });
            return { ...c, ...val };
        }).filter(c => c.valAprovado > 0 || c.qtdAprovada > 0).sort((a,b) => b.valAprovado - a.valAprovado);
    }

    const resumo = calcularResumo(unidades, faturamento);
    return { ...agg, unidades, faturamentoMensal: faturamento, procedimentos, cbos, resumo };
}

function calcularResumo(unidades, faturamento) {
    const r = {
        qtdApresentada: unidades.reduce((s, u) => s + u.qtdApresentada, 0),
        qtdAprovada:    unidades.reduce((s, u) => s + u.qtdAprovada, 0),
        qtdGlosada:     unidades.reduce((s, u) => s + u.qtdGlosada, 0),
        valApresentado: unidades.reduce((s, u) => s + u.valApresentado, 0),
        valAprovado:    unidades.reduce((s, u) => s + u.valAprovado, 0),
        valGlosado:     unidades.reduce((s, u) => s + u.valGlosado, 0),
        totalUnidades:  unidades.length
    };
    r.pctAprovacaoQtd = r.qtdApresentada > 0 ? (r.qtdAprovada / r.qtdApresentada * 100) : 0;
    r.pctGlosaQtd     = r.qtdApresentada > 0 ? (r.qtdGlosada  / r.qtdApresentada * 100) : 0;
    r.pctAprovacaoVal = r.valApresentado > 0 ? (r.valAprovado / r.valApresentado * 100) : (r.valAprovado > 0 ? 100 : 0);
    r.pctGlosaVal     = r.valApresentado > 0 ? (r.valGlosado  / r.valApresentado * 100) : 0;
    return r;
}

/* =========================================================
   RENDER PRINCIPAL
   ========================================================= */
function renderAll(data) {
    const d = data || getFilteredData();
    if (!d) return;

    APP_STATE.filteredData = d;

    renderDashboardTetoMac(d);
    renderDashboardProducaoAmbulatorial(d);
    renderDashboardFaturamento(d);
    renderDashboardEficiencia(d);
    renderDashboardUnidades(d);
    renderDashboardProcedimentos(d);
    renderDashboardCbo(d);
    renderDashboardGlosas(d);
    renderDashboardAuditoria(d);
    renderDashboardRegulacao(d);

    setTimeout(() => ChartModule.renderAll(d), 100);
}

/* =========================================================
   DASHBOARD PRODUÇÃO AMBULATORIAL
   ========================================================= */
function renderDashboardProducaoAmbulatorial(d) {
    const r = d.resumo;

    setEl('kpiApresentados',  fmt.numero(r.qtdApresentada));
    setEl('kpiAprovados',     fmt.numero(r.qtdAprovada));
    setEl('kpiGlosados',      fmt.numero(r.qtdGlosada));
    setEl('kpiUnidades',      fmt.numero(r.totalUnidades));
    setEl('kpiValApresentado', fmt.moeda(r.valApresentado));
    setEl('kpiValAprovado',    fmt.moeda(r.valAprovado));
    setEl('kpiValGlosado',     fmt.moeda(r.valGlosado));
    setEl('kpiTaxaAprovacao',  fmt.pct(r.pctAprovacaoQtd));
    setEl('kpiTaxaGlosa',      fmt.pct(r.pctGlosaQtd));

    const ticketMedio = r.qtdAprovada > 0 ? r.valAprovado / r.qtdAprovada : 0;
    setEl('kpiTicketMedio', fmt.moeda(ticketMedio));

    // Top Procedimento KPI
    const topProc = d.procedimentos.length > 0 ? d.procedimentos[0] : null;
    if (topProc) {
        setEl('kpiTopProcNome', topProc.codigo.replace(/-/g, '\u2011'));
        const el = document.getElementById('kpiTopProcNome');
        if (el) el.title = topProc.descricao;
        setEl('kpiTopProcVal', fmt.moeda(topProc.valAprovado));
        setEl('kpiTopProcQtd', fmt.numero(topProc.qtdAprovada));
    } else {
        setEl('kpiTopProcNome', '-');
        setEl('kpiTopProcVal', 'R$ 0,00');
        setEl('kpiTopProcQtd', '0');
    }

    // Top Profissional (CBO) KPI
    const topCbo = d.cbos.length > 0 ? d.cbos[0] : null;
    if (topCbo) {
        const nomeCbo = topCbo.codigo + ' - ' + topCbo.descricao;
        setEl('kpiTopCboNome', nomeCbo);
        const el = document.getElementById('kpiTopCboNome');
        if (el) el.title = nomeCbo;
        setEl('kpiTopCboVal', fmt.moeda(topCbo.valAprovado));
        setEl('kpiTopCboQtd', fmt.numero(topCbo.qtdAprovada));
    } else {
        setEl('kpiTopCboNome', '-');
        setEl('kpiTopCboVal', 'R$ 0,00');
        setEl('kpiTopCboQtd', '0');
    }

    // Progress bar
    const barEl = document.getElementById('barTaxaAprovacao');
    if (barEl) barEl.style.width = Math.min(r.pctAprovacaoQtd, 100) + '%';

    // Contadores de status
    const counts = { EXCELENTE: 0, BOA: 0, REGULAR: 0, CRITICA: 0 };
    d.unidades.forEach(u => {
        const s = classificarStatus(u.pctAprovacaoVal);
        counts[s.status]++;
    });
    setEl('cntExcelente', counts.EXCELENTE);
    setEl('cntBoa',       counts.BOA);
    setEl('cntRegular',   counts.REGULAR);
    setEl('cntCritica',   counts.CRITICA);

}

/* =========================================================
   DASHBOARD TETO DA MAC
   ========================================================= */
function renderDashboardTetoMac(d) {
    const portaria = APP_STATE.portariaData;
    const tetoSection = document.getElementById('tetoMacSection');
    
    if (portaria && d.competencia !== 'Sem dados') {
        if (tetoSection) tetoSection.style.display = 'block';
        
        const tetoAnual = portaria.tetoMacSemSamu;
        const tetoMensal = tetoAnual / 12;
        
        const anoCorrente = String(d.ano || '2026');
        
        // CORREÇÃO: Considerar apenas a produção do ano corrente para os indicadores do Teto MAC anual
        const fatAnoCorrente = d.faturamentoMensal.filter(m => {
            const cmp = String(m.competencia || m.nomeMes || '');
            return cmp.includes(anoCorrente) || cmp.endsWith(anoCorrente);
        });

        const faturamentoAprovado = fatAnoCorrente.reduce((acc, m) => acc + m.valAprovado, 0);
        const restanteAnual = tetoAnual - faturamentoAprovado;
        
        const numMeses = fatAnoCorrente.length || 1;
        
        const utilizacaoPct = tetoAnual > 0 ? (faturamentoAprovado / tetoAnual * 100) : 0;
        const mediaMensal = faturamentoAprovado / numMeses;
        const projecaoAnual = mediaMensal * 12;
        const projecaoPct = tetoAnual > 0 ? (projecaoAnual / tetoAnual * 100) : 0;

        // Calcular Saldo Acumulado MAC (Global do Ano)
        let perdaAcumuladaGlobal = 0;
        if (d.faturamentoMensal) {
            d.faturamentoMensal.forEach(m => {
                if (String(m.competencia || '').includes(anoCorrente)) {
                    perdaAcumuladaGlobal += (m.valAprovado - tetoMensal);
                }
            });
        }

        // Produção do último mês do ano corrente
        const ultimoMes = fatAnoCorrente.length > 0 
            ? fatAnoCorrente[fatAnoCorrente.length - 1] 
            : null;
        const prodMes = ultimoMes ? ultimoMes.valAprovado : 0;
        const folgaMes = prodMes - tetoMensal;

        // ===== LINHA 1 — Indicadores Executivos =====
        setEl('lblTetoMacMunicipio', `${portaria.name} — ${portaria.uf} (${portaria.gestao})`);
        setEl('valTetoMacAnual', fmt.moeda(tetoAnual));
        setEl('valTetoMacAprovado', fmt.moeda(faturamentoAprovado));
        setEl('descTetoMacAprovado', `Produção aprovada — ${numMeses} ${numMeses === 1 ? 'mês' : 'meses'}`);
        setEl('valTetoMacUtilizacao', fmt.pct(utilizacaoPct));
        setEl('valTetoMacRestante', fmt.moeda(restanteAnual));

        // ===== BARRA DE PROGRESSO CENTRAL =====
        const progressBar = document.getElementById('macProgressBar');
        const progressPct = document.getElementById('macProgressPct');
        if (progressBar) {
            progressBar.style.width = Math.min(utilizacaoPct, 100) + '%';
        }
        if (progressPct) progressPct.textContent = fmt.pct(utilizacaoPct);
        
        // Target percentage up to the latest competence month
        const progressMeta = document.getElementById('macProgressMeta');
        if (progressMeta) {
            if (ultimoMes && numMeses > 0) {
                const targetPct = Math.round((numMeses / 12) * 100);
                const compStr = ultimoMes.competencia || 'atual';
                progressMeta.textContent = `Meta até ${compStr}: ${targetPct}%`;
            } else {
                progressMeta.textContent = '';
            }
        }

        // ===== LINHA 2 — Indicadores Analíticos =====
        setEl('valTetoMacMensal', fmt.moeda(tetoMensal));
        setEl('valTetoMacProdMes', fmt.moeda(prodMes));
        if (ultimoMes) {
            setEl('descTetoMacProdMes', `Competência: ${ultimoMes.nomeMes || ultimoMes.competencia}`);
        }
        setEl('valTetoMacFolgaMes', fmt.moeda(Math.abs(folgaMes)));
        const folgaEl = document.getElementById('valTetoMacFolgaMes');
        if (folgaEl) {
            if (folgaMes >= 0) {
                folgaEl.textContent = fmt.moeda(folgaMes);
                folgaEl.style.color = '#059669'; // Verde
                setEl('descTetoMacFolgaMes', 'Produção acima do teto mensal');
            } else {
                folgaEl.textContent = '- ' + fmt.moeda(Math.abs(folgaMes));
                folgaEl.style.color = '#dc2626'; // Vermelho
                setEl('descTetoMacFolgaMes', 'Produção abaixo do teto mensal');
            }
        }
        // KPI: Saldo Acumulado MAC
        const cardSaldo = document.getElementById('cardTetoMacSaldo');
        const iconSaldo = document.getElementById('iconTetoMacSaldo');
        const valSaldo = document.getElementById('valTetoMacSaldo');
        const descSaldo = document.getElementById('descTetoMacSaldo');
        const badgeSaldo = document.getElementById('badgeTetoMacSaldo');
        
        if (cardSaldo && valSaldo && descSaldo && iconSaldo) {
            valSaldo.textContent = (perdaAcumuladaGlobal >= 0 ? '+' : '-') + ' ' + fmt.moeda(Math.abs(perdaAcumuladaGlobal));
            
            iconSaldo.className = ''; // Reset
            
            if (perdaAcumuladaGlobal >= 0) {
                iconSaldo.className = 'fas fa-check-circle mac-impact-icon';
                cardSaldo.classList.remove('mac-impact-highlight-red');
                cardSaldo.classList.add('mac-impact-highlight-green');
                valSaldo.style.color = ''; 
                descSaldo.textContent = 'VALOR GANHO TETO MAC';
                descSaldo.style.color = '';
                cardSaldo.style.borderColor = '';
                if(badgeSaldo) badgeSaldo.textContent = 'Positivo';
            } else {
                iconSaldo.className = 'fas fa-times-circle mac-impact-icon';
                cardSaldo.classList.remove('mac-impact-highlight-green');
                cardSaldo.classList.add('mac-impact-highlight-red');
                valSaldo.style.color = ''; 
                descSaldo.textContent = 'PERDA ACUMULADA MAC';
                descSaldo.style.color = '';
                cardSaldo.style.borderColor = '';
                if(badgeSaldo) badgeSaldo.textContent = 'Negativo';
            }
        }
        setEl('descTetoMacProjecao', `Projeção de uso: ${fmt.pct(projecaoPct)} do Teto MAC`);
        
        // Colorir a projeção conforme o risco
        const projecaoValEl = document.getElementById('valTetoMacProjecao');
        if (projecaoValEl) {
            if (projecaoPct >= 100) {
                projecaoValEl.innerHTML = '✔ ' + fmt.moeda(projecaoAnual);
                projecaoValEl.style.color = '#059669'; // Verde
            } else if (projecaoPct >= 85) {
                projecaoValEl.innerHTML = '⚠️ ' + fmt.moeda(projecaoAnual);
                projecaoValEl.style.color = '#d97706'; // Amarelo
            } else {
                projecaoValEl.innerHTML = '🛑 ' + fmt.moeda(projecaoAnual);
                projecaoValEl.style.color = '#dc2626'; // Vermelho
            }
        }

        // ===== STATUS / SEMÁFORO =====
        const statusTextEl = document.getElementById('txtTetoMacStatus');
        const descStatusEl = document.getElementById('descTetoMacStatus');
        const semaforoVerde = document.querySelector('.semaforo-verde');
        const semaforoAmarelo = document.querySelector('.semaforo-amarelo');
        const semaforoVermelho = document.querySelector('.semaforo-vermelho');

        // Reset semáforo
        [semaforoVerde, semaforoAmarelo, semaforoVermelho].forEach(d => { if(d) d.classList.remove('active'); });

        // Determinar estado (verde/amarelo/vermelho) baseado na PROJEÇÃO
        let macState = 'verde';
        if (projecaoPct >= 100) {
            macState = 'verde';
            if (statusTextEl) {
                statusTextEl.textContent = '🟢 RITMO IDEAL';
                statusTextEl.style.color = '#059669';
            }
            if (descStatusEl) descStatusEl.textContent = `Ritmo de execução: Alto`;
            if (semaforoVerde) semaforoVerde.classList.add('active');
        } else if (projecaoPct >= 85) {
            macState = 'amarelo';
            if (statusTextEl) {
                statusTextEl.textContent = '🟡 RITMO MODERADO';
                statusTextEl.style.color = '#d97706';
            }
            if (descStatusEl) descStatusEl.textContent = `Ritmo de execução: Moderado`;
            if (semaforoAmarelo) semaforoAmarelo.classList.add('active');
        } else {
            macState = 'vermelho';
            if (statusTextEl) {
                statusTextEl.textContent = '🔴 RITMO BAIXO (RISCO)';
                statusTextEl.style.color = '#dc2626';
            }
            if (descStatusEl) descStatusEl.textContent = `Ritmo de execução: Baixo`;
            if (semaforoVermelho) semaforoVermelho.classList.add('active');
        }

        // Aplicar classe de estado no dashboard
        if (tetoSection) {
            tetoSection.classList.remove('mac-state-verde', 'mac-state-amarelo', 'mac-state-vermelho');
            tetoSection.classList.add(`mac-state-${macState}`);
        }

        renderTabelaTetoMacMensal(d, tetoMensal, tetoAnual);

    } else {
        if (tetoSection) tetoSection.style.display = 'none';
    }
}

function renderTabelaTetoMacMensal(d, tetoMensal, tetoAnual) {
    const tbody = document.getElementById('tbodyTetoMacMensal');
    if (!tbody) return;

    if (!d || !d.faturamentoMensal || d.faturamentoMensal.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Sem dados para exibição</td></tr>';
        return;
    }

    // Filtrar meses para não exibir informações anteriores a JAN/2026
    const mesesFiltrados = d.faturamentoMensal.filter(m => {
        if (!m.competencia) return false;
        const parts = m.competencia.split('/');
        const year = parseInt(parts[parts.length - 1], 10);
        return year >= 2026;
    });

    if (mesesFiltrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Sem dados para exibição a partir de JAN/2026</td></tr>';
        return;
    }

    let prodAcumulada = 0;
    let perdaAcumulada = 0;
    const anoCorrente = String(d.ano || '2026');

    tbody.innerHTML = mesesFiltrados.map(m => {
        const prod = m.valAprovado;
        const situacao = prod - tetoMensal;
        const pctAlcance = tetoMensal > 0 ? (prod / tetoMensal) * 100 : 0;
        
        prodAcumulada += prod;
        
        const corSituacao = situacao >= 0 ? 'text-green' : 'text-red';
        const sinalSituacao = situacao > 0 ? '+' : '';
        
        let txtPerdaAcumulada = '-';
        let corPerda = '';
        
        const compStr = String(m.competencia || '');
        if (compStr.includes(anoCorrente)) {
            perdaAcumulada += situacao;
            corPerda = perdaAcumulada >= 0 ? 'text-green' : 'text-red';
            txtPerdaAcumulada = fmt.moeda(perdaAcumulada);
            if (perdaAcumulada > 0) txtPerdaAcumulada = '+ ' + txtPerdaAcumulada;
        }

        let statusSelo = '';
        if (pctAlcance >= 100) statusSelo = '<span class="status-badge-cell badge-excelente">🟢 ATINGIU TETO</span>';
        else if (pctAlcance >= 85) statusSelo = '<span class="status-badge-cell badge-boa">🟡 MODERADO</span>';
        else statusSelo = '<span class="status-badge-cell badge-critica">🔴 BAIXO</span>';

        return `<tr>
            <td class="text-center"><strong>${m.nomeMes || m.competencia}</strong></td>
            <td class="text-center mono">${fmt.moeda(tetoMensal)}</td>
            <td class="text-center mono">${fmt.moeda(prod)}</td>
            <td class="text-center mono fw-bold ${corSituacao}">${sinalSituacao} ${fmt.moeda(situacao)}</td>
            <td class="text-center mono fw-bold ${corPerda}">${txtPerdaAcumulada}</td>
            <td class="text-center mono fw-bold">${fmt.pct(pctAlcance)}</td>
            <td class="text-center mono">${fmt.moeda(prodAcumulada)}</td>
            <td class="text-center">${statusSelo}</td>
        </tr>`;
    }).join('');
}

/* =========================================================
   DASHBOARD FATURAMENTO
   ========================================================= */
function renderDashboardFaturamento(d) {
    const tbody = document.getElementById('tbodyFaturamento');
    const tfoot = document.getElementById('tfootFaturamento');
    if (!tbody) return;

    const meses = d.faturamentoMensal;
    if (!meses.length) { tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Sem dados</td></tr>'; return; }

    let prevPct = null;
    tbody.innerHTML = meses.map((m, i) => {
        let trend = '';
        if (prevPct !== null) {
            if (m.pctAprovado > prevPct) trend = '<span class="trend-up">↑</span>';
            else if (m.pctAprovado < prevPct) trend = '<span class="trend-down">↓</span>';
            else trend = '<span class="trend-flat">→</span>';
        }
        prevPct = m.pctAprovado;
        const pctColor = m.pctAprovado >= 99 ? 'text-green' : m.pctAprovado >= 97 ? '' : 'text-orange';

        return `<tr>
            <td><strong>${m.nomeMes} / ${m.competencia ? m.competencia.replace(/^0?\d+\//, '') : d.ano || ''}</strong></td>
            <td class="text-right mono">${fmt.numero(m.qtdApresentada)}</td>
            <td class="text-right mono">${fmt.numero(m.qtdAprovada)}</td>
            <td class="text-right mono text-red">${fmt.numero(m.qtdGlosada)}</td>
            <td class="text-right mono">${fmt.moeda(m.valApresentado)}</td>
            <td class="text-right mono fw-bold text-green">${fmt.moeda(m.valAprovado)}</td>
            <td class="text-right mono text-red">${fmt.moeda(m.valGlosado)}</td>
            <td class="text-right mono ${pctColor} fw-bold">${fmt.pct(m.pctAprovado)}</td>
            <td class="text-center">${trend || '<span class="trend-flat">–</span>'}</td>
        </tr>`;
    }).join('');

    // Totais
    const totQtdApres = meses.reduce((s,m) => s + m.qtdApresentada, 0);
    const totQtdAprov = meses.reduce((s,m) => s + m.qtdAprovada, 0);
    const totQtdGlos  = meses.reduce((s,m) => s + m.qtdGlosada, 0);
    const totValApres = meses.reduce((s,m) => s + m.valApresentado, 0);
    const totValAprov = meses.reduce((s,m) => s + m.valAprovado, 0);
    const totValGlos  = meses.reduce((s,m) => s + m.valGlosado, 0);
    const pctGeral    = totQtdApres > 0 ? (totQtdAprov / totQtdApres * 100) : 0;

    tfoot.innerHTML = `<tr>
        <td><strong>TOTAL GERAL</strong></td>
        <td class="text-right mono">${fmt.numero(totQtdApres)}</td>
        <td class="text-right mono">${fmt.numero(totQtdAprov)}</td>
        <td class="text-right mono">${fmt.numero(totQtdGlos)}</td>
        <td class="text-right mono">${fmt.moeda(totValApres)}</td>
        <td class="text-right mono">${fmt.moeda(totValAprov)}</td>
        <td class="text-right mono">${fmt.moeda(totValGlos)}</td>
        <td class="text-right mono">${fmt.pct(pctGeral)}</td>
        <td></td>
    </tr>`;

    // KPIs faturamento
    const mediaApres = meses.length > 0 ? totValApres / meses.length : 0;
    const mediaAprov = meses.length > 0 ? totValAprov / meses.length : 0;
    setEl('kpiMediaApres', fmt.moeda(mediaApres));
    setEl('kpiMediaAprov', fmt.moeda(mediaAprov));
    setEl('kpiProjecaoAnual', fmt.moeda(mediaAprov * 12));

    if (meses.length >= 2) {
        const cresc = ((meses[meses.length-1].valAprovado - meses[0].valAprovado) / meses[0].valAprovado * 100);
        const crescEl = document.getElementById('kpiCrescimento');
        if (crescEl) {
            crescEl.textContent = (cresc >= 0 ? '+' : '') + fmt.pct(cresc);
            crescEl.className = 'kpi-value ' + (cresc >= 0 ? 'text-green' : 'text-red');
        }
    }

    // Busca
    bindSearch('searchFaturamento', 'tableFaturamento');
}

/* =========================================================
   DASHBOARD EFICIÊNCIA
   ========================================================= */
function renderDashboardEficiencia(d) {
    const tbody = document.getElementById('tbodyEficiencia');
    if (!tbody) return;

    const sorted = [...d.unidades].sort((a,b) => b.valAprovado - a.valAprovado);

    tbody.innerHTML = sorted.map((u, i) => {
        const s = classificarStatus(u.pctAprovacaoVal);
        const pctQtd = u.pctAprovacaoQtd;
        const pctVal = u.pctAprovacaoVal;

        const pctBarQtd = `<div class="pct-bar-wrap">
            <div class="pct-bar"><div class="pct-bar-fill ${s.fillCls}" style="width:${Math.min(pctQtd,100)}%"></div></div>
            <span class="${pctQtd < 95 ? 'text-red fw-bold' : ''}">${fmt.pct(pctQtd)}</span>
        </div>`;

        const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';

        return `<tr>
            <td class="text-center"><span class="${rankClass}">${i+1}º</span></td>
            <td><strong>${u.nome}</strong><br><span class="text-muted" style="font-size:.7rem;">${u.tipo || ''} ${u.cnes ? '· CNES: ' + u.cnes : ''}</span></td>
            <td class="text-right mono">${fmt.numero(u.qtdApresentada)}</td>
            <td class="text-right mono">${fmt.numero(u.qtdAprovada)}</td>
            <td class="text-right">${pctBarQtd}</td>
            <td class="text-right mono">${fmt.moeda(u.valApresentado)}</td>
            <td class="text-right mono fw-bold">${fmt.moeda(u.valAprovado)}</td>
            <td class="text-right mono ${pctVal < 95 ? 'text-red fw-bold' : pctVal >= 99 ? 'text-green' : ''}">${fmt.pct(pctVal)}</td>
            <td class="text-right mono text-red">${fmt.moeda(u.valGlosado)}</td>
            <td class="text-center"><span class="status-badge-cell ${s.cls}">${s.label}</span></td>
        </tr>`;
    }).join('');

    bindSearch('searchEficiencia', 'tableEficiencia');
    bindEficienciaStatusFilter();
}

function bindEficienciaStatusFilter() {
    const sel = document.getElementById('filterEficienciaStatus');
    if (!sel) return;
    sel.addEventListener('change', () => {
        const val = sel.value;
        const rows = document.querySelectorAll('#tableEficiencia tbody tr');
        rows.forEach(row => {
            if (val === 'all') { row.style.display = ''; return; }
            const badge = row.querySelector('.status-badge-cell');
            if (!badge) return;
            const match = badge.textContent.toUpperCase().includes(val.toUpperCase());
            row.style.display = match ? '' : 'none';
        });
    });
}

/* =========================================================
   DASHBOARD UNIDADES
   ========================================================= */
let UNIDADES_SORT_ORDER = 'valAprovado';

window.toggleSortUnidades = function(field) {
    UNIDADES_SORT_ORDER = field;
    const d = APP_STATE.filteredData || APP_STATE.data;
    if (d) {
        renderDashboardUnidades(d);
    }
};

function renderDashboardUnidades(d) {
    const grid = document.getElementById('unidadeCardGrid');
    if (!grid) return;

    const sorted = [...d.unidades].sort((a,b) => b.valAprovado - a.valAprovado);

    grid.innerHTML = sorted.map(u => {
        const s = classificarStatus(u.pctAprovacaoVal);
        const statusCardClass = {
            'EXCELENTE': 'status-excelente-card',
            'BOA':       'status-boa-card',
            'REGULAR':   'status-regular-card',
            'CRITICA':   'status-critica-card'
        }[s.status];

        return `<div class="unidade-card ${statusCardClass}" onclick="abrirUnidadeDetalhe('${u.id}')">
            <div class="unidade-card-name">${u.nome}</div>
            <div class="unidade-card-stats">
                <div class="u-stat"><span class="u-stat-label">Aprovado</span><span class="u-stat-value text-green">${fmt.moeda(u.valAprovado)}</span></div>
                <div class="u-stat"><span class="u-stat-label">% Qtd</span><span class="u-stat-value">${fmt.pct(u.pctAprovacaoQtd)}</span></div>
                <div class="u-stat"><span class="u-stat-label">Status</span><span class="u-stat-value"><span class="status-badge-cell ${s.cls}" style="font-size:.65rem">${s.label}</span></span></div>
            </div>
        </div>`;
    }).join('');

    const tbody = document.getElementById('tbodyUnidadesMenu');
    if (tbody) {
        // Atualizar visual do cabeçalho ativo
        const thAprovado = document.getElementById('thUnidadeValAprovado');
        const thPctAprov = document.getElementById('thUnidadePctAprovacao');
        if (thAprovado && thPctAprov) {
            const iconAprovado = thAprovado.querySelector('i');
            const iconPctAprov = thPctAprov.querySelector('i');
            
            if (UNIDADES_SORT_ORDER === 'pctAprovacao') {
                if (iconPctAprov) iconPctAprov.style.opacity = '1';
                if (iconAprovado) iconAprovado.style.opacity = '0.3';
                thPctAprov.style.color = '#1565C0';
                thAprovado.style.color = '';
            } else {
                if (iconPctAprov) iconPctAprov.style.opacity = '0.3';
                if (iconAprovado) iconAprovado.style.opacity = '1';
                thPctAprov.style.color = '';
                thAprovado.style.color = '#1565C0';
            }
        }

        let sortedTable = [...d.unidades];
        if (UNIDADES_SORT_ORDER === 'pctAprovacao') {
            sortedTable.sort((a, b) => (b.pctAprovacaoVal || 0) - (a.pctAprovacaoVal || 0));
        } else {
            sortedTable.sort((a, b) => b.valAprovado - a.valAprovado);
        }

        tbody.innerHTML = sortedTable.map((u, i) => {
            const s = classificarStatus(u.pctAprovacaoVal);
            return `<tr onclick="abrirUnidadeDetalhe('${u.id}')" style="cursor: pointer;">
                <td class="text-center fw-bold">${i+1}</td>
                <td><strong>${u.nome}</strong></td>
                <td class="text-right mono">${fmt.numero(u.qtdAprovada)}</td>
                <td class="text-right mono fw-bold">${fmt.moeda(u.valAprovado)}</td>
                <td class="text-right mono ${u.pctAprovacaoVal < 95 ? 'text-red fw-bold' : u.pctAprovacaoVal >= 99 ? 'text-green' : ''}">${fmt.pct(u.pctAprovacaoVal)}</td>
                <td class="text-center"><span class="status-badge-cell ${s.cls}">${s.label}</span></td>
            </tr>`;
        }).join('');
    }

    // Busca nas unidades
    const search = document.getElementById('searchUnidade');
    if (search) {
        // Clone node para limpar listeners anteriores
        const newSearch = search.cloneNode(true);
        search.parentNode.replaceChild(newSearch, search);

        newSearch.addEventListener('input', () => {
            const q = newSearch.value.toLowerCase();
            document.querySelectorAll('.unidade-card').forEach(card => {
                card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
            document.querySelectorAll('#tbodyUnidadesMenu tr').forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        });
    }
}

function abrirUnidadeDetalhe(unidadeId) {
    const d = APP_STATE.data;
    if (!d) return;
    const u = d.unidades.find(u => u.id === unidadeId);
    if (!u) return;

    const s = classificarStatus(u.pctAprovacaoVal);

    setEl('detalheUnidadeNome', u.nome);
    setEl('dQtdApres',  fmt.numero(u.qtdApresentada));
    setEl('dQtdAprov',  fmt.numero(u.qtdAprovada));
    setEl('dQtdGlos',   fmt.numero(u.qtdGlosada));
    setEl('dValAprov',  fmt.moeda(u.valAprovado));
    setEl('dPctAprov',  fmt.pct(u.pctAprovacaoVal));

    const badge = document.getElementById('detalheStatusBadge');
    if (badge) {
        badge.className = `status-badge-cell ${s.cls}`;
        badge.textContent = s.label;
    }

    document.getElementById('unidadeSelector').classList.add('hidden');
    document.getElementById('unidadeDetalhe').classList.remove('hidden');

    setTimeout(() => ChartModule.renderUnidadeDetalhe(unidadeId, d), 80);
}

document.addEventListener('click', e => {
    if (e.target.id === 'btnVoltarUnidades') {
        document.getElementById('unidadeDetalhe').classList.add('hidden');
        document.getElementById('unidadeSelector').classList.remove('hidden');
    }
});

/* =========================================================
   DASHBOARD PROCEDIMENTOS
   ========================================================= */
window.toggleProcDetails = function(procCode) {
    const detailsRow = document.getElementById('details-proc-' + procCode);
    const icon = document.getElementById('icon-proc-' + procCode);
    if (detailsRow) {
        const isHidden = detailsRow.classList.contains('hidden');
        if (isHidden) {
            detailsRow.classList.remove('hidden');
            if (icon) icon.style.transform = 'rotate(90deg)';
        } else {
            detailsRow.classList.add('hidden');
            if (icon) icon.style.transform = 'rotate(0deg)';
        }
    }
};

let PROCEDIMENTO_SORT_ORDER = 'valAprovado';

window.toggleSortProcedimentos = function(field) {
    PROCEDIMENTO_SORT_ORDER = field;
    const d = APP_STATE.filteredData || APP_STATE.data;
    if (d) {
        renderDashboardProcedimentos(d);
    }
};

function renderDashboardProcedimentos(d) {
    const tbody = document.getElementById('tbodyProcedimentos');
    if (!tbody || !d.procedimentos.length) return;

    // Atualizar visual do cabeçalho ativo
    const thAprovado = document.getElementById('thValAprovado');
    const thUnitario = document.getElementById('thValUnitario');
    if (thAprovado && thUnitario) {
        const iconAprovado = thAprovado.querySelector('i');
        const iconUnitario = thUnitario.querySelector('i');
        
        if (PROCEDIMENTO_SORT_ORDER === 'valUnitario') {
            if (iconUnitario) iconUnitario.style.opacity = '1';
            if (iconAprovado) iconAprovado.style.opacity = '0.3';
            thUnitario.style.color = '#1565C0';
            thAprovado.style.color = '';
        } else {
            if (iconUnitario) iconUnitario.style.opacity = '0.3';
            if (iconAprovado) iconAprovado.style.opacity = '1';
            thUnitario.style.color = '';
            thAprovado.style.color = '#1565C0';
        }
    }

    // Ordenar cópia do array
    let sortedProcs = [...d.procedimentos];
    if (PROCEDIMENTO_SORT_ORDER === 'valUnitario') {
        sortedProcs.sort((a, b) => (b.valUnitario || 0) - (a.valUnitario || 0));
    } else {
        sortedProcs.sort((a, b) => b.valAprovado - a.valAprovado);
    }

    const total = sortedProcs.reduce((s, p) => s + p.valAprovado, 0);

    tbody.innerHTML = sortedProcs.map((p, i) => {
        const pct = total > 0 ? (p.valAprovado / total * 100) : 0;
        const barW = Math.min(pct * 3, 100);

        return `<tr class="proc-row" onclick="toggleProcDetails('${p.codigo}')" style="cursor: pointer;">
            <td class="text-center fw-bold"><i id="icon-proc-${p.codigo}" class="fas fa-chevron-right" style="transition: transform 0.2s; margin-right: 6px;"></i>${i+1}</td>
            <td class="table-code" style="font-size:.75rem; white-space: nowrap;">${p.codigo.replace(/-/g, '\u2011')}</td>
            <td><strong>${p.descricao}</strong></td>
            <td class="text-right mono">${fmt.numero(p.qtdAprovada)}</td>
            <td class="text-right mono fw-bold">${fmt.moeda(p.valAprovado)}</td>
            <td class="text-right mono">${fmt.moeda(p.valUnitario || 0)}</td>
            <td class="text-right mono">${fmt.pct(pct)}</td>
            <td class="text-center">
                <div style="height:6px;background:#E2E8F0;border-radius:3px;width:80px;display:inline-block;">
                    <div style="height:100%;width:${barW}%;background:#1565C0;border-radius:3px;"></div>
                </div>
            </td>
        </tr>
        <tr id="details-proc-${p.codigo}" class="hidden" style="background-color: #f8fafc;">
            <td colspan="8" style="padding: 12px 24px;">
                <div class="proc-details-container" style="border-left: 3px solid #1565C0; padding-left: 15px; text-align: left;">
                    <h5 style="margin: 0 0 8px 0; color: #1e293b; font-size: 0.85rem;"><i class="fas fa-user-md"></i> Profissões (CBO) que Realizaram este Procedimento</h5>
                    ${p.cbos && p.cbos.length > 0 ? `
                    <table class="data-table" style="width: 100%; margin-top: 5px; font-size: 0.8rem; background: white; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <thead>
                            <tr style="background-color: #f1f5f9; border-bottom: 2px solid #e2e8f0;">
                                <th style="padding: 6px 12px; text-align: left; background: #e2e8f0; color: #1e293b;">Profissão / CBO</th>
                                <th style="padding: 6px 12px; text-align: right; background: #e2e8f0; color: #1e293b;">Quantidade Aprovada</th>
                                <th style="padding: 6px 12px; text-align: right; background: #e2e8f0; color: #1e293b;">Valor Aprovado</th>
                                <th style="padding: 6px 12px; text-align: right; background: #e2e8f0; color: #1e293b;">% do Faturamento</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${p.cbos.map(c => {
                                const cboPct = p.valAprovado > 0 ? (c.valAprovado / p.valAprovado * 100) : 0;
                                return `
                                <tr style="border-bottom: 1px solid #f1f5f9;">
                                    <td style="padding: 6px 12px; text-align: left;"><strong>CBO ${c.codigo}</strong> — ${c.descricao}</td>
                                    <td style="padding: 6px 12px; text-align: right;" class="mono">${fmt.numero(c.qtdAprovada)}</td>
                                    <td style="padding: 6px 12px; text-align: right;" class="mono fw-bold">${fmt.moeda(c.valAprovado)}</td>
                                    <td style="padding: 6px 12px; text-align: right;" class="mono">${fmt.pct(cboPct)}</td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                    ` : `<p style="margin: 0; color: #64748b; font-style: italic; font-size: 0.8rem;">Nenhum profissional registrado realizando este procedimento.</p>`}
                </div>
            </td>
        </tr>`;
    }).join('');

    bindSearch('searchProc', 'tableProcedimentos');
}

/* =========================================================
   DASHBOARD CBO (PROFISSÕES)
   ========================================================= */
window.toggleCboDetails = function(cboCode) {
    const detailsRow = document.getElementById('details-cbo-' + cboCode);
    const icon = document.getElementById('icon-cbo-' + cboCode);
    if (detailsRow) {
        const isHidden = detailsRow.classList.contains('hidden');
        if (isHidden) {
            detailsRow.classList.remove('hidden');
            if (icon) icon.style.transform = 'rotate(90deg)';
        } else {
            detailsRow.classList.add('hidden');
            if (icon) icon.style.transform = 'rotate(0deg)';
        }
    }
};

function renderDashboardCbo(d) {
    const tbody = document.getElementById('tbodyCbo');
    if (!tbody || !d.cbos || !d.cbos.length) return;

    const total = d.cbos.reduce((s, c) => s + c.valAprovado, 0);

    tbody.innerHTML = d.cbos.map((c, i) => {
        const pct = total > 0 ? (c.valAprovado / total * 100) : 0;
        const barW = Math.min(pct * 3, 100);

        return `<tr class="cbo-row" onclick="toggleCboDetails('${c.codigo}')" style="cursor: pointer;">
            <td class="text-center fw-bold"><i id="icon-cbo-${c.codigo}" class="fas fa-chevron-right" style="transition: transform 0.2s; margin-right: 6px;"></i>${i+1}</td>
            <td class="table-code" style="font-size:.75rem">CBO ${c.codigo}</td>
            <td><strong>${c.descricao}</strong></td>
            <td class="text-right mono">${fmt.numero(c.qtdAprovada)}</td>
            <td class="text-right mono fw-bold">${fmt.moeda(c.valAprovado)}</td>
            <td class="text-right mono">${fmt.pct(pct)}</td>
            <td class="text-center">
                <div style="height:6px;background:#E2E8F0;border-radius:3px;width:80px;display:inline-block;">
                    <div style="height:100%;width:${barW}%;background:#1565C0;border-radius:3px;"></div>
                </div>
            </td>
        </tr>
        <tr id="details-cbo-${c.codigo}" class="hidden" style="background-color: #f8fafc;">
            <td colspan="7" style="padding: 12px 24px;">
                <div class="cbo-details-container" style="border-left: 3px solid #1565C0; padding-left: 15px; text-align: left;">
                    <h5 style="margin: 0 0 8px 0; color: #1e293b; font-size: 0.85rem;"><i class="fas fa-stethoscope"></i> Procedimentos Realizados por esta Profissão</h5>
                    ${c.procedimentos && c.procedimentos.length > 0 ? `
                    <table class="data-table" style="width: 100%; margin-top: 5px; font-size: 0.8rem; background: white; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <thead>
                            <tr style="background-color: #f1f5f9; border-bottom: 2px solid #e2e8f0;">
                                <th style="padding: 6px 12px; text-align: left; background: #e2e8f0; color: #1e293b;">Procedimento</th>
                                <th style="padding: 6px 12px; text-align: right; background: #e2e8f0; color: #1e293b;">Quantidade Aprovada</th>
                                <th style="padding: 6px 12px; text-align: right; background: #e2e8f0; color: #1e293b;">Valor Aprovado</th>
                                <th style="padding: 6px 12px; text-align: right; background: #e2e8f0; color: #1e293b;">Valor Unitário</th>
                                <th style="padding: 6px 12px; text-align: right; background: #e2e8f0; color: #1e293b;">% do Faturamento do CBO</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${c.procedimentos.map(p => {
                                const procPct = c.valAprovado > 0 ? (p.valAprovado / c.valAprovado * 100) : 0;
                                const valUnit = p.qtdAprovada > 0 ? (p.valAprovado / p.qtdAprovada) : 0;
                                return `
                                <tr style="border-bottom: 1px solid #f1f5f9;">
                                    <td style="padding: 6px 12px; text-align: left;"><strong style="white-space: nowrap;">${p.codigo}</strong> — ${p.descricao}</td>
                                    <td style="padding: 6px 12px; text-align: right;" class="mono">${fmt.numero(p.qtdAprovada)}</td>
                                    <td style="padding: 6px 12px; text-align: right;" class="mono fw-bold">${fmt.moeda(p.valAprovado)}</td>
                                    <td style="padding: 6px 12px; text-align: right;" class="mono">${fmt.moeda(valUnit)}</td>
                                    <td style="padding: 6px 12px; text-align: right;" class="mono">${fmt.pct(procPct)}</td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                    ` : `<p style="margin: 0; color: #64748b; font-style: italic; font-size: 0.8rem;">Nenhum procedimento registrado para esta CBO.</p>`}
                </div>
            </td>
        </tr>`;
    }).join('');

    bindSearch('searchCbo', 'tableCbo');
}

/* =========================================================
   DASHBOARD GLOSAS
   ========================================================= */
function renderDashboardGlosas(d) {
    const r = d.resumo;
    setEl('gKpiValGlosado', fmt.moeda(r.valGlosado));
    setEl('gKpiQtdGlosada', fmt.numero(r.qtdGlosada));
    setEl('gKpiTaxa',       fmt.pct(r.pctGlosaQtd));

    const comGlosa = d.unidades.filter(u => u.valGlosado > 0);
    setEl('gKpiUnidades', comGlosa.length);

    // Tabela de glosas
    const tbody = document.getElementById('tbodyGlosas');
    if (!tbody) return;

    const sorted = [...comGlosa].sort((a,b) => b.valGlosado - a.valGlosado);
    const totalGlos = sorted.reduce((s, u) => s + u.valGlosado, 0);

    tbody.innerHTML = sorted.map((u, i) => {
        const pct = totalGlos > 0 ? (u.valGlosado / totalGlos * 100) : 0;
        const impacto = u.valApresentado > 0 ? (u.valGlosado / u.valApresentado * 100) : 0;
        return `<tr>
            <td class="text-center">${i+1}</td>
            <td><strong>${u.nome}</strong></td>
            <td class="text-right mono">${fmt.numero(u.qtdGlosada)}</td>
            <td class="text-right mono text-red fw-bold">${fmt.moeda(u.valGlosado)}</td>
            <td class="text-right mono">${fmt.pct(pct)}</td>
            <td class="text-center">
                <div class="pct-bar-wrap" style="justify-content:center">
                    <div class="pct-bar" style="width:80px"><div class="pct-bar-fill fill-critical" style="width:${Math.min(impacto*5,100)}%"></div></div>
                    <span class="${impacto > 5 ? 'text-red fw-bold' : ''}">${fmt.pct(impacto)}</span>
                </div>
            </td>
        </tr>`;
    }).join('');

    // Heatmap
    renderHeatmapGlosas(d);
}

function renderHeatmapGlosas(d) {
    const container = document.getElementById('heatmapGlosas');
    if (!container) return;

    const meses = d.faturamentoMensal.map(m => m.nomeMes);
    const comGlosa = d.unidades.filter(u => u.valGlosado > 0).slice(0, 10);

    if (!comGlosa.length || !meses.length) {
        container.innerHTML = '<p class="text-muted" style="padding:16px">Sem dados de glosa disponíveis.</p>';
        return;
    }

    const maxGlosa = Math.max(...comGlosa.map(u => u.valGlosado));

    let html = '<table class="heatmap-table"><thead><tr><th>Unidade</th>';
    meses.forEach(m => { html += `<th>${m}</th>`; });
    html += '</tr></thead><tbody>';

    comGlosa.forEach(u => {
        html += `<tr><td style="text-align:left;font-weight:600">${u.nome.length > 25 ? u.nome.substring(0,23)+'…' : u.nome}</td>`;
        meses.forEach(m => {
            // Buscar o valor real de glosa da unidade para o mês específico
            const val = (u.glosaPorMes && u.glosaPorMes[m]) ? u.glosaPorMes[m] : 0;
            const intensity = maxGlosa > 0 ? val / maxGlosa : 0;
            const r = Math.round(198 + (intensity * 30));
            const g = Math.round(255 - (intensity * 230));
            const b = Math.round(255 - (intensity * 255));
            const textColor = intensity > 0.5 ? '#fff' : '#333';
            html += `<td class="heatmap-cell" style="background:rgb(${r},${g},${b});color:${textColor}">${val > 0 ? 'R$' + val.toFixed(0) : '–'}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

/* =========================================================
   DASHBOARD AUDITORIA
   ========================================================= */
function renderDashboardAuditoria(d) {
    const alertas = gerarAlertasAuditoria(d);
    const grid = document.getElementById('alertasAuditoria');
    const tbody = document.getElementById('tbodyAuditoria');

    if (grid) {
        grid.innerHTML = alertas.map(a => `
            <div class="alerta-card alerta-${a.severidade.toLowerCase()}">
                <div class="alerta-icon"><i class="${a.icone}"></i></div>
                <div class="alerta-body">
                    <div class="alerta-title">${a.titulo}</div>
                    <div class="alerta-desc">${a.descricao}</div>
                    ${a.unidade ? `<div class="alerta-unidade"><i class="fas fa-hospital"></i> ${a.unidade}</div>` : ''}
                </div>
            </div>
        `).join('');
    }

    if (tbody) {
        tbody.innerHTML = alertas.map(a => `<tr>
            <td><span class="status-badge-cell ${a.badgeCls}">${a.severidadeLabel}</span></td>
            <td>${a.tipo}</td>
            <td>${a.unidade || '—'}</td>
            <td>${a.competencia || d.competencia || '—'}</td>
            <td>${a.descricao}</td>
            <td class="text-right mono ${a.valor > 0 ? 'text-red' : ''}">${a.valor > 0 ? fmt.moeda(a.valor) : '—'}</td>
        </tr>`).join('');
    }
}

function gerarAlertasAuditoria(d) {
    const alertas = [];

    d.unidades.forEach(u => {
        const s = classificarStatus(u.pctAprovacaoVal);

        if (s.status === 'CRITICA') {
            alertas.push({
                severidade: 'CRITICO', severidadeLabel: '🔴 Crítico', badgeCls: 'badge-critica',
                icone: 'fas fa-times-circle',
                tipo: 'Taxa de Aprovação Crítica',
                titulo: `❌ Glosa Crítica — ${u.nome}`,
                descricao: `Taxa de aprovação financeira de ${fmt.pct(u.pctAprovacaoVal)}, abaixo do mínimo aceitável de 95%.`,
                unidade: u.nome, competencia: d.competencia,
                valor: u.valGlosado
            });
        }

        if (s.status === 'REGULAR') {
            alertas.push({
                severidade: 'ATENCAO', severidadeLabel: '🟠 Atenção', badgeCls: 'badge-regular',
                icone: 'fas fa-exclamation-triangle',
                tipo: 'Taxa de Aprovação Regular',
                titulo: `⚠️ Atenção — ${u.nome}`,
                descricao: `Taxa de aprovação financeira de ${fmt.pct(u.pctAprovacaoVal)}, entre 95% e 97%. Recomenda-se revisão.`,
                unidade: u.nome, competencia: d.competencia,
                valor: u.valGlosado
            });
        }

        if (u.qtdAprovada === 0 && u.qtdApresentada > 100) {
            alertas.push({
                severidade: 'CRITICO', severidadeLabel: '🔴 Crítico', badgeCls: 'badge-critica',
                icone: 'fas fa-ban',
                tipo: 'Produção Zerada',
                titulo: `🚫 Produção Zerada — ${u.nome}`,
                descricao: `Unidade apresentou ${fmt.numero(u.qtdApresentada)} procedimentos mas não teve nenhum aprovado financeiramente.`,
                unidade: u.nome, competencia: d.competencia,
                valor: u.valApresentado
            });
        }

        if (u.pctDoTotal > 40) {
            alertas.push({
                severidade: 'MODERADO', severidadeLabel: '🟡 Moderado', badgeCls: 'badge-boa',
                icone: 'fas fa-chart-pie',
                tipo: 'Concentração de Produção',
                titulo: `📊 Alta Concentração — ${u.nome}`,
                descricao: `Unidade concentra ${fmt.pct(u.pctDoTotal)} do faturamento total aprovado, indicando alta dependência produtiva.`,
                unidade: u.nome, competencia: d.competencia,
                valor: u.valAprovado
            });
        }
    });

    // Verificar crescimento anormal de glosa
    if (d.faturamentoMensal.length >= 2) {
        const meses = d.faturamentoMensal;
        const ultimo = meses[meses.length - 1];
        const penultimo = meses[meses.length - 2];
        if (penultimo.valGlosado > 0) {
            const crescGlosa = ((ultimo.valGlosado - penultimo.valGlosado) / penultimo.valGlosado * 100);
            if (crescGlosa > 200) {
                alertas.push({
                    severidade: 'CRITICO', severidadeLabel: '🔴 Crítico', badgeCls: 'badge-critica',
                    icone: 'fas fa-chart-line',
                    tipo: 'Crescimento Anormal de Glosa',
                    titulo: `📈 Crescimento Anormal de Glosa`,
                    descricao: `O valor glosado em ${ultimo.nomeMes} cresceu ${fmt.pct(crescGlosa)} em relação ao mês anterior. Requer investigação imediata.`,
                    unidade: 'Geral', competencia: ultimo.nomeMes,
                    valor: ultimo.valGlosado
                });
            }
        }
    }

    if (!alertas.length) {
        alertas.push({
            severidade: 'OK', severidadeLabel: '✅ Normal', badgeCls: 'badge-excelente',
            icone: 'fas fa-check-circle',
            tipo: 'Sistema Normal',
            titulo: '✅ Produção dentro do padrão',
            descricao: 'Nenhuma irregularidade significativa detectada no período analisado.',
            unidade: '', competencia: d.competencia, valor: 0
        });
    }

    return alertas;
}

/* =========================================================
   DASHBOARD REGULAÇÃO
   ========================================================= */
function renderDashboardRegulacao(d) {
    const r = d.resumo;
    setEl('regKpiProd',      fmt.numero(r.qtdAprovada));
    setEl('regKpiCobertura', fmt.pct(r.pctAprovacaoQtd));
    setEl('regKpiDemanda',   fmt.numero(r.qtdGlosada));
    setEl('regKpiAtivas',    fmt.numero(r.totalUnidades));

    const tbody = document.getElementById('tbodyRegulacao');
    if (!tbody) return;

    tbody.innerHTML = [...d.unidades]
        .sort((a,b) => b.qtdAprovada - a.qtdAprovada)
        .slice(0, 15)
        .map(u => {
            const meta  = Math.round(u.qtdApresentada * 1.02);
            const exec  = u.qtdAprovada > 0 ? (u.qtdAprovada / meta * 100) : 0;
            const diff  = u.qtdAprovada - meta;
            const s     = exec >= 98 ? 'badge-excelente' : exec >= 95 ? 'badge-boa' : 'badge-critica';
            const label = exec >= 98 ? '✅ Meta Atingida' : exec >= 95 ? '⚠️ Parcial' : '❌ Abaixo';
            return `<tr>
                <td><strong>${u.nome}</strong></td>
                <td class="text-right mono">${fmt.numero(meta)}</td>
                <td class="text-right mono">${fmt.numero(u.qtdAprovada)}</td>
                <td class="text-right mono ${exec < 95 ? 'text-red' : 'text-green'} fw-bold">${fmt.pct(exec)}</td>
                <td class="text-right mono ${diff < 0 ? 'text-red' : 'text-green'}">${diff >= 0 ? '+' : ''}${fmt.numero(diff)}</td>
                <td class="text-center"><span class="status-badge-cell ${s}">${label}</span></td>
            </tr>`;
        }).join('');
}

/* =========================================================
   FILTROS
   ========================================================= */
function bindFilters() {
    document.getElementById('btnAplicarFiltros')?.addEventListener('click', aplicarFiltros);
    document.getElementById('btnLimparFiltros')?.addEventListener('click', limparFiltros);
    
    const filterIds = ['filterAno', 'filterMes', 'filterUnidade', 'filterProcedimento', 'filterCbo', 'filterStatus'];
    filterIds.forEach(id => {
        document.getElementById(id)?.addEventListener('change', updateFilterSummary);
    });

    updateFilterSummary();
}

function aplicarFiltros() {
    APP_STATE.filters.ano     = document.getElementById('filterAno')?.value || 'all';
    APP_STATE.filters.mes     = document.getElementById('filterMes')?.value || 'all';
    APP_STATE.filters.unidade = document.getElementById('filterUnidade')?.value || 'all';
    APP_STATE.filters.procedimento = document.getElementById('filterProcedimento')?.value || 'all';
    APP_STATE.filters.cbo     = document.getElementById('filterCbo')?.value || 'all';
    APP_STATE.filters.status  = document.getElementById('filterStatus')?.value || 'all';
    const d = getFilteredData();
    renderAll(d);
    updateFilterSummary();
    showToast('Filtros aplicados!', 'success');
}

function limparFiltros() {
    APP_STATE.filters = { ano: 'all', mes: 'all', unidade: 'all', procedimento: 'all', cbo: 'all', status: 'all' };
    document.getElementById('filterAno').value     = 'all';
    document.getElementById('filterMes').value     = 'all';
    document.getElementById('filterUnidade').value = 'all';
    if(document.getElementById('filterProcedimento')) document.getElementById('filterProcedimento').value = 'all';
    if(document.getElementById('filterCbo')) document.getElementById('filterCbo').value = 'all';
    if(document.getElementById('filterStatus')) document.getElementById('filterStatus').value  = 'all';
    renderAll(getFilteredData());
    updateFilterSummary();
    showToast('Filtros limpos.', 'success');
}

function updateFilterSummary() {
    const container = document.getElementById('filterSelectedPillsContainer');
    const badge = document.getElementById('filter-active-count');
    if (!container) return;

    let activeCount = 0;
    let html = '<i class="fas fa-tag"></i> Selecionado: ';
    
    const filters = [
        { id: 'filterAno', name: 'Ano', icon: 'fa-calendar-alt', isDefault: true },
        { id: 'filterMes', name: 'Competência', icon: 'fa-calendar-check', isDefault: true },
        { id: 'filterUnidade', name: 'Unidade', icon: 'fa-hospital', isDefault: true },
        { id: 'filterProcedimento', name: 'Procedimento', icon: 'fa-stethoscope', isDefault: true },
        { id: 'filterCbo', name: 'Profissional', icon: 'fa-user-circle', isDefault: true },
        { id: 'filterStatus', name: 'Status', icon: 'fa-star', isDefault: false }
    ];

    let activePills = [];

    filters.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) {
            const val = el.value;
            const text = el.options[el.selectedIndex]?.text || val;
            
            // Verifica se está ativo
            let isActive = false;
            if (f.isDefault) {
                isActive = (val !== 'all');
            } else {
                isActive = (val && val !== 'all');
            }

            if (isActive) {
                activeCount++;
                activePills.push(`<span class="selected-pill-item"><i class="fas ${f.icon}"></i> <b>${f.name}:</b> ${text}</span>`);
            }
        }
    });

    if (activePills.length > 0) {
        html += activePills.join(' ');
    } else {
        html += '<span class="text-muted" style="font-size: 0.8rem; margin-left: 6px;">Nenhum filtro ativo</span>';
    }

    container.innerHTML = html;
    if (badge) {
        badge.textContent = `${activeCount} ${activeCount === 1 ? 'ativo' : 'ativos'}`;
        if (activeCount > 0) {
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function populateFilterUnidades(data) {
    const sel = document.getElementById('filterUnidade');
    if (sel) {
        sel.innerHTML = '<option value="all">Todas</option>' +
            data.unidades.map(u => `<option value="${u.id}">${u.nome}</option>`).join('');
    }
    
    const rSel = document.getElementById('reportUnidade');
    if (rSel) {
        rSel.innerHTML = '<option value="all">Todas as Unidades</option>' +
            data.unidades.map(u => `<option value="${u.id}">${u.nome}</option>`).join('');
    }
    updateFilterSummary();
}

function populateFilterProcedimentosCbo(data) {
    const selProc = document.getElementById('filterProcedimento');
    if (selProc && data.procedimentos) {
        selProc.innerHTML = '<option value="all">Todos</option>' +
            data.procedimentos.map(p => `<option value="${p.codigo}">${p.codigo} - ${p.descricao}</option>`).join('');
    }
    const selCbo = document.getElementById('filterCbo');
    if (selCbo && data.cbos) {
        selCbo.innerHTML = '<option value="all">Todos</option>' +
            data.cbos.map(c => `<option value="${c.codigo}">${c.codigo} - ${c.descricao}</option>`).join('');
    }
    updateFilterSummary();
}

function populateFilterMesAno() {
    const selAno = document.getElementById('filterAno');
    const selMes = document.getElementById('filterMes');
    if (!selAno || !selMes) return;

    if (!window.datasets || window.datasets.length === 0) {
        selAno.innerHTML = '<option value="all">Todos</option>';
        selMes.innerHTML = '<option value="all">Todos</option>';
        updateFilterSummary();
        return;
    }

    const anos = new Set();
    const meses = new Map();
    const monthNames = {
        '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
        '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
        '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
    };

    window.datasets.forEach(d => {
        if (d.ano) anos.add(String(d.ano));
        if (d.faturamentoMensal && d.faturamentoMensal.length > 0) {
            d.faturamentoMensal.forEach(m => {
                const p = (m.nomeMes || '').split('/');
                if (p.length === 2) {
                    anos.add(p[1]);
                    meses.set(p[0], monthNames[p[0]] || p[0]);
                } else if (m.mes) {
                    meses.set(m.mes, monthNames[m.mes] || m.mes);
                }
            });
        }
    });

    const anosArr = Array.from(anos).sort((a,b) => b.localeCompare(a));
    selAno.innerHTML = '<option value="all">Todos</option>' + (anosArr.length > 0 
        ? anosArr.map(a => `<option value="${a}">${a}</option>`).join('')
        : '');

    const mesesArr = Array.from(meses.entries()).sort((a,b) => a[0].localeCompare(b[0]));
    selMes.innerHTML = '<option value="all">Todos</option>' + 
        mesesArr.map(m => `<option value="${m[0]}">${m[1]}</option>`).join('');

    // Preencher também filtros da aba Relatórios
    const rAno = document.getElementById('reportAno');
    const rMes = document.getElementById('reportMes');
    if (rAno && rMes) {
        rAno.innerHTML = '<option value="all">Todos</option>' + (anosArr.length > 0 
            ? anosArr.map(a => `<option value="${a}">${a}</option>`).join('')
            : '');
        rMes.innerHTML = '<option value="all">Todos</option>' + 
            mesesArr.map(m => `<option value="${m[0]}">${m[1]}</option>`).join('');
    }
        
    // Se o filtro selecionado sumir, reseta para all
    if (!meses.has(APP_STATE.filters.mes) && APP_STATE.filters.mes !== 'all') {
        APP_STATE.filters.mes = 'all';
    }
    if (anosArr.length > 0 && !anosArr.includes(APP_STATE.filters.ano) && APP_STATE.filters.ano !== 'all') {
        APP_STATE.filters.ano = 'all';
    }
    
    selAno.value = APP_STATE.filters.ano || 'all';
    selMes.value = APP_STATE.filters.mes || 'all';
    updateFilterSummary();
}

/* =========================================================
   IMPORTAÇÃO
   ========================================================= */
function bindImport() {
    // Botões importar
    document.getElementById('btnImportar')?.addEventListener('click', () => {
        showModal('modalImportar');
    });
    document.getElementById('btnImportarArquivosPage')?.addEventListener('click', () => {
        showModal('modalImportar');
    });

    // File input
    const fileInput = document.getElementById('fileInput');
    const dropzone  = document.getElementById('dropzone');

    if (fileInput) {
        fileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) processFile(file);
        });
    }

    if (dropzone) {
        dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
        dropzone.addEventListener('drop', e => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) processFile(file);
        });
    }

    // Processar manual
    document.getElementById('btnProcessarManual')?.addEventListener('click', () => {
        const txt = document.getElementById('txtManualInput')?.value;
        if (!txt || !txt.trim()) { showToast('⚠️ Nenhum texto informado.', 'warn'); return; }
        processContent(txt, 'Entrada Manual');
    });

    // Demo
    document.getElementById('btnCarregarDemo')?.addEventListener('click', async () => {
        showLoading('Salvando dados demo no banco...');
        try {
            if (!window.datasets) window.datasets = [];
            
            // Check duplicidade demo
            if (window.datasets.some(d => d.competencia === DEMO_DATA.competencia)) {
                showToast(`⚠️ Os dados de ${DEMO_DATA.competencia} já foram importados.`, 'warn');
                hideModal('modalImportar');
                hideLoading();
                return;
            }
            
            window.datasets.push(DEMO_DATA);
            await AppDB.setItem('datasets', window.datasets);
            await registerImport('Dados de Demonstração', 'SIA/SUS', DEMO_DATA.competencia);
            const agg = buildAggregatedData(window.datasets);
            await PortariaModule.loadPortariaForMunicipio(agg.municipio, agg.uf);
            loadData(agg);
            hideModal('modalImportar');
            showToast('✅ Dados demo salvos e carregados no banco!', 'success');
        } catch(e) {
            showToast('❌ Erro ao salvar dados no banco.', 'error');
        } finally {
            hideLoading();
        }
    });

    // Import tabs
    document.querySelectorAll('.import-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.import-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('importTab' + capitalize(tab.dataset.tab))?.classList.add('active');
        });
    });
}

function bindImportSigtap() {
    const btn = document.getElementById('btnUploadSigtap');
    const input = document.getElementById('fileSigtapInput');
    if (!input) return;

    btn?.addEventListener('click', () => input.click());

    input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        showLoading('Importando SIGTAP...');
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const text = ev.target.result;
            const lines = text.split(/\r?\n/);
            const sigtapMap = {};
            
            lines.forEach(line => {
                if (line.length >= 260) {
                    const code = line.substring(0, 10).trim();
                    const name = line.substring(10, 260).trim();
                    if (code && name) sigtapMap[code] = name;
                }
            });
            
            window.SIGTAP = { ...(window.SIGTAP || {}), ...sigtapMap };
            await AppDB.setItem('SIGTAP_DB', window.SIGTAP);
            
            const now = new Date();
            const dateStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            await AppDB.setItem('sigtap_meta', { fileName: file.name, importDate: dateStr });
            await registerImport(file.name, 'SIGTAP', 'Tabela Oficial');

            if (SupabaseConfig.isConnected()) {
                showLoading('Sincronizando SIGTAP na nuvem...');
                try {
                    await SupabaseService.uploadSigtap(window.SIGTAP, (msg) => showLoading(msg));
                    const user = JSON.parse(sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user') || '{}');
                    if (user.username) {
                        await SupabaseService.logAction(user.username, 'ARQUIVOS', 'IMPORTACAO_SIGTAP', `Tabela SIGTAP (${file.name}) sincronizada na nuvem.`);
                    }
                    hideLoading();
                    showToast(`✅ Tabela SIGTAP carregada com ${Object.keys(sigtapMap).length} itens na Nuvem!`, 'success');
                } catch (err) {
                    console.error("Erro ao sincronizar SIGTAP no Supabase:", err);
                    hideLoading();
                    showToast(`⚠️ SIGTAP com ${Object.keys(sigtapMap).length} itens salvo LOCALMENTE, erro ao sincronizar nuvem. Verifique sua conexão ou chaves do Supabase.`, 'warn');
                }
            } else {
                hideLoading();
                showToast(`✅ Tabela SIGTAP carregada com ${Object.keys(sigtapMap).length} itens localmente!`, 'success');
            }
            
            if (APP_STATE.data) {
                const agg = buildAggregatedData(window.datasets);
                await PortariaModule.loadPortariaForMunicipio(agg.municipio, agg.uf);
                loadData(agg);
            }
        };
        reader.readAsText(file, 'iso-8859-1');
    });
}

function bindImportPortaria() {
    const input = document.getElementById('filePortariaInput');
    const msgEl = document.getElementById('portariaProgressMsg');
    if (!input) return;

    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const userSession = JSON.parse(sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user') || 'null');
        const isAdminOrAuthorized = userSession && (userSession.role === 'ADM' || (userSession.role === 'SUPERINTENDENTE' && userSession.perm_importar));
        if (!isAdminOrAuthorized) {
            showToast('❌ Permissão Negada: Apenas administradores podem importar a portaria.', 'error');
            return;
        }

        showLoading('Processando Portaria PDF...');
        if (msgEl) msgEl.textContent = 'Lendo e estruturando páginas do PDF...';

        try {
            const municipalities = await PortariaModule.parsePDF(file, (msg) => {
                if (msgEl) msgEl.textContent = msg;
            });

            if (Object.keys(municipalities).length === 0) {
                throw new Error("Nenhum município foi encontrado no PDF. Verifique se o arquivo corresponde à Portaria GM/MS 10.146/2026.");
            }

            await AppDB.setItem('PORTARIA_DB', municipalities);

            if (SupabaseConfig.isConnected()) {
                if (msgEl) msgEl.textContent = 'Enviando banco de portarias para a nuvem...';
                await SupabaseService.savePortariaDb(municipalities);
                
                const user = JSON.parse(sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user') || '{}');
                if (user.username) {
                    await SupabaseService.logAction(user.username, 'ARQUIVOS', 'IMPORTACAO_PORTARIA', `Portaria PDF (${file.name}) importada com ${Object.keys(municipalities).length} municípios e sincronizada na nuvem.`);
                }
            }

            if (msgEl) msgEl.textContent = '';
            hideLoading();
            showToast(`✅ Portaria importada com sucesso! ${Object.keys(municipalities).length} municípios carregados no banco de dados.`, 'success');
            
            if (APP_STATE.data) {
                const agg = buildAggregatedData(window.datasets);
                await PortariaModule.loadPortariaForMunicipio(agg.municipio, agg.uf);
                loadData(agg);
            }
            hideModal('modalImportar');
        } catch (err) {
            console.error("Erro ao importar portaria:", err);
            if (msgEl) msgEl.textContent = '';
            hideLoading();
            showToast('❌ Erro ao processar PDF: ' + err.message, 'error');
        } finally {
            input.value = '';
        }
    });
}

function processFile(file) {
    showLoading('Lendo arquivo...');
    const reader = new FileReader();
    reader.onerror = e => {
        hideLoading();
        alert('Erro ao ler o arquivo: ' + reader.error);
    };
    reader.onload = e => {
        hideLoading();
        try {
            processContent(e.target.result, file.name);
        } catch(err) {
            alert('Erro ao processar conteúdo: ' + err.message + '\n' + err.stack);
        }
    };
    reader.readAsText(file, 'UTF-8');
}

function processContent(content, fileName = 'arquivo') {
    showLoading('Processando e salvando dados SIA/SUS...');
    setTimeout(async () => {
        try {
            const parsed = Parser.parseTXT(content);
            if (parsed && parsed.unidades && parsed.unidades.length > 0) {
                if (!window.datasets) window.datasets = [];

                // v4.0: VERIFICAÇÃO MULTI-MUNICÍPIO
                const userSession = JSON.parse(sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user') || 'null');
                const temAcessoMulti = window.MunicipioContext ? MunicipioContext.temAcessoMulti(userSession) : false;
                const municipioAtivo = window.MunicipioContext ? MunicipioContext.getAtivo() : null;

                if (window.datasets.length > 0) {
                    const municipioExistente = window.datasets[0].municipio;
                    if (parsed.municipio && municipioExistente && parsed.municipio.trim().toUpperCase() !== municipioExistente.trim().toUpperCase()) {
                        hideLoading();

                        if (!temAcessoMulti) {
                            // Usuário restrito: bloquear
                            showPermissionDeniedModal(parsed.municipio);
                            showToast('❌ Você não tem permissão para importar dados de outro município.', 'error');
                            return;
                        }

                        // Usuário com acesso multi: perguntar se quer trocar de contexto
                        showContextSwitchModal(parsed.municipio, municipioExistente, async () => {
                            // Confirmar troca: limpar dados locais, iniciar novo contexto
                            window.datasets = [];
                            await AppDB.removeItem('datasets');
                            if (municipioAtivo && municipioAtivo.id) {
                                await AppDB.removeItem('datasets_' + municipioAtivo.id);
                            }
                            // Reprocessar com o contexto limpo
                            processContent(content, fileName);
                        });
                        return;
                    }
                }
                
                // Evitar Duplicidade
                if (window.datasets.some(d => d.competencia === parsed.competencia)) {
                    showToast(`⚠️ A competência ${parsed.competencia} já foi importada anteriormente!`, 'warn');
                    hideLoading();
                    return;
                }

                // Função para finalizar a importação após a decisão (ou imediatamente se já for nuvem)
                const finalizarImportacao = async (salvarNaNuvem) => {
                    showLoading('Processando e salvando dados SIA/SUS...');
                    try {
                        window.datasets.push(parsed);
                        await AppDB.setItem('datasets', window.datasets);
                        
                        // Registrar município e salvar produção no Supabase se solicitado
                        if (salvarNaNuvem && SupabaseConfig.isConnected() && window.MunicipioContext) {
                            try {
                                const municipioId = await MunicipioContext.registrarOuObterMunicipio(parsed.municipio, parsed.uf);
                                if (municipioId) {
                                    MunicipioContext.setAtivo({ id: municipioId, nome: parsed.municipio, uf: parsed.uf });
                                    const user = userSession || {};
                                    await SupabaseService.saveProducaoSia(municipioId, parsed.competencia, fileName, parsed, user.username || 'sistema');
                                    await SupabaseService.logAction(user.username || 'sistema', 'ARQUIVOS', 'IMPORTACAO_SIA', `${fileName} (${parsed.competencia}) de ${parsed.municipio}-${parsed.uf} importado e salvo na nuvem.`);
                                    
                                    // Carregar a logomarca do município recém-importado/selecionado
                                    try {
                                        const logo = await SupabaseService.loadLogoPorMunicipio(municipioId);
                                        if (logo && logo.logo_base64) {
                                            localStorage.setItem('argos_custom_logo', logo.logo_base64);
                                        } else {
                                            localStorage.removeItem('argos_custom_logo');
                                        }
                                        if (typeof updateLogoPreview === 'function') updateLogoPreview();
                                    } catch (logoErr) {
                                        console.error('Erro ao carregar logo após importação:', logoErr);
                                    }
                                }
                            } catch (cloudErr) {
                                console.error('Erro ao salvar produção no Supabase:', cloudErr);
                                showToast('⚠️ Dados salvos localmente. Erro ao sincronizar com nuvem.', 'warn');
                            }
                        }
                        
                        const agg = buildAggregatedData(window.datasets);
                        await PortariaModule.loadPortariaForMunicipio(agg.municipio, agg.uf);
                        loadData(agg);
                        
                        await registerImport(fileName, 'SIA/SUS', parsed.competencia);
                        
                        hideModal('modalImportar');
                        showToast(`✅ ${parsed.competencia} — ${parsed.municipio}-${parsed.uf} importado com sucesso!`, 'success');
                    } catch(err) {
                        showToast('❌ Erro na finalização do processamento: ' + err.message, 'error');
                    } finally {
                        hideLoading();
                    }
                };

                // Verificar se o município já existe nas bases da nuvem
                let jaExisteNaNuvem = false;
                if (SupabaseConfig.isConnected()) {
                    const bases = await SupabaseService.listarResumoBasesNuvem();
                    jaExisteNaNuvem = bases.some(b => b.nome.trim().toUpperCase() === parsed.municipio.trim().toUpperCase());
                }

                hideLoading();

                if (SupabaseConfig.isConnected() && !jaExisteNaNuvem) {
                    // Município novo: Pausar e perguntar
                    window.showCloudOrLocalModal(parsed.municipio, () => {
                        finalizarImportacao(true); // Salvar na Nuvem
                    }, () => {
                        finalizarImportacao(false); // Apenas Local
                    });
                } else {
                    // Já existe na nuvem ou não está conectado: Finaliza normal (salvando na nuvem por padrão)
                    finalizarImportacao(SupabaseConfig.isConnected());
                }
                
            } else {
                showToast('⚠️ Não foi possível reconhecer o formato do arquivo.', 'warn');
                hideLoading();
            }
        } catch(e) {
            showToast('❌ Erro ao processar: ' + e.message, 'error');
            hideLoading();
        }
    }, 500);
}

/**
 * Exibe o modal de decisão Nuvem vs Local
 */
window.showCloudOrLocalModal = function(municipioNome, onSalvarNuvem, onApenasLocal) {
    const modal = document.getElementById('modalCloudOrLocal');
    const lbl = document.getElementById('lblCloudOrLocalMunicipio');
    const btnSalvar = document.getElementById('btnCloudOrLocalSalvarNuvem');
    const btnLocal = document.getElementById('btnCloudOrLocalApenasLocal');
    
    if (modal && lbl && btnSalvar && btnLocal) {
        lbl.textContent = municipioNome;
        
        // Remove listeners antigos clonando o botão (hack simples)
        const novoSalvar = btnSalvar.cloneNode(true);
        btnSalvar.parentNode.replaceChild(novoSalvar, btnSalvar);
        const novoLocal = btnLocal.cloneNode(true);
        btnLocal.parentNode.replaceChild(novoLocal, btnLocal);
        
        novoSalvar.addEventListener('click', () => {
            hideModal('modalCloudOrLocal');
            if (onSalvarNuvem) onSalvarNuvem();
        });
        
        novoLocal.addEventListener('click', () => {
            hideModal('modalCloudOrLocal');
            if (onApenasLocal) onApenasLocal();
        });
        
        showModal('modalCloudOrLocal');
    }
}

/* =========================================================
   AGREGADOR DE MÚLTIPLOS MESES
   ========================================================= */
function buildAggregatedData(datasets) {
    if (!datasets || datasets.length === 0) return null;
    
    // Sort datasets by date if possible
    
    const agg = {
        municipio: datasets[0].municipio,
        uf: datasets[0].uf,
        sistema: datasets[0].sistema,
        competencia: datasets.map(d => d.competencia).join(', '),
        ano: datasets[0].ano,
        resumo: { qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0, valApresentado: 0, valAprovado: 0, valGlosado: 0, pctAprovacaoQtd: 0, pctGlosaQtd: 0, totalUnidades: 0 },
        faturamentoMensal: [],
        unidades: [],
        procedimentos: [],
        cbos: []
    };
    
    let uMap = {};
    let pMap = {};
    let mMap = {};
    let cboMap = {};
    
    datasets.forEach(d => {
        d.faturamentoMensal.forEach(m => {
            if (!mMap[m.nomeMes]) {
                mMap[m.nomeMes] = { ...m, valoresPorUnidade: {} };
            } else {
                mMap[m.nomeMes].qtdApresentada += m.qtdApresentada;
                mMap[m.nomeMes].qtdAprovada += m.qtdAprovada;
                mMap[m.nomeMes].qtdGlosada += m.qtdGlosada;
                mMap[m.nomeMes].valApresentado += m.valApresentado;
                mMap[m.nomeMes].valAprovado += m.valAprovado;
                mMap[m.nomeMes].valGlosado += m.valGlosado;
            }
            if (m.valoresPorUnidade) {
                Object.keys(m.valoresPorUnidade).forEach(uid => {
                    if (!mMap[m.nomeMes].valoresPorUnidade[uid]) {
                        mMap[m.nomeMes].valoresPorUnidade[uid] = { valApresentado: 0, valAprovado: 0, valGlosado: 0, qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0 };
                    }
                    mMap[m.nomeMes].valoresPorUnidade[uid].valApresentado += m.valoresPorUnidade[uid].valApresentado;
                    mMap[m.nomeMes].valoresPorUnidade[uid].valAprovado += m.valoresPorUnidade[uid].valAprovado;
                    mMap[m.nomeMes].valoresPorUnidade[uid].valGlosado += m.valoresPorUnidade[uid].valGlosado;
                    mMap[m.nomeMes].valoresPorUnidade[uid].qtdApresentada += m.valoresPorUnidade[uid].qtdApresentada;
                    mMap[m.nomeMes].valoresPorUnidade[uid].qtdAprovada += m.valoresPorUnidade[uid].qtdAprovada;
                    mMap[m.nomeMes].valoresPorUnidade[uid].qtdGlosada += m.valoresPorUnidade[uid].qtdGlosada;
                });
            }
        });
        
        d.unidades.forEach(u => {
            CryptoUtils.sanitizeData(u, ['nome']);
            const cleanName = u.nome.replace(/&l[0-9a-zA-Z.]+/gi, '')
                                    .replace(/\(s[0-9a-zA-Z.]+/gi, '')
                                    .replace(/\([0-9]+[a-zA-Z]/gi, '')
                                    .replace(/[^A-Za-z0-9ÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç\s\-\/\.,\(\)]/g, '')
                                    .replace(/\s{2,}/g, ' ')
                                    .replace(/^[-\s]+|[-\s]+$/g, '')
                                    .trim();
            u.nome = cleanName;
            
            if (!uMap[u.id]) {
                uMap[u.id] = { ...u, qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0, valApresentado: 0, valAprovado: 0, valGlosado: 0, glosaPorMes: {} };
            }
            uMap[u.id].qtdApresentada += u.qtdApresentada;
            uMap[u.id].qtdAprovada += u.qtdAprovada;
            uMap[u.id].qtdGlosada += u.qtdGlosada;
            uMap[u.id].valApresentado += u.valApresentado;
            uMap[u.id].valAprovado += u.valAprovado;
            uMap[u.id].valGlosado += u.valGlosado;
            
            // Gravar glosa no mês correspondente
            const mesNome = (d.faturamentoMensal && d.faturamentoMensal.length > 0) ? d.faturamentoMensal[0].nomeMes : (d.competencia || '');
            if (mesNome) {
                uMap[u.id].glosaPorMes[mesNome] = (uMap[u.id].glosaPorMes[mesNome] || 0) + u.valGlosado;
            }
        });
        
        d.procedimentos.forEach(p => {
            CryptoUtils.sanitizeData(p, ['descricao']);
            const cleanCode = p.codigo.replace(/\D/g, '');
            const correctDesc = (window.SIGTAP && window.SIGTAP[cleanCode]) || p.descricao;
            if (!pMap[p.codigo]) {
                pMap[p.codigo] = { ...p, descricao: correctDesc, qtdAprovada: 0, valAprovado: 0, cbos: {}, valoresPorUnidade: {} };
            }
            pMap[p.codigo].descricao = correctDesc; // Garantir atualização
            pMap[p.codigo].qtdAprovada += p.qtdAprovada;
            pMap[p.codigo].valAprovado += p.valAprovado;
            if (pMap[p.codigo].valAprovado > 0 && pMap[p.codigo].qtdAprovada > 0) {
                pMap[p.codigo].valUnitario = pMap[p.codigo].valAprovado / pMap[p.codigo].qtdAprovada;
            }
            if (p.valoresPorUnidade) {
                Object.keys(p.valoresPorUnidade).forEach(uid => {
                    if (!pMap[p.codigo].valoresPorUnidade[uid]) pMap[p.codigo].valoresPorUnidade[uid] = { valAprovado: 0, qtdAprovada: 0 };
                    pMap[p.codigo].valoresPorUnidade[uid].valAprovado += p.valoresPorUnidade[uid].valAprovado;
                    pMap[p.codigo].valoresPorUnidade[uid].qtdAprovada += p.valoresPorUnidade[uid].qtdAprovada;
                });
            }

            if (p.cbos) {
                const cboList = Array.isArray(p.cbos) ? p.cbos : Object.values(p.cbos);
                cboList.forEach(c => {
                    if (!pMap[p.codigo].cbos[c.codigo]) {
                        pMap[p.codigo].cbos[c.codigo] = { ...c, qtdAprovada: 0, valAprovado: 0 };
                    }
                    pMap[p.codigo].cbos[c.codigo].qtdAprovada += c.qtdAprovada;
                    pMap[p.codigo].cbos[c.codigo].valAprovado += c.valAprovado;
                });
            }
        });

        const currentCbos = d.cbos || [];
        currentCbos.forEach(c => {
            CryptoUtils.sanitizeData(c, ['descricao']);
            const correctDesc = (window.CBO_DICTIONARY && window.CBO_DICTIONARY[c.codigo]) || c.descricao;
            if (!cboMap[c.codigo]) {
                cboMap[c.codigo] = { ...c, descricao: correctDesc, qtdAprovada: 0, valAprovado: 0, procedimentos: {}, valoresPorUnidade: {} };
            }
            cboMap[c.codigo].descricao = correctDesc; // Garantir atualização
            cboMap[c.codigo].qtdAprovada += c.qtdAprovada;
            cboMap[c.codigo].valAprovado += c.valAprovado;
            
            if (c.valoresPorUnidade) {
                Object.keys(c.valoresPorUnidade).forEach(uid => {
                    if (!cboMap[c.codigo].valoresPorUnidade[uid]) cboMap[c.codigo].valoresPorUnidade[uid] = { valAprovado: 0, qtdAprovada: 0 };
                    cboMap[c.codigo].valoresPorUnidade[uid].valAprovado += c.valoresPorUnidade[uid].valAprovado;
                    cboMap[c.codigo].valoresPorUnidade[uid].qtdAprovada += c.valoresPorUnidade[uid].qtdAprovada;
                });
            }

            if (c.procedimentos) {
                const procList = Array.isArray(c.procedimentos) ? c.procedimentos : Object.values(c.procedimentos);
                procList.forEach(p => {
                    if (!cboMap[c.codigo].procedimentos[p.codigo]) {
                        cboMap[c.codigo].procedimentos[p.codigo] = { ...p, qtdAprovada: 0, valAprovado: 0 };
                    }
                    cboMap[c.codigo].procedimentos[p.codigo].qtdAprovada += p.qtdAprovada;
                    cboMap[c.codigo].procedimentos[p.codigo].valAprovado += p.valAprovado;
                });
            }
        });
    });
    
    // final calculations
    agg.unidades = Object.values(uMap);
    let totalValAprov = 0;
    agg.unidades.forEach(u => {
        u.pctAprovacaoQtd = u.qtdApresentada > 0 ? (u.qtdAprovada / u.qtdApresentada * 100) : 0;
        u.pctAprovacaoVal = u.valApresentado > 0 ? (u.valAprovado / u.valApresentado * 100) : (u.qtdAprovada > 0 ? 100 : 0);
        if (u.valAprovado > 0 && u.valApresentado === 0) u.pctAprovacaoVal = 100;
        
        totalValAprov += u.valAprovado;
        
        agg.resumo.qtdApresentada += u.qtdApresentada;
        agg.resumo.qtdAprovada += u.qtdAprovada;
        agg.resumo.qtdGlosada += u.qtdGlosada;
        agg.resumo.valApresentado += u.valApresentado;
        agg.resumo.valAprovado += u.valAprovado;
        agg.resumo.valGlosado += u.valGlosado;
    });
    
    agg.unidades.sort((a,b) => b.valAprovado - a.valAprovado);
    agg.unidades.forEach((u, i) => {
        u.rank = i+1;
        u.pctDoTotal = totalValAprov > 0 ? (u.valAprovado / totalValAprov * 100) : 0;
    });
    
    agg.resumo.totalUnidades = agg.unidades.length;
    agg.resumo.pctAprovacaoQtd = agg.resumo.qtdApresentada > 0 ? (agg.resumo.qtdAprovada / agg.resumo.qtdApresentada * 100) : 0;
    agg.resumo.pctGlosaQtd = agg.resumo.qtdApresentada > 0 ? (agg.resumo.qtdGlosada / agg.resumo.qtdApresentada * 100) : 0;

    // Ordenar e recalcular faturamento mensal
    agg.faturamentoMensal = Object.values(mMap).sort((a,b) => {
        const partsA = a.nomeMes.split('/');
        const partsB = b.nomeMes.split('/');
        const valA = partsA.length === 2 ? partsA[1] + partsA[0] : a.nomeMes;
        const valB = partsB.length === 2 ? partsB[1] + partsB[0] : b.nomeMes;
        return valA.localeCompare(valB);
    });
    
    agg.faturamentoMensal.forEach(m => {
        m.pctAprovado = m.valApresentado > 0 ? (m.valAprovado / m.valApresentado * 100) : (m.valAprovado > 0 ? 100 : 0);
    });

    const totalAprov = agg.resumo.valAprovado;
    
    agg.unidades = Object.values(uMap).sort((a,b) => b.valAprovado - a.valAprovado);
    agg.procedimentos = Object.values(pMap).map(p => {
        p.cbos = Object.values(p.cbos || {}).sort((a,b) => b.valAprovado - a.valAprovado);
        return p;
    }).sort((a,b) => b.valAprovado - a.valAprovado);
    agg.cbos = Object.values(cboMap).map(c => {
        c.procedimentos = Object.values(c.procedimentos || {}).sort((a,b) => b.valAprovado - a.valAprovado);
        return c;
    }).sort((a,b) => b.valAprovado - a.valAprovado);
    
    return agg;
}

/* =========================================================
   ARGOS IA
   ========================================================= */
function bindArgosIA() {
    document.getElementById('btnArgosAI')?.addEventListener('click', () => showModal('modalArgosIA'));
    document.getElementById('btnAnalisarArgos')?.addEventListener('click', gerarAnaliseArgos);
}

function gerarAnaliseArgos() {
    const d = APP_STATE.data;
    if (!d) { showToast('⚠️ Carregue os dados primeiro.', 'warn'); return; }

    showLoading('ARGOS IA analisando produção...');

    setTimeout(() => {
        hideLoading();
        const r = d.resumo;
        const top1 = [...d.unidades].sort((a,b) => b.valAprovado - a.valAprovado)[0];
        const critica = d.unidades.filter(u => classificarStatus(u.pctAprovacaoVal).status === 'CRITICA');
        const comGlosa = d.unidades.filter(u => u.valGlosado > 0);
        const ticketMedio = r.qtdAprovada > 0 ? r.valAprovado / r.qtdAprovada : 0;
        const meses = d.faturamentoMensal;
        const crescimento = meses.length >= 2
            ? ((meses[meses.length-1].valAprovado - meses[0].valAprovado) / meses[0].valAprovado * 100)
            : 0;

        const resultado = document.getElementById('argosResult');
        if (!resultado) return;

        resultado.innerHTML = `
            <h4><i class="fas fa-robot"></i> Relatório ARGOS IA — ${d.competencia}</h4>
            <p><strong>📊 Visão Geral:</strong> No período de ${d.competencia}, o município de ${d.municipio}/${d.uf} apresentou <strong>${fmt.numero(r.qtdApresentada)}</strong> procedimentos ao SIA/SUS, dos quais <strong>${fmt.numero(r.qtdAprovada)}</strong> foram aprovados (<strong>${fmt.pct(r.pctAprovacaoQtd)}</strong> de aprovação), gerando um faturamento líquido de <strong>${fmt.moeda(r.valAprovado)}</strong>.</p>

            <p><strong>🏆 Maior Produtor:</strong> O ${top1 ? top1.nome : '—'} concentrou <strong>${fmt.pct(top1?.pctDoTotal || 0)}</strong> do faturamento aprovado, totalizando <strong>${fmt.moeda(top1?.valAprovado || 0)}</strong>. Essa concentração sugere dependência estratégica desta unidade para o cumprimento das metas ambulatoriais.</p>

            <p><strong>💰 Eficiência Financeira:</strong> O valor glosado total foi de <strong>${fmt.moeda(r.valGlosado)}</strong> (<strong>${fmt.pct(r.pctGlosaQtd)}</strong>), distribuído em <strong>${comGlosa.length}</strong> unidades. O ticket médio por procedimento aprovado é de <strong>${fmt.moeda(ticketMedio)}</strong>.</p>

            ${crescimento !== 0 ? `<p><strong>📈 Tendência:</strong> O faturamento apresentou <strong>${crescimento >= 0 ? 'crescimento' : 'queda'} de ${fmt.pct(Math.abs(crescimento))}</strong> entre ${meses[0]?.nomeMes} e ${meses[meses.length-1]?.nomeMes}, indicando ${crescimento >= 0 ? 'expansão da oferta de serviços' : 'redução da produção ambulatorial'}.</p>` : ''}

            ${critica.length > 0 ? `<p><strong>🔴 Alertas Críticos:</strong> ${critica.length} unidade(s) apresentaram taxa de aprovação financeira abaixo de 95%: <strong>${critica.map(u => u.nome).join(', ')}</strong>. Recomenda-se auditoria específica nestas unidades.</p>` : '<p><strong>✅ Conformidade:</strong> Todas as unidades com faturamento ativo apresentam taxas de aprovação financeira adequadas (≥ 97%).</p>'}

            <p><strong>📋 Recomendações ARGOS:</strong></p>
            <ul>
                ${critica.length > 0 ? `<li>Realizar auditoria imediata nas unidades com status CRÍTICO</li>` : ''}
                <li>Monitorar mensalmente as unidades com taxa de glosa crescente</li>
                <li>${top1?.pctDoTotal > 40 ? `Avaliar diversificação da oferta para reduzir dependência do ${top1?.nome}` : 'Manter o equilíbrio atual de produção entre unidades'}</li>
                <li>Revisar codificação SIGTAP dos procedimentos mais glosados</li>
                <li>Capacitar equipes de faturamento das unidades com glosa recorrente</li>
            </ul>
        `;
        resultado.classList.remove('hidden');
    }, 1800);
}

/* =========================================================
   MODAIS
   ========================================================= */
function bindModals() {
    document.getElementById('btnFecharImportar')?.addEventListener('click', () => hideModal('modalImportar'));
    document.getElementById('btnFecharArgos')?.addEventListener('click', () => hideModal('modalArgosIA'));
    
    // Novo modal de exclusão
    document.getElementById('btnFecharConfirmarExclusao')?.addEventListener('click', () => hideModal('modalConfirmarExclusao'));
    document.getElementById('btnConfirmarExclusaoCancelar')?.addEventListener('click', () => hideModal('modalConfirmarExclusao'));
    
    document.getElementById('btnConfirmarExclusaoOk')?.addEventListener('click', async () => {
        if (!window.pendingDelete) return;
        const { id, fileName, competencia } = window.pendingDelete;
        
        hideModal('modalConfirmarExclusao');
        showLoading('Excluindo faturamento...');
        
        try {
            let imports = await AppDB.getItem('imported_files') || [];
            imports = imports.filter(i => i.id !== id);
            await AppDB.setItem('imported_files', imports);
            
            if (window.datasets) {
                window.datasets = window.datasets.filter(d => d.competencia !== competencia);
                await AppDB.setItem('datasets', window.datasets);
            }

            if (SupabaseConfig.isConnected()) {
                try {
                    const user = JSON.parse(sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user') || '{}');
                    if (user.username) {
                        await SupabaseService.logAction(user.username, 'ARQUIVOS', 'EXCLUSAO_SIA', `Competência de faturamento ${competencia} excluída localmente.`);
                    }
                } catch (cloudErr) {
                    console.error("Erro ao salvar log de exclusão no Supabase:", cloudErr);
                }
            }
            
            if (!window.datasets || window.datasets.length === 0) {
                window.datasets = [];
                loadData(getEmptyData());
                showModal('modalImportar');
            } else {
                const agg = buildAggregatedData(window.datasets);
                await PortariaModule.loadPortariaForMunicipio(agg.municipio, agg.uf);
                loadData(agg);
            }
            
            showToast(`✅ Arquivo ${fileName} excluído com sucesso!`, 'success');
        } catch (err) {
            console.error("Erro ao excluir arquivo:", err);
            showToast('❌ Erro ao excluir faturamento.', 'error');
        } finally {
            hideLoading();
            window.pendingDelete = null;
            await renderArquivosManager();
        }
    });

    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.addEventListener('click', e => {
            if (e.target === m) hideModal(m.id);
        });
    });
}

function showModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id)?.classList.add('hidden'); }

/* =========================================================
   BUSCA NAS TABELAS
   ========================================================= */
function bindSearch(inputId, tableId) {
    const input = document.getElementById(inputId);
    const table = document.getElementById(tableId);
    if (!input || !table) return;

    // Remover listener anterior
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('input', () => {
        const q = newInput.value.toLowerCase();
        table.querySelectorAll('tbody tr').forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });
}

/* =========================================================
   UTILITÁRIOS
   ========================================================= */
function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function showToast(msg, type = '') {
    const loginContainer = document.getElementById('login-container');
    if (loginContainer && !loginContainer.classList.contains('hidden')) {
        // Ignora toasts de carregamento de fundo se a tela de login estiver visível
        return;
    }

    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast ${type ? 'toast-' + type : ''}`;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

function showLoading(msg = 'Carregando...') {
    const ov = document.getElementById('loadingOverlay');
    const lbl = document.getElementById('loadingMsg');
    if (ov) { ov.classList.remove('hidden'); }
    if (lbl) { lbl.textContent = msg; }
}

function hideLoading() {
    document.getElementById('loadingOverlay')?.classList.add('hidden');
}

/* =========================================================
   ABAS DE RELATÓRIO E EXPORTAÇÃO PARAMETRIZADA
   ========================================================= */
function bindReports() {
    // Marcar todos os checkboxes
    document.getElementById('btnReportCheckAll')?.addEventListener('click', () => {
        document.querySelectorAll('.checkbox-list input[type="checkbox"]').forEach(chk => chk.checked = true);
    });
    
    // Desmarcar todos os checkboxes
    document.getElementById('btnReportUncheckAll')?.addEventListener('click', () => {
        document.querySelectorAll('.checkbox-list input[type="checkbox"]').forEach(chk => chk.checked = false);
    });
    
    // Evento de clique para o botão PDF do Relatório
    document.getElementById('btnReportPDF')?.addEventListener('click', () => {
        PDFExport.exportExecutivo();
    });
    
    // Evento de clique para o botão Excel do Relatório
    document.getElementById('btnReportExcel')?.addEventListener('click', () => {
        ExcelExport.export();
    });

    // Eventos de clique para exportação PDF de tabelas específicas
    document.getElementById('btnExportProcPDF')?.addEventListener('click', () => {
        PDFExport.exportProcedimentosPDF();
    });

    document.getElementById('btnExportCboPDF')?.addEventListener('click', () => {
        PDFExport.exportCboPDF();
    });

    document.getElementById('btnExportUnidadesPDF')?.addEventListener('click', () => {
        PDFExport.exportUnidadesPDF();
    });

    document.getElementById('btnExportEficienciaPDF')?.addEventListener('click', () => {
        PDFExport.exportEficienciaPDF();
    });

    document.getElementById('btnExportTetoMacPDF')?.addEventListener('click', () => {
        PDFExport.exportTetoMacPDF();
    });

    // Preencher combobox de subgrupos e adicionar listener
    const comboSubgrupo = document.getElementById('filterSubgrupoPDF');
    if (comboSubgrupo && window.SIGTAP_SUBGRUPOS) {
        Object.keys(window.SIGTAP_SUBGRUPOS).sort().forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = `${key} — ${window.SIGTAP_SUBGRUPOS[key]}`;
            comboSubgrupo.appendChild(opt);
        });
    }

    document.getElementById('btnExportSubgrupoPDF')?.addEventListener('click', () => {
        const sel = document.getElementById('filterSubgrupoPDF')?.value;
        if (!sel) {
            showToast('⚠️ Selecione um subgrupo antes de exportar.', 'warn');
            return;
        }
        if (PDFExport.exportRelatorioMensalSubgrupoPDF) {
            PDFExport.exportRelatorioMensalSubgrupoPDF(sel);
        } else {
            showToast('❌ Erro: Função de exportação não implementada.', 'error');
        }
    });
}

function getReportFilteredData() {
    if (!APP_STATE.data) return null;
    if (!window.datasets || window.datasets.length === 0) return APP_STATE.data;
    
    const f = {
        ano: document.getElementById('reportAno')?.value || 'all',
        mes: document.getElementById('reportMes')?.value || 'all',
        unidade: document.getElementById('reportUnidade')?.value || 'all',
        status: 'all'
    };
    
    const hasLinhas = window.datasets.some(d => d.linhas && d.linhas.length > 0);
    
    if (hasLinhas) {
        let linhas = [];
        let activeDatasets = [];
        window.datasets.forEach(d => {
            if (f.mes !== 'all' && d.competencia.split('/')[0] !== f.mes) return;
            if (f.ano !== 'all' && String(d.ano) !== String(f.ano) && (!d.competencia || !d.competencia.endsWith('/' + f.ano))) return;
            activeDatasets.push(d);
            if (d.linhas) linhas = linhas.concat(d.linhas);
        });

        if (f.unidade !== 'all') linhas = linhas.filter(l => l.uId === f.unidade);

        const cmpString = activeDatasets.length > 0 ? activeDatasets.map(d => d.competencia).join(', ') : window.datasets[0].competencia;
        const anoString = activeDatasets.length > 0 ? activeDatasets[0].ano : window.datasets[0].ano;

        const agg = aggregateLinhas(linhas, cmpString, anoString);
        return agg;
    }
    
    // Fallback original (dados demo / legados sem linhas)
    let dts = window.datasets;
    if (f.mes !== 'all') {
        dts = dts.filter(d => {
            const mesNum = (d.faturamentoMensal && d.faturamentoMensal.length > 0) ? d.faturamentoMensal[0].nomeMes.split('/')[0] : '';
            return mesNum === f.mes;
        });
    }
    if (f.ano !== 'all') {
        dts = dts.filter(d => d.ano === f.ano || (d.competencia && d.competencia.endsWith('/' + f.ano)));
    }
    
    let agg = buildAggregatedData(dts);
    if (!agg) {
        agg = { ...APP_STATE.data, unidades: [], faturamentoMensal: [], procedimentos: [], cbos: [], resumo: { qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0, valApresentado: 0, valAprovado: 0, valGlosado: 0, pctAprovacaoQtd: 0, pctGlosaQtd: 0, totalUnidades: 0 }};
    }

    let unidades = [...agg.unidades];
    let faturamento = [...agg.faturamentoMensal];
    let procedimentos = [...agg.procedimentos];
    let cbos = [...(agg.cbos || [])];

    if (f.unidade !== 'all') {
        const uId = f.unidade;
        unidades = unidades.filter(u => u.id === uId);
        
        faturamento = faturamento.map(m => {
            const val = m.valoresPorUnidade && m.valoresPorUnidade[uId] ? m.valoresPorUnidade[uId] : { valApresentado: 0, valAprovado: 0, valGlosado: 0, qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0 };
            return { ...m, ...val, pctAprovado: val.valApresentado > 0 ? (val.valAprovado / val.valApresentado * 100) : 0 };
        });

        procedimentos = procedimentos.map(p => {
            const val = p.valoresPorUnidade && p.valoresPorUnidade[uId] ? p.valoresPorUnidade[uId] : { valAprovado: 0, qtdAprovada: 0 };
            return { ...p, ...val };
        }).filter(p => p.valAprovado > 0 || p.qtdAprovada > 0).sort((a,b) => b.valAprovado - a.valAprovado);

        cbos = cbos.map(c => {
            const val = c.valoresPorUnidade && c.valoresPorUnidade[uId] ? c.valoresPorUnidade[uId] : { valAprovado: 0, qtdAprovada: 0 };
            return { ...c, ...val };
        }).filter(c => c.valAprovado > 0 || c.qtdAprovada > 0).sort((a,b) => b.valAprovado - a.valAprovado);
    }

    const resumo = calcularResumo(unidades, faturamento);
    return { ...agg, unidades, faturamentoMensal: faturamento, procedimentos, cbos, resumo };
}

window.getReportFilteredData = getReportFilteredData;

/* =========================================================
   INTEGRAÇÃO SUPABASE (NUVEM)
   ========================================================= */
function bindSupabase() {
    const btnConfig = document.getElementById('btnConfigSupabase');
    const modal = document.getElementById('modalSupabase');
    const btnFechar = document.getElementById('btnFecharSupabase');
    const btnTestar = document.getElementById('btnTestarConexaoSupabase');
    const btnSalvar = document.getElementById('btnSalvarSupabase');
    const inpUrl = document.getElementById('supabaseUrl');
    const inpKey = document.getElementById('supabaseAnonKey');
    const divResult = document.getElementById('supabaseTestResult');

    if (!btnConfig || !modal) return;

    // Ajusta o botão de salvar para atuar como "Fechar" já que as chaves são gerenciadas automaticamente
    if (btnSalvar) {
        btnSalvar.innerHTML = '<i class="fas fa-check"></i> Fechar';
        btnSalvar.style.backgroundColor = '#64748b';
        btnSalvar.style.borderColor = '#64748b';
    }

    btnConfig.addEventListener('click', () => {
        inpUrl.value = SupabaseConfig.getUrl();
        inpKey.value = SupabaseConfig.getAnonKey();
        inpUrl.disabled = true;
        inpKey.disabled = true;
        
        // Explicação amigável de que a conexão é automática e compartilhada
        const pDesc = modal.querySelector('p');
        if (pDesc) {
            pDesc.innerHTML = 'As credenciais do banco de dados Supabase estão configuradas de forma automática e integrada para todos os usuários. Use a opção de teste abaixo para verificar o status do servidor.';
            pDesc.style.color = '#0284c7';
        }
        
        divResult.style.display = 'none';
        modal.classList.remove('hidden');
    });

    btnFechar.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    btnTestar.addEventListener('click', async () => {
        divResult.style.display = 'block';
        divResult.style.backgroundColor = '#eff6ff';
        divResult.style.color = '#1e40af';
        divResult.textContent = 'Testando conexão...';

        const res = await SupabaseService.testConnection();

        if (res.success) {
            divResult.style.backgroundColor = '#dcfce7';
            divResult.style.color = '#166534';
            divResult.innerHTML = `<i class="fas fa-check-circle"></i> ${res.message}`;
        } else {
            divResult.style.backgroundColor = '#fee2e2';
            divResult.style.color = '#991b1b';
            divResult.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${res.message}`;
        }
    });

    btnSalvar.addEventListener('click', () => {
        modal.classList.add('hidden');
    });
}

/* =========================================================
   HISTÓRICO DE IMPORTAÇÕES - CENTRAL DE ARQUIVOS
   ========================================================= */
async function registerImport(fileName, type, competencia) {
    try {
        let imports = await AppDB.getItem('imported_files') || [];
        
        // Evitar duplicados no histórico para o mesmo arquivo e competência
        imports = imports.filter(i => !(i.fileName === fileName && i.competencia === competencia));
        
        const now = new Date();
        const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
                        now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        imports.unshift({
            id: type.toLowerCase() + '_' + Date.now(),
            fileName,
            importDate: dateStr,
            type,
            competencia
        });
        
        // Limitar histórico a 15 itens
        if (imports.length > 15) {
            imports = imports.slice(0, 15);
        }
        
        await AppDB.setItem('imported_files', imports);
        await renderArquivosManager();
    } catch (e) {
        console.error("Erro ao registrar importação no histórico:", e);
    }
}

async function renderArquivosManager() {
    updateLogoPreview();
    
    // Status do SIGTAP
    const lblBadge = document.getElementById('lblSigtapStatusBadge');
    const lblDate = document.getElementById('lblSigtapStatusDate');
    if (lblBadge && lblDate) {
        const savedSigtap = await AppDB.getItem('SIGTAP_DB');
        const sigtapMeta = await AppDB.getItem('sigtap_meta');
        
        if (savedSigtap && Object.keys(savedSigtap).length > 0) {
            lblBadge.className = 'sigtap-status-badge loaded';
            lblBadge.innerHTML = `<i class="fas fa-check-circle"></i> Carregada (${Object.keys(savedSigtap).length} itens)`;
            lblDate.textContent = sigtapMeta && sigtapMeta.importDate 
                ? `Importada em ${sigtapMeta.importDate} (${sigtapMeta.fileName})`
                : 'Tabela importada e ativa';
        } else {
            lblBadge.className = 'sigtap-status-badge missing';
            lblBadge.innerHTML = `<i class="fas fa-times-circle"></i> Não Carregada`;
            lblDate.textContent = 'Importe o arquivo TXT da tabela SIGTAP';
        }
    }

    // Tabela de Histórico de Arquivos de Faturamento SIA/SUS
    const tbody = document.getElementById('tbodyHistoricoArquivos');
    if (tbody) {
        const imports = await AppDB.getItem('imported_files') || [];
        // Filtrar apenas arquivos SIA/SUS e que correspondam a alguma competência carregada localmente (window.datasets)
        const faturamentos = imports.filter(i => {
            if (i.type !== 'SIA/SUS') return false;
            if (!window.datasets || window.datasets.length === 0) return false;
            return window.datasets.some(d => d.competencia === i.competencia);
        });
        
        if (faturamentos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 15px;">Nenhum arquivo local correspondente a este município</td></tr>`;
        } else {
            tbody.innerHTML = faturamentos.map(item => {
                let totalQtd = '—';
                let totalVal = 'R$ —';
                
                if (window.datasets) {
                    const ds = window.datasets.find(d => d.competencia === item.competencia);
                    if (ds && ds.resumo) {
                        totalQtd = ds.resumo.qtdAprovada.toLocaleString('pt-BR');
                        totalVal = 'R$ ' + ds.resumo.valAprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    }
                }
                
                // Ocultar botão de exclusão para Visitante ou Gerente
                const userSession = JSON.parse(sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user') || 'null');
                const hideDelete = userSession && (userSession.role === 'VISITANTE' || userSession.role === 'GERENTE');
                const deleteBtnHtml = hideDelete ? '' : `
                    <button class="btn-delete-file" onclick="confirmDeleteImport('${item.id}', '${item.fileName.replace(/'/g, "\\'")}', '${item.importDate}', '${item.competencia}')" title="Excluir arquivo">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                
                return `
                    <tr>
                        <td><strong>${item.fileName}</strong></td>
                        <td class="mono">${item.importDate}</td>
                        <td><span class="status-badge-cell badge-boa" style="font-size: 0.68rem; padding: 2px 6px;">${item.competencia}</span></td>
                        <td class="text-right mono">${totalQtd}</td>
                        <td class="text-right mono fw-bold text-green">${totalVal}</td>
                        <td class="text-center">
                            ${deleteBtnHtml}
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
    
    // Atualizar Painel de Bases na Nuvem
    renderPainelBasesNuvem();
}

/**
 * Renderiza o novo painel de Bases de Dados na Nuvem na seção de Arquivos
 */
async function renderPainelBasesNuvem() {
    const listEl = document.getElementById('listaBasesNuvem');
    const btnRefresh = document.getElementById('btnAtualizarBasesNuvem');
    
    if (!listEl) return;
    
    // Anexar evento de refresh se não estiver anexado
    if (btnRefresh && !btnRefresh.hasAttribute('data-bound')) {
        btnRefresh.addEventListener('click', () => {
            renderPainelBasesNuvem();
        });
        btnRefresh.setAttribute('data-bound', 'true');
    }

    if (!SupabaseConfig.isConnected()) {
        listEl.innerHTML = `<div class="text-center text-muted" style="padding: 20px;"><i class="fas fa-cloud-slash" style="font-size: 1.5rem; margin-bottom: 8px;"></i><br><span style="font-size: 0.8rem;">Supabase não conectado</span></div>`;
        return;
    }

    listEl.innerHTML = `<div class="text-center text-muted" style="padding: 20px;"><i class="fas fa-spinner fa-spin" style="margin-bottom: 8px;"></i><br><span style="font-size: 0.8rem;">Buscando bases...</span></div>`;

    try {
        const bases = await SupabaseService.listarResumoBasesNuvem();
        
        if (!bases || bases.length === 0) {
            listEl.innerHTML = `<div class="text-center text-muted" style="padding: 20px;"><i class="fas fa-folder-open" style="font-size: 1.5rem; margin-bottom: 8px;"></i><br><span style="font-size: 0.8rem;">Nenhuma base processada na nuvem</span></div>`;
            return;
        }

        const ativoId = window.MunicipioContext ? MunicipioContext.getAtivo()?.id : null;
        
        // Verifica perfil do usuário logado
        const userStr = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        let isGerente = false;
        let currentUser = null;
        if (userStr) {
            try { 
                currentUser = JSON.parse(userStr);
                isGerente = currentUser.role === 'GERENTE'; 
            } catch(e){}
        }

        let basesToRender = bases;
        if (isGerente && currentUser && !currentUser.acesso_multi_municipio && currentUser.municipio_vinculado) {
            const vinculado = currentUser.municipio_vinculado.toUpperCase();
            basesToRender = bases.filter(b => {
                const bString = `${b.nome}-${b.uf}`.toUpperCase();
                return bString === vinculado;
            });
        }

        if (basesToRender.length === 0) {
            listEl.innerHTML = `<div class="text-center text-muted" style="padding: 20px;"><i class="fas fa-folder-open" style="font-size: 1.5rem; margin-bottom: 8px;"></i><br><span style="font-size: 0.8rem;">Nenhuma base acessível na nuvem</span></div>`;
            return;
        }

        listEl.innerHTML = basesToRender.map(b => {
            const isActive = ativoId === b.id;
            const bgClass = isActive ? 'style="border-color: var(--sus-blue-light); background: rgba(14, 165, 233, 0.05);"' : '';
            const compsHtml = b.competencias.map(c => `
                <span class="db-nuvem-comp-badge">
                    ${c} 
                    ${!isGerente ? `<i class="fas fa-times badge-delete" title="Excluir competência" onclick="event.stopPropagation(); confirmarExclusaoCompetenciaNuvem('${b.id}', '${b.nome.replace(/'/g, "\\'")}', '${c}')"></i>` : ''}
                </span>
            `).join('');
            
            return `
                <div class="db-nuvem-item" ${bgClass} onclick="carregarBaseNuvem('${b.id}')">
                    <div class="db-nuvem-header">
                        <div class="db-nuvem-title">
                            ${isActive ? '<i class="fas fa-check-circle" style="color: var(--sus-blue-light);"></i>' : '<i class="fas fa-database" style="color: var(--gray-400);"></i>'}
                            ${b.nome}
                            <span class="db-nuvem-uf">${b.uf}</span>
                        </div>
                        <div class="db-nuvem-actions">
                            ${!isGerente ? `
                            <button class="btn-nuvem-action btn-add" title="Adicionar arquivo para este município" onclick="event.stopPropagation(); adicionarMaisArquivos('${b.id}')">
                                <i class="fas fa-plus"></i>
                            </button>
                            <button class="btn-nuvem-action btn-trash" title="Excluir toda a base deste município" onclick="event.stopPropagation(); confirmarExclusaoBaseNuvem('${b.id}', '${b.nome.replace(/'/g, "\\'")}')">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="db-nuvem-comps">
                        ${compsHtml}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error("Erro ao renderizar bases na nuvem:", e);
        listEl.innerHTML = `<div class="text-center text-red" style="padding: 20px;"><i class="fas fa-exclamation-triangle" style="margin-bottom: 8px;"></i><br><span style="font-size: 0.8rem;">Erro ao carregar bases</span></div>`;
    }
}

/**
 * Função para carregar instantaneamente um município da nuvem a partir do clique no painel
 */
window.carregarBaseNuvem = async function(municipioId) {
    if (!window.MunicipioContext) return;
    showLoading('Carregando base de dados...');
    try {
        const ok = await MunicipioContext.carregarMunicipio(municipioId);
        if (ok) {
            showToast('✅ Base carregada com sucesso!', 'success');
        }
    } catch (e) {
        showToast('❌ Erro ao carregar base', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Função para adicionar mais arquivos de um município pela nuvem
 */
window.adicionarMaisArquivos = async function(municipioId) {
    if (!window.MunicipioContext) return;
    try {
        const ativoId = MunicipioContext.getAtivo()?.id;
        // Se já não for o atual, carrega primeiro
        if (ativoId !== municipioId) {
            showLoading('Carregando base...');
            await MunicipioContext.carregarMunicipio(municipioId);
            hideLoading();
        }
        // Abre o modal de importação (o sistema não deixará importar outro município)
        showModal('modalImportar');
    } catch (e) {
        hideLoading();
        showToast('Erro ao preparar importação.', 'error');
    }
}

/**
 * Função para excluir todas as competências de um município na nuvem
 */
window.confirmarExclusaoBaseNuvem = async function(municipioId, nome) {
    if (!confirm(`Tem certeza que deseja excluir TODA a base de dados de ${nome} na nuvem? Essa ação não pode ser desfeita.`)) return;

    showLoading('Excluindo base...');
    try {
        await SupabaseService.deleteAllProducaoSia(municipioId);
        showToast(`Base de ${nome} excluída com sucesso.`, 'success');
        
        // Se o município excluído for o ativo localmente, avisa o usuário (pode limpar depois se necessário)
        if (window.MunicipioContext && MunicipioContext.getAtivo()?.id === municipioId) {
            showToast('A base ativa foi excluída da nuvem.', 'warning');
            // opcionalmente: limpar local
        }
        
        // Atualiza painel
        renderPainelBasesNuvem();
    } catch (e) {
        console.error("Erro ao excluir base:", e);
        showToast('Erro ao excluir base de dados.', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Função para excluir uma competência de produção de um município na nuvem
 */
window.confirmarExclusaoCompetenciaNuvem = async function(municipioId, nome, competencia) {
    if (!confirm(`Excluir a competência ${competencia} de ${nome}?`)) return;

    showLoading('Excluindo competência...');
    try {
        await SupabaseService.deleteProducaoSia(municipioId, competencia);
        showToast(`Competência ${competencia} excluída.`, 'success');
        
        // Atualiza painel
        renderPainelBasesNuvem();

        // Se for do município ativo, recarrega
        if (window.MunicipioContext && MunicipioContext.getAtivo()?.id === municipioId) {
            await MunicipioContext.carregarMunicipio(municipioId);
        }
    } catch (e) {
        console.error("Erro ao excluir competência:", e);
        showToast('Erro ao excluir competência.', 'error');
    } finally {
        hideLoading();
    }
}

window.confirmDeleteImport = function(id, fileName, importDate, competencia) {
    window.pendingDelete = { id, fileName, importDate, competencia };
    
    const nameEl = document.getElementById('delConfirmName');
    const dateEl = document.getElementById('delConfirmDate');
    if (nameEl) nameEl.textContent = fileName;
    if (dateEl) dateEl.textContent = importDate;
    
    showModal('modalConfirmarExclusao');
};

/* =========================================================
   ALERTA DE SEGURANÇA MUNICÍPIO (v4.0 — Reescrito)
   ========================================================= */

/**
 * Modal de confirmação de troca de contexto (para users com acesso multi)
 */
function showContextSwitchModal(municipioTentado, municipioExistente, onConfirm) {
    const existing = document.getElementById('securityAlertModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'securityAlertModalOverlay';
    Object.assign(overlay.style, { position:'fixed', top:'0', left:'0', width:'100vw', height:'100vh', backgroundColor:'rgba(0,0,0,0.85)', zIndex:'999999', display:'flex', justifyContent:'center', alignItems:'center', backdropFilter:'blur(4px)' });

    const modalBox = document.createElement('div');
    Object.assign(modalBox.style, { backgroundColor:'#1a1d24', border:'2px solid #f59e0b', borderRadius:'12px', padding:'30px', maxWidth:'600px', width:'90%', color:'#fff', boxShadow:'0 0 40px rgba(245,158,11,0.4)', textAlign:'center', fontFamily:'Inter, system-ui, sans-serif' });

    modalBox.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 10px;">🔄</div>
        <h2 style="color: #f59e0b; margin-top: 0; font-size: 1.5rem; font-weight: 800;">Troca de Município</h2>
        <p style="font-size: 1rem; color: #ced4da; margin-bottom: 12px;">O arquivo importado pertence a:</p>
        <div style="background: rgba(245,158,11,0.1); border: 1px dashed #f59e0b; padding: 12px; border-radius: 8px; margin-bottom: 18px;">
            <span style="font-size: 1.6rem; font-weight: 800; color: #f59e0b;">${municipioTentado}</span>
        </div>
        <p style="font-size: 1rem; color: #ced4da; margin-bottom: 12px;">Mas o contexto ativo é:</p>
        <div style="background: rgba(46,204,113,0.1); border: 1px dashed #2ecc71; padding: 12px; border-radius: 8px; margin-bottom: 18px;">
            <span style="font-size: 1.6rem; font-weight: 800; color: #2ecc71;">${municipioExistente}</span>
        </div>
        <p style="font-size: 0.9rem; color: #adb5bd; margin-bottom: 25px;">Deseja limpar os dados atuais e trocar para o novo município?</p>
        <div style="display: flex; gap: 12px; justify-content: center;">
            <button id="btnContextSwitchConfirm" style="background-color: #f59e0b; color: #000; border: none; padding: 12px 30px; font-size: 1rem; font-weight: bold; border-radius: 8px; cursor: pointer;">TROCAR E IMPORTAR</button>
            <button id="btnContextSwitchCancel" style="background-color: #475569; color: #fff; border: none; padding: 12px 30px; font-size: 1rem; font-weight: bold; border-radius: 8px; cursor: pointer;">CANCELAR</button>
        </div>
    `;

    overlay.appendChild(modalBox);
    document.body.appendChild(overlay);

    const closeOverlay = () => { overlay.style.transition='opacity 0.2s'; overlay.style.opacity='0'; setTimeout(()=>overlay.remove(),200); };
    document.getElementById('btnContextSwitchCancel').addEventListener('click', closeOverlay);
    document.getElementById('btnContextSwitchConfirm').addEventListener('click', () => { closeOverlay(); if (onConfirm) onConfirm(); });

    if (typeof modalBox.animate === 'function') {
        modalBox.animate([{ transform:'scale(0.8)', opacity:0 },{ transform:'scale(1)', opacity:1 }], { duration:300, easing:'cubic-bezier(0.175,0.885,0.32,1.275)' });
    }
}

/**
 * Modal de permissão negada (para users sem acesso multi)
 */
function showPermissionDeniedModal(municipioTentado) {
    const existing = document.getElementById('securityAlertModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'securityAlertModalOverlay';
    Object.assign(overlay.style, { position:'fixed', top:'0', left:'0', width:'100vw', height:'100vh', backgroundColor:'rgba(0,0,0,0.85)', zIndex:'999999', display:'flex', justifyContent:'center', alignItems:'center', backdropFilter:'blur(4px)' });

    const modalBox = document.createElement('div');
    Object.assign(modalBox.style, { backgroundColor:'#1a1d24', border:'2px solid #e74c3c', borderRadius:'12px', padding:'30px', maxWidth:'600px', width:'90%', color:'#fff', boxShadow:'0 0 40px rgba(231,76,60,0.4)', textAlign:'center', fontFamily:'Inter, system-ui, sans-serif' });

    modalBox.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 10px;">🚫</div>
        <h2 style="color: #e74c3c; margin-top: 0; font-size: 1.5rem; text-transform: uppercase; font-weight: 800;">Acesso Negado</h2>
        <p style="font-size: 1rem; color: #ced4da; margin-bottom: 12px;">Você tentou importar dados do município:</p>
        <div style="background: rgba(231,76,60,0.1); border: 1px dashed #e74c3c; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
            <span style="font-size: 1.6rem; font-weight: 800; color: #e74c3c;">${municipioTentado}</span>
        </div>
        <p style="font-size: 0.9rem; color: #adb5bd; margin-bottom: 25px; line-height: 1.5;">Seu perfil não tem acesso multi-município. Apenas dados do seu município vinculado podem ser importados.<br>Contate o administrador do sistema para obter acesso.</p>
        <button id="btnPermissionDeniedOk" style="background-color: #e74c3c; color: #fff; border: none; padding: 12px 30px; font-size: 1rem; font-weight: bold; border-radius: 8px; cursor: pointer;">ENTENDI</button>
    `;

    overlay.appendChild(modalBox);
    document.body.appendChild(overlay);

    document.getElementById('btnPermissionDeniedOk').addEventListener('click', () => {
        overlay.style.transition = 'opacity 0.2s'; overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 200);
    });

    if (typeof modalBox.animate === 'function') {
        modalBox.animate([{ transform:'scale(0.8)', opacity:0 },{ transform:'scale(1)', opacity:1 }], { duration:300, easing:'cubic-bezier(0.175,0.885,0.32,1.275)' });
    }
}

