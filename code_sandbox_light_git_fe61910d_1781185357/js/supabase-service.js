const SupabaseService = {
    client: null,

    init() {
        this.client = window.SupabaseConfig.getClient();
        return this.client !== null;
    },

    async _rpc(name, params = {}) {
        if (!this.init()) throw new Error('Supabase não configurado.');
        const { data, error } = await this.client.rpc(name, params);
        if (error) throw error;
        if (typeof data === 'string' && (data.startsWith('[') || data.startsWith('{'))) {
            try { return JSON.parse(data); } catch(e) { return data; }
        }
        return data;
    },

    async testConnection() {
        try {
            await this._rpc('fn_testar_conexao');
            return { success: true, message: 'Conectado com sucesso ao Supabase!' };
        } catch (e) {
            return { success: false, message: 'Erro ao conectar: ' + (e.message || e.details || JSON.stringify(e)) };
        }
    },

    /* =========================================================
       GERENCIAMENTO DE USUÁRIOS (RPC SECURITY DEFINER)
       ========================================================= */

    async authLogin(login, password) {
        try {
            const passwordHash = await CryptoUtils.sha256(password);
            try {
                const edgeUrl = `${window.SupabaseConfig.getUrl()}/functions/v1/sign-in`;
                const edgeResponse = await fetch(edgeUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.SupabaseConfig.getAnonKey()}`
                    },
                    body: JSON.stringify({ username: login, password_hash: passwordHash })
                });
                if (edgeResponse.ok) {
                    const result = await edgeResponse.json();
                    if (result.success && result.session) {
                        await this.client.auth.setSession({
                            access_token: result.session.access_token,
                            refresh_token: result.session.refresh_token
                        });
                        return { success: true, user: result.user, session: true };
                    }
                    if (!result.success) {
                        return {
                            success: false, message: result.message,
                            isPasswordWrong: result.isPasswordWrong || false,
                            user: result.isPasswordWrong ? { username: login } : null,
                            failedAttempts: result.failedAttempts || 0
                        };
                    }
                }
            } catch (edgeErr) {
                console.warn('Edge Function indisponível, usando RPC fallback:', edgeErr);
            }

            const result = await this._rpc('fn_verify_login', {
                p_username: login,
                p_password_hash: passwordHash
            });
            if (!result.success) {
                return {
                    success: false, message: result.message,
                    isPasswordWrong: result.isPasswordWrong || false,
                    user: result.isPasswordWrong ? { username: login } : null,
                    failedAttempts: result.failedAttempts || 0
                };
            }
            return { success: true, user: result.user };
        } catch (e) {
            console.error('Erro ao autenticar usuário:', e);
            throw e;
        }
    },

    async updateUserStatus(username, status) {
        return await this._rpc('fn_update_user_status', { p_username: username, p_status: status });
    },

    async getUsers() {
        try {
            const result = await this._rpc('fn_listar_usuarios');
            return result || [];
        } catch (e) {
            console.error('Erro ao buscar usuários:', e);
            return [];
        }
    },

    async upsertUser(user) {
        const userData = {
            username: user.username,
            email: user.email,
            name: user.name,
            password: user.password || '',
            role: user.role || 'GERENTE',
            status: user.status || 'ATIVO',
            acesso_multi_municipio: user.acesso_multi_municipio || false,
            municipio_vinculado: user.municipio_vinculado || 'Bacabal-MA',
            perm_usuarios: user.perm_usuarios || false,
            perm_importar: user.perm_importar || false,
            perm_limpar_db: user.perm_limpar_db || false,
            perm_config_supabase: user.perm_config_supabase || false
        };
        if (userData.password && userData.password.length !== 64) {
            userData.password = await CryptoUtils.sha256(userData.password);
        }
        return await this._rpc('fn_upsert_usuario', { p_user_data: userData });
    },

    async deleteUser(username) {
        return await this._rpc('fn_delete_usuario', { p_username: username });
    },

    async resetPassword(username, newPassword) {
        const passwordHash = await CryptoUtils.sha256(newPassword);
        return await this._rpc('fn_reset_password', { p_username: username, p_new_password_hash: passwordHash });
    },

    async resetFailedAttempts(username) {
        return await this._rpc('fn_reset_failed_attempts', { p_username: username });
    },

    /* =========================================================
       LOGS E HISTÓRICO DE AÇÕES
       ========================================================= */

    async logAction(username, action, moduleName, description) {
        if (!this.init()) return false;
        try {
            const { error } = await this.client
                .from('historico_acoes')
                .insert({ usuario_login: username, acao: action, modulo: moduleName, descricao: description });
            if (error) throw error;
            return true;
        } catch (e) {
            console.error('Erro ao registrar log de ação:', e);
            return false;
        }
    },

    async getUserActionHistory(username) {
        if (!this.init()) return [];
        try {
            const { data, error } = await this.client
                .from('historico_acoes')
                .select('*')
                .eq('usuario_login', username)
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;
            return (data || []).map(d => ({
                date: d.created_at, user: d.usuario_login,
                action: d.acao, module: d.modulo, desc: d.descricao
            }));
        } catch (e) {
            console.error('Erro ao buscar histórico de ações:', e);
            return [];
        }
    },

    /* =========================================================
       CONFIGURAÇÕES (RPC) — logo, portaria, etc.
       ========================================================= */

    async saveLogo(base64Image) {
        return await this._rpc('fn_salvar_config', { p_chave: 'logo_pdf', p_valor: base64Image });
    },

    async loadLogo() {
        try { return await this._rpc('fn_carregar_config', { p_chave: 'logo_pdf' }); } catch (e) { return null; }
    },

    async saveLogoHistory(historyArray) {
        return await this._rpc('fn_salvar_config', { p_chave: 'logo_history_array', p_valor: JSON.stringify(historyArray) });
    },

    async loadLogoHistory() {
        try {
            const val = await this._rpc('fn_carregar_config', { p_chave: 'logo_history_array' });
            return val ? JSON.parse(val) : null;
        } catch (e) { return null; }
    },

    async deleteLogo() {
        return await this._rpc('fn_excluir_config', { p_chave: 'logo_pdf' });
    },

    /* =========================================================
       SIGTAP (RPC)
       ========================================================= */

    async uploadSigtap(sigtapMap, onProgress = () => {}) {
        if (!this.init()) throw new Error('Supabase não configurado.');
        const total = Object.keys(sigtapMap).length;
        if (total === 0) return;
        onProgress('Enviando SIGTAP para a nuvem...');
        const dados = Object.entries(sigtapMap).map(([codigo, descricao]) => ({
            codigo, descricao, valor_unitario: 0.00
        }));
        const result = await this._rpc('fn_upload_sigtap', { p_dados: dados });
        onProgress(`Sincronização concluída! ${result.processados} itens processados.`);
    },

    async loadSigtap() {
        try {
            const data = await this._rpc('fn_carregar_procedimentos');
            if (!data || data.length === 0) return null;
            const map = {};
            data.forEach(p => { map[p.codigo] = p.descricao; });
            return map;
        } catch (e) { return null; }
    },

    async savePortariaDb(portariaData) {
        return await this._rpc('fn_salvar_config', { p_chave: 'portaria_db_data', p_valor: JSON.stringify(portariaData) });
    },

    async loadPortariaDb() {
        try {
            const val = await this._rpc('fn_carregar_config', { p_chave: 'portaria_db_data' });
            return val ? JSON.parse(val) : null;
        } catch (e) { return null; }
    },

    /* =========================================================
       MULTI-MUNICÍPIO (RPC)
       ========================================================= */

    normalizeMunicipio(str) {
        if (!str) return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    },

    async registrarMunicipio(nome, uf) {
        return await this._rpc('fn_registrar_municipio', {
            p_nome: this.normalizeMunicipio(nome),
            p_uf: uf.trim().toUpperCase()
        });
    },

    async listarMunicipios() {
        try { return await this._rpc('fn_listar_municipios') || []; } catch (e) { return []; }
    },

    async listarResumoBasesNuvem() {
        try {
            const data = await this._rpc('fn_listar_resumo_bases') || [];
            const mesesMap = {
                'JAN':1,'FEV':2,'MAR':3,'ABR':4,'MAI':5,'JUN':6,
                'JUL':7,'AGO':8,'SET':9,'OUT':10,'NOV':11,'DEZ':12
            };
            data.forEach(m => {
                if (m.competencias && Array.isArray(m.competencias)) {
                    m.competencias.sort((a, b) => {
                        const pc = (c) => { const [me, an] = c.split('/'); return (parseInt(an)*100)+(mesesMap[me.toUpperCase()]||0); };
                        return pc(a) - pc(b);
                    });
                }
            });
            return data;
        } catch (e) { return []; }
    },

    async saveProducaoSia(municipioId, competencia, nomeArquivo, dadosJson, importadoPor) {
        return await this._rpc('fn_salvar_producao_sia', {
            p_municipio_id: municipioId,
            p_competencia: competencia,
            p_nome_arquivo: nomeArquivo,
            p_dados_json: typeof dadosJson === 'string' ? JSON.parse(dadosJson) : dadosJson,
            p_importado_por: importadoPor
        });
    },

    async loadProducaoSia(municipioId) {
        try { return await this._rpc('fn_carregar_producao_sia', { p_municipio_id: municipioId }) || []; } catch (e) { return []; }
    },

    async deleteProducaoSia(municipioId, competencia) {
        return await this._rpc('fn_excluir_producao_sia', { p_municipio_id: municipioId, p_competencia: competencia });
    },

    async deleteAllProducaoSia(municipioId) {
        return await this._rpc('fn_excluir_todas_producao_sia', { p_municipio_id: municipioId });
    },

    async saveLogoPorMunicipio(municipioId, base64) {
        return await this._rpc('fn_salvar_logo_municipio', { p_municipio_id: municipioId, p_base64: base64 });
    },

    async loadLogoPorMunicipio(municipioId) {
        try { return await this._rpc('fn_carregar_logo_municipio', { p_municipio_id: municipioId }); } catch (e) { return null; }
    },

    async loadLogoHistoryPorMunicipio(municipioId) {
        try { return await this._rpc('fn_carregar_historico_logos', { p_municipio_id: municipioId }) || []; } catch (e) { return []; }
    },

    async deleteLogoPorMunicipio(logoId) {
        return await this._rpc('fn_excluir_logo_municipio', { p_logo_id: logoId });
    },

    async clearLogoPorMunicipio(municipioId) {
        return await this._rpc('fn_limpar_logo_municipio', { p_municipio_id: municipioId });
    }
};

window.SupabaseService = SupabaseService;
