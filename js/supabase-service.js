/**
 * ARGOS FPA — supabase-service.js
 * Serviços e queries de integração com o banco de dados do Supabase
 */

const SupabaseService = {
    client: null,

    init() {
        this.client = window.SupabaseConfig.getClient();
        return this.client !== null;
    },

    /**
     * Testa se as credenciais configuradas estão corretas e conseguem acessar o banco
     */
    async testConnection() {
        if (!this.init()) {
            return { success: false, message: 'Credenciais do Supabase não configuradas no sistema.' };
        }

        try {
            // Tenta ler 1 registro da tabela de usuários para validar a conexão
            const { data, error } = await this.client
                .from('usuarios')
                .select('username')
                .limit(1);

            if (error) throw error;
            return { success: true, message: 'Conectado com sucesso ao Supabase!' };
        } catch (e) {
            console.error('Erro de teste de conexão com Supabase:', e);
            return { success: false, message: 'Erro ao conectar: ' + (e.message || e.details || JSON.stringify(e)) };
        }
    },

    /* =========================================================
       GERENCIAMENTO DE USUÁRIOS
       ========================================================= */

    /**
     * Autentica um usuário no Supabase
     */
    async authLogin(login, password) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        try {
            const { data, error } = await this.client
                .from('usuarios')
                .select('*')
                .or(`username.eq.${login},email.eq.${login}`);

            if (error) throw error;
            
            if (!data || data.length === 0) {
                return { success: false, message: 'Nome de acesso ou e-mail não cadastrado.' };
            }

            const user = data[0];

            if (user.status === 'BLOQUEADO' || user.status === 'INATIVO') {
                return { success: false, message: 'Acesso Negado. Seu usuário foi bloqueado pelo Administrador.' };
            }

            if (user.password !== password) {
                return { success: false, message: 'Senha incorreta.', isPasswordWrong: true, user };
            }

            return { success: true, user };
        } catch (e) {
            console.error('Erro ao autenticar usuário no Supabase:', e);
            throw e;
        }
    },

    /**
     * Atualiza o status do usuário (útil para bloquear)
     */
    async updateUserStatus(username, status) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        try {
            const { error } = await this.client
                .from('usuarios')
                .update({ status })
                .eq('username', username);

            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('Erro ao atualizar status de usuário no Supabase:', e);
            throw e;
        }
    },

    /**
     * Busca todos os usuários cadastrados
     */
    async getUsers() {
        if (!this.init()) return [];

        try {
            const { data, error } = await this.client
                .from('usuarios')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('Erro ao buscar usuários do Supabase:', e);
            return [];
        }
    },

    /**
     * Cria ou atualiza um usuário
     */
    async upsertUser(user) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        try {
            const { error } = await this.client
                .from('usuarios')
                .upsert({
                    username: user.username,
                    email: user.email,
                    name: user.name,
                    password: user.password,
                    role: user.role,
                    status: user.status || 'ATIVO'
                }, { onConflict: 'username' });

            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('Erro ao salvar usuário no Supabase:', e);
            throw e;
        }
    },

    /**
     * Exclui um usuário
     */
    async deleteUser(username) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        try {
            const { error } = await this.client
                .from('usuarios')
                .delete()
                .eq('username', username);

            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('Erro ao excluir usuário no Supabase:', e);
            throw e;
        }
    },

    /**
     * Redefine a senha de um usuário
     */
    async resetPassword(username, newPassword) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        try {
            const { error } = await this.client
                .from('usuarios')
                .update({ password: newPassword })
                .eq('username', username);

            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('Erro ao redefinir senha no Supabase:', e);
            throw e;
        }
    },

    /* =========================================================
       LOGS E HISTÓRICO DE AÇÕES (AUDITORIA)
       ========================================================= */

    /**
     * Registra uma ação de auditoria na nuvem
     */
    async logAction(username, action, moduleName, description) {
        if (!this.init()) return false;

        try {
            const { error } = await this.client
                .from('historico_acoes')
                .insert({
                    usuario_login: username,
                    acao: action,
                    modulo: moduleName,
                    descricao: description
                });

            if (error) throw error;
            return true;
        } catch (e) {
            console.error('Erro ao registrar log de ação no Supabase:', e);
            return false;
        }
    },

    /**
     * Busca o histórico de ações do usuário conectado
     */
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
            
            // Mapear para o formato esperado pelo frontend
            return (data || []).map(d => ({
                date: d.created_at,
                user: d.usuario_login,
                action: d.acao,
                module: d.modulo,
                desc: d.descricao
            }));
        } catch (e) {
            console.error('Erro ao buscar histórico de ações do Supabase:', e);
            return [];
        }
    },

    /* =========================================================
       CONFIGURAÇÕES DO SISTEMA (LOGOMARCA)
       ========================================================= */

    /**
     * Salva a logomarca no banco sob a chave 'logo_pdf'
     */
    async saveLogo(base64Image) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        try {
            const { error } = await this.client
                .from('configuracoes')
                .upsert({
                    chave: 'logo_pdf',
                    valor: base64Image,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'chave' });

            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('Erro ao salvar logomarca no Supabase:', e);
            throw e;
        }
    },

    /**
     * Retorna a logomarca salva na nuvem
     */
    async loadLogo() {
        if (!this.init()) return null;

        try {
            const { data, error } = await this.client
                .from('configuracoes')
                .select('valor')
                .eq('chave', 'logo_pdf')
                .limit(1);

            if (error) throw error;
            if (data && data.length > 0) return data[0].valor;
            return null;
        } catch (e) {
            console.error('Erro ao carregar logomarca do Supabase:', e);
            return null;
        }
    },

    /**
     * Remove a logomarca da nuvem
     */
    async deleteLogo() {
        if (!this.init()) throw new Error('Supabase não configurado.');

        try {
            const { error } = await this.client
                .from('configuracoes')
                .delete()
                .eq('chave', 'logo_pdf');

            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('Erro ao excluir logomarca no Supabase:', e);
            throw e;
        }
    },

    /* =========================================================
       TABELA UNIFICADA SIGTAP
       ========================================================= */

    /**
     * Envia os dados de procedimentos para o banco do Supabase
     */
    async uploadSigtap(sigtapMap, onProgress = () => {}) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        try {
            const procsList = Object.entries(sigtapMap).map(([code, desc]) => ({
                codigo: code,
                descricao: desc,
                valor_unitario: 0.00
            }));

            const total = procsList.length;
            if (total === 0) return;

            onProgress('Limpando tabela procedimentos antiga...');
            const { error: delErr } = await this.client
                .from('procedimentos')
                .delete()
                .neq('codigo', ''); // Apaga tudo
            if (delErr) console.warn('Aviso ao limpar procedimentos:', delErr.message);

            const batchSize = 200;
            for (let i = 0; i < total; i += batchSize) {
                const batch = procsList.slice(i, i + batchSize);
                const pct = Math.round((i / total) * 100);
                onProgress(`Sincronizando SIGTAP na nuvem... (${pct}%)`);

                const { error: err } = await this.client
                    .from('procedimentos')
                    .upsert(batch, { onConflict: 'codigo' });

                if (err) throw new Error(`Erro ao enviar lote do SIGTAP: ${err.message}`);
            }

            onProgress('Sincronização concluída com sucesso!');
        } catch (e) {
            console.error('Erro ao salvar SIGTAP no Supabase:', e);
            throw e;
        }
    },

    /**
     * Carrega a tabela SIGTAP unificada do banco e retorna como mapeamento
     */
    async loadSigtap() {
        if (!this.init()) return null;

        try {
            const { data, error } = await this.client
                .from('procedimentos')
                .select('codigo, descricao');

            if (error) throw error;
            if (!data || data.length === 0) return null;

            const map = {};
            data.forEach(p => {
                map[p.codigo] = p.descricao;
            });
            return map;
        } catch (e) {
            console.error('Erro ao carregar SIGTAP do Supabase:', e);
            return null;
        }
    }
};

window.SupabaseService = SupabaseService;
