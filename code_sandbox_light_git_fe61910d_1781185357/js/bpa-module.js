/**
 * ARGOS — bpa-module.js v2.0
 * Módulo de Controle, Envio, Rastreio e Download de Produções BPA
 * 
 * Funcionalidades Refinadas:
 * 1. Baseia-se nas Unidades Reais do sistema (APP_STATE / DEMO_DATA) e permite casos isolados;
 * 2. Atribuição de responsáveis exclusiva para ADM e Francileide;
 * 3. Restrição de exclusão/edição: digitador só pode gerenciar as suas próprias produções;
 * 4. Detecção profunda Individual (BPA-I) vs Consolidado (BPA-C) com Raio-X de procedimentos.
 */

const BpaModule = {
    get storageKey() {
        return 'argos_producoes_bpa:' + (this.getCurrentUser().username || 'sem-sessao');
    },
    accessLoadError: '',
    persistenceMode: 'cloud',
    localProducoesKey: 'argos_producoes_bpa',
    responsaveisKey: 'argos_bpa_responsaveis',
    modalidadesKey: 'argos_bpa_modalidades',
    unidadesManuaisKey: 'argos_bpa_unidades_manuais',
    producoes: [],

    getUnidadesManuais() {
        try {
            const str = localStorage.getItem(this.unidadesManuaisKey);
            if (str) {
                const parsed = JSON.parse(str);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch(e) {}
        return [];
    },

    saveUnidadesManuais(list) {
        try {
            localStorage.setItem(this.unidadesManuaisKey, JSON.stringify(list || []));
        } catch(e) {}
    },
    currentCompetenciaFiltro: '',
    currentStatusFilter: '', // '' (todos), 'delivered' (enviadas), 'pending' (faltam enviar)
    currentResponsavelFiltro: '', // '' (todos) ou nome do profissional responsável
    currentTipoFiltro: '', // '' (todos), 'BPA-C', 'BPA-I', 'AMBOS', 'PARCIAL'
    currentSearchTerm: '',
    filePendingUpload: null,
    auditApproval: null,

    mascararCns(cns) {
        const s = String(cns ?? '').trim();
        if (!s) return '—';
        const num = s.replace(/\D/g, '');
        if (num.length === 15) {
            return num.slice(0, 3) + '*********' + num.slice(-3);
        }
        if (s.length > 6) {
            return s.slice(0, 3) + '*'.repeat(s.length - 6) + s.slice(-3);
        }
        return s;
    },

    canSubmitPendingUpload() {
        if (!this.filePendingUpload) return false;
        const approval = this.auditApproval;
        if (!approval || !approval.podeEnviarSemGlosa) return false;
        if (this.filePendingUpload.fingerprint && approval.fingerprint && approval.fingerprint !== this.filePendingUpload.fingerprint) {
            return false;
        }
        return true;
    },

    mesesExtenso: {
        '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
        '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
        '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
    },

    siglasMeses: {
        'JAN': '01', 'FEV': '02', 'MAR': '03', 'ABR': '04',
        'MAI': '05', 'JUN': '06', 'JUL': '07', 'AGO': '08',
        'SET': '09', 'OUT': '10', 'NOV': '11', 'DEZ': '12'
    },

    siglasUnidades: {
        'TOMO': 'HOSPITAL MARIA SOCORRO BRANDAO', // Exames de Tomografia do Hospital HMSO
        'HMSO': 'HOSPITAL MARIA SOCORRO BRANDAO',
        'HMI': 'HOSPITAL MATERNO INFANTIL',
        'CESP': 'CENTRO DE ESPECIALIDADES DR COELHO',
        'COELHO': 'CENTRO DE ESPECIALIDADES DR COELHO',
        'LCDIAS': 'LABORATORIO CENTRAL DR COELHO DIAS',
        'LAB': 'LABORATORIO CENTRAL DR COELHO DIAS',
        'FISIO': 'CENTRO DE FISIOTERAPIA DE BACABAL',
        'PAFISIO': 'CENTRO DE FISIOTERAPIA DE BACABAL',
        'SAE': 'SAE SERVICO AMBULATORIAL ESPECIALIZ',
        'TFD': 'UNIDADE DE TRATAMENTO FORA DO DOMIC',
        'CAPSI': 'CENTRO DE ATENCAO PSICOSSOCIAL INFA',
        'CAPS': 'CENTRO DE ATENCAO PSICOSSOCIAL CAPS',
        'CTA': 'COACTA CENTRO DE TESTAGEM ANONIMA P',
        'POLI': 'POLICLINICA DE BACABAL',
        'CEO': 'CENTRO DE ESPECIALIDADE ODONTOLOGIC',
        'CREG': 'CENTRAL DE REGULACAO DAS URGENCIAS',
        'REGULACAO': 'CENTRAL DE REGULACAO DAS URGENCIAS',
        'VISANIT': 'SERVICO DE VIGILANCIA SANITARIA BAC',
        'VIGILANCIA': 'SERVICO DE VIGILANCIA SANITARIA BAC',
        'SAV': 'SAMU 192 SAV BACABAL 01',
        'SBV01': 'SAMU 192 SBV BACABAL 01',
        'SBV 01': 'SAMU 192 SBV BACABAL 01',
        'SBV02': 'SAMU 192 SBV BACABAL 02',
        'SBV 02': 'SAMU 192 SBV BACABAL 02',
        'SBV03': 'SAMU 192 SBV BACABAL 03',
        'SBV 03': 'SAMU 192 SBV BACABAL 03',
        'MOTO01': 'MOTOLANCIA BACABAL 01',
        'MOTO 01': 'MOTOLANCIA BACABAL 01',
        'MOTO02': 'MOTOLANCIA BACABAL 02',
        'MOTO 02': 'MOTOLANCIA BACABAL 02',
        'MOTO03': 'MOTOLANCIA BACABAL 03',
        'MOTO 03': 'MOTOLANCIA BACABAL 03'
    },

    cnesUnidadesMap: {
        '2387412': 'HOSPITAL MARIA SOCORRO BRANDAO',
        '0000001': 'UNIDADE DE TRATAMENTO FORA DO DOMIC',
        '2387439': 'HOSPITAL MATERNO INFANTIL',
        '2389114': 'LABORATORIO CENTRAL DR COELHO DIAS',
        '2389122': 'CENTRO DE ESPECIALIDADES DR COELHO',
        '2389130': 'SAE SERVICO AMBULATORIAL ESPECIALIZ',
        '3889157': 'CENTRO DE FISIOTERAPIA DE BACABAL',
        '2389149': 'CENTRO DE FISIOTERAPIA DE BACABAL',
        '2389157': 'CENTRAL DE REGULACAO DAS URGENCIAS',
        '2389165': 'POLICLINICA DE BACABAL',
        '7014710': 'CENTRO DE ATENCAO PSICOSSOCIAL CAPS',
        '7083834': 'COACTA CENTRO DE TESTAGEM ANONIMA P',
        '9654321': 'CENTRO DE ATENCAO PSICOSSOCIAL INFA',
        '2389173': 'SERVICO DE VIGILANCIA SANITARIA BAC',
        '2389181': 'SAMU 192 SAV BACABAL 01',
        '2389200': 'CENTRO DE ESPECIALIDADE ODONTOLOGIC',
        '2389219': 'SAMU 192 SBV BACABAL 01',
        '2389227': 'SAMU 192 SBV BACABAL 02',
        '2389235': 'SAMU 192 SBV BACABAL 03',
        '2389243': 'MOTOLANCIA BACABAL 01',
        '2389251': 'MOTOLANCIA BACABAL 02',
        '2389260': 'MOTOLANCIA BACABAL 03'
    },

    async init() {
        this.sanitizeIfFirstRun();
        this.bindEvents();
        this.loadProducoes();
        await this.loadCnesBase();
    },

    sanitizeIfFirstRun() {
        const RESET_FLAG = 'argos_sanitized_zero_2026_09_19_v3';
        try {
            if (typeof localStorage !== 'undefined' && localStorage.getItem(RESET_FLAG) !== 'done') {
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && (k.startsWith('argos_producoes_bpa') || k === 'argos_producoes_profissionais_cns' || k === 'argos_espelho_producao')) {
                        keysToRemove.push(k);
                    }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
                localStorage.setItem(this.responsaveisKey, JSON.stringify({}));
                localStorage.setItem(RESET_FLAG, 'done');
                console.info('🧹 Higienização ARGOS aplicada: produções e atribuições zeradas.');
            }
        } catch(e) {}
    },

    async clearAllData() {
        try {
            // 1. Limpar produções locais do BPA
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k.startsWith('argos_producoes_bpa') || k === 'argos_producoes_profissionais_cns' || k === 'argos_espelho_producao')) {
                    keysToRemove.push(k);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));

            // 2. Zerar atribuições de responsáveis
            localStorage.setItem(this.responsaveisKey, JSON.stringify({}));

            // 3. Atualizar configurações na nuvem se conectado
            if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                try {
                    const client = window.SupabaseConfig.getClient();
                    if (client) {
                        await client.from('configuracoes').upsert([
                            { chave: 'bpa_responsaveis', valor: JSON.stringify({}) }
                        ], { onConflict: 'chave' });
                    }
                } catch(e) {}
            }

            // 4. Limpar memória BPA
            this.producoes = [];
            this.filePendingUpload = null;
            this.pendingEmailProducao = null;
            this.currentCompetenciaFiltro = '';
            this.currentResponsavelFiltro = '';
            this.currentStatusFilter = '';
            this.currentTipoFiltro = '';
            this.currentSearchTerm = '';

            // 5. Limpar Espelho de Produção
            if (typeof window !== 'undefined' && window.ProducaoProfissionalModule) {
                if (typeof window.ProducaoProfissionalModule.clearAllData === 'function') {
                    window.ProducaoProfissionalModule.clearAllData();
                } else {
                    window.ProducaoProfissionalModule.records = [];
                    try { localStorage.removeItem('argos_producoes_profissionais_cns'); } catch(e){}
                    if (typeof window.ProducaoProfissionalModule.render === 'function') {
                        window.ProducaoProfissionalModule.render();
                    }
                }
            }

            this.renderAll();
            this.showToast('Higienização realizada: todos os dados de produção e atribuições foram zerados!', 'success');
        } catch(e) {
            console.error('Erro na higienização:', e);
            alert('Falha ao higienizar: ' + e.message);
        }
    },

    solicitarZerarDados() {
        if (!this.isAdminOrFrancileide()) return;
        const confirmMsg = '⚠️ HIGIENIZAÇÃO DE DADOS:\n\nDeseja realmente ZERAR todos os dados de Produção BPA, o Espelho de Produção e deixar todas as atribuições zeradas?\n\nEsta ação limpará o histórico para permitir que você envie as produções do zero com segurança.';
        if (confirm(confirmMsg)) {
            this.clearAllData();
        }
    },

    async loadCnesBase() {
        if (this.cnesBaseCache && Array.isArray(this.cnesBaseCache.estabelecimentos) && this.cnesBaseCache.estabelecimentos.length > 0) {
            return this.cnesBaseCache;
        }
        if (typeof window !== 'undefined' && window.ArgosCnesBase && Array.isArray(window.ArgosCnesBase.estabelecimentos)) {
            this.cnesBaseCache = window.ArgosCnesBase;
            return this.cnesBaseCache;
        }
        if (typeof window !== 'undefined' && window.CnesModule?.state && Array.isArray(window.CnesModule.state.estabelecimentos) && window.CnesModule.state.estabelecimentos.length > 0) {
            this.cnesBaseCache = { estabelecimentos: window.CnesModule.state.estabelecimentos };
            window.ArgosCnesBase = this.cnesBaseCache;
            return this.cnesBaseCache;
        }
        if (typeof window !== 'undefined' && window.ProducaoProfissionalModule?.cnesCache && Array.isArray(window.ProducaoProfissionalModule.cnesCache.estabelecimentos) && window.ProducaoProfissionalModule.cnesCache.estabelecimentos.length > 0) {
            this.cnesBaseCache = window.ProducaoProfissionalModule.cnesCache;
            window.ArgosCnesBase = this.cnesBaseCache;
            return this.cnesBaseCache;
        }

        if (typeof fetch === 'function') {
            try {
                const headers = {};
                if (typeof window !== 'undefined' && window.SupabaseConfig) {
                    if (typeof window.SupabaseConfig.getClient === 'function') {
                        const client = window.SupabaseConfig.getClient();
                        if (client && client.auth && typeof client.auth.getSession === 'function') {
                            const sessionResult = await client.auth.getSession().catch(() => null);
                            const token = sessionResult?.data?.session?.access_token;
                            if (token) headers.Authorization = `Bearer ${token}`;
                        }
                    }
                    if (!headers.Authorization && typeof window.SupabaseConfig.getAnonKey === 'function') {
                        const anon = window.SupabaseConfig.getAnonKey();
                        if (anon) headers.Authorization = `Bearer ${anon}`;
                    }
                }
                const res = await fetch('/api/cnes/bacabal', { headers }).catch(() => null);
                if (res && res.ok) {
                    const txt = await res.text();
                    this.cnesBaseCache = JSON.parse(txt.replace(/^\uFEFF/, ''));
                    if (typeof window !== 'undefined') window.ArgosCnesBase = this.cnesBaseCache;
                    return this.cnesBaseCache;
                }
            } catch (e) {
                console.warn('CNES data fetch falhou no BpaModule:', e);
            }
        }
        return null;
    },

    /* =========================================================
       CATÁLOGO DINÂMICO DE UNIDADES DO SISTEMA + CASOS ISOLADOS
       ========================================================= */
    getUnidadesSistema() {
        if (this.accessLoadError) return [];

        // As 21 Unidades Executoras oficiais da Produção BPA de Bacabal (conforme tabela municipal de faturamento)
        const unidadesOficiais = [
            { id: 'hmso', cnes: '2387412', nome: 'HOSPITAL MARIA SOCORRO BRANDAO' },
            { id: 'hmi', cnes: '2387439', nome: 'HOSPITAL MATERNO INFANTIL' },
            { id: 'cesp', cnes: '2389122', nome: 'CENTRO DE ESPECIALIDADES DR COELHO' },
            { id: 'tfd', cnes: '0000001', nome: 'UNIDADE DE TRATAMENTO FORA DO DOMIC' },
            { id: 'lcdias', cnes: '2389114', nome: 'LABORATORIO CENTRAL DR COELHO DIAS' },
            { id: 'pbacabal', cnes: '2389165', nome: 'POLICLINICA DE BACABAL' },
            { id: 'sae', cnes: '2389130', nome: 'SAE SERVICO AMBULATORIAL ESPECIALIZ' },
            { id: 'fisio', cnes: '3889157', nome: 'CENTRO DE FISIOTERAPIA DE BACABAL' },
            { id: 'caps', cnes: '7014710', nome: 'CENTRO DE ATENCAO PSICOSSOCIAL CAPS' },
            { id: 'cta', cnes: '7083834', nome: 'COACTA CENTRO DE TESTAGEM ANONIMA P' },
            { id: 'ceo', cnes: '2389200', nome: 'CENTRO DE ESPECIALIDADE ODONTOLOGIC' },
            { id: 'capsi', cnes: '9654321', nome: 'CENTRO DE ATENCAO PSICOSSOCIAL INFA' },
            { id: 'creg', cnes: '2389157', nome: 'CENTRAL DE REGULACAO DAS URGENCIAS' },
            { id: 'moto02', cnes: '2389251', nome: 'MOTOLANCIA BACABAL 02' },
            { id: 'visanit', cnes: '2389173', nome: 'SERVICO DE VIGILANCIA SANITARIA BAC' },
            { id: 'savsav01', cnes: '2389181', nome: 'SAMU 192 SAV BACABAL 01' },
            { id: 'sbv01', cnes: '2389219', nome: 'SAMU 192 SBV BACABAL 01' },
            { id: 'sbv02', cnes: '2389227', nome: 'SAMU 192 SBV BACABAL 02' },
            { id: 'sbv03', cnes: '2389235', nome: 'SAMU 192 SBV BACABAL 03' },
            { id: 'moto01', cnes: '2389243', nome: 'MOTOLANCIA BACABAL 01' },
            { id: 'moto03', cnes: '2389260', nome: 'MOTOLANCIA BACABAL 03' }
        ];

        let unidades = unidadesOficiais.map(u => ({ ...u }));

        // Incluir unidades manuais cadastradas pela gestão (ADM / Francileide)
        const manuais = this.getUnidadesManuais();
        manuais.forEach(m => {
            const cleanCnesM = (m.cnes || '').replace(/\D/g, '');
            const exists = unidades.some(u =>
                (cleanCnesM && u.cnes && u.cnes.replace(/\D/g, '') === cleanCnesM) ||
                this.normalizeIdentity(u.nome) === this.normalizeIdentity(m.nome)
            );
            if (!exists) {
                unidades.push({
                    id: m.id || ('man_' + Math.random().toString(36).substring(2, 7)),
                    nome: (m.nome || '').trim().toUpperCase(),
                    cnes: m.cnes ? m.cnes.trim() : '',
                    isManual: true,
                    isIsolado: false
                });
            }
        });

        // Incluir unidades de produções já enviadas que sejam casos isolados (exceto exames SADT como Tomografia)
        if (Array.isArray(this.producoes)) {
            this.producoes.forEach(p => {
                if (p.estabelecimento_nome) {
                    const nomeNorm = p.estabelecimento_nome.trim().toUpperCase();
                    if (nomeNorm === 'TOMOGRAFIA' || nomeNorm === 'TOMO') return; // Exame SADT do HMSO, não é unidade isolada
                    const cnesP = (p.cnes || '').trim();
                    const exists = unidades.some(u => 
                        (cnesP && u.cnes && u.cnes.replace(/\D/g, '') === cnesP.replace(/\D/g, '')) ||
                        this.normalizeIdentity(u.nome) === this.normalizeIdentity(nomeNorm)
                    );
                    if (!exists) {
                        unidades.push({
                            id: 'iso_' + Math.random().toString(36).substring(2, 7),
                            nome: nomeNorm,
                            cnes: p.cnes || '',
                            isIsolado: true
                        });
                    }
                }
            });
        }

        // Vincular o responsável e a modalidade definidos pelo ADM / Francileide
        const respMap = this.getResponsaveisMap();
        const modalMap = this.getModalidadesMap();
        unidades.forEach(u => {
            const cleanCnes = (u.cnes || '').replace(/\D/g, '');
            // Uma atribuição vazia é uma remoção explícita; não recuperar um alias antigo.
            const keys = [cleanCnes, u.cnes, u.nome, u.id].filter(Boolean);
            const key = keys.find(k => Object.prototype.hasOwnProperty.call(respMap, k))
                ?? Object.keys(respMap).find(k => this.normalizeIdentity(k) === this.normalizeIdentity(u.nome));
            let rawResp = key !== undefined ? respMap[key] : '';
            const respNorm = (rawResp || '').toLowerCase();
            if (respNorm.includes('mateus') || respNorm.includes('altair') || respNorm.includes('yvanna') || respNorm.includes('carvalhal') || respNorm.includes('mariline') || respNorm.includes('marilene')) {
                rawResp = '';
            }
            u.responsavel = rawResp || 'Não atribuído';

            // Modalidade esperada: 'AMBOS' (BPA-C + BPA-I), 'BPA-C' ou 'BPA-I'
            u.modalidade = modalMap[cleanCnes] || modalMap[u.cnes] || modalMap[u.nome] || modalMap[u.id];
            if (!u.modalidade) {
                for (const [k, mod] of Object.entries(modalMap)) {
                    if (this.normalizeIdentity(u.nome) === this.normalizeIdentity(k) ||
                        this.normalizeIdentity(u.nome).includes(this.normalizeIdentity(k)) ||
                        this.normalizeIdentity(k).includes(this.normalizeIdentity(u.nome))) {
                        u.modalidade = mod;
                        break;
                    }
                }
            }
            if (!u.modalidade) u.modalidade = 'AMBOS';
        });

        return this.isAdminOrFrancileide() ? unidades : unidades.filter(u => this.isAssignedToUser(u));
    },

    /* =========================================================
       GESTÃO DE RESPONSÁVEIS (EXCLUSIVO ADM E FRANCILEIDE)
       ========================================================= */
    getCurrentUser() {
        try {
            const str = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
            if (str) return JSON.parse(str);
        } catch(e){}
        return {};
    },

    isAdminOrFrancileide(user) {
        if (!user) user = this.getCurrentUser();
        if (!user) return false;
        const uname = (user.username || '').toLowerCase();
        const role = (user.role || '').toUpperCase();
        return !!uname && (uname.trim() === 'francileide' || role.trim() === 'ADM');
    },

    isFrancileide(user) {
        if (!user) user = this.getCurrentUser();
        if (!user) return false;
        const uname = (user.username || '').toLowerCase().trim();
        const name = (user.name || '').toLowerCase().trim();
        return uname === 'francileide' || name === 'francileide';
    },

    normalizeIdentity(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/g, ' ')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
    },

    isAssignedToUser(unit, user = this.getCurrentUser()) {
        if (!user.username) return false;
        const assigned = this.normalizeIdentity(unit.responsavel);
        if (!assigned || assigned === 'nao atribuido') return false;
        const names = [user.username, user.name];
        if ((user.username || '').toLowerCase() === 'airton' || (user.role || '').toUpperCase() === 'ADM') {
            names.push('airton/argos', 'airton argos', 'airton costa', 'airton', 'argos');
        }
        return names.filter(Boolean).some(value => this.normalizeIdentity(value) === assigned);
    },

    matchesUnit(record, unit) {
        const cnes = String(record.cnes || '').replace(/\D/g, '');
        const unitCnes = String(unit.cnes || '').replace(/\D/g, '');
        // CNES divergentes nunca são conciliados pelo nome.
        if (cnes) return !!unitCnes && cnes === unitCnes;
        return !!record.estabelecimento_nome && this.normalizeIdentity(record.estabelecimento_nome) === this.normalizeIdentity(unit.nome);
    },

    canAccessProducao(record) {
        if (!record || this.accessLoadError || !this.getCurrentUser().username) return false;
        return this.isAdminOrFrancileide() || this.getUnidadesSistema().some(u => this.matchesUnit(record, u));
    },

    getAccessibleProducoes() {
        return this.producoes.filter(p => this.canAccessProducao(p));
    },

    assertUploadAccess(data) {
        if (this.accessLoadError || !this.getCurrentUser().username) throw new Error('Acesso indisponível. Entre novamente e recarregue as unidades.');
        const record = { cnes: data.cnes, estabelecimento_nome: data.estabelecimentoNome };
        const unit = this.getUnidadesSistema().find(u => this.matchesUnit(record, u));
        if (!this.isAdminOrFrancileide() && !unit) throw new Error('Você só pode anexar produções das unidades atribuídas a você.');
        if (unit && data.estabelecimentoNome && this.normalizeIdentity(unit.nome) !== this.normalizeIdentity(data.estabelecimentoNome)) {
            throw new Error('A unidade selecionada não corresponde ao CNES do arquivo. Confira antes de enviar.');
        }
        if (!data.estabelecimentoNome || data.estabelecimentoNome === 'ESTABELECIMENTO NÃO IDENTIFICADO') throw new Error('Selecione a unidade da produção.');
        if (unit) {
            data.cnes = unit.cnes;
            data.estabelecimentoNome = unit.nome;
        }
    },

    getSystemUsers() {
        let baseUsers = [];
        if (window.UsersModule && Array.isArray(window.UsersModule.users) && window.UsersModule.users.length > 0) {
            baseUsers = window.UsersModule.users;
        } else {
            baseUsers = [
                { username: 'ewerton', name: 'Ewerton', role: 'DIGITADOR' },
                { username: 'aline', name: 'Aline', role: 'DIGITADOR' },
                { username: 'flavia', name: 'Flávia', role: 'DIGITADOR' },
                { username: 'jessica', name: 'Jéssica', role: 'DIGITADOR' },
                { username: 'carol', name: 'Carol', role: 'DIGITADOR' },
                { username: 'francileide', name: 'Francileide', role: 'SUPERINTENDENTE' },
                { username: 'airton', name: 'AIRTON/ARGOS', role: 'ADM' }
            ];
        }

        const filtered = baseUsers
            .filter(u => {
                const un = (u.username || '').toLowerCase().trim();
                const nm = (u.name || '').toLowerCase().trim();
                // Excluir Mariline/Marilene
                if (un === 'mariline' || un === 'marilene' || nm.includes('mariline') || nm.includes('marilene')) return false;
                // Excluir Mateus Altair
                if (un === 'mateus' || nm.includes('mateus') || nm.includes('altair')) return false;
                // Excluir Yvanna Carvalhal
                if (un === 'yvanna' || nm.includes('yvanna') || nm.includes('carvalhal')) return false;
                return true;
            })
            .map(u => {
                if ((u.username || '').toLowerCase() === 'airton') {
                    return { ...u, name: 'AIRTON/ARGOS' };
                }
                return u;
            });

        if (!filtered.some(u => (u.username || '').toLowerCase() === 'airton' || (u.name || '').includes('AIRTON'))) {
            filtered.push({ username: 'airton', name: 'AIRTON/ARGOS', role: 'ADM' });
        }

        return filtered;
    },

    getResponsaveisMap() {
        try {
            const str = localStorage.getItem(this.responsaveisKey);
            if (str) {
                const map = JSON.parse(str);
                let altered = false;
                for (const k of Object.keys(map)) {
                    const v = String(map[k] || '').toLowerCase();
                    if (v.includes('mateus') || v.includes('altair') || v.includes('yvanna') || v.includes('carvalhal') || v.includes('mariline') || v.includes('marilene')) {
                        delete map[k];
                        altered = true;
                    }
                }
                if (altered) {
                    try { localStorage.setItem(this.responsaveisKey, JSON.stringify(map)); } catch(e){}
                }
                return map;
            }
        } catch(e){}
        return {};
    },

    getModalidadesMap() {
        try {
            const str = localStorage.getItem(this.modalidadesKey);
            if (str) return JSON.parse(str);
        } catch(e){}
        return {
            'HOSPITAL MARIA SOCORRO BRANDÃO': 'AMBOS',
            'HOSPITAL MATERNO INFANTIL': 'AMBOS',
            'CENTRO DE ESPECIALIDADES DR. COELHO': 'AMBOS',
            'CENTRO DE ESPECIALIDADES DR COELHO': 'AMBOS',
            'POLICLÍNICA DE BACABAL': 'AMBOS',
            'POLICLINICA DE BACABAL': 'AMBOS',
            'CENTRO DE FISIOTERAPIA': 'AMBOS',
            'CENTRO DE FISIOTERAPIA DE BACABAL': 'AMBOS',
            '2389149': 'AMBOS',
            'SAE': 'AMBOS',
            'SAE SERVICO AMBULATORIAL ESPECIALIZ': 'AMBOS',
            'CENTRO DE ATENCAO PSICOSSOCIAL CAPS': 'BPA-I',
            'CAPS': 'BPA-I',
            'CENTRO DE ATENCAO PSICOSSOCIAL INFA': 'BPA-I',
            'CAPSI': 'BPA-I',
            'COACTA CENTRO DE TESTAGEM ANONIMA P': 'AMBOS',
            'CTA': 'AMBOS',
            'CENTRO DE ESPECIALIDADE ODONTOLOGIC': 'AMBOS',
            'CEO': 'AMBOS',
            'UNIDADE DE TRATAMENTO FORA DO DOMIC': 'BPA-I',
            'TFD': 'BPA-I',
            'LABORATÓRIO CENTRAL DR. COELHO DIAS': 'BPA-C',
            'LABORATORIO CENTRAL DR COELHO DIAS': 'BPA-C',
            'SERVICO DE VIGILANCIA SANITARIA BAC': 'BPA-C',
            'VIGILÂNCIA SANITÁRIA': 'BPA-C',
            'CENTRAL DE REGULACAO DAS URGENCIAS': 'BPA-C',
            'CENTRAL DE REGULAÇÃO': 'BPA-C',
            'SAMU 192 SAV BACABAL 01': 'BPA-C',
            'SAMU SAV 01': 'BPA-C',
            'SAMU 192 SBV BACABAL 01': 'BPA-C',
            'SAMU SBV 01': 'BPA-C',
            'SAMU 192 SBV BACABAL 02': 'BPA-C',
            'SAMU SBV 02': 'BPA-C',
            'SAMU 192 SBV BACABAL 03': 'BPA-C',
            'SAMU SBV 03': 'BPA-C',
            'MOTOLANCIA BACABAL 01': 'BPA-C',
            'MOTOLÂNCIA 01': 'BPA-C',
            'MOTOLANCIA BACABAL 02': 'BPA-C',
            'MOTOLÂNCIA 02': 'BPA-C',
            'MOTOLANCIA BACABAL 03': 'BPA-C',
            'MOTOLÂNCIA 03': 'BPA-C'
        };
    },

    openAssignResponsaveisModal(focusInput = false) {
        if (!this.isAdminOrFrancileide()) {
            alert('Apenas o Administrador e a Francileide podem definir ou alterar os responsáveis pelas unidades.');
            return;
        }

        const modal = document.getElementById('modalGerenciarResponsaveisBpa');
        const tbody = document.getElementById('tbodyGerenciarResponsaveisBpa');
        if (!modal || !tbody) return;

        const unidades = this.getUnidadesSistema();
        const users = this.getSystemUsers();
        const currentMap = this.getResponsaveisMap();
        const modalMap = this.getModalidadesMap();

        // Preencher o select de digitadores do form de adicionar nova unidade manual
        const selectNovaResp = document.getElementById('selectNovaUnidadeResp');
        if (selectNovaResp) {
            let optionsNova = `<option value="">-- Não Atribuído --</option>`;
            users.forEach(usr => {
                optionsNova += `<option value="${usr.name}">${usr.name} (@${usr.username})</option>`;
            });
            selectNovaResp.innerHTML = optionsNova;
        }

        let html = '';
        unidades.forEach(u => {
            let currentResp = currentMap[u.cnes] || currentMap[u.nome] || currentMap[u.id] || u.responsavel || '';
            const respNorm = (currentResp || '').toLowerCase();
            if (respNorm.includes('mateus') || respNorm.includes('altair') || respNorm.includes('yvanna') || respNorm.includes('carvalhal') || respNorm.includes('mariline') || respNorm.includes('marilene') || respNorm === 'não atribuído') {
                currentResp = '';
            }
            const currentModal = modalMap[u.cnes] || modalMap[u.nome] || modalMap[u.id] || u.modalidade || 'AMBOS';

            let options = `<option value="">-- Não Atribuído --</option>`;
            users.forEach(usr => {
                const isSelected = currentResp && (usr.name.toLowerCase() === currentResp.toLowerCase() || usr.username.toLowerCase() === currentResp.toLowerCase());
                options += `<option value="${usr.name}" ${isSelected ? 'selected' : ''}>${usr.name} (@${usr.username})</option>`;
            });

            const actionBtn = u.isManual
                ? `<button type="button" onclick="BpaModule.removerUnidadeManual('${u.id}')" title="Excluir esta unidade manual" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px 6px; border-radius: 4px; transition: all 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='none'"><i class="fas fa-trash-alt"></i></button>`
                : `<span style="color: #cbd5e1; font-size: 0.72rem;" title="Unidade oficial do município"><i class="fas fa-lock"></i></span>`;

            html += `
                <tr style="border-bottom: 1px solid #e2e8f0; ${u.isManual ? 'background: #fffdf5;' : ''}">
                    <td style="padding: 0.65rem 1rem; font-weight: 600; color: #1e293b;">
                        ${u.nome}
                        ${u.isManual ? '<span style="font-size: 0.68rem; background: #fef3c7; color: #b45309; padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: 700; border: 1px solid #fde68a;"><i class="fas fa-hand-paper"></i> Manual</span>' : ''}
                        ${u.isIsolado ? '<span style="font-size: 0.68rem; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">Caso Isolado</span>' : ''}
                    </td>
                    <td style="padding: 0.65rem 1rem; color: #64748b; font-family: monospace;">${u.cnes || '-'}</td>
                    <td style="padding: 0.65rem 1rem;">
                        <select class="bpa-select bpa-select-resp-row" data-key="${u.nome}" data-cnes="${u.cnes}" style="width: 100%;">
                            ${options}
                        </select>
                    </td>
                    <td style="padding: 0.65rem 1rem;">
                        <select class="bpa-select bpa-select-modal-row" data-key="${u.nome}" data-cnes="${u.cnes}" style="width: 100%; font-weight: 600;">
                            <option value="AMBOS" ${currentModal === 'AMBOS' ? 'selected' : ''}>AMBOS (BPA-C + BPA-I)</option>
                            <option value="BPA-C" ${currentModal === 'BPA-C' ? 'selected' : ''}>Apenas BPA-C (Consolidado)</option>
                            <option value="BPA-I" ${currentModal === 'BPA-I' ? 'selected' : ''}>Apenas BPA-I (Individualizado)</option>
                        </select>
                    </td>
                    <td style="padding: 0.65rem 0.5rem; text-align: center;">
                        ${actionBtn}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        const btnZerar = document.getElementById('btnZerarAtribuicoesBpa');
        if (btnZerar) {
            btnZerar.onclick = () => {
                if (confirm('Deseja realmente deixar todas as unidades zeradas (Não Atribuído)?')) {
                    tbody.querySelectorAll('.bpa-select-resp-row').forEach(sel => sel.value = '');
                    this.showToast('Todas as unidades marcadas como Não Atribuído. Clique em "Salvar Atribuições" para confirmar.', 'info');
                }
            };
        }

        modal.classList.remove('hidden');

        if (focusInput) {
            setTimeout(() => {
                const inp = document.getElementById('inputNovaUnidadeNome');
                if (inp) {
                    inp.focus();
                    inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 120);
        }
    },

    closeAssignResponsaveisModal() {
        const modal = document.getElementById('modalGerenciarResponsaveisBpa');
        if (modal) modal.classList.add('hidden');
    },

    adicionarNovaUnidadeManual() {
        if (!this.isAdminOrFrancileide()) {
            this.showToast('Apenas Administrador e Francileide podem cadastrar novas unidades.', 'warning');
            return;
        }

        const inputNome = document.getElementById('inputNovaUnidadeNome');
        const inputCnes = document.getElementById('inputNovaUnidadeCnes');
        const selectModal = document.getElementById('selectNovaUnidadeModal');
        const selectResp = document.getElementById('selectNovaUnidadeResp');

        const nome = (inputNome ? inputNome.value : '').trim().toUpperCase();
        const cnes = (inputCnes ? inputCnes.value : '').trim().replace(/\D/g, '');
        const modalidade = (selectModal ? selectModal.value : 'AMBOS') || 'AMBOS';
        const responsavel = (selectResp ? selectResp.value : '') || '';

        if (!nome || nome.length < 3) {
            this.showToast('Informe o nome da unidade de saúde (mínimo 3 caracteres).', 'warning');
            if (inputNome) inputNome.focus();
            return;
        }

        // Verificar se já existe uma unidade com este nome ou CNES
        const unidadesAtuais = this.getUnidadesSistema();
        const jaExiste = unidadesAtuais.some(u => {
            const mesmoNome = this.normalizeIdentity(u.nome) === this.normalizeIdentity(nome);
            const mesmoCnes = cnes && u.cnes && u.cnes.replace(/\D/g, '') === cnes;
            return mesmoNome || mesmoCnes;
        });

        if (jaExiste) {
            this.showToast('Esta unidade ou CNES já está cadastrada no sistema.', 'warning');
            return;
        }

        const novaUnidade = {
            id: 'manual_' + Date.now(),
            nome: nome,
            cnes: cnes,
            isManual: true,
            criado_em: new Date().toISOString()
        };

        const manuais = this.getUnidadesManuais();
        manuais.push(novaUnidade);
        this.saveUnidadesManuais(manuais);

        // Salvar a modalidade da nova unidade
        const modalMap = this.getModalidadesMap();
        if (cnes) modalMap[cnes] = modalidade;
        modalMap[nome] = modalidade;
        modalMap[novaUnidade.id] = modalidade;
        try {
            localStorage.setItem(this.modalidadesKey, JSON.stringify(modalMap));
        } catch(e) {}

        // Salvar o responsável se atribuído
        if (responsavel) {
            const respMap = this.getResponsaveisMap();
            if (cnes) respMap[cnes] = responsavel;
            respMap[nome] = responsavel;
            respMap[novaUnidade.id] = responsavel;
            try {
                localStorage.setItem(this.responsaveisKey, JSON.stringify(respMap));
            } catch(e) {}
        }

        // Limpar os campos do formulário
        if (inputNome) inputNome.value = '';
        if (inputCnes) inputCnes.value = '';
        if (selectResp) selectResp.value = '';
        if (selectModal) selectModal.value = 'AMBOS';

        // Re-renderizar o modal e atualizar o restante do sistema
        this.openAssignResponsaveisModal();
        this.renderAll();
        this.showToast(`Unidade "${nome}" cadastrada com sucesso!`, 'success');
    },

    removerUnidadeManual(id) {
        if (!this.isAdminOrFrancileide()) return;
        const manuais = this.getUnidadesManuais();
        const target = manuais.find(m => m.id === id);
        if (!target) return;

        if (!confirm(`Deseja realmente remover a unidade manual "${target.nome}"?`)) return;

        const updated = manuais.filter(m => m.id !== id);
        this.saveUnidadesManuais(updated);

        // Remover do respMap e modalMap se necessário
        const respMap = this.getResponsaveisMap();
        if (target.cnes) delete respMap[target.cnes];
        delete respMap[target.nome];
        delete respMap[target.id];
        try { localStorage.setItem(this.responsaveisKey, JSON.stringify(respMap)); } catch(e){}

        this.openAssignResponsaveisModal();
        this.renderAll();
        this.showToast(`Unidade "${target.nome}" removida.`, 'info');
    },

    async saveResponsaveis() {
        if (!this.isAdminOrFrancileide()) return;

        // Salvar Responsáveis (Base Limpa)
        const selects = document.querySelectorAll('.bpa-select-resp-row');
        const newMap = {};
        selects.forEach(sel => {
            const key = sel.getAttribute('data-key');
            const cnes = sel.getAttribute('data-cnes');
            const val = sel.value;
            if (key) newMap[key] = val;
            if (cnes) newMap[cnes] = val;
        });

        // Salvar Modalidades Esperadas
        const modalSelects = document.querySelectorAll('.bpa-select-modal-row');
        const newModalMap = this.getModalidadesMap();
        modalSelects.forEach(sel => {
            const key = sel.getAttribute('data-key');
            const cnes = sel.getAttribute('data-cnes');
            const val = sel.value;
            if (key) newModalMap[key] = val;
            if (cnes) newModalMap[cnes] = val;
        });

        try {
            if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                const client = window.SupabaseConfig.getClient();
                if (!client) throw new Error('Conexão indisponível.');
                const { error } = await client.from('configuracoes').upsert([
                    { chave: 'bpa_responsaveis', valor: JSON.stringify(newMap) },
                    { chave: 'bpa_modalidades', valor: JSON.stringify(newModalMap) }
                ], { onConflict: 'chave' });
                if (error) throw error;
            }
            localStorage.setItem(this.responsaveisKey, JSON.stringify(newMap));
            localStorage.setItem(this.modalidadesKey, JSON.stringify(newModalMap));
        } catch (error) {
            alert('Não foi possível salvar as atribuições. Elas não foram alteradas. ' + error.message);
            return;
        }

        this.closeAssignResponsaveisModal();
        this.populateResponsaveisFilter();
        this.renderAll();
        this.showToast('Responsáveis e modalidades esperadas atualizados com sucesso!', 'success');
    },

    /* =========================================================
       PARSER INTELIGENTE E LEITURA PROFUNDA DO ARQUIVO BPA
       ========================================================= */
    parseBpaFile(file, textContent) {
        if (!window.BpaAuditCore) throw new Error('O leitor BPA não carregou. Atualize a página.');
        const parsed = window.BpaAuditCore.parse(textContent);
        const records = parsed.records;
        const cnesList = [...new Set(records.map(r => r.cnes).filter(Boolean))];
        const competencies = [...new Set(records.map(r => r.competencia).filter(Boolean))];

        // 1. Frequência de ocorrência de cada CNES no arquivo
        const cnesFrequency = new Map();
        for (const r of records) {
            if (r.cnes) {
                const c = String(r.cnes).trim();
                cnesFrequency.set(c, (cnesFrequency.get(c) || 0) + 1);
            }
        }

        // 2. Cruzamento com as Unidades Oficiais do Sistema (Bacabal)
        const unidadesSistema = this.getUnidadesSistema();
        const officialMatches = cnesList
            .map(c => ({ cnes: c, unit: unidadesSistema.find(u => String(u.cnes || '').replace(/\D/g, '') === String(c).replace(/\D/g, '')) }))
            .filter(item => !!item.unit);

        // 3. Detecção por Sigla no Nome do Arquivo (ex: PAFISIO -> CENTRO DE FISIOTERAPIA)
        const fileNameUpper = String(file?.name || '').toUpperCase();
        let unitByFilename = null;
        for (const [sigla, nomeUnidade] of Object.entries(this.siglasUnidades || {})) {
            const cleanSigla = sigla.toUpperCase().trim();
            if (cleanSigla && fileNameUpper.includes(cleanSigla)) {
                const matched = unidadesSistema.find(u => 
                    this.normalizeIdentity(u.nome) === this.normalizeIdentity(nomeUnidade) ||
                    (u.id && u.id.toUpperCase() === cleanSigla)
                );
                if (matched) {
                    unitByFilename = matched;
                    break;
                }
            }
        }

        // 4. Determinação assertiva do CNES e Unidade do arquivo
        let unit = null;
        let cnes = '';

        if (cnesList.length === 1) {
            cnes = cnesList[0];
            unit = unidadesSistema.find(u => String(u.cnes || '').replace(/\D/g, '') === String(cnes).replace(/\D/g, ''));
        } else if (cnesList.length > 1) {
            // Em arquivos com múltiplas menções (ex: linhas com falha posicional de exportação),
            // priorizar a unidade oficial municipal identificada
            if (officialMatches.length === 1) {
                unit = officialMatches[0].unit;
                cnes = officialMatches[0].cnes;
            } else if (officialMatches.length > 1) {
                officialMatches.sort((a, b) => (cnesFrequency.get(b.cnes) || 0) - (cnesFrequency.get(a.cnes) || 0));
                unit = officialMatches[0].unit;
                cnes = officialMatches[0].cnes;
            }
            if (!unit && unitByFilename) {
                unit = unitByFilename;
                cnes = unit.cnes || '';
            }
            if (!cnes && cnesList.length > 0) {
                const sortedByFreq = [...cnesList].sort((a, b) => (cnesFrequency.get(b) || 0) - (cnesFrequency.get(a) || 0));
                cnes = sortedByFreq[0];
            }
        } else if (cnesList.length === 0 && unitByFilename) {
            unit = unitByFilename;
            cnes = unit.cnes || '';
        }

        if (!unit && cnes) {
            unit = unidadesSistema.find(u => String(u.cnes || '').replace(/\D/g, '') === String(cnes).replace(/\D/g, ''));
        }
        if (!unit && cnes && typeof window !== 'undefined' && window.CNES_METADATA_BACABAL && window.CNES_METADATA_BACABAL[cnes]) {
            const meta = window.CNES_METADATA_BACABAL[cnes];
            unit = { id: 'cnes_' + cnes, cnes: cnes, nome: String(meta.nomeFantasia || meta.razaoSocial || `CNES ${cnes}`).trim().toUpperCase() };
        }
        if (!unit && cnes && this.cnesBaseCache && Array.isArray(this.cnesBaseCache.estabelecimentos)) {
            const est = this.cnesBaseCache.estabelecimentos.find(e => String(e.cnes || '').replace(/\D/g, '') === String(cnes).replace(/\D/g, ''));
            if (est) {
                unit = { id: 'cnes_' + cnes, cnes: cnes, nome: String(est.nomeFantasia || est.nome || est.razaoSocial || `CNES ${cnes}`).trim().toUpperCase() };
            }
        }
        if (!unit && cnes && this.cnesUnidadesMap && this.cnesUnidadesMap[cnes]) {
            unit = { id: 'cnes_' + cnes, cnes: cnes, nome: this.cnesUnidadesMap[cnes] };
        }

        const presentation = window.BpaAuditCore.competencia(parsed.header?.competencia);
        const comp = presentation || (competencies.length === 1 ? window.BpaAuditCore.competencia(competencies[0]) : (competencies[0] ? window.BpaAuditCore.competencia(competencies[0]) : ''));
        const competencia = comp ? comp.slice(4) + '/' + comp.slice(0, 4) : '';
        const count02 = records.filter(r => r.tipo === 'BPA-C').length;
        const count03 = records.filter(r => r.tipo === 'BPA-I').length;
        const procedures = new Map();
        for (const r of records) {
            if (!/^\d{10}$/.test(r.procedimento) || !/^\d+$/.test(r.quantidade)) continue;
            procedures.set(r.procedimento, (procedures.get(r.procedimento) || 0) + Number(r.quantidade));
        }
        const detalhes = [...procedures].map(([codigo, quantidade]) => ({codigo, quantidade}));
        detalhes.sort((a, b) => b.quantidade - a.quantidade);

        // BPA-C is consolidated and has no individual CNS. Only BPA-I can
        // contribute to the list of identified professionals.
        const profMap = new Map();
        for (const r of records) {
            if (r.tipo !== 'BPA-I' || !/^\d{15}$/.test(String(r.cnsProfissional || '').trim())) continue;
            let cns = String(r.cnsProfissional || '').trim();
            const cbo = String(r.cbo || '').trim();
            const qty = /^\d+$/.test(r.quantidade) ? Number(r.quantidade) : 1;

            let key = cns;
            let resolvedProfs = [];
            if (!key && cbo) {
                resolvedProfs = this.lookupProfissionaisByCbo(cbo, cnes, unit?.nome);
                if (resolvedProfs.length === 1) {
                    key = resolvedProfs[0].cns || `CBO_${cbo}`;
                } else if (resolvedProfs.length > 1) {
                    key = `EQUIPE_${cbo}`;
                } else {
                    key = `CBO_${cbo}`;
                }
            }

            if (!key && !cbo) continue;
            if (!key) key = `CBO_${cbo}`;

            if (!profMap.has(key)) {
                let nome = '';
                let cboDesc = '';
                let membrosEquipe = [];

                if (resolvedProfs.length === 1) {
                    nome = resolvedProfs[0].nome || '';
                    cboDesc = resolvedProfs[0].ocupacao || (cbo ? `CBO ${cbo}` : '');
                } else if (resolvedProfs.length > 1) {
                    const ocupLabel = resolvedProfs[0].ocupacao?.split('-')[1]?.trim() || 'Especializada';
                    nome = `Equipe de ${ocupLabel} (${resolvedProfs.length} médicos/profissionais)`;
                    cboDesc = resolvedProfs[0].ocupacao || (`CBO ${cbo}`);
                    membrosEquipe = resolvedProfs.map(p => ({ nome: p.nome, cns: p.cns, ocupacao: p.ocupacao }));
                } else if (!key.startsWith('CBO_') && !key.startsWith('EQUIPE_')) {
                    const info = this.lookupProfissional ? this.lookupProfissional(key, cnes) : null;
                    nome = info?.nome || '';
                    cboDesc = info?.ocupacao || (cbo ? `CBO ${cbo}` : '');
                } else {
                    nome = `Equipe Especializada (CBO ${cbo})`;
                    cboDesc = `CBO ${cbo}`;
                }

                profMap.set(key, {
                    cns: key.startsWith('EQUIPE_') ? `CBO ${cbo} (${resolvedProfs.length} CNS)` : key.startsWith('CBO_') ? `Consolidado CBO ${cbo}` : key,
                    cnsReal: (key.startsWith('EQUIPE_') || key.startsWith('CBO_')) ? '' : key,
                    nome,
                    cbo,
                    cboDesc,
                    membrosEquipe,
                    totalQuantidade: 0,
                    totalAtendimentos: 0,
                    procedimentosMap: new Map(),
                    isConsolidadoBpaC: !r.cnsProfissional
                });
            }

            const prof = profMap.get(key);
            prof.totalQuantidade += qty;
            prof.totalAtendimentos += 1;
            if (r.cbo) prof.cbo = prof.cbo || r.cbo;
            if (r.procedimento) {
                const procQty = (prof.procedimentosMap.get(r.procedimento) || 0) + qty;
                prof.procedimentosMap.set(r.procedimento, procQty);
            }
        }

        const profissionaisDetalhados = [...profMap.values()].map(prof => {
            const info = prof.cnsReal && this.lookupProfissional ? this.lookupProfissional(prof.cnsReal, cnes) : null;
            const nome = prof.nome || info?.nome || '';
            const cboDesc = prof.cboDesc || info?.ocupacao || (prof.cbo ? ('CBO ' + prof.cbo) : '');
            const procedimentos = [...prof.procedimentosMap.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([codigo, quantidade]) => ({ codigo, quantidade }));
            return {
                cns: prof.cns,
                cnsReal: prof.cnsReal,
                nome,
                cbo: prof.cbo,
                cboDesc,
                membrosEquipe: prof.membrosEquipe || [],
                quantidade: prof.totalQuantidade,
                atendimentos: prof.totalAtendimentos,
                procedimentos,
                isConsolidadoBpaC: prof.isConsolidadoBpaC
            };
        }).sort((a, b) => b.quantidade - a.quantidade);

        const profissionaisAmostra = this.formatProfissionaisAmostra(profissionaisDetalhados);
        return {
            nomeArquivo: file?.name || '', estabelecimentoNome: unit?.nome || (cnes ? ((this.cnesUnidadesMap && this.cnesUnidadesMap[cnes]) || `ESTABELECIMENTO CNES ${cnes}`) : ''), cnes: unit?.cnes || cnes, cnesList,
            competencia, competenciasAtendimento: competencies, competenciaFormatada: this.formatCompetenciaLabel(competencia),
            tipoBpa: count02 && count03 ? 'AMBOS' : count03 ? 'BPA-I' : 'BPA-C',
            tipoExplicacao: records.length + ' registros reais: ' + count02 + ' BPA-C e ' + count03 + ' BPA-I. ' + (parsed.issues.length ? 'Há pontos de estrutura para conferir na auditoria.' : 'Execute a auditoria para verificar as regras e bases da competência.'),
            count02, count03, totalLinhas: records.length,
            totalAtendimentos: detalhes.reduce((n, p) => n + p.quantidade, 0),
            valorTotalEstimado: null, valorTotalFormatado: 'Disponível após auditoria da competência',
            procedimentosDetalhados: detalhes,
            procedimentosAmostra: detalhes.slice(0, 5).map(p => '• <code>' + p.codigo + '</code> — quantidade: ' + p.quantidade),
            profissionaisDetalhados,
            profissionaisAmostra,
            totalProfissionais: profissionaisDetalhados.length,
            tamanhoBytes: file?.size || 0, tamanhoFormatado: this.formatFileSize(file?.size || 0),
            conteudo: textContent
        };
    },

    formatProfissionaisAmostra(profissionaisDetalhados) {
        if (!Array.isArray(profissionaisDetalhados) || !profissionaisDetalhados.length) return [];
        return profissionaisDetalhados.map(prof => {
            const temNome = !!(prof.nome && !prof.nome.startsWith('Profissional CNS'));
            const cboCode = prof.cbo || '';
            const cboLabel = prof.cboDesc || (cboCode ? (typeof CBO_DICTIONARY !== 'undefined' && CBO_DICTIONARY[cboCode] ? `${cboCode} - ${CBO_DICTIONARY[cboCode]}` : `CBO ${cboCode}`) : '');

            // Identificação do profissional
            let headerProfHtml = '';
            if (temNome) {
                headerProfHtml = '<strong style="color: #0f172a; font-size: 0.86rem; display: inline-flex; align-items: center; gap: 0.35rem;"><i class="fas fa-user-md" style="color: #0284c7;"></i> ' + prof.nome + '</strong> ' +
                    '<code class="bpa-prof-badge-cns" data-cns="' + prof.cns + '">CNS ' + this.mascararCns(prof.cns) + '</code>';
            } else {
                headerProfHtml = '<code class="bpa-prof-badge-cns" data-cns="' + prof.cns + '" style="background: #f1f5f9; color: #334155;">CNS ' + this.mascararCns(prof.cns) + '</code> ' +
                    '<span style="color: #dc2626; font-size: 0.74rem; font-style: italic;">(Profissional sem vínculo localizado nesta unidade)</span>';
            }

            const cboStr = cboLabel ? '<span class="bpa-prof-cbo-text"><i class="fas fa-id-badge" style="color: #94a3b8;"></i> ' + cboLabel + '</span>' : '';

            // Badge de vínculo CNES
            let badgeVinculo = '';
            if (temNome && prof.vinculadoUnidade !== false) {
                badgeVinculo = '<span style="display: inline-flex; align-items: center; gap: 3px; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 4px; padding: 1px 6px; font-size: 0.70rem; font-weight: 600; white-space: nowrap;" title="Vínculo confirmado no CNES e DATASUS"><i class="fas fa-check-circle"></i> Vínculo Confirmado no CNES</span>';
            } else if (temNome && prof.vinculadoUnidade === false) {
                badgeVinculo = '<span style="display: inline-flex; align-items: center; gap: 3px; background: #fffbeb; color: #b45309; border: 1px solid #fde68a; border-radius: 4px; padding: 1px 6px; font-size: 0.70rem; font-weight: 600; white-space: nowrap;" title="Profissional cadastrado em outro CNES do município"><i class="fas fa-exclamation-circle"></i> Vínculo em outra Unidade</span>';
            }

            let procsHtml = '';
            if (prof.procedimentos && prof.procedimentos.length > 0) {
                const badges = prof.procedimentos.slice(0, 5).map(p => 
                    '<span class="bpa-proc-pill-item" style="background: #ffffff; border: 1px solid #e2e8f0; padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; white-space: nowrap;">' +
                    '<code style="font-family: monospace; color: #334155;">' + p.codigo + '</code>: <strong style="color: #0284c7;">' + p.quantidade + '</strong>' +
                    '</span>'
                ).join(' ');
                procsHtml = '<div class="bpa-prof-procs-row"><span style="font-size: 0.70rem; color: #64748b; font-weight: 600; margin-right: 2px;">Procedimentos:</span> ' + badges + '</div>';
            }

            let equipeHtml = '';
            if (prof.membrosEquipe && prof.membrosEquipe.length > 0) {
                const nomesEquipe = prof.membrosEquipe.map(m => m.nome.split(' ')[0] + ' (' + this.mascararCns(m.cns).slice(-4) + ')').join(' • ');
                equipeHtml = '<div style="margin-top: 0.25rem; font-size: 0.72rem; color: #0369a1;"><i class="fas fa-users" style="margin-right: 3px;"></i> Médicos vinculados: ' + nomesEquipe + '</div>';
            }

            return '<div class="bpa-prof-card">' +
                '<div class="bpa-prof-card-top">' +
                    '<div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">' + headerProfHtml + '</div>' +
                    '<div style="display: flex; align-items: center; gap: 0.4rem; white-space: nowrap;">' + badgeVinculo + ' <span class="bpa-prof-total-badge" title="quantidade total: ' + prof.quantidade + '"><i class="fas fa-clipboard-check" style="color: #0284c7; margin-right: 2px;"></i> ' + prof.quantidade + ' atendimentos</span></div>' +
                '</div>' +
                (cboStr ? '<div class="bpa-prof-card-meta">' + cboStr + '</div>' : '') +
                procsHtml + equipeHtml + 
                '</div>';
        });
    },

    lookupProfissional(cns, cnes = '') {
        const cleanCns = String(cns || '').replace(/\D/g, '');
        if (!cleanCns) return null;
        const cleanCnes = String(cnes || '').replace(/\D/g, '');

        const estabs = [];
        try {
            if (typeof window !== 'undefined' && window.CnesModule?.state && Array.isArray(window.CnesModule.state.estabelecimentos)) {
                estabs.push(...window.CnesModule.state.estabelecimentos);
            }
        } catch (e) {}
        if (this.cnesBaseCache && Array.isArray(this.cnesBaseCache.estabelecimentos)) {
            estabs.push(...this.cnesBaseCache.estabelecimentos);
        }
        if (typeof window !== 'undefined' && window.ArgosCnesBase && Array.isArray(window.ArgosCnesBase.estabelecimentos)) {
            estabs.push(...window.ArgosCnesBase.estabelecimentos);
        }
        if (typeof window !== 'undefined' && window.ProducaoProfissionalModule?.cnesCache && Array.isArray(window.ProducaoProfissionalModule.cnesCache.estabelecimentos)) {
            estabs.push(...window.ProducaoProfissionalModule.cnesCache.estabelecimentos);
        }

        let found = null;
        let unitFound = null;

        // 1. Tentar buscar primeiro na unidade específica (cleanCnes)
        if (cleanCnes) {
            const targetUnit = estabs.find(est => String(est.cnes || '').replace(/\D/g, '') === cleanCnes);
            if (targetUnit && Array.isArray(targetUnit.profissionais)) {
                const p = targetUnit.profissionais.find(x => String(x.cns || x.cnsMaster || '').replace(/\D/g, '') === cleanCns);
                if (p) {
                    found = p;
                    unitFound = targetUnit;
                }
            }
        }

        // 2. Se não achou na unidade específica, buscar em qualquer estabelecimento do município
        if (!found) {
            for (const est of estabs) {
                if (Array.isArray(est.profissionais)) {
                    const p = est.profissionais.find(x => String(x.cns || x.cnsMaster || '').replace(/\D/g, '') === cleanCns);
                    if (p) {
                        found = p;
                        unitFound = est;
                        break;
                    }
                }
            }
        }

        // Se encontrou no catálogo de estabelecimentos
        if (found) {
            const vinculadoUnidade = !cleanCnes || (unitFound && String(unitFound.cnes || '').replace(/\D/g, '') === cleanCnes);
            const cboCode = String(found.cbo || '').trim();
            const cboDescDict = (typeof CBO_DICTIONARY !== 'undefined' && CBO_DICTIONARY[cboCode])
                || (typeof window !== 'undefined' && window.CBO_DICTIONARY && window.CBO_DICTIONARY[cboCode])
                || '';
            const ocupacao = found.ocupacao || (cboDescDict ? `${cboCode} - ${cboDescDict}` : (cboCode ? `CBO ${cboCode}` : ''));

            // Cruzamento com a base oficial de vínculos DATASUS
            let vinculoInfo = null;
            if (typeof window !== 'undefined' && window.DATASUS_VINCULOS_BACABAL) {
                const map = window.DATASUS_VINCULOS_BACABAL;
                vinculoInfo = (cleanCnes && cboCode && map[`${cleanCnes}_${cleanCns}_${cboCode}`])
                    || (cleanCnes && map[`${cleanCnes}_${cleanCns}`])
                    || (cboCode && (map[`${cleanCns}_${cboCode}`] || map[`cns_${cleanCns}_${cboCode}`]))
                    || map[`cns_${cleanCns}`]
                    || map[cleanCns]
                    || null;
            }

            return {
                ...found,
                nome: found.nome || '',
                cns: cleanCns,
                cbo: cboCode,
                ocupacao: ocupacao,
                vinculadoUnidade: vinculadoUnidade,
                cnesUnidade: unitFound ? String(unitFound.cnes || '').replace(/\D/g, '') : cleanCnes,
                nomeUnidade: unitFound ? (unitFound.nomeFantasia || unitFound.nome || '') : '',
                vinculoOficial: vinculoInfo
            };
        }

        return null;
    },

    lookupProfissionaisByCbo(cbo, cnes = '', unidadeNome = '') {
        const cleanCbo = String(cbo || '').trim();
        const cleanCnes = String(cnes || '').replace(/\D/g, '');
        const normNome = String(unidadeNome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
        if (!cleanCbo) return [];

        const estabs = [];
        if (typeof window !== 'undefined' && window.CnesModule && window.CnesModule.state && Array.isArray(window.CnesModule.state.estabelecimentos)) {
            estabs.push(...window.CnesModule.state.estabelecimentos);
        }
        if (this.cnesBaseCache && Array.isArray(this.cnesBaseCache.estabelecimentos)) {
            estabs.push(...this.cnesBaseCache.estabelecimentos);
        }
        if (typeof window !== 'undefined' && window.ProducaoProfissionalModule && window.ProducaoProfissionalModule.cnesCache && Array.isArray(window.ProducaoProfissionalModule.cnesCache.estabelecimentos)) {
            estabs.push(...window.ProducaoProfissionalModule.cnesCache.estabelecimentos);
        }

        let matchedUnits = estabs.filter(est => {
            const estCnes = String(est.cnes || '').replace(/\D/g, '');
            if (cleanCnes && estCnes && estCnes === cleanCnes) return true;
            const estNome = String(est.nomeFantasia || est.nome || est.razaoSocial || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
            if (normNome && estNome && (estNome === normNome || estNome.includes(normNome) || normNome.includes(estNome))) return true;
            return false;
        });

        if (matchedUnits.length === 0) matchedUnits = estabs;

        const profsFound = [];
        for (const est of matchedUnits) {
            if (Array.isArray(est.profissionais)) {
                for (const p of est.profissionais) {
                    if (String(p.cbo || '').trim() === cleanCbo) {
                        if (!profsFound.some(f => (f.cns || f.nome) === (p.cns || p.nome))) {
                            profsFound.push(p);
                        }
                    }
                }
            }
        }
        return profsFound;
    },

    async enrichProfissionaisNames(parsed) {
        if (!parsed || !parsed.profissionaisDetalhados || !parsed.profissionaisDetalhados.length) return;
        const hasMissing = parsed.profissionaisDetalhados.some(p => !p.nome || p.nome.startsWith('Profissional CNS'));
        if (!hasMissing) return;

        try {
            await this.loadCnesBase();
            let updated = false;
            for (const prof of parsed.profissionaisDetalhados) {
                if (!prof.nome || prof.nome.startsWith('Profissional CNS')) {
                    const info = this.lookupProfissional(prof.cnsReal || prof.cns, parsed.cnes);
                    if (info && info.nome) {
                        prof.nome = info.nome;
                        prof.cboDesc = info.ocupacao || prof.cboDesc;
                        prof.vinculadoUnidade = info.vinculadoUnidade;
                        prof.vinculoOficial = info.vinculoOficial;
                        updated = true;
                    }
                }
            }
            if (updated) {
                parsed.profissionaisAmostra = this.formatProfissionaisAmostra(parsed.profissionaisDetalhados);
                const elProfs = document.getElementById('bpaProfissionaisAmostra');
                if (elProfs && (this.filePendingUpload === parsed || !this.filePendingUpload)) {
                    elProfs.style.display = 'block';
                    elProfs.innerHTML = '<div class="bpa-section-divider-title"><span><i class="fas fa-user-md" style="color: #0284c7;"></i> Profissionais Identificados (' + parsed.profissionaisDetalhados.length + ')</span><span style="font-weight: 500; color: #10b981; font-size: 0.72rem;"><i class="fas fa-shield-alt"></i> Cruzamento CNES Ativo</span></div>' + parsed.profissionaisAmostra.slice(0, 8).join('');
                }
            }
        } catch (e) {
            console.warn('Erro ao enriquecer nomes no preview BPA:', e);
        }
    },

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 K';
        if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'M';
        return (bytes / 1024).toFixed(0) + 'K';
    },

    formatCompetenciaLabel(comp) {
        if (!comp) return '-';
        const parts = comp.split('/');
        if (parts.length === 2) {
            const m = parts[0];
            const a = parts[1];
            const nomeMes = this.mesesExtenso[m] || m;
            return `${nomeMes}/${a}`;
        }
        return comp;
    },

    /* =========================================================
       CARREGAMENTO E PERSISTÊNCIA (SUPABASE + FALLBACK LOCAL)
       ========================================================= */
    isMissingProducoesTable(error) {
        return error && ['PGRST205', '42P01'].includes(error.code)
            && String(error.message || '').includes('producoes_bpa');
    },

    readLocalProducoes() {
        const originalText = localStorage.getItem(this.localProducoesKey);
        const original = JSON.parse(originalText || '[]');
        const scoped = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
        if (!Array.isArray(original) || !Array.isArray(scoped)) throw new Error('Armazenamento local inválido. Os dados originais foram preservados.');
        // A base antiga continua sendo a fonte local. Cache de nuvem não é um envio local.
        const records = new Map(original.map(p => [p.id, { ...p, _localOnly: true }]));
        if (originalText === null) {
            for (const p of scoped) if (p._localOnly && !records.has(p.id)) records.set(p.id, p);
        }
        return [...records.values()];
    },

    persistLocalProducao(record, remove = false) {
        const all = this.readLocalProducoes();
        const updated = all.filter(p => p.id !== record.id);
        if (!remove) updated.unshift({ ...record, _localOnly: true });
        // Preserva produções de outras unidades/contas ao salvar um único registro.
        localStorage.setItem(this.localProducoesKey, JSON.stringify(updated));
    },

    async loadProducoes() {
        const loadId = this.loadId = (this.loadId || 0) + 1;
        const username = this.getCurrentUser().username;
        this.renderLoadingState(true);
        let loaded = [];

        this.accessLoadError = '';
        this.persistenceMode = 'cloud';
        this.producoes = [];
        this.pendingEmailProducao = null;
        this.filePendingUpload = null;
        this.currentResponsavelFiltro = '';
        try {
            const connected = window.SupabaseConfig && window.SupabaseConfig.isConnected();
            if (connected) {
                const client = window.SupabaseConfig.getClient();
                if (!client) throw new Error('Não foi possível conectar para consultar suas unidades.');
                const config = await client.from('configuracoes').select('chave,valor').in('chave', ['bpa_responsaveis', 'bpa_modalidades']);
                if (config.error) throw config.error;
                for (const row of config.data || []) {
                    const value = typeof row.valor === 'string' ? JSON.parse(row.valor) : row.valor;
                    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuração de unidades inválida.');
                    localStorage.setItem(row.chave === 'bpa_responsaveis' ? this.responsaveisKey : this.modalidadesKey, JSON.stringify(value));
                }
                const unidades = this.getUnidadesSistema();
                let results = [];
                if (this.isAdminOrFrancileide()) {
                    results = [await client.from('producoes_bpa').select('*').order('criado_em', { ascending: false })];
                } else if (unidades.length) {
                    const cnes = unidades.map(u => u.cnes).filter(Boolean);
                    const nomes = unidades.map(u => u.nome);
                    results = await Promise.all([
                        client.from('producoes_bpa').select('*').in('cnes', cnes),
                        client.from('producoes_bpa').select('*').in('estabelecimento_nome', nomes).is('cnes', null),
                        client.from('producoes_bpa').select('*').in('estabelecimento_nome', nomes).eq('cnes', '')
                    ]);
                }
                const failure = results.find(r => r.error);
                if (failure && !this.isMissingProducoesTable(failure.error)) throw failure.error;
                if (failure) this.persistenceMode = 'local';
                const cloud = failure ? [] : results.flatMap(r => r.data || []);
                const local = this.readLocalProducoes();
                loaded = [...new Map([...local, ...cloud].map(p => [p.id, p])).values()];
            } else {
                this.persistenceMode = 'local';
                loaded = this.readLocalProducoes();
            }
            if (loadId !== this.loadId || username !== this.getCurrentUser().username) return;
            if (!Array.isArray(loaded)) throw new Error('Lista de produções inválida.');
            loaded = loaded.filter(p => this.canAccessProducao(p)).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
            localStorage.setItem(this.storageKey, JSON.stringify(loaded));
        } catch (error) {
            if (loadId !== this.loadId || username !== this.getCurrentUser().username) return;
            this.accessLoadError = 'Não foi possível carregar suas unidades e produções. Recarregue para tentar novamente.';
            loaded = [];
            console.error('Falha ao carregar BPA:', error.message);
        }

        // HIGIENIZAÇÃO AUTOMÁTICA: Tomografia é exame realizado pelo Hospital Maria Socorro Brandão, não estabelecimento isolado
        let wasSanitized = false;
        loaded = loaded.map(p => {
            if (p.estabelecimento_nome === 'TOMOGRAFIA' || p.estabelecimento_nome === 'TOMO') {
                wasSanitized = true;
                return {
                    ...p,
                    estabelecimento_nome: 'HOSPITAL MARIA SOCORRO BRANDÃO',
                    cnes: '2387412',
                    tipo_exame: 'Tomografia Computadorizada',
                    observacoes: (p.observacoes && !p.observacoes.includes('Tomografia') && !p.observacoes.includes('tomografia'))
                        ? `Exames de Tomografia: ${p.observacoes}`
                        : (p.observacoes || 'Produção de exames de tomografia computadorizada — Hospital Maria Socorro Brandão.')
                };
            }
            return p;
        });

        if (wasSanitized) {
            localStorage.setItem(this.storageKey, JSON.stringify(loaded));
        }

        // Limpeza de chaves antigas de TOMOGRAFIA salvas no localStorage do usuário
        try {
            const respStr = localStorage.getItem(this.responsaveisKey);
            if (respStr) {
                const respObj = JSON.parse(respStr);
                if (respObj['TOMOGRAFIA']) {
                    delete respObj['TOMOGRAFIA'];
                    localStorage.setItem(this.responsaveisKey, JSON.stringify(respObj));
                }
            }
            const modalStr = localStorage.getItem(this.modalidadesKey);
            if (modalStr) {
                const modalObj = JSON.parse(modalStr);
                if (modalObj['TOMOGRAFIA']) {
                    delete modalObj['TOMOGRAFIA'];
                    localStorage.setItem(this.modalidadesKey, JSON.stringify(modalObj));
                }
            }
        } catch(e){}

        this.producoes = loaded;
        this.loadedUsername = username;
        this.renderLoadingState(false);
        this.populateCompetenciaFilter();
        this.populateDatalistUnidades();
        this.populateResponsaveisFilter();
        this.renderAll();
    },

    getMockInitialData() {
        return [
            {
                id: 'bpa-mock-1',
                nome_arquivo: 'PATOMO7-.JUL',
                estabelecimento_nome: 'HOSPITAL MARIA SOCORRO BRANDÃO',
                cnes: '2387412',
                competencia: '07/2026',
                tipo_bpa: 'BPA-C',
                tipo_exame: 'Tomografia Computadorizada',
                tamanho_bytes: 124800,
                tamanho_formatado: '124K',
                conteudo_arquivo: '01#BPA#2026070001200000042387412HOSPITAL MARIA DO SOCORRO BRANDAO 02.00\r\n03238741220260722512502040101780001',
                digitador_username: 'ewerton',
                digitador_nome: 'Ewerton',
                observacoes: 'Produção de exames de tomografia do mês de Julho/2026 — Hospital Maria Socorro Brandão.',
                status: 'ENVIADO',
                criado_em: new Date('2026-08-05T14:32:00Z').toISOString()
            },
            {
                id: 'bpa-mock-2',
                nome_arquivo: 'PAHMSO07-.JUL',
                estabelecimento_nome: 'HOSPITAL MARIA SOCORRO BRANDÃO',
                cnes: '2387412',
                competencia: '07/2026',
                tipo_bpa: 'BPA-C',
                tamanho_bytes: 489200,
                tamanho_formatado: '489K',
                conteudo_arquivo: '01#BPA#2026070004800000122387412HOSPITAL MARIA DO SOCORRO BRANDAO 02.00\r\n03238741220260722512503010100720005',
                digitador_username: 'flavia',
                digitador_nome: 'Flávia',
                observacoes: 'Arquivo de faturamento ambulatorial consolidado HMSO Julho/2026.',
                status: 'ENVIADO',
                criado_em: new Date('2026-08-06T10:15:00Z').toISOString()
            },
            {
                id: 'bpa-mock-4',
                nome_arquivo: 'IBHMSO07-.JUL',
                estabelecimento_nome: 'HOSPITAL MARIA SOCORRO BRANDÃO',
                cnes: '2387412',
                competencia: '07/2026',
                tipo_bpa: 'BPA-I',
                tamanho_bytes: 285400,
                tamanho_formatado: '285K',
                conteudo_arquivo: '01#BPA#2026070002800000082387412HOSPITAL MARIA DO SOCORRO BRANDAO 02.00\r\n03238741220260722512502040101780001',
                digitador_username: 'flavia',
                digitador_nome: 'Flávia',
                observacoes: 'Produção BPA-I Individualizada HMSO Julho/2026 com atendimentos especializados.',
                status: 'ENVIADO',
                criado_em: new Date('2026-08-06T14:30:00Z').toISOString()
            },
            {
                id: 'bpa-mock-3',
                nome_arquivo: 'PAHMI07-.JUL',
                estabelecimento_nome: 'HOSPITAL MATERNO INFANTIL',
                cnes: '2387439',
                competencia: '07/2026',
                tipo_bpa: 'BPA-C',
                tamanho_bytes: 312000,
                tamanho_formatado: '312K',
                conteudo_arquivo: '01#BPA#2026070003100000082387439HOSPITAL MATERNO INFANTIL         02.00\r\n03238743920260722512503010100720002',
                digitador_username: 'jessica',
                digitador_nome: 'Jéssica',
                observacoes: 'Produção Materno Infantil Julho/2026.',
                status: 'ENVIADO',
                criado_em: new Date('2026-08-07T16:45:00Z').toISOString()
            }
        ];
    },

    populateDatalistUnidades() {
        const datalist = document.getElementById('datalistUnidadesBpa');
        if (!datalist) return;

        const unidades = this.getUnidadesSistema();
        let html = '';
        unidades.forEach(u => {
            html += `<option value="${u.nome}">${u.nome} (CNES: ${u.cnes || 'N/D'})</option>`;
        });
        datalist.innerHTML = html;
    },

    async saveProducao(producaoData) {
        this.assertUploadAccess(producaoData);
        const currentUser = this.getCurrentUser();
        const newRecord = {
            id: crypto.randomUUID(),
            nome_arquivo: producaoData.nomeArquivo,
            estabelecimento_nome: (producaoData.estabelecimentoNome || 'OUTRO ESTABELECIMENTO').trim().toUpperCase(),
            cnes: producaoData.cnes || '',
            competencia: producaoData.competencia,
            tipo_bpa: producaoData.tipoBpa || 'BPA-C',
            tamanho_bytes: producaoData.tamanhoBytes || 0,
            tamanho_formatado: producaoData.tamanhoFormatado || '0 K',
            conteudo_arquivo: producaoData.conteudo || '',
            digitador_username: currentUser.username,
            digitador_nome: currentUser.name || currentUser.username,
            observacoes: producaoData.observacoes || '',
            status: 'ENVIADO',
            criado_em: new Date().toISOString()
        };

        // Salvar no Supabase se disponível
        try {
            if (this.persistenceMode !== 'local' && window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                const client = window.SupabaseConfig.getClient();
                if (!client) throw new Error('Conexão indisponível.');
                if (client) {
                    const { data, error } = await client.from('producoes_bpa').insert([newRecord]).select();
                    if (error) throw error;
                    if (data && data[0]) {
                        newRecord.id = data[0].id;
                    }
                }
            }
        } catch (e) {
            throw new Error('Não foi possível salvar a produção na nuvem: ' + e.message);
        }

        if (this.persistenceMode === 'local' || !window.SupabaseConfig || !window.SupabaseConfig.isConnected()) {
            newRecord._localOnly = true;
            this.persistLocalProducao(newRecord);
        }
        // Notificar o modulo de Producao Profissional CNS
        try {
            if (window.ProducaoProfissionalModule && typeof window.ProducaoProfissionalModule.recordProducaoProfissionais === 'function') {
                window.ProducaoProfissionalModule.recordProducaoProfissionais(newRecord, producaoData);
            }
        } catch (e) {
            console.warn('Falha ao sincronizar com ProducaoProfissionalModule:', e);
        }

        // Salvar localmente
        this.producoes.unshift(newRecord);
        localStorage.setItem(this.storageKey, JSON.stringify(this.producoes));

        // Atualizar visualização
        this.populateCompetenciaFilter();
        this.populateDatalistUnidades();
        this.renderAll();
        return newRecord;
    },

    async deleteProducao(id) {
        const index = this.producoes.findIndex(p => p.id === id);
        if (index === -1) return false;

        const prod = this.producoes[index];
        if (!this.canAccessProducao(prod)) return false;
        const currentUser = this.getCurrentUser();

        // VALIDAÇÃO ESTRITA DE PERMISSÃO:
        // Apenas ADM, Francileide ou o PRÓPRIO DIGITADOR QUE ENVIOU podem excluir
        const isPrivileged = this.isAdminOrFrancileide(currentUser);
        const isOwner = (currentUser.username === prod.digitador_username);

        if (!isPrivileged && !isOwner) {
            alert(`Acesso restrito: Você só pode excluir arquivos enviados por você (${currentUser.name || currentUser.username}). Este arquivo foi enviado por ${prod.digitador_nome}.`);
            return false;
        }

        if (!confirm(`Deseja realmente remover o arquivo "${prod.nome_arquivo}" da unidade "${prod.estabelecimento_nome}"?`)) {
            return false;
        }

        // Deletar no Supabase se disponível
        try {
            if (!prod._localOnly && this.persistenceMode !== 'local' && window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                const client = window.SupabaseConfig.getClient();
                if (!client) throw new Error('Conexão indisponível.');
                if (client) {
                    const { error } = await client.from('producoes_bpa').delete().eq('id', id);
                    if (error) throw error;
                }
            }
        } catch (e) {
            alert('Não foi possível excluir a produção na nuvem. Tente novamente.');
            return false;
        }

        // Deletar apenas o registro autorizado na base local, mantendo os demais.
        if (prod._localOnly) {
            try { this.persistLocalProducao(prod, true); }
            catch (error) { alert('Não foi possível remover o arquivo local: ' + error.message); return false; }
        }
        this.producoes.splice(index, 1);
        localStorage.setItem(this.storageKey, JSON.stringify(this.producoes));

        // Notificar o modulo de Espelho de Produção para expurgo em cascata
        try {
            if (typeof window !== 'undefined' && window.ProducaoProfissionalModule && typeof window.ProducaoProfissionalModule.removeProducao === 'function') {
                window.ProducaoProfissionalModule.removeProducao(id);
            }
        } catch (e) {
            console.warn('Falha ao sincronizar exclusão com ProducaoProfissionalModule:', e);
        }

        this.renderAll();
        this.showToast('Produção removida com sucesso.', 'info');
        return true;
    },

    /* =========================================================
       DOWNLOAD DE ARQUIVOS
       ========================================================= */
    downloadFile(id) {
        const prod = this.getAccessibleProducoes().find(p => p.id === id);
        if (!prod) {
            alert('Arquivo não localizado.');
            return;
        }

        const content = prod.conteudo_arquivo || '';
        const blob = new Blob([content], { type: 'text/plain;charset=iso-8859-1' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = prod.nome_arquivo || 'PRODUCAO.BPA';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast(`Download de "${prod.nome_arquivo}" iniciado!`, 'success');
    },

    downloadBatchCompetencia() {
        const comp = this.currentCompetenciaFiltro || this.getLatestCompetencia();
        const filtradas = this.getAccessibleProducoes().filter(p => !comp || p.competencia === comp);

        if (filtradas.length === 0) {
            alert(`Nenhum arquivo encontrado para a competência ${comp || 'selecionada'}.`);
            return;
        }

        this.showToast(`Iniciando download de ${filtradas.length} arquivo(s) da competência ${comp}...`, 'info');
        filtradas.forEach((prod, index) => {
            setTimeout(() => {
                this.downloadFile(prod.id);
            }, index * 350);
        });
    },

    /* =========================================================
       DISPARO DE E-MAIL OFICIAL PARA AUDITORIA (auditoriabacabal@gmail.com)
       ========================================================= */
    canSendEmail(prod, currentUser) {
        if (!currentUser) currentUser = this.getCurrentUser();
        return this.canAccessProducao(prod);
    },

    buildEmailPayload(prod) {
        const compLabel = this.formatCompetenciaLabel(prod.competencia);
        const tipoSigla = prod.tipo_bpa || 'BPA-C';
        const tipoNome = (tipoSigla === 'BPA-I') ? 'BPA Individualizado (BPA-I)' : 'BPA Consolidado (BPA-C)';
        const assunto = `[PRODUÇÃO BPA - ${prod.competencia}] ${prod.estabelecimento_nome} - ${tipoSigla}`;

        const corpoTexto = `Prezada Equipe de Auditoria / Francileide,\n\n` +
            `Informamos que a produção ambulatorial referente à competência ${prod.competencia} foi finalizada e validada no sistema ARGOS:\n\n` +
            `• Unidade de Saúde: ${prod.estabelecimento_nome}\n` +
            `• CNES: ${prod.cnes || 'N/D'}\n` +
            `• Competência: ${compLabel} (${prod.competencia})\n` +
            `• Tipo de Produção: ${tipoNome}\n` +
            `• Arquivo Anexo: ${prod.nome_arquivo} (${prod.tamanho_formatado})\n` +
            `• Responsável pelo Envio: ${prod.digitador_nome} (@${prod.digitador_username})\n` +
            `• Data de Registro: ${this.formatTimestamp(prod.criado_em)}\n` +
            (prod.observacoes ? `• Observações: ${prod.observacoes}\n` : '') +
            `\nO arquivo oficial correspondente (${prod.nome_arquivo}) encontra-se em anexo nesta mensagem para conferência, validação no BPA Magnético e arquivamento oficial da SMS Bacabal.\n\n` +
            `Atenciosamente,\n` +
            `${prod.digitador_nome}\n` +
            `Setor de Faturamento / ARGOS - Bacabal-MA`;

        const corpoHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #0284c7, #0369a1); padding: 1.3rem; color: #ffffff;">
                    <h2 style="margin: 0; font-size: 1.25rem;">ARGOS — Notificação Oficial de Produção BPA</h2>
                    <p style="margin: 0.35rem 0 0 0; opacity: 0.92; font-size: 0.85rem;">Secretaria Municipal de Saúde de Bacabal / Setor de Auditoria</p>
                </div>
                <div style="background: #f8fafc; padding: 1.5rem;">
                    <p style="margin-top: 0; font-size: 0.95rem;">Prezada Equipe de Auditoria / Francileide,</p>
                    <p style="font-size: 0.92rem; color: #334155;">Informamos que a produção ambulatorial abaixo foi homologada e anexada no sistema ARGOS:</p>
                    <table style="width: 100%; border-collapse: collapse; margin: 1.1rem 0; font-size: 0.9rem; background: #ffffff; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #475569; width: 40%;">Unidade de Saúde:</td>
                            <td style="padding: 0.6rem 0.8rem; font-weight: 700; color: #0f172a;">${prod.estabelecimento_nome}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #475569;">CNES:</td>
                            <td style="padding: 0.6rem 0.8rem; font-family: monospace;">${prod.cnes || 'N/D'}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #475569;">Competência:</td>
                            <td style="padding: 0.6rem 0.8rem; font-weight: 600;">${compLabel} (${prod.competencia})</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #475569;">Modalidade:</td>
                            <td style="padding: 0.6rem 0.8rem; font-weight: 700; color: #0284c7;">${tipoNome}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #475569;">Arquivo em Anexo:</td>
                            <td style="padding: 0.6rem 0.8rem; font-family: monospace; font-weight: 700; color: #0369a1;">📎 ${prod.nome_arquivo} (${prod.tamanho_formatado})</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #475569;">Digitador Responsável:</td>
                            <td style="padding: 0.6rem 0.8rem;">${prod.digitador_nome} (@${prod.digitador_username})</td>
                        </tr>
                        <tr>
                            <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #475569;">Data do Registro:</td>
                            <td style="padding: 0.6rem 0.8rem;">${this.formatTimestamp(prod.criado_em)}</td>
                        </tr>
                    </table>
                    ${prod.observacoes ? `<div style="background: #ffffff; border-left: 4px solid #0284c7; padding: 0.75rem 1rem; margin: 1rem 0; font-size: 0.86rem; border-radius: 4px;"><strong>Observações:</strong> ${prod.observacoes}</div>` : ''}
                    <div style="background: #eff6ff; border: 1px dashed #93c5fd; border-radius: 6px; padding: 0.85rem 1rem; margin-top: 1rem; font-size: 0.86rem; color: #0369a1;">
                        📎 <strong>Anexo Oficial:</strong> O arquivo original <code>${prod.nome_arquivo}</code> encontra-se anexado a este e-mail para processamento no BPA Magnético e arquivo oficial.
                    </div>
                </div>
            </div>
        `;

        return {
            producaoId: prod.id,
            destinatario: 'auditoriabacabal@gmail.com',
            assunto,
            corpoTexto,
            corpoHtml,
            nomeArquivo: prod.nome_arquivo || 'PRODUCAO.BPA',
            digitadorNome: prod.digitador_nome
        };
    },

    openEmailModal(producaoId) {
        const prod = this.getAccessibleProducoes().find(p => p.id === producaoId);
        if (!prod) {
            alert('Arquivo de produção não localizado.');
            return;
        }

        this.pendingEmailProducao = prod;
        const emailData = this.buildEmailPayload(prod);

        const modal = document.getElementById('modalPreviewEmailBpa');
        if (!modal) return;

        // Limpar alertas anteriores
        const alertBox = document.getElementById('alertEmailFeedbackBpa');
        if (alertBox) {
            alertBox.classList.add('hidden');
            alertBox.innerHTML = '';
        }

        // Fechar gaveta de config
        const drawer = document.getElementById('emailBpaConfigDrawer');
        if (drawer) drawer.classList.add('hidden');

        // Preencher dados na tela
        const inputDest = document.getElementById('emailBpaDestinatario');
        if (inputDest) {
            inputDest.value = emailData.destinatario;
        }
        const inputCc = document.getElementById('emailBpaCc');
        if (inputCc) inputCc.value = '';

        document.getElementById('emailBpaAssunto').value = emailData.assunto;
        document.getElementById('emailBpaNomeArquivo').textContent = emailData.nomeArquivo;
        document.getElementById('emailBpaTamanhoArquivo').textContent = prod.tamanho_formatado;
        document.getElementById('emailBpaCorpoPreview').textContent = emailData.corpoTexto;
        document.getElementById('emailBpaAutorNome').textContent = `${prod.digitador_nome} (@${prod.digitador_username})`;

        // Botão de download direto do anexo no card
        const btnBaixarAnexo = document.getElementById('btnBaixarAnexoModal');
        if (btnBaixarAnexo) {
            btnBaixarAnexo.onclick = () => this.downloadFile(prod.id);
        }

        modal.classList.remove('hidden');

        // Verificar status das credenciais do servidor em segundo plano
        this.checkServerEmailStatus();
    },

    closeEmailModal() {
        const modal = document.getElementById('modalPreviewEmailBpa');
        if (modal) modal.classList.add('hidden');
        this.pendingEmailProducao = null;
    },

    async checkServerEmailStatus() {
        const badge = document.getElementById('emailStatusBadgeConfig');
        if (!badge) return;
        try {
            const res = await fetch('/api/bpa/email-config');
            if (res.ok) {
                const cfg = await res.json();
                if (cfg.has_smtp_configured) {
                    badge.style.background = '#dcfce7';
                    badge.style.color = '#15803d';
                    badge.innerHTML = `<i class="fas fa-check-circle"></i> SMTP Configurado (${cfg.smtp_user || cfg.smtp_host})`;
                } else if (cfg.has_resend_configured) {
                    badge.style.background = '#dcfce7';
                    badge.style.color = '#15803d';
                    badge.innerHTML = `<i class="fas fa-check-circle"></i> Resend API Ativa`;
                } else {
                    badge.style.background = '#fef3c7';
                    badge.style.color = '#92400e';
                    badge.innerHTML = `<i class="fas fa-info-circle"></i> Servidor Sem Credenciais`;
                }
            } else {
                badge.style.background = '#f1f5f9';
                badge.style.color = '#64748b';
                badge.textContent = 'Servidor local';
            }
        } catch(e) {
            badge.style.background = '#f1f5f9';
            badge.style.color = '#64748b';
            badge.textContent = 'Servidor local';
        }
    },

    generateEmlBlob(prod, emailData) {
        const boundary = '----=_Part_ARGOS_' + Date.now().toString(16) + Math.random().toString(16).substring(2);
        const destInput = document.getElementById('emailBpaDestinatario');
        const destinatario = (destInput && destInput.value.trim()) || emailData.destinatario;
        const ccInput = document.getElementById('emailBpaCc');
        const copia = (ccInput && ccInput.value.trim()) || '';
        const assuntoInput = document.getElementById('emailBpaAssunto');
        const assunto = (assuntoInput && assuntoInput.value.trim()) || emailData.assunto;

        // Base64 do anexo
        let base64Content = '';
        try {
            base64Content = btoa(unescape(encodeURIComponent(prod.conteudo_arquivo || '')));
        } catch(e) {
            base64Content = btoa(prod.conteudo_arquivo || '');
        }
        const b64Lines = base64Content.match(/.{1,76}/g) || [base64Content];

        let eml = '';
        eml += `From: "ARGOS Produções BPA" <noreply@argos.saude.gov.br>\r\n`;
        eml += `To: ${destinatario}\r\n`;
        if (copia) eml += `Cc: ${copia}\r\n`;
        try {
            eml += `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(assunto)))}?=\r\n`;
        } catch(e) {
            eml += `Subject: ${assunto}\r\n`;
        }
        eml += `Date: ${new Date().toUTCString()}\r\n`;
        eml += `MIME-Version: 1.0\r\n`;
        eml += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

        // Parte 1: Corpo da mensagem HTML
        eml += `--${boundary}\r\n`;
        eml += `Content-Type: text/html; charset=UTF-8\r\n`;
        eml += `Content-Transfer-Encoding: 8bit\r\n\r\n`;
        eml += `${emailData.corpoHtml}\r\n\r\n`;

        // Parte 2: Anexo oficial do arquivo BPA
        const filename = prod.nome_arquivo || 'PRODUCAO.BPA';
        eml += `--${boundary}\r\n`;
        eml += `Content-Type: application/octet-stream; name="${filename}"\r\n`;
        eml += `Content-Disposition: attachment; filename="${filename}"\r\n`;
        eml += `Content-Transfer-Encoding: base64\r\n\r\n`;
        eml += b64Lines.join('\r\n') + '\r\n\r\n';

        eml += `--${boundary}--\r\n`;

        return new Blob([eml], { type: 'message/rfc822' });
    },

    downloadEmlFile() {
        if (!this.canAccessProducao(this.pendingEmailProducao)) return;
        const prod = this.pendingEmailProducao;
        const emailData = this.buildEmailPayload(prod);

        const emlBlob = this.generateEmlBlob(prod, emailData);
        const url = URL.createObjectURL(emlBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EMAIL_PRODUCAO_${prod.nome_arquivo || 'BPA'}.eml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        // Atualizar status
        const dest = (document.getElementById('emailBpaDestinatario') && document.getElementById('emailBpaDestinatario').value.trim()) || 'auditoriabacabal@gmail.com';
        prod.email_enviado_em = new Date().toISOString();
        prod.email_destinatario = dest;
        prod.email_status = 'EML_GERADO';
        localStorage.setItem(this.storageKey, JSON.stringify(this.producoes));

        if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
            try {
                const client = window.SupabaseConfig.getClient();
                if (client) {
                    client.from('producoes_bpa').update({
                        email_enviado_em: prod.email_enviado_em,
                        email_destinatario: prod.email_destinatario,
                        email_status: 'EML_GERADO'
                    }).eq('id', prod.id);
                }
            } catch(e){}
        }

        const alertBox = document.getElementById('alertEmailFeedbackBpa');
        if (alertBox) {
            alertBox.classList.remove('hidden');
            alertBox.style.background = '#eff6ff';
            alertBox.style.border = '1px solid #bfdbfe';
            alertBox.style.color = '#1e40af';
            alertBox.innerHTML = `
                <div style="font-weight: 700; margin-bottom: 0.2rem;"><i class="fas fa-check-circle" style="color: #2563eb;"></i> Arquivo .eml com Anexo Gerado com Sucesso!</div>
                <div>O arquivo <strong>EMAIL_PRODUCAO_${prod.nome_arquivo}.eml</strong> foi baixado e já contém o anexo <strong>${prod.nome_arquivo}</strong> embutido. Ao abrir no Outlook, Windows Mail ou Thunderbird, o anexo já estará anexado automaticamente!</div>
            `;
        }

        this.renderAll();
        this.showToast(`E-mail com anexo embutido (.eml) gerado para ${dest}!`, 'success');
    },

    openGmailWeb() {
        if (!this.canAccessProducao(this.pendingEmailProducao)) return;
        const prod = this.pendingEmailProducao;
        const emailData = this.buildEmailPayload(prod);

        // 1. Baixar arquivo imediatamente para a pasta Downloads
        this.downloadFile(prod.id);

        const dest = (document.getElementById('emailBpaDestinatario') && document.getElementById('emailBpaDestinatario').value.trim()) || 'auditoriabacabal@gmail.com';
        const cc = (document.getElementById('emailBpaCc') && document.getElementById('emailBpaCc').value.trim()) || '';
        const assunto = (document.getElementById('emailBpaAssunto') && document.getElementById('emailBpaAssunto').value.trim()) || emailData.assunto;

        // Adicionar instrução amigável no corpo do texto para o usuário não esquecer de anexar no Gmail
        const corpoGmail = `[ARQUIVO DE PRODUÇÃO: ${prod.nome_arquivo}]\n(O arquivo foi baixado na pasta Downloads. Anexe-o nesta mensagem clicando no clipe 📎 abaixo)\n\n` + emailData.corpoTexto;

        const subjectEnc = encodeURIComponent(assunto);
        const bodyEnc = encodeURIComponent(corpoGmail);
        let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(dest)}&su=${subjectEnc}&body=${bodyEnc}`;
        if (cc) gmailUrl += `&cc=${encodeURIComponent(cc)}`;
        window.open(gmailUrl, '_blank');

        prod.email_enviado_em = new Date().toISOString();
        prod.email_destinatario = dest;
        prod.email_status = 'GMAIL_ABERTO';
        localStorage.setItem(this.storageKey, JSON.stringify(this.producoes));

        if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
            try {
                const client = window.SupabaseConfig.getClient();
                if (client) {
                    client.from('producoes_bpa').update({
                        email_enviado_em: prod.email_enviado_em,
                        email_destinatario: prod.email_destinatario,
                        email_status: 'GMAIL_ABERTO'
                    }).eq('id', prod.id);
                }
            } catch(e){}
        }

        const alertBox = document.getElementById('alertEmailFeedbackBpa');
        if (alertBox) {
            alertBox.classList.remove('hidden');
            alertBox.style.background = '#fef2f2';
            alertBox.style.border = '2px solid #f87171';
            alertBox.style.color = '#991b1b';
            alertBox.innerHTML = `
                <div style="font-weight: 700; margin-bottom: 0.35rem; font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem;">
                    <i class="fab fa-google" style="color: #dc2626;"></i> Gmail Aberto & Arquivo Baixado em Downloads!
                </div>
                <div style="font-size: 0.82rem; line-height: 1.5; color: #374151;">
                    Por segurança dos navegadores, sites externos não podem inserir arquivos diretamente dentro do Gmail Web.<br>
                    <strong>Como anexar em 2 segundos:</strong><br>
                    1. Vá na aba do Gmail que se abriu.<br>
                    2. Clique no ícone de clipe <strong>📎 Anexar arquivos</strong> (ao lado do botão Enviar).<br>
                    3. Selecione o arquivo <strong>${prod.nome_arquivo}</strong> da sua pasta <strong>Downloads</strong> (ou arraste-o direto para o Gmail).
                </div>
            `;
        }

        this.renderAll();
        this.showToast(`Gmail aberto! Arquivo "${prod.nome_arquivo}" baixado na pasta Downloads.`, 'info');
    },

    async confirmEmailSend() {
        if (!this.canAccessProducao(this.pendingEmailProducao)) return;

        const prod = this.pendingEmailProducao;
        const btn = document.getElementById('btnConfirmarEnvioEmailBpa');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transmitindo com Anexo...';
        }

        const alertBox = document.getElementById('alertEmailFeedbackBpa');
        if (alertBox) alertBox.classList.add('hidden');

        try {
            const emailData = this.buildEmailPayload(prod);
            const destinatario = (document.getElementById('emailBpaDestinatario') && document.getElementById('emailBpaDestinatario').value.trim()) || 'auditoriabacabal@gmail.com';
            const copia = (document.getElementById('emailBpaCc') && document.getElementById('emailBpaCc').value.trim()) || '';
            const assunto = (document.getElementById('emailBpaAssunto') && document.getElementById('emailBpaAssunto').value.trim()) || emailData.assunto;

            // Codificar conteúdo em Base64 para anexo real
            let base64Content = '';
            try {
                base64Content = btoa(unescape(encodeURIComponent(prod.conteudo_arquivo || '')));
            } catch(e) {
                base64Content = btoa(prod.conteudo_arquivo || '');
            }

            const payload = {
                producaoId: prod.id,
                destinatario,
                copia,
                assunto,
                corpoHtml: emailData.corpoHtml,
                corpoTexto: emailData.corpoTexto,
                nomeArquivo: prod.nome_arquivo || 'PRODUCAO.BPA',
                conteudoBase64: base64Content
            };

            // Carregar credenciais salvas no navegador para garantir envio mesmo se server.js estiver desincronizado
            let localCreds = {};
            try {
                const s = localStorage.getItem('argos_bpa_email_config_v2');
                if (s) localCreds = JSON.parse(s);
            } catch(e){}

            const drawerUser = document.getElementById('cfgEmailSmtpUser');
            const drawerPass = document.getElementById('cfgEmailSmtpPass');
            if (drawerUser && drawerUser.value.trim()) localCreds.smtp_user = drawerUser.value.trim();
            if (drawerPass && drawerPass.value.trim() && drawerPass.value !== '••••••••') localCreds.smtp_pass = drawerPass.value.trim();

            payload.emailConfig = localCreds;

            // Disparo via endpoint oficial no Servidor ARGOS (server.js)
            let sendSucceeded = false;
            let deliveryMethod = '';

            try {
                const response = await fetch('/api/bpa/enviar-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.status === 404) {
                    throw new Error('SERVIDOR_PRECISA_REINICIAR');
                }

                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        sendSucceeded = true;
                        deliveryMethod = result.method || 'servidor';
                    } else if (result.needConfig) {
                        // Servidor não possui credenciais configuradas ainda
                        if (alertBox) {
                            alertBox.classList.remove('hidden');
                            alertBox.style.background = '#fffbeb';
                            alertBox.style.border = '1px solid #fde68a';
                            alertBox.style.color = '#92400e';
                            alertBox.innerHTML = `
                                <div style="font-weight: 700; margin-bottom: 0.25rem;"><i class="fas fa-key"></i> Configuração de Envio Necessária</div>
                                <div>O servidor ARGOS precisa das credenciais de e-mail (SMTP ou Resend). Clique em <strong>Configurar Servidor</strong> abaixo ou use a opção <strong>Abrir com Anexo (.eml)</strong> para envio imediato com o arquivo já anexado.</div>
                            `;
                        }
                        const drawer = document.getElementById('emailBpaConfigDrawer');
                        if (drawer) drawer.classList.remove('hidden');
                        return;
                    } else {
                        throw new Error(result.error || 'Falha no processamento pelo servidor.');
                    }
                }
            } catch (serverErr) {
                console.warn('Servidor local não processou envio direto:', serverErr.message);

                if (serverErr.message === 'SERVIDOR_PRECISA_REINICIAR') {
                    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                    if (alertBox) {
                        alertBox.classList.remove('hidden');
                        alertBox.style.background = '#eff6ff';
                        alertBox.style.border = '2px solid #3b82f6';
                        alertBox.style.color = '#1e3a8a';
                        
                        if (isLocal) {
                            alertBox.innerHTML = `
                                <div style="font-weight: 700; margin-bottom: 0.35rem; font-size: 0.95rem;">
                                    <i class="fas fa-sync-alt" style="color: #2563eb;"></i> Atualização do Servidor Local Necessária
                                </div>
                                <div style="font-size: 0.83rem; line-height: 1.5; color: #1f2937;">
                                    O servidor local ainda está inicializando as rotas de e-mail.<br>
                                    <strong>Opção Imediata:</strong> Clique em <strong>"Abrir com Anexo (.eml)"</strong> abaixo para abrir o e-mail pronto no Outlook / Windows Mail sem esperar nada!<br>
                                    <em>Para ambiente local: reinicie o comando no seu terminal quando conveniente.</em>
                                </div>
                            `;
                        } else {
                            alertBox.innerHTML = `
                                <div style="font-weight: 700; margin-bottom: 0.35rem; font-size: 0.95rem;">
                                    <i class="fas fa-paperclip" style="color: #0284c7;"></i> Envio Alternativo Imediato Disponível
                                </div>
                                <div style="font-size: 0.83rem; line-height: 1.5; color: #1f2937;">
                                    O serviço em nuvem está finalizando a implantação.<br>
                                    Clique no botão <strong>"Abrir com Anexo (.eml)"</strong> abaixo para abrir a mensagem com o arquivo oficial já anexado no seu aplicativo de e-mail (Outlook / Windows Mail)!
                                </div>
                            `;
                        }
                    }
                    return;
                }

                // Fallback: tentar Supabase Edge Function se estiver configurada
                if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                    const client = window.SupabaseConfig.getClient();
                    if (client && client.functions) {
                        try {
                            const edgeRes = await client.functions.invoke('enviar-bpa-email', { body: payload });
                            if (edgeRes && !edgeRes.error && edgeRes.data && edgeRes.data.success) {
                                sendSucceeded = true;
                                deliveryMethod = 'supabase-edge';
                            }
                        } catch(e){}
                    }
                }
            }

            if (!sendSucceeded) {
                if (alertBox) {
                    alertBox.classList.remove('hidden');
                    alertBox.style.background = '#fef2f2';
                    alertBox.style.border = '1px solid #fecaca';
                    alertBox.style.color = '#991b1b';
                    alertBox.innerHTML = `
                        <div style="font-weight: 700; margin-bottom: 0.25rem;"><i class="fas fa-info-circle"></i> Envio Direto Não Concluído</div>
                        <div>Para enviar com 1 clique direto pelo sistema, configure o SMTP em <strong>Configurar Servidor</strong>. Como alternativa imediata, clique em <strong>Abrir com Anexo (.eml)</strong> para abrir o e-mail com o arquivo já anexado!</div>
                    `;
                }
                const drawer = document.getElementById('emailBpaConfigDrawer');
                if (drawer) drawer.classList.remove('hidden');
                return;
            }

            // Atualizar registro local e no banco
            prod.email_enviado_em = new Date().toISOString();
            prod.email_destinatario = destinatario;
            prod.email_status = 'ENVIADO';

            if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                try {
                    const client = window.SupabaseConfig.getClient();
                    if (client) {
                        await client.from('producoes_bpa').update({
                            email_enviado_em: prod.email_enviado_em,
                            email_destinatario: prod.email_destinatario,
                            email_status: 'ENVIADO'
                        }).eq('id', prod.id);
                    }
                } catch(e){}
            }

            localStorage.setItem(this.storageKey, JSON.stringify(this.producoes));
            this.closeEmailModal();
            this.renderAll();
            this.showToast(`Produção enviada com sucesso com anexo para ${destinatario}! (${deliveryMethod.toUpperCase()})`, 'success');
        } catch (err) {
            console.error('Erro ao enviar e-mail:', err);
            if (alertBox) {
                alertBox.classList.remove('hidden');
                alertBox.style.background = '#fef2f2';
                alertBox.style.border = '1px solid #fecaca';
                alertBox.style.color = '#991b1b';
                alertBox.innerHTML = `<strong>Erro no envio:</strong> ${err.message || err}`;
            } else {
                alert('Erro ao enviar e-mail: ' + (err.message || err));
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Direto pelo Servidor';
            }
        }
    },

    toggleEmailConfigDrawer() {
        const drawer = document.getElementById('emailBpaConfigDrawer');
        if (!drawer) return;
        drawer.classList.toggle('hidden');
        if (!drawer.classList.contains('hidden')) {
            this.loadEmailConfigIntoDrawer();
        }
    },

    async loadEmailConfigIntoDrawer() {
        // 1. Carregar primeiro do localStorage (nunca perde o que o usuário digitou)
        let localCfg = null;
        try {
            const s = localStorage.getItem('argos_bpa_email_config_v2');
            if (s) localCfg = JSON.parse(s);
        } catch(e){}

        if (localCfg) {
            const user = document.getElementById('cfgEmailSmtpUser');
            if (user && localCfg.smtp_user) user.value = localCfg.smtp_user;

            const pass = document.getElementById('cfgEmailSmtpPass');
            if (pass && localCfg.smtp_pass) pass.value = localCfg.smtp_pass;

            const host = document.getElementById('cfgEmailSmtpHost');
            if (host && localCfg.smtp_host) host.value = localCfg.smtp_host;

            const port = document.getElementById('cfgEmailSmtpPort');
            if (port && localCfg.smtp_port) port.value = localCfg.smtp_port;

            const selProvider = document.getElementById('cfgEmailProvider');
            if (selProvider && localCfg.provider) selProvider.value = localCfg.provider;
        }

        // 2. Buscar do backend se disponível
        try {
            const res = await fetch('/api/bpa/email-config');
            if (res.ok) {
                const cfg = await res.json();
                const selProvider = document.getElementById('cfgEmailProvider');
                if (selProvider && !localCfg?.provider) selProvider.value = cfg.provider || 'smtp';
                
                const host = document.getElementById('cfgEmailSmtpHost');
                if (host && !localCfg?.smtp_host) host.value = cfg.smtp_host || 'smtp.gmail.com';

                const user = document.getElementById('cfgEmailSmtpUser');
                if (user && !localCfg?.smtp_user) user.value = cfg.smtp_user || '';

                const pass = document.getElementById('cfgEmailSmtpPass');
                if (pass && !localCfg?.smtp_pass) pass.value = cfg.smtp_pass || '';

                const port = document.getElementById('cfgEmailSmtpPort');
                if (port && !localCfg?.smtp_port) port.value = cfg.smtp_port || 465;

                const resendKey = document.getElementById('cfgEmailResendKey');
                if (resendKey) resendKey.value = cfg.resend_api_key || '';

                this.updateProviderView(cfg.provider || (localCfg?.provider) || 'smtp');
            }
        } catch(e) {}
    },

    updateProviderView(provider) {
        const boxHost = document.getElementById('boxCfgSmtpHost');
        const boxCred = document.getElementById('boxCfgSmtpCredentials');
        const boxResend = document.getElementById('boxCfgResendKey');

        if (provider === 'resend') {
            if (boxHost) boxHost.classList.add('hidden');
            if (boxCred) boxCred.classList.add('hidden');
            if (boxResend) boxResend.classList.remove('hidden');
        } else {
            if (boxHost) boxHost.classList.remove('hidden');
            if (boxCred) boxCred.classList.remove('hidden');
            if (boxResend) boxResend.classList.add('hidden');
        }
    },

    async saveEmailConfigFromDrawer() {
        const btn = document.getElementById('btnSalvarConfigEmail');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        }

        try {
            const provider = document.getElementById('cfgEmailProvider').value;
            const payload = {
                provider,
                smtp_host: document.getElementById('cfgEmailSmtpHost').value.trim() || 'smtp.gmail.com',
                smtp_port: parseInt(document.getElementById('cfgEmailSmtpPort').value || '465', 10),
                smtp_secure: true,
                smtp_user: document.getElementById('cfgEmailSmtpUser').value.trim(),
                smtp_pass: document.getElementById('cfgEmailSmtpPass').value.trim(),
                from_email: document.getElementById('cfgEmailSmtpUser').value.trim(),
                resend_api_key: document.getElementById('cfgEmailResendKey').value.trim()
            };

            // 1. Sempre salvar no localStorage imediatamente
            localStorage.setItem('argos_bpa_email_config_v2', JSON.stringify(payload));

            // 2. Salvar no backend
            let serverSaved = false;
            try {
                const res = await fetch('/api/bpa/email-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    serverSaved = true;
                }
            } catch(e){}

            if (serverSaved) {
                this.showToast('Credenciais salvas com sucesso no servidor!', 'success');
                this.checkServerEmailStatus();
                alert('✅ Credenciais salvas com sucesso no servidor ARGOS!');
            } else {
                this.showToast('Credenciais salvas no seu navegador!', 'success');
                const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (isLocal) {
                    alert(`✅ Credenciais salvas no seu navegador para: ${payload.smtp_user}!\n\nNo ambiente de desenvolvimento local, reinicie o "npm run dev" quando puder.`);
                } else {
                    alert(`✅ Credenciais salvas com sucesso para: ${payload.smtp_user}!`);
                }
            }
        } catch(e) {
            alert('Erro ao salvar credenciais: ' + e.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Salvar Credenciais';
            }
        }
    },

    async testEmailConnectionFromDrawer() {
        const btn = document.getElementById('btnTestarConexaoEmail');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando Conexão...';
        }

        try {
            const provider = document.getElementById('cfgEmailProvider').value;
            const dest = (document.getElementById('emailBpaDestinatario') && document.getElementById('emailBpaDestinatario').value.trim()) || 'auditoriabacabal@gmail.com';
            const payload = {
                provider,
                smtp_host: document.getElementById('cfgEmailSmtpHost').value.trim() || 'smtp.gmail.com',
                smtp_port: parseInt(document.getElementById('cfgEmailSmtpPort').value || '465', 10),
                smtp_secure: true,
                smtp_user: document.getElementById('cfgEmailSmtpUser').value.trim(),
                smtp_pass: document.getElementById('cfgEmailSmtpPass').value.trim(),
                from_email: document.getElementById('cfgEmailSmtpUser').value.trim(),
                resend_api_key: document.getElementById('cfgEmailResendKey').value.trim(),
                destinatario: dest
            };

            // Salvar no localStorage
            localStorage.setItem('argos_bpa_email_config_v2', JSON.stringify(payload));

            const res = await fetch('/api/bpa/testar-conexao-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.status === 404) {
                const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (isLocal) {
                    alert('⚠️ As rotas de e-mail ainda não estão ativas no servidor local.\n\nReinicie o comando no terminal (Ctrl+C e npm run dev) para carregar as novas rotas.');
                } else {
                    alert('⚠️ A rota de teste em nuvem está sendo inicializada no Vercel. Aguarde alguns instantes e tente novamente, ou utilize o botão "Abrir com Anexo (.eml)".');
                }
                return;
            }

            const data = await res.json();
            if (data.success) {
                alert(`✅ Conexão e teste bem sucedidos!\n${data.message}`);
                this.checkServerEmailStatus();
            } else {
                alert(`❌ Falha no teste de e-mail:\n${data.error || 'Não foi possível conectar ao servidor SMTP.'}`);
            }
        } catch(e) {
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            if (isLocal) {
                alert(`⚠️ Falha ao comunicar com o servidor: ${e.message}\n\nVerifique se o terminal local está rodando.`);
            } else {
                alert(`⚠️ Falha ao comunicar com o servidor: ${e.message}\n\nUtilize a opção "Abrir com Anexo (.eml)" para envio imediato pelo seu aplicativo de e-mail.`);
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-vial"></i> Testar Conexão';
            }
        }
    },

    /* =========================================================
       RENDERIZAÇÃO E INTERFACE
       ========================================================= */
    populateCompetenciaFilter() {
        const select = document.getElementById('selectBpaCompetencia');
        if (!select) return;

        const competenciasUnicas = [...new Set(this.getAccessibleProducoes().map(p => p.competencia))].sort().reverse();
        if (!competenciasUnicas.includes('07/2026')) {
            competenciasUnicas.unshift('07/2026');
        }

        const requested = select.value || this.currentCompetenciaFiltro;
        const currentVal = competenciasUnicas.includes(requested) ? requested : (competenciasUnicas[0] || '');
        select.innerHTML = '<option value="">Todas as Competências</option>';

        competenciasUnicas.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = `${this.formatCompetenciaLabel(c)} (${c})`;
            if (c === currentVal) opt.selected = true;
            select.appendChild(opt);
        });

        this.currentCompetenciaFiltro = select.value;
    },

    getLatestCompetencia() {
        const comps = [...new Set(this.getAccessibleProducoes().map(p => p.competencia))].sort().reverse();
        return comps[0] || '07/2026';
    },

    renderAll() {
        if (this.loadedUsername !== this.getCurrentUser().username) {
            this.loadProducoes();
            return;
        }
        const privileged = this.isAdminOrFrancileide();
        const units = this.accessLoadError ? [] : this.getUnidadesSistema();
        const scope = document.getElementById('bpaAccessScope');
        if (scope) scope.textContent = this.accessLoadError || (privileged ? 'Visão geral • Todas as unidades' : units.length ? 'Minhas unidades • ' + units.length + ' atribuída(s) a você' : 'Nenhuma unidade atribuída. Solicite o vínculo ao ADM ou à Francileide.');
        if (scope && !this.accessLoadError && this.persistenceMode === 'local') scope.textContent += ' • Arquivos salvos neste navegador';
        const upload = document.getElementById('btnNovoEnvioBpa');
        if (upload) upload.disabled = !!this.accessLoadError || (!privileged && !units.length);

        // Controle de visibilidade nos perfis de Gerentes vs Gestão (ADM/Francileide)
        const respGroup = document.getElementById('bpaGroupResponsavelFilter');
        if (respGroup) respGroup.style.display = privileged ? 'flex' : 'none';
        const respSelect = document.getElementById('selectBpaResponsavel');
        if (respSelect) respSelect.disabled = !privileged;
        const chipsWrapper = document.getElementById('bpaSmartChipsWrapper');
        if (chipsWrapper) chipsWrapper.style.display = privileged ? 'flex' : 'none';
        const chips = document.getElementById('bpaSmartChipsContainer');
        if (chips) chips.style.display = privileged ? '' : 'none';

        // Baixar Pacote da Competência oculto nos perfis de gerentes
        const btnLote = document.getElementById('btnBaixarLoteBpa');
        if (btnLote) btnLote.style.display = privileged ? 'inline-flex' : 'none';

        // Controlar visibilidade do botão de atribuição de responsáveis, cadastrar unidade e higienização
        const btnNova = document.getElementById('btnNovaUnidadeManualBpa');
        if (btnNova) {
            btnNova.style.display = privileged ? 'inline-flex' : 'none';
        }
        const btnResp = document.getElementById('btnGerenciarResponsaveisBpa');
        if (btnResp) {
            btnResp.style.display = privileged ? 'inline-flex' : 'none';
        }
        const btnHigiene = document.getElementById('btnHigienizarDadosBpa');
        if (btnHigiene) {
            btnHigiene.style.display = privileged ? 'inline-flex' : 'none';
        }

        // Rótulo dinâmico do primeiro KPI (Unidades Esperadas para ADM, Minhas Unidades para Gerente)
        const kpiTotalLabel = document.getElementById('bpaKpiTotalLabel');
        if (kpiTotalLabel) {
            kpiTotalLabel.textContent = privileged ? 'Unidades Esperadas' : 'Minhas Unidades';
        }

        // Visibilidade dos cards (checklist de unidades)
        // Para o perfil de Francileide, remove a exibição dos cards
        const isFrancileideProfile = this.isFrancileide();
        const checklistWrapper = document.getElementById('bpaChecklistWrapper');
        if (checklistWrapper) {
            checklistWrapper.style.display = isFrancileideProfile ? 'none' : 'block';
        }

        this.populateResponsaveisFilter();
        this.renderKPIs();
        this.renderActiveFiltersBar();
        if (!isFrancileideProfile) {
            this.renderChecklistFrancileide();
        }
        this.renderTable();
    },

    /* =========================================================
       FILTROS INTELIGENTES DE RESPONSÁVEIS E KPIS INTERATIVOS
       ========================================================= */
    populateResponsaveisFilter() {
        const select = document.getElementById('selectBpaResponsavel');
        const chipsContainer = document.getElementById('bpaSmartChipsContainer');

        const comp = this.currentCompetenciaFiltro || this.getLatestCompetencia();
        const unidades = this.getUnidadesSistema();
        const enviadosComp = this.getAccessibleProducoes().filter(p => !comp || p.competencia === comp);

        // Mapear estatísticas de cada responsável
        const statsByResp = {};

        unidades.forEach(u => {
            const resp = (u.responsavel && u.responsavel.trim() && u.responsavel !== 'Não atribuído') 
                ? u.responsavel.trim() 
                : 'Não atribuído';

            if (!statsByResp[resp]) {
                const initials = resp.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                statsByResp[resp] = { 
                    nome: resp, 
                    total: 0, 
                    completas: 0, 
                    parciais: 0, 
                    pendentes: 0, 
                    initials: initials || 'RP' 
                };
            }
            statsByResp[resp].total++;

            const evalRes = this.evaluateUnitDeliveries(u, enviadosComp);
            if (evalRes.isComplete) {
                statsByResp[resp].completas++;
            } else if (evalRes.isPartial) {
                statsByResp[resp].parciais++;
            } else {
                statsByResp[resp].pendentes++;
            }
        });

        // 1. Preencher Dropdown de Responsáveis
        if (select) {
            const currentVal = this.currentResponsavelFiltro;
            let optionsHtml = `<option value="">Todos os Responsáveis (${unidades.length} unidades)</option>`;
            const sortedNames = Object.keys(statsByResp).sort((a, b) => a.localeCompare(b));
            
            sortedNames.forEach(name => {
                const s = statsByResp[name];
                const isSelected = (name.toLowerCase() === currentVal.toLowerCase());
                let pendingTxt = '';
                if (s.pendentes === 0 && s.parciais === 0) {
                    pendingTxt = ' · 100% entregue';
                } else if (s.parciais > 0 && s.pendentes === 0) {
                    pendingTxt = ` · ${s.parciais} parcial`;
                } else if (s.parciais > 0) {
                    pendingTxt = ` · ${s.pendentes} pend. + ${s.parciais} parc.`;
                } else {
                    pendingTxt = ` · ${s.pendentes} pendente(s)`;
                }
                optionsHtml += `<option value="${name}" ${isSelected ? 'selected' : ''}>${name} (${s.completas}/${s.total}${pendingTxt})</option>`;
            });
            select.innerHTML = optionsHtml;
        }

        // 2. Preencher Chips Inteligentes
        if (chipsContainer) {
            const isAllActive = !this.currentResponsavelFiltro;
            let chipsHtml = `
                <div class="bpa-chip ${isAllActive ? 'active' : ''}" onclick="BpaModule.setResponsavelFilter('')" title="Visualizar unidades de todos os responsáveis">
                    <span class="bpa-chip-avatar"><i class="fas fa-layer-group"></i></span>
                    <span>Todos</span>
                    <span class="bpa-chip-badge">${unidades.length}</span>
                </div>
            `;

            const sortedNames = Object.keys(statsByResp).sort((a, b) => a.localeCompare(b));
            sortedNames.forEach(name => {
                const s = statsByResp[name];
                const isActive = (name.toLowerCase() === this.currentResponsavelFiltro.toLowerCase());
                const escapedName = name.replace(/'/g, "\\'");
                const hasAlert = (s.pendentes > 0 || s.parciais > 0);
                const pendingClass = hasAlert ? 'pending-count' : '';
                const isUnassigned = (name.toLowerCase() === 'nao atribuido' || name.toLowerCase() === 'não atribuído');
                const displayName = isUnassigned ? 'Não Atribuído' : name;
                const avatarContent = isUnassigned ? '<i class="fas fa-user-slash" style="font-size: 0.72rem;"></i>' : s.initials;
                const titleText = `${displayName}: ${s.completas} de ${s.total} completas` + 
                    (s.parciais > 0 ? `, ${s.parciais} entrega(s) parcial(is)` : '') + 
                    (s.pendentes > 0 ? `, ${s.pendentes} sem envio` : '');

                chipsHtml += `
                    <div class="bpa-chip ${isActive ? 'active' : ''}" onclick="BpaModule.setResponsavelFilter('${escapedName}')" title="${titleText}">
                        <span class="bpa-chip-avatar">${avatarContent}</span>
                        <span>${displayName}</span>
                        <span class="bpa-chip-badge ${pendingClass}">${s.completas}/${s.total}${s.parciais > 0 ? '*' : ''}</span>
                    </div>
                `;
            });
            chipsContainer.innerHTML = chipsHtml;
        }
    },

    setStatusFilter(status) {
        if (this.currentStatusFilter === status) {
            this.currentStatusFilter = '';
        } else {
            this.currentStatusFilter = status;
        }
        this.renderAll();
    },

    setResponsavelFilter(responsavel) {
        if (this.currentResponsavelFiltro === responsavel) {
            this.currentResponsavelFiltro = '';
        } else {
            this.currentResponsavelFiltro = responsavel || '';
        }
        const select = document.getElementById('selectBpaResponsavel');
        if (select) select.value = this.currentResponsavelFiltro;
        this.renderAll();
    },

    setTipoFilter(tipo) {
        this.currentTipoFiltro = tipo || '';
        const select = document.getElementById('selectBpaTipoFiltro');
        if (select) select.value = this.currentTipoFiltro;
        this.renderAll();
    },

    async setUnitModalidade(nome, cnes, novaModalidade) {
        if (!this.isAdminOrFrancileide() || (!nome && !cnes)) return;

        const map = this.getModalidadesMap();
        if (nome) map[nome] = novaModalidade;
        if (cnes) map[cnes] = novaModalidade;

        // Sincronizar com Supabase se conectado
        try {
            if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                const client = window.SupabaseConfig.getClient();
                if (!client) throw new Error('Conexão indisponível.');
                if (client) {
                    const { error } = await client.from('configuracoes').upsert({
                        chave: 'bpa_modalidades',
                        valor: map,
                        atualizado_em: new Date().toISOString()
                    }, { onConflict: 'chave' });
                    if (error) throw error;
                }
            }
        } catch(e) {
            alert('Não foi possível salvar a modalidade. Tente novamente.');
            this.renderAll();
            return;
        }
        localStorage.setItem(this.modalidadesKey, JSON.stringify(map));

        const labelMap = {
            'AMBOS': 'Ambas (BPA-C + BPA-I)',
            'BPA-C': 'Apenas Produção Consolidada (BPA-C)',
            'BPA-I': 'Apenas Produção Individual (BPA-I)'
        };
        this.showToast(`"${nome}": exigência alterada para ${labelMap[novaModalidade] || novaModalidade}`, 'success');
        this.renderAll();
    },

    clearAllFilters() {
        this.currentStatusFilter = '';
        this.currentResponsavelFiltro = '';
        this.currentTipoFiltro = '';
        this.currentSearchTerm = '';
        const searchInput = document.getElementById('searchBpaInput');
        if (searchInput) searchInput.value = '';
        const selectResp = document.getElementById('selectBpaResponsavel');
        if (selectResp) selectResp.value = '';
        const selectTipo = document.getElementById('selectBpaTipoFiltro');
        if (selectTipo) selectTipo.value = '';
        this.renderAll();
    },

    clearSearchFilter() {
        this.currentSearchTerm = '';
        const searchInput = document.getElementById('searchBpaInput');
        if (searchInput) searchInput.value = '';
        this.renderAll();
    },

    renderActiveFiltersBar() {
        const bar = document.getElementById('bpaActiveFilterBar');
        const badges = document.getElementById('bpaActiveFilterBadges');
        if (!bar || !badges) return;

        let hasFilter = false;
        let badgesHtml = '';

        if (this.currentStatusFilter === 'delivered') {
            hasFilter = true;
            badgesHtml += `
                <span class="bpa-active-pill" style="border-color: #86efac; color: #166534;">
                    <i class="fas fa-check-circle"></i> Status: <strong>Enviadas</strong>
                    <button onclick="BpaModule.setStatusFilter('')" title="Remover filtro"><i class="fas fa-times"></i></button>
                </span>
            `;
        } else if (this.currentStatusFilter === 'pending') {
            hasFilter = true;
            badgesHtml += `
                <span class="bpa-active-pill" style="border-color: #fde68a; color: #92400e;">
                    <i class="fas fa-hourglass-half"></i> Status: <strong>Faltam Enviar</strong>
                    <button onclick="BpaModule.setStatusFilter('')" title="Remover filtro"><i class="fas fa-times"></i></button>
                </span>
            `;
        }

        if (this.currentTipoFiltro) {
            hasFilter = true;
            let tipoLabel = this.currentTipoFiltro;
            if (this.currentTipoFiltro === 'AMBOS') tipoLabel = 'Produção Dupla (BPA-C + BPA-I)';
            else if (this.currentTipoFiltro === 'PARTIAL') tipoLabel = 'Entrega Parcial (Falta 1)';
            else if (this.currentTipoFiltro === 'BPA-C') tipoLabel = 'Apenas BPA-C (Consolidado)';
            else if (this.currentTipoFiltro === 'BPA-I') tipoLabel = 'Apenas BPA-I (Individualizado)';

            badgesHtml += `
                <span class="bpa-active-pill" style="border-color: #c084fc; color: #7e22ce;">
                    <i class="fas fa-layer-group"></i> Modalidade: <strong>${tipoLabel}</strong>
                    <button onclick="BpaModule.setTipoFilter('')" title="Remover filtro"><i class="fas fa-times"></i></button>
                </span>
            `;
        }

        if (this.currentResponsavelFiltro) {
            hasFilter = true;
            badgesHtml += `
                <span class="bpa-active-pill" style="border-color: #7dd3fc; color: #0369a1;">
                    <i class="fas fa-user-circle"></i> Responsável: <strong>${this.currentResponsavelFiltro}</strong>
                    <button onclick="BpaModule.setResponsavelFilter('')" title="Remover filtro"><i class="fas fa-times"></i></button>
                </span>
            `;
        }

        if (this.currentSearchTerm) {
            hasFilter = true;
            badgesHtml += `
                <span class="bpa-active-pill">
                    <i class="fas fa-search"></i> Busca: "<strong>${this.currentSearchTerm}</strong>"
                    <button onclick="BpaModule.clearSearchFilter()" title="Remover filtro"><i class="fas fa-times"></i></button>
                </span>
            `;
        }

        if (hasFilter) {
            badges.innerHTML = badgesHtml;
            bar.style.display = 'flex';
        } else {
            bar.style.display = 'none';
        }
    },

    /* =========================================================
       AVALIAÇÃO DE ENTREGAS: MODALIDADE DUPLA (BPA-C E BPA-I)
       ========================================================= */
    evaluateUnitDeliveries(estab, enviadosComp) {
        const nomeE = (estab.nome || '').toUpperCase().trim();
        const cnesE = (estab.cnes || '').trim().replace(/\D/g, '');
        const modalidade = estab.modalidade || 'AMBOS';

        // Encontrar todos os arquivos enviados que correspondem a este estabelecimento
        const prods = enviadosComp.filter(p => this.matchesUnit(p, estab));

        const isBpaC = (p) => {
            if (p.tipo_bpa === 'AMBOS') return true;
            if (p.tipo_bpa === 'BPA-C') return true;
            if (p.tipo_bpa === 'BPA-I') return false;
            if (p.count02 > 0 && (!p.count03 || p.count03 === 0)) return true;
            const upName = (p.nome_arquivo || '').toUpperCase();
            if (upName.startsWith('PA') || upName.startsWith('PC') || upName.startsWith('BC')) return true;
            return false;
        };

        const isBpaI = (p) => {
            if (p.tipo_bpa === 'AMBOS') return true;
            if (p.tipo_bpa === 'BPA-I') return true;
            if (p.tipo_bpa === 'BPA-C') return false;
            if (p.count03 > 0) return true;
            const upName = (p.nome_arquivo || '').toUpperCase();
            if (upName.startsWith('PB') || upName.startsWith('PI') || upName.startsWith('BI')) return true;
            return false;
        };

        const prodsC = prods.filter(isBpaC);
        const prodsI = prods.filter(isBpaI);
        const prodC = prodsC[0] || null;
        const prodI = prodsI[0] || null;

        const hasC = prodsC.length > 0;
        const hasI = prodsI.length > 0;

        let expectedCount = 1;
        let deliveredCount = 0;
        let status = 'pending'; // 'delivered' | 'partial' | 'pending'
        let needsBpaC = false;
        let needsBpaI = false;

        if (modalidade === 'AMBOS') {
            expectedCount = 2;
            deliveredCount = (hasC ? 1 : 0) + (hasI ? 1 : 0);
            needsBpaC = !hasC;
            needsBpaI = !hasI;
            if (deliveredCount === 2) {
                status = 'delivered';
            } else if (deliveredCount === 1) {
                status = 'partial';
            } else {
                status = 'pending';
            }
        } else if (modalidade === 'BPA-C') {
            expectedCount = 1;
            deliveredCount = hasC ? 1 : 0;
            needsBpaC = !hasC;
            status = hasC ? 'delivered' : 'pending';
        } else if (modalidade === 'BPA-I') {
            expectedCount = 1;
            deliveredCount = hasI ? 1 : 0;
            needsBpaI = !hasI;
            status = hasI ? 'delivered' : 'pending';
        }

        return {
            estab,
            modalidade,
            prods,
            prodsC,
            prodsI,
            prodC,
            prodI,
            hasC,
            hasI,
            expectedCount,
            deliveredCount,
            status,
            isComplete: status === 'delivered',
            isPartial: status === 'partial',
            isPending: status === 'pending',
            needsBpaC,
            needsBpaI
        };
    },

    renderKPIs() {
        const comp = this.currentCompetenciaFiltro || this.getLatestCompetencia();
        let unidades = this.getUnidadesSistema();

        // Se houver filtro de responsável, os KPIs calculam a meta daquele profissional
        if (this.currentResponsavelFiltro) {
            const respTarget = this.currentResponsavelFiltro.toLowerCase().trim();
            unidades = unidades.filter(u => (u.responsavel || '').toLowerCase().trim() === respTarget);
        }

        // Se houver filtro de modalidade
        if (this.currentTipoFiltro) {
            if (this.currentTipoFiltro === 'AMBOS') {
                unidades = unidades.filter(u => (u.modalidade || 'AMBOS') === 'AMBOS');
            } else if (this.currentTipoFiltro === 'BPA-C') {
                unidades = unidades.filter(u => u.modalidade === 'BPA-C');
            } else if (this.currentTipoFiltro === 'BPA-I') {
                unidades = unidades.filter(u => u.modalidade === 'BPA-I');
            }
        }

        const totalEsperado = unidades.length;

        // Arquivos enviados na competência
        const enviadosComp = this.getAccessibleProducoes().filter(p => !comp || p.competencia === comp);
        
        let countCompletas = 0;
        let countParciais = 0;
        let countPendentes = 0;
        let totalArquivosEsperados = 0;
        let totalArquivosEntregues = 0;

        unidades.forEach(estab => {
            const evalRes = this.evaluateUnitDeliveries(estab, enviadosComp);
            totalArquivosEsperados += evalRes.expectedCount;
            totalArquivosEntregues += evalRes.deliveredCount;

            if (evalRes.isComplete) {
                countCompletas++;
            } else if (evalRes.isPartial) {
                countParciais++;
            } else {
                countPendentes++;
            }
        });

        // Contagem de arquivos específicos
        const countBpaC = enviadosComp.filter(p => p.tipo_bpa === 'BPA-C').length;
        const countBpaI = enviadosComp.filter(p => p.tipo_bpa === 'BPA-I').length;

        const totalComPendencia = countPendentes + countParciais;
        const percentual = totalArquivosEsperados > 0 ? Math.round((totalArquivosEntregues / totalArquivosEsperados) * 100) : 0;

        const elTotal = document.getElementById('bpaKpiTotal');
        const elEnviadas = document.getElementById('bpaKpiEnviadas');
        const elPendentes = document.getElementById('bpaKpiPendentes');
        const elTaxa = document.getElementById('bpaKpiTaxa');
        const elProgress = document.getElementById('bpaProgressBar');
        const elCompLabel = document.getElementById('bpaKpiCompLabel');

        if (elTotal) elTotal.textContent = totalEsperado;
        if (elEnviadas) {
            elEnviadas.innerHTML = countParciais > 0 
                ? `${countCompletas} <span style="font-size: 0.72rem; font-weight: 500; color: #f59e0b;" title="${countParciais} unidade(s) com entrega parcial (+1 arquivo faltante)">(+${countParciais} parc.)</span>` 
                : countCompletas;
        }
        if (elPendentes) {
            elPendentes.innerHTML = countParciais > 0 
                ? `${totalComPendencia} <span style="font-size: 0.72rem; font-weight: 500; color: #d97706;" title="${countPendentes} sem envio + ${countParciais} entrega parcial">(${countPendentes} zer. / ${countParciais} parc.)</span>` 
                : totalComPendencia;
        }
        if (elTaxa) elTaxa.textContent = `${percentual}%`;
        if (elProgress) elProgress.style.width = `${percentual}%`;
        
        if (elCompLabel) {
            const compName = this.formatCompetenciaLabel(comp);
            if (this.currentResponsavelFiltro) {
                elCompLabel.textContent = `Resp: ${this.currentResponsavelFiltro} · ${compName}`;
            } else {
                elCompLabel.textContent = comp ? `${compName} (BPA-C: ${countBpaC} | BPA-I: ${countBpaI})` : 'Geral';
            }
        }

        // DESTAQUE VISUAL DO KPI ATIVO QUE ESTÁ FILTRANDO
        const cardTotal = document.getElementById('bpaCardTotal');
        const cardEnviadas = document.getElementById('bpaCardEnviadas');
        const cardPendentes = document.getElementById('bpaCardPendentes');
        const tagTotal = document.getElementById('tagFilterTotal');
        const tagEnviadas = document.getElementById('tagFilterEnviadas');
        const tagPendentes = document.getElementById('tagFilterPendentes');

        if (cardTotal) cardTotal.classList.toggle('active', this.currentStatusFilter === '');
        if (cardEnviadas) cardEnviadas.classList.toggle('active', this.currentStatusFilter === 'delivered');
        if (cardPendentes) cardPendentes.classList.toggle('active', this.currentStatusFilter === 'pending');

        if (tagTotal) tagTotal.style.display = (this.currentStatusFilter === '' && (this.currentResponsavelFiltro || this.currentTipoFiltro)) ? 'inline-block' : 'none';
        if (tagEnviadas) tagEnviadas.style.display = (this.currentStatusFilter === 'delivered') ? 'inline-block' : 'none';
        if (tagPendentes) tagPendentes.style.display = (this.currentStatusFilter === 'pending') ? 'inline-block' : 'none';
    },

    renderChecklistFrancileide() {
        const container = document.getElementById('bpaChecklistContainer');
        if (!container) return;

        const comp = this.currentCompetenciaFiltro || this.getLatestCompetencia();
        const unidades = this.getUnidadesSistema();
        const enviadosComp = this.getAccessibleProducoes().filter(p => !comp || p.competencia === comp);
        const currentUser = this.getCurrentUser();
        const isPrivileged = this.isAdminOrFrancileide(currentUser);
        const search = (this.currentSearchTerm || '').toLowerCase().trim();
        const respFilter = (this.currentResponsavelFiltro || '').toLowerCase().trim();
        const tipoFilter = this.currentTipoFiltro;

        // 1. Avaliar cada unidade quanto às entregas necessárias
        const unitItems = unidades.map(estab => {
            return this.evaluateUnitDeliveries(estab, enviadosComp);
        });

        // 2. Aplicar os filtros combinados (Status do KPI, Responsável, Modalidade, Busca)
        const filtered = unitItems.filter(item => {
            const { estab, modalidade, isComplete, isPartial, prods } = item;
            const nomeE = estab.nome.toLowerCase();
            const cnesE = estab.cnes || '';
            const respE = (estab.responsavel || '').toLowerCase();

            // Filtro de Status do KPI
            if (this.currentStatusFilter === 'delivered' && !isComplete) return false;
            if (this.currentStatusFilter === 'pending' && isComplete) return false;

            // Filtro de Modalidade
            if (tipoFilter === 'AMBOS' && modalidade !== 'AMBOS') return false;
            if (tipoFilter === 'PARTIAL' && !isPartial) return false;
            if (tipoFilter === 'BPA-C' && modalidade !== 'BPA-C') return false;
            if (tipoFilter === 'BPA-I' && modalidade !== 'BPA-I') return false;

            // Filtro de Responsável
            if (respFilter) {
                const matchResp = (respE === respFilter || prods.some(p => (p.digitador_nome || '').toLowerCase() === respFilter));
                if (!matchResp) return false;
            }

            // Filtro de Busca
            if (search) {
                const matchSearch = nomeE.includes(search) ||
                    cnesE.includes(search) ||
                    respE.includes(search) ||
                    prods.some(p => (p.nome_arquivo && p.nome_arquivo.toLowerCase().includes(search)) ||
                                     (p.digitador_nome && p.digitador_nome.toLowerCase().includes(search)));
                if (!matchSearch) return false;
            }

            return true;
        });

        // 3. Renderizar Empty State ou Cards
        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 2.5rem 1.5rem; text-align: center; background: #f8fafc; border-radius: 0.75rem; border: 1px dashed #cbd5e1;">
                    <i class="fas fa-filter" style="font-size: 2.2rem; color: #94a3b8; margin-bottom: 0.75rem; display: block;"></i>
                    <h4 style="margin: 0 0 0.35rem 0; color: #334155; font-weight: 700;">Nenhuma unidade encontrada para os filtros selecionados</h4>
                    <p style="margin: 0 0 1rem 0; color: #64748b; font-size: 0.85rem;">
                        ${this.currentStatusFilter ? `Status: <strong>${this.currentStatusFilter === 'delivered' ? 'Produções Enviadas' : 'Faltam Enviar'}</strong> · ` : ''}
                        ${this.currentTipoFiltro ? `Modalidade: <strong>${this.currentTipoFiltro}</strong> · ` : ''}
                        ${this.currentResponsavelFiltro ? `Responsável: <strong>${this.currentResponsavelFiltro}</strong> · ` : ''}
                        ${search ? `Busca: <strong>"${search}"</strong>` : ''}
                    </p>
                    <button class="btn-secondary" onclick="BpaModule.clearAllFilters()" style="padding: 0.45rem 1rem;">
                        <i class="fas fa-times-circle"></i> Limpar Filtros
                    </button>
                </div>
            `;
            return;
        }

        let html = '';
        filtered.forEach(item => {
            const { estab, modalidade, prodsC, prodsI, prodC, prodI, hasC, hasI, status, isComplete, isPartial } = item;
            const escapedNome = (estab.nome || '').replace(/'/g, "\\'");

            const modalidadeSelectHtml = `
                <div class="bpa-unit-modalidade-badge-group" title="Alterar o que deve ser lançado para esta unidade">
                    <span class="bpa-modalidade-label"><i class="fas fa-sliders-h"></i> Exigir:</span>
                    <select class="bpa-select-modalidade-card ${modalidade === 'AMBOS' ? 'mode-ambos' : (modalidade === 'BPA-C' ? 'mode-c' : 'mode-i')}" 
                            onchange="BpaModule.setUnitModalidade('${escapedNome}', '${estab.cnes || ''}', this.value)">
                        <option value="AMBOS" ${modalidade === 'AMBOS' ? 'selected' : ''}>Ambas (BPA-C + BPA-I)</option>
                        <option value="BPA-C" ${modalidade === 'BPA-C' ? 'selected' : ''}>Apenas BPA-C (Consolidado)</option>
                        <option value="BPA-I" ${modalidade === 'BPA-I' ? 'selected' : ''}>Apenas BPA-I (Individualizado)</option>
                    </select>
                </div>
            `;

            if (modalidade === 'AMBOS') {
                // CASO MODALIDADE DUPLA: UNIDADE QUE DEVE ENVIAR BPA-C E BPA-I
                let statusBadgeHtml = '';
                let statusIcon = '';

                if (isComplete) {
                    statusBadgeHtml = '<span class="bpa-badge-delivered"><i class="fas fa-check-double"></i> Completo (2/2)</span>';
                    statusIcon = '<i class="fas fa-check-circle bpa-status-icon delivered"></i>';
                } else if (isPartial) {
                    statusBadgeHtml = '<span class="bpa-badge-partial"><i class="fas fa-adjust"></i> Parcial (1/2)</span>';
                    statusIcon = '<i class="fas fa-exclamation-triangle bpa-status-icon partial"></i>';
                } else {
                    statusBadgeHtml = '<span class="bpa-badge-pending"><i class="fas fa-hourglass-half"></i> Falta Enviar (0/2)</span>';
                    statusIcon = '<i class="fas fa-exclamation-circle bpa-status-icon pending"></i>';
                }

                const renderSlotFiles = (prodsList, typeTagClass, typeLabel, emptyText) => {
                    if (!prodsList || prodsList.length === 0) {
                        return `
                            <div class="bpa-slot-item pending">
                                <div class="bpa-slot-left">
                                    <span class="bpa-type-tag ${typeTagClass}"><i class="fas fa-clock"></i> ${typeLabel}</span>
                                    <span class="bpa-slot-file-info"><em style="color: #b45309;">${emptyText}</em></span>
                                </div>
                                <div style="display: flex; align-items: center;">
                                    <button class="bpa-slot-btn-up" onclick="BpaModule.openUploadModalFor('${escapedNome}', '${estab.cnes}', '${typeLabel}')" title="Anexar produção ${typeLabel}">
                                        <i class="fas fa-upload"></i> Anexar ${typeLabel}
                                    </button>
                                </div>
                            </div>
                        `;
                    }

                    return prodsList.map(p => {
                        const isTomo = p.tipo_exame === 'Tomografia Computadorizada' || (p.nome_arquivo && p.nome_arquivo.includes('TOMO'));
                        return `
                            <div class="bpa-slot-item delivered" style="margin-bottom: 0.35rem;">
                                <div class="bpa-slot-left" style="flex: 1; min-width: 0;">
                                    <span class="bpa-type-tag ${typeTagClass}"><i class="fas fa-check"></i> ${typeLabel}</span>
                                    <div style="display: inline-flex; flex-direction: column; vertical-align: middle; max-width: calc(100% - 75px);">
                                        <span class="bpa-slot-file-info" title="${p.nome_arquivo} (${p.digitador_nome})">
                                            <strong>${p.nome_arquivo}</strong> <small>(${p.tamanho_formatado})</small>
                                            ${isTomo ? '<span style="background: #e0f2fe; color: #0284c7; padding: 1px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; margin-left: 4px;"><i class="fas fa-x-ray"></i> Exame: Tomografia</span>' : ''}
                                        </span>
                                        <span style="font-size: 0.68rem; color: #64748b;">Enviado por: <strong>${p.digitador_nome}</strong></span>
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 0.35rem;">
                                    <button class="bpa-slot-btn-dl" onclick="BpaModule.downloadFile('${p.id}')" title="Baixar ${p.nome_arquivo}">
                                        <i class="fas fa-download"></i> Baixar
                                    </button>
                                    ${this.canSendEmail(p, currentUser) ? `
                                        <button class="bpa-slot-btn-email ${p.email_enviado_em ? 'is-sent' : ''}" onclick="BpaModule.openEmailModal('${p.id}')" title="${p.email_enviado_em ? `Enviado em ${this.formatTimestamp(p.email_enviado_em)}. Clique para reenviar.` : 'Enviar para auditoriabacabal@gmail.com'}">
                                            <i class="fas ${p.email_enviado_em ? 'fa-check' : 'fa-paper-plane'}"></i> ${p.email_enviado_em ? 'Email OK' : 'Email'}
                                        </button>
                                    ` : `
                                        <span style="font-size: 0.72rem; color: #94a3b8; padding: 0 4px;" title="Apenas o autor (${p.digitador_nome}) pode enviar ao e-mail"><i class="fas fa-lock"></i></span>
                                    `}
                                </div>
                            </div>
                        `;
                    }).join('');
                };

                html += `
                    <div class="bpa-status-card ${status}">
                        <div class="bpa-card-header">
                            <div class="bpa-card-title">
                                ${statusIcon}
                                <strong>${estab.nome}</strong>
                                ${estab.isIsolado ? '<span style="font-size: 0.65rem; background: #e0f2fe; color: #0284c7; padding: 1px 5px; border-radius: 4px;">Isolado</span>' : ''}
                            </div>
                            ${statusBadgeHtml}
                        </div>

                        <div class="bpa-card-meta">
                            <span class="bpa-meta-item text-muted">
                                <i class="fas fa-user-edit"></i> Resp: <strong>${estab.responsavel}</strong>
                                ${isPrivileged ? `<button onclick="BpaModule.openAssignResponsaveisModal()" style="background: none; border: none; color: #0284c7; cursor: pointer; font-size: 0.75rem; padding: 0 4px;" title="Alterar responsável"><i class="fas fa-pen"></i></button>` : ''}
                            </span>
                            <span class="bpa-meta-item text-muted"><i class="fas fa-hospital"></i> CNES: ${estab.cnes || 'N/D'}</span>
                            ${modalidadeSelectHtml}
                        </div>

                        <!-- SLOTS INTERATIVOS BPA-C E BPA-I -->
                        <div class="bpa-modalidades-slots">
                            ${renderSlotFiles(prodsC, 'bpa-c', 'BPA-C', 'Consolidado Pendente')}
                            ${renderSlotFiles(prodsI, 'bpa-i', 'BPA-I', 'Individualizado Pendente')}
                        </div>
                    </div>
                `;
            } else {
                // CASO MODALIDADE ÚNICA (APENAS BPA-C OU APENAS BPA-I)
                const singleProds = modalidade === 'BPA-I' ? prodsI : prodsC;
                const singleProd = (singleProds && singleProds[0]) || null;
                const isTomoSingle = singleProd && (singleProd.tipo_exame === 'Tomografia Computadorizada' || (singleProd.nome_arquivo && singleProd.nome_arquivo.includes('TOMO')));

                if (isComplete && singleProd) {
                    const canSendSingle = this.canSendEmail(singleProd, currentUser);
                    html += `
                        <div class="bpa-status-card delivered">
                            <div class="bpa-card-header">
                                <div class="bpa-card-title">
                                    <i class="fas fa-check-circle bpa-status-icon delivered"></i>
                                    <strong>${estab.nome}</strong>
                                </div>
                                <span class="bpa-badge-delivered">Enviado (${modalidade})</span>
                            </div>
                            <div class="bpa-card-meta">
                                <span class="bpa-file-pill">
                                    <i class="fas fa-file-code"></i> ${singleProd.nome_arquivo}
                                    ${isTomoSingle ? '<span style="background: #e0f2fe; color: #0284c7; padding: 1px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; margin-left: 4px;"><i class="fas fa-x-ray"></i> Exame: Tomografia</span>' : ''}
                                </span>
                                <span class="bpa-meta-item"><i class="fas fa-user"></i> Enviado por: <strong>${singleProd.digitador_nome}</strong></span>
                                <span class="bpa-meta-item"><i class="fas fa-clock"></i> ${this.formatTimestamp(singleProd.criado_em)}</span>
                                <span class="bpa-meta-item"><i class="fas fa-database"></i> ${singleProd.tamanho_formatado}</span>
                                ${modalidadeSelectHtml}
                            </div>
                            <div class="bpa-card-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                <button class="bpa-btn-download-sm" style="flex: 1;" onclick="BpaModule.downloadFile('${singleProd.id}')" title="Baixar ${singleProd.nome_arquivo}">
                                    <i class="fas fa-download"></i> Baixar
                                </button>
                                ${canSendSingle ? `
                                    <button class="btn-bpa-email ${singleProd.email_enviado_em ? 'is-sent' : ''}" style="flex: 1;" onclick="BpaModule.openEmailModal('${singleProd.id}')" title="${singleProd.email_enviado_em ? `Enviado em ${this.formatTimestamp(singleProd.email_enviado_em)}. Clique para reenviar.` : 'Enviar para auditoriabacabal@gmail.com'}">
                                        <i class="fas ${singleProd.email_enviado_em ? 'fa-check' : 'fa-paper-plane'}"></i>
                                        <span>${singleProd.email_enviado_em ? 'Email Enviado' : 'Enviar Email'}</span>
                                    </button>
                                ` : `
                                    <span style="font-size: 0.72rem; color: #64748b; padding: 0.35rem 0.5rem;" title="Apenas o autor (${singleProd.digitador_nome}) pode enviar ao e-mail">
                                        <i class="fas fa-lock"></i> Apenas Autor
                                    </span>
                                `}
                            </div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="bpa-status-card pending">
                            <div class="bpa-card-header">
                                <div class="bpa-card-title">
                                    <i class="fas fa-exclamation-circle bpa-status-icon pending"></i>
                                    <strong>${estab.nome}</strong>
                                    ${estab.isIsolado ? '<span style="font-size: 0.65rem; background: #e0f2fe; color: #0284c7; padding: 1px 5px; border-radius: 4px;">Isolado</span>' : ''}
                                </div>
                                <span class="bpa-badge-pending">Falta ${modalidade}</span>
                            </div>
                            <div class="bpa-card-meta">
                                <span class="bpa-meta-item text-muted">
                                    <i class="fas fa-user-edit"></i> Resp: <strong>${estab.responsavel}</strong>
                                    ${isPrivileged ? `<button onclick="BpaModule.openAssignResponsaveisModal()" style="background: none; border: none; color: #0284c7; cursor: pointer; font-size: 0.75rem; padding: 0 4px;" title="Alterar responsável"><i class="fas fa-pen"></i></button>` : ''}
                                </span>
                                <span class="bpa-meta-item text-muted"><i class="fas fa-hospital"></i> CNES: ${estab.cnes || 'N/D'}</span>
                                ${modalidadeSelectHtml}
                            </div>
                            <div class="bpa-card-actions">
                                <button class="bpa-btn-upload-direct" onclick="BpaModule.openUploadModalFor('${escapedNome}', '${estab.cnes}', '${modalidade}')" title="Anexar ${modalidade}">
                                    <i class="fas fa-upload"></i> Anexar ${modalidade}
                                </button>
                            </div>
                        </div>
                    `;
                }
            }
        });

        container.innerHTML = html;
    },

    renderTable() {
        const tbody = document.getElementById('tbodyBpaArquivos');
        if (!tbody) return;

        const comp = this.currentCompetenciaFiltro;
        const search = (this.currentSearchTerm || '').toLowerCase().trim();
        const respFilter = (this.currentResponsavelFiltro || '').toLowerCase().trim();
        const tipoFilter = this.currentTipoFiltro;
        const currentUser = this.getCurrentUser();
        const isPrivileged = this.isAdminOrFrancileide(currentUser);
        const isFrancileideProfile = this.isFrancileide(currentUser);
        const unidades = this.getUnidadesSistema();
        const enviadosComp = this.getAccessibleProducoes().filter(p => !comp || p.competencia === comp);

        // Helper para renderizar linha de arquivo recebido
        const renderReceivedRow = (p) => {
            const compLabel = this.formatCompetenciaLabel(p.competencia);
            const canDelete = isPrivileged || (currentUser.username === p.digitador_username);
            const isBpaI = p.tipo_bpa === 'BPA-I';
            const badgeClass = isBpaI ? 'bpa-badge-tipo bpa-i' : 'bpa-badge-tipo bpa-c';
            const badgeIcon = isBpaI ? '<i class="fas fa-user-tag"></i>' : '<i class="fas fa-layer-group"></i>';

            return `
                <tr class="bpa-table-row">
                    <!-- ARQUIVO -->
                    <td class="bpa-cell-file">
                        <div class="bpa-file-tag" title="${p.nome_arquivo}">
                            <i class="fas fa-file-code file-icon"></i>
                            <span class="file-name">${p.nome_arquivo}</span>
                        </div>
                    </td>

                    <!-- ESTABELECIMENTO -->
                    <td class="bpa-cell-estab">
                        <div class="estab-name" title="${p.estabelecimento_nome}">${p.estabelecimento_nome}</div>
                        <div class="estab-sub">
                            <span class="${badgeClass}">${badgeIcon} ${p.tipo_bpa || 'BPA-C'}</span>
                            ${p.cnes ? `<span class="cnes-code">CNES: ${p.cnes}</span>` : ''}
                            ${(p.tipo_exame === 'Tomografia Computadorizada' || (p.nome_arquivo && p.nome_arquivo.includes('TOMO'))) ? '<span style="background: #e0f2fe; color: #0284c7; padding: 1px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; border: 1px solid #bae6fd;"><i class="fas fa-x-ray"></i> Exame: Tomografia</span>' : ''}
                        </div>
                    </td>

                    <!-- COMPETÊNCIA -->
                    <td class="bpa-cell-comp">
                        <span class="comp-text">${compLabel}</span>
                    </td>

                    <!-- DIGITADOR & DATA -->
                    <td class="bpa-cell-author">
                        <div class="author-name"><i class="fas fa-user-circle"></i> ${p.digitador_nome}</div>
                        <div class="author-date">${this.formatTimestamp(p.criado_em)}</div>
                        ${p.email_enviado_em ? `
                            <div class="bpa-badge-email-sent" style="margin-top: 0.35rem;" title="Enviado para auditoriabacabal@gmail.com em ${this.formatTimestamp(p.email_enviado_em)}">
                                <i class="fas fa-check-circle"></i> E-mail Enviado
                            </div>
                        ` : ''}
                    </td>

                    <!-- TAMANHO -->
                    <td class="bpa-cell-size">
                        <span class="size-text">${p.tamanho_formatado}</span>
                    </td>

                    <!-- DOWNLOAD E AÇÕES -->
                    <td class="bpa-cell-actions">
                        <div class="bpa-action-group">
                            <button class="btn-bpa-download" onclick="BpaModule.downloadFile('${p.id}')" title="Baixar ${p.nome_arquivo}">
                                <i class="fas fa-download"></i>
                                <span>Download</span>
                            </button>
                            ${(() => {
                                const canSend = this.canSendEmail(p, currentUser);
                                const isSent = !!p.email_enviado_em;
                                if (canSend) {
                                    return `
                                        <button class="btn-bpa-email ${isSent ? 'is-sent' : ''}" onclick="BpaModule.openEmailModal('${p.id}')" title="${isSent ? `Enviado em ${this.formatTimestamp(p.email_enviado_em)}. Clique para reenviar.` : 'Enviar esta produção por e-mail para auditoriabacabal@gmail.com'}">
                                            <i class="fas ${isSent ? 'fa-check' : 'fa-paper-plane'}"></i>
                                            <span>${isSent ? 'E-mail Enviado' : 'Enviar E-mail'}</span>
                                        </button>
                                    `;
                                } else {
                                    return `
                                        <span class="bpa-pill-locked" style="font-size: 0.75rem;" title="Enviado por ${p.digitador_nome}. Apenas o autor ou gestão podem enviar ao e-mail.">
                                            <i class="fas fa-lock"></i>
                                        </span>
                                    `;
                                }
                            })()}
                            ${canDelete ? `
                                <button class="btn-bpa-delete" onclick="BpaModule.deleteProducao('${p.id}')" title="Excluir arquivo">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            ` : `
                                <span style="font-size: 0.75rem; color: #64748b; padding: 0.35rem 0.5rem;" title="Enviado por ${p.digitador_nome}. Apenas o autor ou gestão podem remover.">
                                    <i class="fas fa-lock"></i>
                                </span>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        };

        // Helper para renderizar linha de unidade pendente
        const renderPendingRow = (u, tipoPendente, isPartial) => {
            const compLabel = this.formatCompetenciaLabel(comp || '07/2026');
            const escapedNome = (u.nome || '').replace(/'/g, "\\'");
            const tagColor = tipoPendente === 'BPA-I' ? '#0284c7' : '#16a34a';
            const tagBg = tipoPendente === 'BPA-I' ? '#e0f2fe' : '#dcfce7';

            return `
                <tr class="bpa-table-row pending-unit-row">
                    <!-- ARQUIVO (PENDENTE) -->
                    <td class="bpa-cell-file">
                        <span class="bpa-file-pending-pill" style="border-color: ${isPartial ? '#fde68a' : '#fed7aa'}; color: ${isPartial ? '#b45309' : '#c2410c'};">
                            <i class="fas fa-hourglass-half"></i> Falta ${tipoPendente} ${isPartial ? '<small style="font-weight: 700;">(Parcial)</small>' : ''}
                        </span>
                    </td>

                    <!-- ESTABELECIMENTO -->
                    <td class="bpa-cell-estab">
                        <div class="estab-name" title="${u.nome}">${u.nome}</div>
                        <div class="estab-sub">
                            <span class="bpa-badge-tipo" style="background: ${tagBg}; color: ${tagColor}; border: 1px solid ${tagColor}40;">
                                ${tipoPendente} Pendente
                            </span>
                            ${u.cnes ? `<span class="cnes-code">CNES: ${u.cnes}</span>` : ''}
                            ${u.isIsolado ? '<span style="font-size: 0.65rem; background: #e0f2fe; color: #0284c7; padding: 1px 5px; border-radius: 4px;">Isolado</span>' : ''}
                        </div>
                    </td>

                    <!-- COMPETÊNCIA -->
                    <td class="bpa-cell-comp">
                        <span class="comp-text">${compLabel}</span>
                    </td>

                    <!-- DIGITADOR RESPONSÁVEL -->
                    <td class="bpa-cell-author">
                        <div class="author-name" style="color: #b45309;">
                            <i class="fas fa-user-clock"></i> Resp: <strong>${u.responsavel}</strong>
                        </div>
                        <div class="author-date" style="color: #94a3b8;">Aguardando envio de ${tipoPendente}</div>
                    </td>

                    <!-- TAMANHO -->
                    <td class="bpa-cell-size">
                        <span class="size-text">-</span>
                    </td>

                    <!-- AÇÃO: ANEXAR PRODUÇÃO -->
                    <td class="bpa-cell-actions">
                        <div class="bpa-action-group">
                            <button class="bpa-btn-upload-direct-table" onclick="BpaModule.openUploadModalFor('${escapedNome}', '${u.cnes}', '${tipoPendente}')" title="Anexar ${tipoPendente} desta unidade">
                                <i class="fas fa-upload"></i>
                                <span>Anexar ${tipoPendente}</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        };

        // CASO 1: SE O FILTRO DE STATUS FOR 'pending' (FALTAM ENVIAR / PENDÊNCIAS)
        if (this.currentStatusFilter === 'pending') {
            const pendingList = [];
            unidades.forEach(estab => {
                const evalRes = this.evaluateUnitDeliveries(estab, enviadosComp);
                if (evalRes.isComplete) return;

                const nomeE = estab.nome.toLowerCase();
                const cnesE = estab.cnes || '';
                const respE = (estab.responsavel || '').toLowerCase();

                if (respFilter && respE !== respFilter) return;
                if (tipoFilter === 'AMBOS' && evalRes.modalidade !== 'AMBOS') return;
                if (tipoFilter === 'PARTIAL' && !evalRes.isPartial) return;
                if (tipoFilter === 'BPA-C' && !evalRes.needsBpaC) return;
                if (tipoFilter === 'BPA-I' && !evalRes.needsBpaI) return;
                if (search && !nomeE.includes(search) && !cnesE.includes(search) && !respE.includes(search)) return;

                if (evalRes.modalidade === 'AMBOS') {
                    if (evalRes.needsBpaC) {
                        pendingList.push({ estab, tipoPendente: 'BPA-C', isPartial: evalRes.isPartial });
                    }
                    if (evalRes.needsBpaI) {
                        pendingList.push({ estab, tipoPendente: 'BPA-I', isPartial: evalRes.isPartial });
                    }
                } else if (evalRes.modalidade === 'BPA-C' && evalRes.needsBpaC) {
                    pendingList.push({ estab, tipoPendente: 'BPA-C', isPartial: false });
                } else if (evalRes.modalidade === 'BPA-I' && evalRes.needsBpaI) {
                    pendingList.push({ estab, tipoPendente: 'BPA-I', isPartial: false });
                }
            });

            if (pendingList.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center" style="padding: 2.5rem 1rem; color: #10b981;">
                            <i class="fas fa-check-circle" style="font-size: 2.2rem; margin-bottom: 0.8rem; color: #10b981; display: block;"></i>
                            <span style="font-size: 0.95rem; font-weight: 700;">Nenhuma produção pendente encontrada!</span><br>
                            <span style="font-size: 0.8rem; color: #64748b;">Todas as unidades correspondentes aos filtros selecionados já enviaram suas produções.</span>
                        </td>
                    </tr>
                `;
                return;
            }

            let html = '';
            pendingList.forEach(item => {
                html += renderPendingRow(item.estab, item.tipoPendente, item.isPartial);
            });
            tbody.innerHTML = html;
            return;
        }

        // CASO 2: SE FOR O PERFIL DE FRANCILEIDE E O FILTRO FOR 'TODOS' ('')
        // Exibir a tabela com as produções recebidas ou não (de todas as unidades)
        if (isFrancileideProfile && this.currentStatusFilter === '') {
            let html = '';
            let totalRowsCount = 0;

            unidades.forEach(estab => {
                const nomeE = estab.nome.toLowerCase();
                const cnesE = estab.cnes || '';
                const respE = (estab.responsavel || '').toLowerCase();
                const evalRes = this.evaluateUnitDeliveries(estab, enviadosComp);

                // Filtro de Responsável
                if (respFilter) {
                    const matchResp = (respE === respFilter || evalRes.prods.some(p => (p.digitador_nome || '').toLowerCase() === respFilter));
                    if (!matchResp) return;
                }

                // Filtro de Modalidade
                if (tipoFilter === 'AMBOS' && evalRes.modalidade !== 'AMBOS') return;
                if (tipoFilter === 'PARTIAL' && !evalRes.isPartial) return;

                // Filtro de Busca
                if (search) {
                    const matchSearch = nomeE.includes(search) || cnesE.includes(search) || respE.includes(search) ||
                        evalRes.prods.some(p => (p.nome_arquivo && p.nome_arquivo.toLowerCase().includes(search)) || (p.digitador_nome && p.digitador_nome.toLowerCase().includes(search)));
                    if (!matchSearch) return;
                }

                // 1. Renderizar arquivos já recebidos da unidade
                if (evalRes.prods && evalRes.prods.length > 0) {
                    evalRes.prods.forEach(p => {
                        if (tipoFilter === 'BPA-C' && p.tipo_bpa !== 'BPA-C') return;
                        if (tipoFilter === 'BPA-I' && p.tipo_bpa !== 'BPA-I') return;
                        html += renderReceivedRow(p);
                        totalRowsCount++;
                    });
                }

                // 2. Renderizar pendências se faltar enviar
                if (evalRes.isPending) {
                    if (evalRes.modalidade === 'AMBOS') {
                        if (!tipoFilter || tipoFilter === 'AMBOS' || tipoFilter === 'BPA-C') {
                            html += renderPendingRow(estab, 'BPA-C', false);
                            totalRowsCount++;
                        }
                        if (!tipoFilter || tipoFilter === 'AMBOS' || tipoFilter === 'BPA-I') {
                            html += renderPendingRow(estab, 'BPA-I', false);
                            totalRowsCount++;
                        }
                    } else if (evalRes.modalidade === 'BPA-C') {
                        if (!tipoFilter || tipoFilter === 'BPA-C') {
                            html += renderPendingRow(estab, 'BPA-C', false);
                            totalRowsCount++;
                        }
                    } else if (evalRes.modalidade === 'BPA-I') {
                        if (!tipoFilter || tipoFilter === 'BPA-I') {
                            html += renderPendingRow(estab, 'BPA-I', false);
                            totalRowsCount++;
                        }
                    }
                } else if (evalRes.isPartial) {
                    if (evalRes.needsBpaC && (!tipoFilter || tipoFilter === 'AMBOS' || tipoFilter === 'BPA-C' || tipoFilter === 'PARTIAL')) {
                        html += renderPendingRow(estab, 'BPA-C', true);
                        totalRowsCount++;
                    }
                    if (evalRes.needsBpaI && (!tipoFilter || tipoFilter === 'AMBOS' || tipoFilter === 'BPA-I' || tipoFilter === 'PARCIAL')) {
                        html += renderPendingRow(estab, 'BPA-I', true);
                        totalRowsCount++;
                    }
                }
            });

            if (totalRowsCount === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center" style="padding: 2.5rem 1rem; color: #64748b;">
                            <i class="fas fa-folder-open" style="font-size: 2.2rem; margin-bottom: 0.8rem; color: #94a3b8; display: block;"></i>
                            <span style="font-size: 0.95rem; font-weight: 700; color: #1e293b;">Nenhuma unidade ou produção encontrada</span><br>
                            <span style="font-size: 0.82rem; color: #64748b;">
                                <button class="btn-secondary" onclick="BpaModule.clearAllFilters()" style="margin-top: 0.6rem; padding: 0.35rem 0.75rem;"><i class="fas fa-times-circle"></i> Limpar Filtros</button>
                            </span>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = html;
            return;
        }

        // CASO 3: DEMAIS PERFIS OU SE FILTRANDO POR STATUS 'delivered'
        const filtered = this.getAccessibleProducoes().filter(p => {
            const matchComp = !comp || p.competencia === comp;
            const matchSearch = !search || 
                (p.nome_arquivo && p.nome_arquivo.toLowerCase().includes(search)) ||
                (p.estabelecimento_nome && p.estabelecimento_nome.toLowerCase().includes(search)) ||
                (p.digitador_nome && p.digitador_nome.toLowerCase().includes(search)) ||
                (p.competencia && p.competencia.toLowerCase().includes(search));

            // Encontrar unidade correspondente ao arquivo
            const u = unidades.find(unit => {
                const cnesP = (p.cnes || '').trim();
                const nomeP = (p.estabelecimento_nome || '').toUpperCase().trim();
                const cnesU = (unit.cnes || '').trim();
                const nomeU = (unit.nome || '').toUpperCase().trim();
                if (cnesU && cnesP && cnesU.replace(/\D/g, '') === cnesP.replace(/\D/g, '')) return true;
                if (nomeU && nomeP && (nomeP.includes(nomeU) || nomeU.includes(nomeP))) return true;
                return false;
            });

            let matchResp = true;
            if (respFilter) {
                const unitResp = (u && u.responsavel) ? u.responsavel.toLowerCase() : '';
                const pDigitador = (p.digitador_nome || '').toLowerCase();
                matchResp = (pDigitador === respFilter || unitResp === respFilter);
            }

            let matchTipo = true;
            if (tipoFilter) {
                if (tipoFilter === 'BPA-C') matchTipo = (p.tipo_bpa === 'BPA-C');
                else if (tipoFilter === 'BPA-I') matchTipo = (p.tipo_bpa === 'BPA-I');
                else if (tipoFilter === 'AMBOS') matchTipo = (u && u.modalidade === 'AMBOS');
                else if (tipoFilter === 'PARTIAL') {
                    if (!u) matchTipo = false;
                    else {
                        const evalU = this.evaluateUnitDeliveries(u, this.getAccessibleProducoes().filter(pr => !comp || pr.competencia === comp));
                        matchTipo = evalU.isPartial;
                    }
                }
            }

            return matchComp && matchSearch && matchResp && matchTipo;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center" style="padding: 2.5rem 1rem; color: #64748b;">
                        <i class="fas fa-folder-open" style="font-size: 2.2rem; margin-bottom: 0.8rem; color: #94a3b8; display: block;"></i>
                        <span style="font-size: 0.95rem; font-weight: 700; color: #1e293b;">Nenhum arquivo de produção BPA encontrado</span><br>
                        <span style="font-size: 0.82rem; color: #64748b;">
                            ${(this.currentResponsavelFiltro || this.currentSearchTerm || this.currentStatusFilter || this.currentTipoFiltro) ? 
                                '<button class="btn-secondary" onclick="BpaModule.clearAllFilters()" style="margin-top: 0.6rem; padding: 0.35rem 0.75rem;"><i class="fas fa-times-circle"></i> Limpar Filtros</button>' : 
                                'Utilize o botão principal "Enviar Produção BPA" acima para anexar um novo arquivo.'}
                        </span>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        filtered.forEach(p => {
            html += renderReceivedRow(p);
        });

        tbody.innerHTML = html;
    },

    formatTimestamp(isoStr) {
        if (!isoStr) return '-';
        try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return isoStr;
            const dia = String(d.getDate()).padStart(2, '0');
            const mes = String(d.getMonth() + 1).padStart(2, '0');
            const hora = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            return `${dia}/${mes} às ${hora}:${min}`;
        } catch(e) {
            return isoStr;
        }
    },

    /* =========================================================
       MODAL DE UPLOAD COM AUTO-IDENTIFICAÇÃO E RAIO-X
       ========================================================= */
    openUploadModal(prefillEstab = '', prefillCnes = '', prefillTipo = '') {
        const units = this.getUnidadesSistema();
        if (this.accessLoadError || !this.getCurrentUser().username || (!this.isAdminOrFrancileide() && !units.length)) {
            alert('Você ainda não tem unidades disponíveis para envio. Solicite a atribuição ao ADM ou à Francileide.');
            return;
        }
        if (prefillEstab && !this.isAdminOrFrancileide() && !units.some(u => this.matchesUnit({ cnes: prefillCnes, estabelecimento_nome: prefillEstab }, u))) return;
        this.uploadTarget = prefillEstab ? { nome: prefillEstab, cnes: prefillCnes } : null;
        const modal = document.getElementById('modalUploadBpa');
        if (!modal) return;

        this.loadCnesBase(); // Pré-carrega a base CNES em background
        this.filePendingUpload = null;
        this.auditApproval = null;
        this.fileSelectionId = (this.fileSelectionId || 0) + 1;
        document.getElementById('bpaFileInput').value = '';
        document.getElementById('bpaDropzone').classList.remove('has-file');
        document.getElementById('bpaFileInfoCard').style.display = 'none';
        document.getElementById('bpaDropPrompt').style.display = 'block';
        document.getElementById('btnConfirmarUploadBpa').disabled = true;
        const elProfsInit = document.getElementById('bpaProfissionaisAmostra');
        if (elProfsInit) elProfsInit.innerHTML = '';

        if (prefillEstab) {
            document.getElementById('inputBpaEstabelecimento').value = prefillEstab;
        } else {
            document.getElementById('inputBpaEstabelecimento').value = '';
        }

        if (prefillTipo) {
            const selectTipo = document.getElementById('selectBpaTipo');
            if (selectTipo) selectTipo.value = prefillTipo;
        }

        const defaultComp = this.currentCompetenciaFiltro || '07/2026';
        document.getElementById('inputBpaCompetencia').value = defaultComp;
        document.getElementById('inputBpaObservacoes').value = '';

        this.populateDatalistUnidades();
        modal.classList.remove('hidden');
    },

    openUploadModalFor(estabNome, cnes, tipo = '') {
        this.openUploadModal(estabNome, cnes, tipo);
    },

    closeUploadModal() {
        this.fileSelectionId = (this.fileSelectionId || 0) + 1;
        if (typeof document !== 'undefined') {
            const modal = document.getElementById('modalUploadBpa');
            if (modal) modal.classList.add('hidden');
        }
        this.filePendingUpload = null;
        this.auditApproval = null;
    },

    handleFileSelect(file) {
        if (!file) return;
        this.filePendingUpload = null;
        this.auditApproval = null;
        if (typeof document !== 'undefined') {
            const btn = document.getElementById('btnConfirmarUploadBpa');
            if (btn) btn.disabled = true;
        }
        const selectionId = this.fileSelectionId = (this.fileSelectionId || 0) + 1;

        const extension = String(file.name || '').split('.').pop().toUpperCase();
        if (!['TXT', ...Object.keys(this.siglasMeses)].includes(extension)) {
            alert('Selecione um arquivo BPA exportado: .TXT ou uma extensão de mês, de .JAN a .DEZ.');
            return;
        }
        if (!file.size) {
            alert('O arquivo está vazio. Exporte a produção novamente.');
            return;
        }
        if (typeof FileReader === 'undefined') return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            if (selectionId !== this.fileSelectionId) return;
            const textContent = e.target.result;
            if (!this.cnesBaseCache) {
                await this.loadCnesBase();
            }
            const parsed = this.parseBpaFile(file, textContent);

            if (this.uploadTarget) {
                if (parsed.cnes && String(parsed.cnes) !== String(this.uploadTarget.cnes)) {
                    alert('Este arquivo pertence a outra unidade. Confira o CNES antes de anexar.');
                    return;
                }
                parsed.estabelecimentoNome = this.uploadTarget.nome;
                if (!parsed.cnes) parsed.cnes = this.uploadTarget.cnes;
            }
            if (parsed.cnes && !this.isAdminOrFrancileide() && !this.canAccessProducao({ cnes: parsed.cnes, estabelecimento_nome: parsed.estabelecimentoNome })) {
                alert('O arquivo pertence a uma unidade que não está atribuída a você.');
                return;
            }
            this.filePendingUpload = parsed;

            // Preencher cabeçalho do arquivo
            document.getElementById('inputBpaFileName').textContent = parsed.nomeArquivo;
            document.getElementById('inputBpaFileSize').textContent = parsed.tamanhoFormatado;
            document.getElementById('inputBpaLinesCount').textContent = `${parsed.totalLinhas} linhas`;
            document.getElementById('inputBpaProcedimentosCount').textContent = `${parsed.totalAtendimentos} atendimentos`;
            const elValBpa = document.getElementById('inputBpaValorTotal');
            if (elValBpa) elValBpa.textContent = `${parsed.valorTotalFormatado} (SIGTAP)`;

            // Badge do tipo (BPA-C ou BPA-I)
            const badgeTipo = document.getElementById('badgeDetectedTipo');
            if (badgeTipo) {
                badgeTipo.innerHTML = `<i class="fas fa-check-circle"></i> ${parsed.tipoBpa === 'AMBOS' ? 'BPA-C + BPA-I' : parsed.tipoBpa === 'BPA-I' ? 'BPA-I (Individualizado)' : 'BPA-C (Consolidado)'}`;
                badgeTipo.style.background = parsed.tipoBpa === 'BPA-I' ? '#0284c7' : '#10b981';
            }

            // Exibição do Raio-X com explicação e amostra
            const elExplicacao = document.getElementById('bpaTipoExplicacao');
            const elAmostra = document.getElementById('bpaProcedimentosAmostra');
            if (elExplicacao) {
                elExplicacao.innerHTML = `<i class="fas fa-info-circle" style="color: #0284c7; margin-top: 2px; flex-shrink: 0;"></i> <span>${parsed.tipoExplicacao}</span>`;
            }
            if (elAmostra) {
                if (parsed.procedimentosDetalhados && parsed.procedimentosDetalhados.length > 0) {
                    const topProcs = parsed.procedimentosDetalhados.slice(0, 6);
                    elAmostra.innerHTML = `
                        <div class="bpa-section-divider-title">
                            <span><i class="fas fa-layer-group" style="color: #0284c7;"></i> Principais Procedimentos no Arquivo</span>
                            <span style="font-weight: 500; color: #64748b; font-size: 0.72rem;">${parsed.procedimentosDetalhados.length} procedimentos</span>
                        </div>
                        <div class="bpa-procedimentos-pills-wrap">
                            ${topProcs.map(p => `
                                <span class="bpa-proc-pill-item" title="Procedimento ${p.codigo}: ${p.quantidade} atendimentos">
                                    <code>${p.codigo}</code>
                                    <span class="qty">${p.quantidade}</span>
                                </span>
                            `).join('')}
                        </div>
                    `;
                } else {
                    elAmostra.innerHTML = `<div style="color: #64748b; font-size: 0.75rem; font-style: italic;"><i class="fas fa-check"></i> Estrutura padrão de faturamento reconhecida com sucesso.</div>`;
                }
            }

            // Exibição da Amostra de Profissionais Identificados (BPA-I e BPA-C)
            const elProfsAmostra = document.getElementById('bpaProfissionaisAmostra');
            if (elProfsAmostra) {
                if (parsed.profissionaisAmostra && parsed.profissionaisAmostra.length > 0) {
                    elProfsAmostra.style.display = 'block';
                    elProfsAmostra.innerHTML = `
                        <div class="bpa-section-divider-title">
                            <span><i class="fas fa-user-md" style="color: #0284c7;"></i> Profissionais Identificados (${parsed.profissionaisDetalhados.length})</span>
                            <span style="font-weight: 500; color: #10b981; font-size: 0.72rem;"><i class="fas fa-shield-alt"></i> Cruzamento CNES Ativo</span>
                        </div>
                        ${parsed.profissionaisAmostra.slice(0, 8).join('')}
                    `;
                } else {
                    elProfsAmostra.style.display = 'none';
                }
            }
            this.enrichProfissionaisNames(parsed);

            // Preencher campos do formulário
            document.getElementById('inputBpaEstabelecimento').value = parsed.estabelecimentoNome;
            document.getElementById('inputBpaCompetencia').value = parsed.competencia;
            document.getElementById('selectBpaTipo').value = parsed.tipoBpa;

            // Transição visual
            document.getElementById('bpaDropPrompt').style.display = 'none';
            document.getElementById('bpaFileInfoCard').style.display = 'block';
            document.getElementById('bpaDropzone').classList.add('has-file');
            document.getElementById('btnConfirmarUploadBpa').disabled = !this.canSubmitPendingUpload();
        };

        reader.onerror = () => alert('Não foi possível ler o arquivo. Selecione-o novamente.');
        reader.readAsText(file, 'ISO-8859-1');
    },

    async handleFormSubmit() {
        if (!this.filePendingUpload) {
            if (typeof alert === 'function') alert('Por favor, selecione ou arraste um arquivo de produção BPA.');
            return false;
        }

        if (!this.canSubmitPendingUpload()) {
            if (typeof alert === 'function') alert('Envio bloqueado pelo Pente Fino ARGOS. A produção precisa ser auditada e aprovada sem glosas antes do envio.');
            return false;
        }

        const btn = document.getElementById('btnConfirmarUploadBpa');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando Produção...';

        try {
            const finalData = {
                ...this.filePendingUpload,
                estabelecimentoNome: document.getElementById('inputBpaEstabelecimento').value.trim() || this.filePendingUpload.estabelecimentoNome,
                competencia: document.getElementById('inputBpaCompetencia').value.trim() || this.filePendingUpload.competencia,
                tipoBpa: document.getElementById('selectBpaTipo').value,
                observacoes: document.getElementById('inputBpaObservacoes').value.trim()
            };

            const shouldSendEmail = document.getElementById('checkEnviarEmailAposUpload') && document.getElementById('checkEnviarEmailAposUpload').checked;
            const newRecord = await this.saveProducao(finalData);
            this.closeUploadModal();
            this.showToast(newRecord._localOnly ? `Produção "${finalData.nomeArquivo}" salva neste navegador. Ainda não enviada à nuvem.` : `Produção "${finalData.nomeArquivo}" salva com sucesso!`, 'success');

            if (shouldSendEmail && newRecord && newRecord.id) {
                setTimeout(() => {
                    this.openEmailModal(newRecord.id);
                }, 350);
            }
        } catch (e) {
            console.error('Erro ao salvar produção BPA:', e);
            alert('Erro ao salvar produção: ' + (e.message || e));
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Confirmar e Enviar Produção';
        }
    },

    /* =========================================================
       EVENT BINDINGS
       ========================================================= */
    bindEvents() {
        // Enviar Produção
        const btnNovo = document.getElementById('btnNovoEnvioBpa');
        if (btnNovo) btnNovo.addEventListener('click', () => this.openUploadModal());

        // Baixar Lote
        const btnBaixarLote = document.getElementById('btnBaixarLoteBpa');
        if (btnBaixarLote) btnBaixarLote.addEventListener('click', () => this.downloadBatchCompetencia());

        // Atribuir Responsáveis e Inserir Unidade (ADM / Francileide)
        const btnNova = document.getElementById('btnNovaUnidadeManualBpa');
        if (btnNova) btnNova.addEventListener('click', () => this.openAssignResponsaveisModal(true));
        const btnResp = document.getElementById('btnGerenciarResponsaveisBpa');
        if (btnResp) btnResp.addEventListener('click', () => this.openAssignResponsaveisModal(false));
        const btnCloseResp = document.getElementById('btnCloseModalResponsaveisBpa');
        if (btnCloseResp) btnCloseResp.addEventListener('click', () => this.closeAssignResponsaveisModal());
        const btnCancelResp = document.getElementById('btnCancelResponsaveisBpa');
        if (btnCancelResp) btnCancelResp.addEventListener('click', () => this.closeAssignResponsaveisModal());
        const btnSalvarResp = document.getElementById('btnSalvarResponsaveisBpa');
        if (btnSalvarResp) btnSalvarResp.addEventListener('click', () => this.saveResponsaveis());

        // Higienização / Zerar Dados (ADM / Francileide)
        const btnHigiene = document.getElementById('btnHigienizarDadosBpa');
        if (btnHigiene) btnHigiene.addEventListener('click', () => this.solicitarZerarDados());

        // Modais de Upload
        const btnClose = document.getElementById('btnCloseModalUploadBpa');
        if (btnClose) btnClose.addEventListener('click', () => this.closeUploadModal());
        const btnCancel = document.getElementById('btnCancelUploadBpa');
        if (btnCancel) btnCancel.addEventListener('click', () => this.closeUploadModal());
        const btnConfirm = document.getElementById('btnConfirmarUploadBpa');
        if (btnConfirm) btnConfirm.addEventListener('click', () => this.handleFormSubmit());

        // Modal de E-mail BPA (Auditoria Bacabal)
        const btnCloseEmail = document.getElementById('btnCloseModalEmailBpa');
        if (btnCloseEmail) btnCloseEmail.addEventListener('click', () => this.closeEmailModal());
        const btnCancelEmail = document.getElementById('btnCancelEmailBpa');
        if (btnCancelEmail) btnCancelEmail.addEventListener('click', () => this.closeEmailModal());
        const btnConfirmEmail = document.getElementById('btnConfirmarEnvioEmailBpa');
        if (btnConfirmEmail) btnConfirmEmail.addEventListener('click', () => this.confirmEmailSend());
        const btnOpenGmailWeb = document.getElementById('btnOpenGmailWebBpa');
        if (btnOpenGmailWeb) btnOpenGmailWeb.addEventListener('click', () => this.openGmailWeb());
        const btnDownloadEml = document.getElementById('btnDownloadEmlBpa');
        if (btnDownloadEml) btnDownloadEml.addEventListener('click', () => this.downloadEmlFile());
        const btnToggleConfig = document.getElementById('btnToggleEmailConfig');
        if (btnToggleConfig) btnToggleConfig.addEventListener('click', () => this.toggleEmailConfigDrawer());
        const btnSalvarConfig = document.getElementById('btnSalvarConfigEmail');
        if (btnSalvarConfig) btnSalvarConfig.addEventListener('click', () => this.saveEmailConfigFromDrawer());
        const btnTestarConexao = document.getElementById('btnTestarConexaoEmail');
        if (btnTestarConexao) btnTestarConexao.addEventListener('click', () => this.testEmailConnectionFromDrawer());
        const selProvider = document.getElementById('cfgEmailProvider');
        if (selProvider) selProvider.addEventListener('change', (e) => this.updateProviderView(e.target.value));

        // Filtros
        const selectComp = document.getElementById('selectBpaCompetencia');
        if (selectComp) {
            selectComp.addEventListener('change', (e) => {
                this.currentCompetenciaFiltro = e.target.value;
                this.renderAll();
            });
        }

        const selectResp = document.getElementById('selectBpaResponsavel');
        if (selectResp) {
            selectResp.addEventListener('change', (e) => {
                this.setResponsavelFilter(e.target.value);
            });
        }

        const selectTipoFiltro = document.getElementById('selectBpaTipoFiltro');
        if (selectTipoFiltro) {
            selectTipoFiltro.addEventListener('change', (e) => {
                this.currentTipoFiltro = e.target.value;
                this.renderAll();
            });
        }

        const searchInput = document.getElementById('searchBpaInput');
        if (searchInput) {
            const debouncedSearch = (typeof debounce === 'function' ? debounce : (fn) => fn)((e) => {
                this.currentSearchTerm = e.target.value;
                this.renderAll();
            }, 300);
            searchInput.addEventListener('input', debouncedSearch);
        }

        const btnClearFilters = document.getElementById('btnClearBpaFilters');
        if (btnClearFilters) {
            btnClearFilters.addEventListener('click', () => this.clearAllFilters());
        }

        // Interação dos Cards de KPI (Filtragem da Lista)
        const cardTotal = document.getElementById('bpaCardTotal');
        if (cardTotal) cardTotal.addEventListener('click', () => this.setStatusFilter(''));

        const cardEnviadas = document.getElementById('bpaCardEnviadas');
        if (cardEnviadas) cardEnviadas.addEventListener('click', () => this.setStatusFilter('delivered'));

        const cardPendentes = document.getElementById('bpaCardPendentes');
        if (cardPendentes) cardPendentes.addEventListener('click', () => this.setStatusFilter('pending'));

        const cardProgresso = document.getElementById('bpaCardProgresso');
        if (cardProgresso) cardProgresso.addEventListener('click', () => this.setStatusFilter(''));

        // Drag & Drop
        const dropzone = document.getElementById('bpaDropzone');
        const fileInput = document.getElementById('bpaFileInput');

        if (dropzone && fileInput) {
            dropzone.addEventListener('click', (e) => {
                if (dropzone.classList.contains('has-file')) {
                    if (e.target.closest('#btnTrocarArquivoBpa')) {
                        fileInput.click();
                    }
                    return;
                }
                if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
                    fileInput.click();
                }
            });

            const btnSelectFile = dropzone.querySelector('.btn-select-file');
            if (btnSelectFile) {
                btnSelectFile.addEventListener('click', (e) => {
                    e.stopPropagation();
                    fileInput.click();
                });
            }

            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    this.handleFileSelect(e.target.files[0]);
                }
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.add('dragover');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.remove('dragover');
                }, false);
            });

            dropzone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                if (files && files.length > 0) {
                    this.handleFileSelect(files[0]);
                }
            }, false);
        }
    },

    renderLoadingState(isLoading) {
        const tbody = document.getElementById('tbodyBpaArquivos');
        const container = document.getElementById('bpaChecklistContainer');
        if (!tbody && !container) return;

        if (isLoading) {
            if (typeof renderSkeletonTable === 'function') {
                renderSkeletonTable(tbody, 5, 6);
            } else if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center" style="padding: 2rem; color: #94a3b8;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i><br>
                            <span>Carregando produções da nuvem...</span>
                        </td>
                    </tr>
                `;
            }

            if (typeof renderSkeletonCards === 'function') {
                renderSkeletonCards(container, 4);
            }
        }
    },

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `bpa-toast ${type}`;
        toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i> <span>${message}</span>`;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('visible'), 50);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
};

if (typeof window !== 'undefined') window.BpaModule = BpaModule;
if (typeof module !== 'undefined' && module.exports) module.exports = BpaModule;
