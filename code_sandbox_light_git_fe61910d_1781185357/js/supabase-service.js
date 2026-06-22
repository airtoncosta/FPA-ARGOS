/**
 * ARGOS — supabase-service.js
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
                    status: user.status || 'ATIVO',
                    acesso_multi_municipio: user.acesso_multi_municipio || false,
                    municipio_vinculado: user.municipio_vinculado || 'Bacabal-MA'
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
     * Salva o histórico de logomarcas no banco
     */
    async saveLogoHistory(historyArray) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        try {
            const { error } = await this.client
                .from('configuracoes')
                .upsert({
                    chave: 'logo_history_array',
                    valor: JSON.stringify(historyArray),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'chave' });

            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('Erro ao salvar histórico de logomarca no Supabase:', e);
            throw e;
        }
    },

    /**
     * Retorna o histórico de logomarcas salvo na nuvem
     */
    async loadLogoHistory() {
        if (!this.init()) return null;

        try {
            const { data, error } = await this.client
                .from('configuracoes')
                .select('valor')
                .eq('chave', 'logo_history_array')
                .limit(1);

            if (error) throw error;
            if (data && data.length > 0) return JSON.parse(data[0].valor);
            return null;
        } catch (e) {
            console.error('Erro ao carregar histórico de logomarca do Supabase:', e);
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
            let allData = [];
            let from = 0;
            const batchSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await this.client
                    .from('procedimentos')
                    .select('codigo, descricao')
                    .range(from, from + batchSize - 1);

                if (error) throw error;
                
                if (!data || data.length === 0) {
                    hasMore = false;
                } else {
                    allData = allData.concat(data);
                    if (data.length < batchSize) {
                        hasMore = false;
                    } else {
                        from += batchSize;
                    }
                }
            }

            if (allData.length === 0) return null;

            const map = {};
            allData.forEach(p => {
                map[p.codigo] = p.descricao;
            });
            return map;
        } catch (e) {
            console.error('Erro ao carregar SIGTAP do Supabase:', e);
            return null;
        }
    },

    /**
     * Salva o mapeamento da portaria no Supabase sob a chave 'portaria_db_data'
     */
    async savePortariaDb(portariaData) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        try {
            const { error } = await this.client
                .from('configuracoes')
                .upsert({
                    chave: 'portaria_db_data',
                    valor: JSON.stringify(portariaData),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'chave' });

            if (error) throw error;
            return { success: true };
        } catch (e) {
            console.error('Erro ao salvar Portaria no Supabase:', e);
            throw e;
        }
    },

    /**
     * Carrega os dados da portaria do Supabase
     */
    async loadPortariaDb() {
        if (!this.init()) return null;

        try {
            const { data, error } = await this.client
                .from('configuracoes')
                .select('valor')
                .eq('chave', 'portaria_db_data')
                .limit(1);

            if (error) throw error;
            if (data && data.length > 0) return JSON.parse(data[0].valor);
            return null;
        } catch (e) {
            console.error('Erro ao carregar Portaria do Supabase:', e);
            return null;
        }
    },

    /* =========================================================
       MULTI-MUNICÍPIO (v4.0)
       ========================================================= */

    /**
     * Helper para normalizar strings (remover acentos e colocar tudo em maiúsculo)
     */
    normalizeMunicipio(str) {
        if (!str) return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    },

    /**
     * Registra um município no catálogo ou retorna o ID se já existir
     * @returns {Promise<string>} UUID do município
     */
    async registrarMunicipio(nome, uf) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        const normalizedNome = this.normalizeMunicipio(nome);
        const normalizedUf = uf.trim().toUpperCase();

        // 1. Tentar encontrar primeiro ignorando acentos e case
        const { data: allMunis } = await this.client
            .from('municipios_sistema')
            .select('id, nome')
            .eq('uf', normalizedUf);
            
        if (allMunis && allMunis.length > 0) {
            const found = allMunis.find(m => this.normalizeMunicipio(m.nome) === normalizedNome);
            if (found) return found.id;
        }

        // 2. Se não encontrar, insere a versão em maiúsculas (padrão)
        const nomeParaInserir = nome.trim().toUpperCase();
        
        // INSERT ON CONFLICT DO NOTHING
        await this.client
            .from('municipios_sistema')
            .insert({ nome: nomeParaInserir, uf: normalizedUf })
            .select()
            .maybeSingle();

        // SELECT para garantir retorno do id caso tenha dado conflito simultâneo
        const { data, error } = await this.client
            .from('municipios_sistema')
            .select('id')
            .eq('nome', nomeParaInserir)
            .eq('uf', normalizedUf)
            .limit(1)
            .single();

        if (error) throw error;
        return data.id;
    },

    /**
     * Lista todos os municípios cadastrados no catálogo
     * @returns {Promise<Array<{ id, nome, uf }>>}
     */
    async listarMunicipios() {
        if (!this.init()) return [];

        const { data, error } = await this.client
            .from('municipios_sistema')
            .select('*')
            .order('nome');

        if (error) throw error;
        return data || [];
    },

    /**
     * Busca o resumo de todas as bases de dados (municípios que têm produção)
     * e as respectivas competências salvas.
     */
    async listarResumoBasesNuvem() {
        if (!this.init()) return [];
        
        try {
            // Buscamos a produção e fazemos o join com os municípios
            const { data, error } = await this.client
                .from('producao_sia')
                .select(`
                    competencia,
                    municipio_id,
                    municipios_sistema ( id, nome, uf )
                `)
                .order('competencia', { ascending: false });

            if (error) throw error;
            if (!data) return [];

            // Agregamos por município
            const map = {};
            data.forEach(row => {
                if (!row.municipios_sistema) return;
                const m = row.municipios_sistema;
                if (!map[m.id]) {
                    map[m.id] = {
                        id: m.id,
                        nome: m.nome,
                        uf: m.uf,
                        competencias: []
                    };
                }
                if (!map[m.id].competencias.includes(row.competencia)) {
                    map[m.id].competencias.push(row.competencia);
                }
            });

            const result = Object.values(map).sort((a, b) => a.nome.localeCompare(b.nome));
            
            // Ordenação Cronológica das Competências
            const mesesMap = {
                'JAN': 1, 'FEV': 2, 'MAR': 3, 'ABR': 4, 'MAI': 5, 'JUN': 6,
                'JUL': 7, 'AGO': 8, 'SET': 9, 'OUT': 10, 'NOV': 11, 'DEZ': 12
            };
            
            result.forEach(m => {
                m.competencias.sort((a, b) => {
                    const parseComp = (c) => {
                        const [mes, ano] = c.split('/');
                        return (parseInt(ano) * 100) + (mesesMap[mes.toUpperCase()] || 0);
                    };
                    return parseComp(a) - parseComp(b); // Ordem crescente
                });
            });

            return result;
        } catch (e) {
            console.error('Erro ao listar resumo de bases da nuvem:', e);
            return [];
        }
    },

    /**
     * Salva dados de produção SIA/SUS para um município/competência (upsert)
     */
    async saveProducaoSia(municipioId, competencia, nomeArquivo, dadosJson, importadoPor) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        const payload = {
            municipio_id: municipioId,
            competencia,
            nome_arquivo: nomeArquivo,
            dados_json: dadosJson,
            importado_por: importadoPor,
            importado_em: new Date().toISOString()
        };

        const { data, error } = await this.client
            .from('producao_sia')
            .upsert(payload, { onConflict: 'municipio_id,competencia' })
            .select();

        if (error) throw error;
        return data;
    },

    /**
     * Carrega todas as competências de produção de um município
     */
    async loadProducaoSia(municipioId) {
        if (!this.init()) return [];

        const { data, error } = await this.client
            .from('producao_sia')
            .select('*')
            .eq('municipio_id', municipioId)
            .order('competencia');

        if (error) throw error;
        return data || [];
    },

    /**
     * Exclui uma competência de produção de um município
     */
    async deleteProducaoSia(municipioId, competencia) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        const { error } = await this.client
            .from('producao_sia')
            .delete()
            .eq('municipio_id', municipioId)
            .eq('competencia', competencia);

        if (error) throw error;
    },

    /**
     * Exclui todas as competências de produção de um município
     */
    async deleteAllProducaoSia(municipioId) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        const { error } = await this.client
            .from('producao_sia')
            .delete()
            .eq('municipio_id', municipioId);

        if (error) throw error;
    },

    /**
     * Salva logomarca vinculada a um município (desativa anteriores)
     */
    async saveLogoPorMunicipio(municipioId, base64) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        // Desativar logos anteriores deste município
        await this.client
            .from('logomarcas_municipio')
            .update({ ativa: false })
            .eq('municipio_id', municipioId);

        // Inserir nova logo como ativa
        const { data, error } = await this.client
            .from('logomarcas_municipio')
            .insert({ municipio_id: municipioId, logo_base64: base64, ativa: true })
            .select();

        if (error) throw error;
        return data;
    },

    /**
     * Carrega a logomarca ativa de um município
     */
    async loadLogoPorMunicipio(municipioId) {
        if (!this.init()) return null;

        const { data, error } = await this.client
            .from('logomarcas_municipio')
            .select('*')
            .eq('municipio_id', municipioId)
            .eq('ativa', true)
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        return data;
    },

    /**
     * Carrega o histórico de logos de um município (últimas 10)
     */
    async loadLogoHistoryPorMunicipio(municipioId) {
        if (!this.init()) return [];

        const { data, error } = await this.client
            .from('logomarcas_municipio')
            .select('*')
            .eq('municipio_id', municipioId)
            .order('criado_em', { ascending: false })
            .limit(10);

        if (error) throw error;
        return data || [];
    },

    async deleteLogoPorMunicipio(logoId) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        const { error } = await this.client
            .from('logomarcas_municipio')
            .delete()
            .eq('id', logoId);

        if (error) throw error;
    },

    /**
     * Limpa a logomarca do município (desativa)
     */
    async clearLogoPorMunicipio(municipioId) {
        if (!this.init()) throw new Error('Supabase não configurado.');

        const { error } = await this.client
            .from('logomarcas_municipio')
            .update({ ativa: false })
            .eq('municipio_id', municipioId);

        if (error) throw error;
    }
};

window.SupabaseService = SupabaseService;
