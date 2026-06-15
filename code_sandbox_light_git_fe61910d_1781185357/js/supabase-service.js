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
            // Tenta ler 1 registro da tabela de unidades para validar a conexão
            const { data, error } = await this.client
                .from('unidades')
                .select('cnes')
                .limit(1);

            if (error) throw error;
            return { success: true, message: 'Conectado com sucesso ao Supabase!' };
        } catch (e) {
            console.error('Erro de teste de conexão com Supabase:', e);
            return { success: false, message: 'Erro ao conectar: ' + (e.message || e.details || JSON.stringify(e)) };
        }
    },

    /**
     * Faz upload de uma nova competência faturada para a nuvem
     */
    async uploadDataset(parsedData, onProgress = () => {}) {
        if (!this.init()) throw new Error('Supabase não inicializado.');

        const comp = parsedData.competencia;
        const ano = parsedData.ano;
        const mes = parsedData.faturamentoMensal?.[0]?.mes || comp.split('/')[0];

        // 1. Extrair e preparar Unidades Distinct
        const unidadesMap = {};
        parsedData.unidades.forEach(u => {
            unidadesMap[u.cnes] = {
                cnes: u.cnes,
                nome: u.nome,
                tipo: u.tipo || 'Unidade'
            };
        });
        const unidadesList = Object.values(unidadesMap);

        onProgress('Sincronizando Unidades...');
        const { error: errU } = await this.client
            .from('unidades')
            .upsert(unidadesList, { onConflict: 'cnes' });
        if (errU) throw new Error('Erro ao salvar unidades: ' + errU.message);

        // 2. Extrair e preparar Procedimentos Distinct
        const procMap = {};
        parsedData.procedimentos.forEach(p => {
            const cleanCode = p.codigo.replace(/\D/g, '');
            if (cleanCode) {
                procMap[cleanCode] = {
                    codigo: cleanCode,
                    descricao: p.descricao,
                    valor_unitario: p.valUnitario || 0
                };
            }
        });
        const procList = Object.values(procMap);

        if (procList.length > 0) {
            onProgress('Sincronizando Procedimentos...');
            const { error: errP } = await this.client
                .from('procedimentos')
                .upsert(procList, { onConflict: 'codigo' });
            if (errP) throw new Error('Erro ao salvar procedimentos: ' + errP.message);
        }

        // 3. Extrair e preparar CBOs Distinct
        const cbosMap = {};
        parsedData.cbos.forEach(c => {
            if (c.codigo) {
                cbosMap[c.codigo] = {
                    codigo: c.codigo,
                    descricao: c.descricao
                };
            }
        });
        const cbosList = Object.values(cbosMap);

        if (cbosList.length > 0) {
            onProgress('Sincronizando Profissionais (CBOs)...');
            const { error: errC } = await this.client
                .from('cbos')
                .upsert(cbosList, { onConflict: 'codigo' });
            if (errC) throw new Error('Erro ao salvar CBOs: ' + errC.message);
        }

        // 4. Limpar linhas antigas desta mesma competência (se houver re-importação)
        onProgress('Limpando dados anteriores desta competência na nuvem...');
        const { error: errDel } = await this.client
            .from('faturamento_linhas')
            .delete()
            .eq('competencia', comp);
        if (errDel) throw new Error('Erro ao limpar competência anterior: ' + errDel.message);

        // 5. Inserir linhas de faturamento em lotes (batch insert de 500 em 500)
        const linhas = parsedData.linhas || [];
        const totalLinhas = linhas.length;
        
        if (totalLinhas === 0) {
            onProgress('Nenhum detalhe de linha para enviar.');
            return;
        }

        const batchSize = 500;
        let lotesEnviados = 0;

        for (let i = 0; i < totalLinhas; i += batchSize) {
            const batch = linhas.slice(i, i + batchSize).map(l => ({
                competencia: comp,
                ano: parseInt(ano) || 2026,
                mes: mes,
                unidade_cnes: l.uCnes,
                procedimento_codigo: l.proc,
                cbo_codigo: l.cbo,
                qtd_apresentada: l.qtdApresentada || 0,
                qtd_aprovada: l.qtdAprovada || 0,
                qtd_glosada: l.qtdGlosada || 0,
                val_apresentado: l.valApresentado || 0,
                val_aprovado: l.valAprovado || 0,
                val_glosado: l.valGlosado || 0
            }));

            const progressoPct = Math.round((i / totalLinhas) * 100);
            onProgress(`Enviando linhas de faturamento... (${progressoPct}%)`);

            const { error: errLines } = await this.client
                .from('faturamento_linhas')
                .insert(batch);

            if (errLines) throw new Error(`Erro ao salvar lote de linhas: ${errLines.message}`);
        }

        onProgress('Finalizado com sucesso!');
    },

    /**
     * Carrega as competências gravadas no Supabase e reconstrói o formato para o frontend
     */
    async downloadAllDatasets() {
        if (!this.init()) return [];

        try {
            // Busca a listagem das competências e anos distintos
            const { data: competencias, error: errComp } = await this.client
                .from('faturamento_linhas')
                .select('competencia, ano')
                .order('competencia', { ascending: true });

            if (errComp) throw errComp;
            if (!competencias || competencias.length === 0) return [];

            // Filtrar competências únicas
            const compUnicas = [];
            const visto = new Set();
            competencias.forEach(item => {
                if (!visto.has(item.competencia)) {
                    visto.add(item.competencia);
                    compUnicas.push(item);
                }
            });

            const datasets = [];

            for (const c of compUnicas) {
                // Carrega todas as linhas desta competência
                const { data: linhasRaw, error: errLinhas } = await this.client
                    .from('faturamento_linhas')
                    .select(`
                        competencia, ano, mes,
                        qtd_apresentada, qtd_aprovada, qtd_glosada,
                        val_apresentado, val_aprovado, val_glosado,
                        unidade_cnes, procedimento_codigo, cbo_codigo,
                        unidades (nome, tipo)
                    `)
                    .eq('competencia', c.competencia);

                if (errLinhas) throw errLinhas;

                // Formatar linhas para o padrão do Fato Engine atual (JS local)
                const linhasFormatadas = linhasRaw.map(l => ({
                    uId: l.unidade_cnes,
                    uCnes: l.unidade_cnes,
                    uNome: l.unidades?.nome || 'Unidade ' + l.unidade_cnes,
                    proc: l.procedimento_codigo,
                    cbo: l.cbo_codigo,
                    mes: l.mes,
                    cmp: l.competencia,
                    qtdApresentada: l.qtd_apresentada,
                    qtdAprovada: l.qtd_aprovada,
                    qtdGlosada: l.qtd_glosada,
                    valApresentado: parseFloat(l.val_apresentado) || 0,
                    valAprovado: parseFloat(l.val_aprovado) || 0,
                    valGlosado: parseFloat(l.val_glosado) || 0
                }));

                // Reconstruir o dataset consolidado localmente
                const { app } = window; 
                // Chamamos o aggregateLinhas do app.js
                // Para simplificar, o frontend fará esse mapeamento ao receber os dados estruturados
                datasets.push({
                    competencia: c.competencia,
                    ano: c.ano,
                    linhas: linhasFormatadas
                });
            }

            return datasets;
        } catch (e) {
            console.error('Erro ao baixar competências do Supabase:', e);
            throw e;
        }
    }
};

window.SupabaseService = SupabaseService;
