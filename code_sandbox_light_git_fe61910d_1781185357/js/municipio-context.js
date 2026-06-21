/**
 * ARGOS FPA — municipio-context.js
 * Módulo de contexto multi-município
 * Gerencia o município ativo da sessão, troca de contexto,
 * e carregamento de dados/logo por município.
 */

const MunicipioContext = {
    _STORAGE_KEY: 'argos_municipio_ativo',

    /**
     * Retorna o município ativo da sessão
     * @returns {{ id: string, nome: string, uf: string } | null}
     */
    getAtivo() {
        try {
            const raw = localStorage.getItem(this._STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.error('Erro ao ler município ativo:', e);
            return null;
        }
    },

    /**
     * Define o município ativo na sessão
     */
    setAtivo(municipioId, nome, uf) {
        const obj = { id: municipioId, nome, uf };
        localStorage.setItem(this._STORAGE_KEY, JSON.stringify(obj));
        this.atualizarBadgeContexto();
        return obj;
    },

    /**
     * Limpa o município ativo
     */
    limparAtivo() {
        localStorage.removeItem(this._STORAGE_KEY);
        this.atualizarBadgeContexto();
    },

    /**
     * Atualiza o badge visual de contexto na UI
     */
    atualizarBadgeContexto() {
        const ativo = this.getAtivo();
        const badge = document.getElementById('badgeMunicipioAtivo');
        if (badge) {
            if (ativo) {
                badge.textContent = `📍 Contexto atual: ${ativo.nome}-${ativo.uf}`;
                badge.classList.add('ativo');
            } else {
                badge.textContent = '📍 Sem município selecionado';
                badge.classList.remove('ativo');
            }
        }
    },

    /**
     * Lista municípios disponíveis para o usuário logado
     * @param {object} userSession - Sessão do usuário com acesso_multi_municipio e municipio_vinculado
     * @returns {Promise<Array<{ id: string, nome: string, uf: string }>>}
     */
    async listarDisponiveis(userSession) {
        if (!SupabaseConfig.isConnected()) return [];

        try {
            const todos = await SupabaseService.listarMunicipios();
            if (!todos || todos.length === 0) return [];

            // Verifica acesso multi-município
            if (userSession && userSession.acesso_multi_municipio) {
                return todos;
            }

            // Usuário restrito: filtrar apenas o município vinculado
            const vinculado = (userSession && userSession.municipio_vinculado) || 'Bacabal-MA';
            const parts = vinculado.split('-');
            const nomeVinculado = parts[0].trim().toUpperCase();
            const ufVinculada = parts.length > 1 ? parts[1].trim().toUpperCase() : '';

            return todos.filter(m => {
                const matchNome = m.nome.trim().toUpperCase() === nomeVinculado;
                const matchUf = ufVinculada ? m.uf.trim().toUpperCase() === ufVinculada : true;
                return matchNome && matchUf;
            });
        } catch (e) {
            console.error('Erro ao listar municípios disponíveis:', e);
            return [];
        }
    },

    /**
     * Carrega dados completos de um município do Supabase
     * Atualiza window.datasets, logo, IndexedDB cache, e re-renderiza a UI
     * @param {string} municipioId - UUID do município
     * @returns {Promise<boolean>} sucesso
     */
    async carregarMunicipio(municipioId) {
        try {
            showLoading('Carregando dados do município...');

            // 1. Buscar dados de produção
            const producaoList = await SupabaseService.loadProducaoSia(municipioId);
            
            if (!producaoList || producaoList.length === 0) {
                hideLoading();
                showToast('⚠️ Nenhum dado de produção encontrado para este município na nuvem.', 'warn');
                return false;
            }

            // 2. Montar window.datasets a partir dos dados_json
            window.datasets = producaoList.map(p => {
                const parsed = typeof p.dados_json === 'string' ? JSON.parse(p.dados_json) : p.dados_json;
                return parsed;
            });

            // 3. Salvar cache local por município
            const cacheKey = 'datasets_' + municipioId;
            await AppDB.setItem(cacheKey, window.datasets);
            // Salvar também na chave padrão para compatibilidade
            await AppDB.setItem('datasets', window.datasets);

            // 4. Definir município ativo
            const municipioInfo = producaoList[0];
            // Buscar nome e UF do primeiro dataset ou do registro do município
            const primeiroDataset = window.datasets[0];
            const nome = primeiroDataset.municipio || '';
            const uf = primeiroDataset.uf || '';
            this.setAtivo(municipioId, nome, uf);

            // 5. Carregar logomarca do município
            try {
                const logo = await SupabaseService.loadLogoPorMunicipio(municipioId);
                if (logo && logo.logo_base64) {
                    localStorage.setItem('argos_custom_logo', logo.logo_base64);
                } else {
                    localStorage.removeItem('argos_custom_logo');
                }
                if (typeof updateLogoPreview === 'function') updateLogoPreview();
            } catch (logoErr) {
                console.error('Erro ao carregar logo do município:', logoErr);
            }

            // 6. Carregar histórico global de logos (para o usuário poder reaproveitar em qualquer município)
            try {
                const cloudHistory = await SupabaseService.loadLogoHistory();
                if (cloudHistory && Array.isArray(cloudHistory) && cloudHistory.length > 0) {
                    await AppDB.setItem('logos_history', cloudHistory);
                }
                if (typeof renderLogoHistory === 'function') renderLogoHistory();
            } catch (histErr) {
                console.error('Erro ao carregar histórico global de logos:', histErr);
            }

            // 7. Carregar Portaria para o município
            const agg = buildAggregatedData(window.datasets);
            if (agg) {
                await PortariaModule.loadPortariaForMunicipio(agg.municipio, agg.uf);
                loadData(agg);
            }

            // 8. Registrar importações no histórico local
            try {
                let imports = await AppDB.getItem('imported_files') || [];
                // Limpar importações antigas de faturamento (SIA/SUS) e recriar do que veio da nuvem
                imports = imports.filter(i => i.type !== 'SIA/SUS');
                producaoList.forEach(p => {
                    imports.push({
                        id: 'sia_cloud_' + (p.id || Date.now()),
                        fileName: p.nome_arquivo || 'Nuvem',
                        importDate: p.importado_em ? new Date(p.importado_em).toLocaleDateString('pt-BR') : '—',
                        type: 'SIA/SUS',
                        competencia: p.competencia
                    });
                });
                await AppDB.setItem('imported_files', imports);
            } catch (impErr) {
                console.error('Erro ao recriar histórico de importações:', impErr);
            }

            hideLoading();
            await renderArquivosManager();
            showToast(`✅ Município ${nome}-${uf} carregado com ${window.datasets.length} competência(s)!`, 'success');
            return true;

        } catch (e) {
            console.error('Erro ao carregar município:', e);
            hideLoading();
            showToast('❌ Erro ao carregar dados do município: ' + e.message, 'error');
            return false;
        }
    },

    /**
     * Registra um município no catálogo ou retorna o ID se já existir
     * @param {string} nome - Nome do município
     * @param {string} uf - UF (2 chars)
     * @returns {Promise<string|null>} UUID do município
     */
    async registrarOuObterMunicipio(nome, uf) {
        if (!SupabaseConfig.isConnected()) return null;

        try {
            const id = await SupabaseService.registrarMunicipio(nome, uf);
            return id;
        } catch (e) {
            console.error('Erro ao registrar/obter município:', e);
            return null;
        }
    },

    /**
     * Verifica se o usuário tem acesso multi-município
     * @param {object} userSession
     * @returns {boolean}
     */
    temAcessoMulti(userSession) {
        if (!userSession) return false;
        return userSession.acesso_multi_municipio === true;
    },

    /**
     * Retorna a sessão do usuário logado (helper)
     * @returns {object|null}
     */
    getUserSession() {
        try {
            return JSON.parse(sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user') || 'null');
        } catch (e) {
            return null;
        }
    },

    /**
     * Inicializa os controles de UI de seleção de município
     */
    async initUI() {
        const userSession = this.getUserSession();
        const temAcesso = this.temAcessoMulti(userSession);

        // Badge de contexto
        this.atualizarBadgeContexto();

        // Ocultar/exibir aba "Outros Municípios" na Central de Arquivos
        const tabOutros = document.getElementById('tabOutrosMunicipios');
        const ctxTabs = document.getElementById('municipioContextTabs');
        if (tabOutros) {
            tabOutros.style.display = temAcesso ? '' : 'none';
        }
        if (ctxTabs && !temAcesso) {
            ctxTabs.style.display = 'none';
        }

        // Bind tabs de contexto
        document.querySelectorAll('.ctx-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.ctx-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const ctx = tab.dataset.ctx;
                const painel = document.getElementById('painelOutrosMunicipios');
                if (painel) {
                    painel.classList.toggle('hidden', ctx !== 'outros');
                }
            });
        });

        // Bind botão carregar município selecionado
        document.getElementById('btnCarregarMunicipioSelecionado')?.addEventListener('click', async () => {
            const select = document.getElementById('selectMunicipioCarregar');
            if (!select || !select.value) {
                showToast('⚠️ Selecione um município.', 'warn');
                return;
            }
            await this.carregarMunicipio(select.value);
        });

        // Popular dropdown de municípios se tem acesso
        if (temAcesso) {
            await this.popularSelectMunicipios();
        }

        // === SELETOR RÁPIDO NO MODAL DE IMPORTAÇÃO ===
        this.initQuickSelect(userSession, temAcesso);

        // === MODAL LOGOMARCA UF/MUNICÍPIO ===
        this.initLogoMunicipioModal();
    },

    /**
     * Popula o select de municípios disponíveis (Central de Arquivos + Modal)
     */
    async popularSelectMunicipios() {
        const userSession = this.getUserSession();
        const municipios = await this.listarDisponiveis(userSession);

        // Select na Central de Arquivos
        const selectArquivos = document.getElementById('selectMunicipioCarregar');
        if (selectArquivos) {
            selectArquivos.innerHTML = '<option value="">Selecione um município...</option>' +
                municipios.map(m => `<option value="${m.id}">${m.nome}-${m.uf}</option>`).join('');
        }

        // Select no QuickSelect do modal
        const selectQuick = document.getElementById('selectMunicipioQuickLoad');
        if (selectQuick) {
            selectQuick.innerHTML = '<option value="">Selecione...</option>' +
                municipios.map(m => `<option value="${m.id}">${m.nome}-${m.uf}</option>`).join('');
        }

        return municipios;
    },

    /**
     * Inicializa o seletor rápido de município no modal de importação
     */
    async initQuickSelect(userSession, temAcesso) {
        const container = document.getElementById('municipioQuickSelect');
        if (!container) return;

        // Oculta completamente a lista suspensa rápida na nuvem para perfil GERENTE
        if (userSession && userSession.role === 'GERENTE') {
            container.classList.add('hidden');
            return;
        }

        if (!SupabaseConfig.isConnected()) {
            container.classList.add('hidden');
            return;
        }

        // Puxar apenas os municípios que já têm base processada na nuvem
        let municipios = await SupabaseService.listarResumoBasesNuvem();

        // A pedido do usuário, todos os municípios disponíveis na nuvem devem aparecer no dropdown para carregamento.
        // Removido o filtro de restrição local para que a lista seja idêntica ao painel de Bases de Dados na Nuvem.

        if (municipios.length > 0) {
            container.classList.remove('hidden');
            const selectQuick = document.getElementById('selectMunicipioQuickLoad');
            if (selectQuick) {
                selectQuick.innerHTML = '<option value="">Selecione um município...</option>' +
                    municipios.map(m => `<option value="${m.id}">${m.nome}-${m.uf}</option>`).join('');
            }
        } else {
            container.classList.add('hidden');
        }

        // Bind botão carregar rápido
        document.getElementById('btnQuickLoadMunicipio')?.addEventListener('click', async () => {
            const select = document.getElementById('selectMunicipioQuickLoad');
            if (!select || !select.value) {
                showToast('⚠️ Selecione um município.', 'warn');
                return;
            }
            const ok = await this.carregarMunicipio(select.value);
            if (ok) {
                hideModal('modalImportar');
            }
        });
    },

    /**
     * Inicializa o modal de seleção UF/Município para logomarca
     */
    initLogoMunicipioModal() {
        const selectUf = document.getElementById('logoSelectUf');
        const selectMunicipio = document.getElementById('logoSelectMunicipio');
        const btnConfirmar = document.getElementById('btnConfirmarMunicipioLogo');
        const btnFechar = document.getElementById('btnFecharModalLogoMunicipio');

        if (!selectUf || !selectMunicipio) return;

        // Popular UFs
        const ufs = Object.keys(window.MUNICIPIOS_BR || {}).sort();
        selectUf.innerHTML = '<option value="">Selecione a UF</option>' +
            ufs.map(uf => `<option value="${uf}">${uf}</option>`).join('');

        // Pré-selecionar UF do município ativo
        const ativo = this.getAtivo();
        if (ativo && ativo.uf) {
            selectUf.value = ativo.uf;
            this._popularMunicipiosLogoSelect(ativo.uf);
            if (ativo.nome) {
                setTimeout(() => {
                    selectMunicipio.value = ativo.nome;
                    if (btnConfirmar) btnConfirmar.disabled = false;
                }, 50);
            }
        }

        // Cascata UF → Município
        selectUf.addEventListener('change', () => {
            const uf = selectUf.value;
            if (uf) {
                this._popularMunicipiosLogoSelect(uf);
                selectMunicipio.disabled = false;
            } else {
                selectMunicipio.innerHTML = '<option value="">Selecione primeiro a UF</option>';
                selectMunicipio.disabled = true;
            }
            if (btnConfirmar) btnConfirmar.disabled = true;
        });

        selectMunicipio.addEventListener('change', () => {
            if (btnConfirmar) btnConfirmar.disabled = !selectMunicipio.value;
        });

        // Confirmar → abrir seletor de arquivo
        if (btnConfirmar) {
            btnConfirmar.addEventListener('click', () => {
                const uf = selectUf.value;
                const municipio = selectMunicipio.value;
                if (!uf || !municipio) {
                    showToast('⚠️ Selecione UF e Município.', 'warn');
                    return;
                }
                // Salvar seleção temporária para uso no onload do FileReader
                window._logoMunicipioSelecionado = { uf, municipio };
                hideModal('modalSelecionarMunicipioLogo');
                // Abrir seletor de arquivo
                document.getElementById('fileLogoInput')?.click();
            });
        }

        // Fechar modal
        if (btnFechar) {
            btnFechar.addEventListener('click', () => {
                hideModal('modalSelecionarMunicipioLogo');
            });
        }

        // Fechar ao clicar fora
        const modalOverlay = document.getElementById('modalSelecionarMunicipioLogo');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) hideModal('modalSelecionarMunicipioLogo');
            });
        }
    },

    /**
     * Helper: popula o select de municípios do modal de logo para uma UF
     */
    _popularMunicipiosLogoSelect(uf) {
        const selectMunicipio = document.getElementById('logoSelectMunicipio');
        if (!selectMunicipio) return;

        const municipios = (window.MUNICIPIOS_BR && window.MUNICIPIOS_BR[uf]) || [];
        selectMunicipio.innerHTML = '<option value="">Selecione o município</option>' +
            municipios.map(m => `<option value="${m}">${m}</option>`).join('');
        selectMunicipio.disabled = false;
    }
};

window.MunicipioContext = MunicipioContext;
