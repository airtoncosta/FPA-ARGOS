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
    storageKey: 'argos_producoes_bpa',
    responsaveisKey: 'argos_bpa_responsaveis',
    modalidadesKey: 'argos_bpa_modalidades',
    producoes: [],
    currentCompetenciaFiltro: '',
    currentStatusFilter: '', // '' (todos), 'delivered' (enviadas), 'pending' (faltam enviar)
    currentResponsavelFiltro: '', // '' (todos) ou nome do profissional responsável
    currentTipoFiltro: '', // '' (todos), 'BPA-C', 'BPA-I', 'AMBOS', 'PARCIAL'
    currentSearchTerm: '',
    filePendingUpload: null,

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
        'TOMO': 'HOSPITAL MARIA SOCORRO BRANDÃO', // Exames de Tomografia do Hospital HMSO
        'HMSO': 'HOSPITAL MARIA SOCORRO BRANDÃO',
        'HMI': 'HOSPITAL MATERNO INFANTIL',
        'CESP': 'CENTRO DE ESPECIALIDADES DR. COELHO',
        'COELHO': 'CENTRO DE ESPECIALIDADES DR. COELHO',
        'LCDIAS': 'LABORATÓRIO CENTRAL DR. COELHO DIAS',
        'LAB': 'LABORATÓRIO CENTRAL DR. COELHO DIAS',
        'FISIO': 'CENTRO DE FISIOTERAPIA',
        'PAFISIO': 'CENTRO DE FISIOTERAPIA',
        'SAE': 'SAE',
        'TFD': 'UNIDADE DE TRATAMENTO FORA DO DOMIC',
        'CAPSI': 'CAPSI',
        'CAPS': 'CAPS',
        'CTA': 'CTA',
        'POLI': 'POLICLÍNICA DE BACABAL',
        'CEO': 'CENTRO DE ESPECIALIDADES ODONTOLÓGICAS',
        'CREG': 'CENTRAL DE REGULAÇÃO',
        'REGULACAO': 'CENTRAL DE REGULAÇÃO',
        'VISANIT': 'VIGILÂNCIA SANITÁRIA',
        'VIGILANCIA': 'VIGILÂNCIA SANITÁRIA',
        'SAV': 'SAMU 192 SAV BACABAL 01',
        'SBV01': 'SAMU 192 SBV BACABAL 01',
        'SBV 01': 'SAMU 192 SBV BACABAL 01',
        'SBV02': 'SAMU 192 SBV BACABAL 02',
        'SBV 02': 'SAMU 192 SBV BACABAL 02',
        'SBV03': 'SAMU 192 SBV BACABAL 03',
        'SBV 03': 'SAMU 192 SBV BACABAL 03',
        'MOTO01': 'MOTOLÂNCIA 01',
        'MOTO 01': 'MOTOLÂNCIA 01',
        'MOTO02': 'MOTOLÂNCIA 02',
        'MOTO 02': 'MOTOLÂNCIA 02',
        'MOTO03': 'MOTOLÂNCIA 03',
        'MOTO 03': 'MOTOLÂNCIA 03'
    },

    cnesUnidadesMap: {
        '2387412': 'HOSPITAL MARIA SOCORRO BRANDÃO',
        '0000001': 'UNIDADE DE TRATAMENTO FORA DO DOMIC',
        '2387439': 'HOSPITAL MATERNO INFANTIL',
        '2389114': 'LABORATÓRIO CENTRAL DR. COELHO DIAS',
        '2389122': 'CENTRO DE ESPECIALIDADES DR. COELHO',
        '2389130': 'SAE SERVICO AMBULATORIAL ESPECIALIZ',
        '2389149': 'CENTRO DE FISIOTERAPIA DE BACABAL',
        '2389157': 'CENTRAL DE REGULACAO DAS URGENCIAS',
        '2389165': 'POLICLÍNICA DE BACABAL',
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

    init() {
        this.bindEvents();
        this.loadProducoes();
    },

    /* =========================================================
       CATÁLOGO DINÂMICO DE UNIDADES DO SISTEMA + CASOS ISOLADOS
       ========================================================= */
    getUnidadesSistema() {
        let unidades = [];

        // 1. Obter unidades carregadas no estado ativo do sistema (APP_STATE)
        if (window.APP_STATE && window.APP_STATE.data && Array.isArray(window.APP_STATE.data.unidades) && window.APP_STATE.data.unidades.length > 0) {
            unidades = window.APP_STATE.data.unidades.map(u => ({
                id: u.id || u.cnes || u.nome,
                nome: (u.nome || '').trim().toUpperCase(),
                cnes: (u.cnes || '').trim()
            }));
        } 
        
        // 2. Fallback garantido para DEMO_DATA (as 21 unidades do Painel de Unidades)
        if (unidades.length === 0) {
            const demoSource = (window.DEMO_DATA && Array.isArray(window.DEMO_DATA.unidades))
                ? window.DEMO_DATA.unidades
                : (typeof DEMO_DATA !== 'undefined' && Array.isArray(DEMO_DATA.unidades) ? DEMO_DATA.unidades : []);

            if (demoSource.length > 0) {
                unidades = demoSource.map(u => ({
                    id: u.id || u.cnes || u.nome,
                    nome: (u.nome || '').trim().toUpperCase(),
                    cnes: (u.cnes || '').trim()
                }));
            }
        }

        // 3. Fallback de contingência caso nem DEMO_DATA esteja acessível (todas as 21 unidades de Bacabal completas)
        if (unidades.length === 0) {
            unidades = [
                { id: 'hmso', cnes: '2387412', nome: 'HOSPITAL MARIA SOCORRO BRANDÃO' },
                { id: 'tfd', cnes: '0000001', nome: 'UNIDADE DE TRATAMENTO FORA DO DOMIC' },
                { id: 'hmi', cnes: '2387439', nome: 'HOSPITAL MATERNO INFANTIL' },
                { id: 'lcdias', cnes: '2389114', nome: 'LABORATÓRIO CENTRAL DR. COELHO DIAS' },
                { id: 'cesp', cnes: '2389122', nome: 'CENTRO DE ESPECIALIDADES DR. COELHO' },
                { id: 'sae', cnes: '2389130', nome: 'SAE SERVICO AMBULATORIAL ESPECIALIZ' },
                { id: 'fisio', cnes: '2389149', nome: 'CENTRO DE FISIOTERAPIA DE BACABAL' },
                { id: 'creg', cnes: '2389157', nome: 'CENTRAL DE REGULACAO DAS URGENCIAS' },
                { id: 'pbacabal', cnes: '2389165', nome: 'POLICLÍNICA DE BACABAL' },
                { id: 'caps', cnes: '7014710', nome: 'CENTRO DE ATENCAO PSICOSSOCIAL CAPS' },
                { id: 'cta', cnes: '7083834', nome: 'COACTA CENTRO DE TESTAGEM ANONIMA P' },
                { id: 'capsi', cnes: '9654321', nome: 'CENTRO DE ATENCAO PSICOSSOCIAL INFA' },
                { id: 'visanit', cnes: '2389173', nome: 'SERVICO DE VIGILANCIA SANITARIA BAC' },
                { id: 'savsav01', cnes: '2389181', nome: 'SAMU 192 SAV BACABAL 01' },
                { id: 'ceo', cnes: '2389200', nome: 'CENTRO DE ESPECIALIDADE ODONTOLOGIC' },
                { id: 'sbv01', cnes: '2389219', nome: 'SAMU 192 SBV BACABAL 01' },
                { id: 'sbv02', cnes: '2389227', nome: 'SAMU 192 SBV BACABAL 02' },
                { id: 'sbv03', cnes: '2389235', nome: 'SAMU 192 SBV BACABAL 03' },
                { id: 'moto01', cnes: '2389243', nome: 'MOTOLANCIA BACABAL 01' },
                { id: 'moto02', cnes: '2389251', nome: 'MOTOLANCIA BACABAL 02' },
                { id: 'moto03', cnes: '2389260', nome: 'MOTOLANCIA BACABAL 03' }
            ];
        }

        // 4. Incluir unidades de produções já enviadas que sejam casos isolados (exceto exames SADT como Tomografia)
        this.producoes.forEach(p => {
            if (p.estabelecimento_nome) {
                const nomeNorm = p.estabelecimento_nome.trim().toUpperCase();
                if (nomeNorm === 'TOMOGRAFIA' || nomeNorm === 'TOMO') return; // Exame SADT do HMSO, não é unidade isolada
                const cnesP = (p.cnes || '').trim();
                const exists = unidades.some(u => 
                    (cnesP && u.cnes && u.cnes.replace(/\D/g, '') === cnesP.replace(/\D/g, '')) ||
                    u.nome === nomeNorm ||
                    u.nome.includes(nomeNorm) ||
                    nomeNorm.includes(u.nome)
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

        // 6. Vincular o responsável e a modalidade definidos pelo ADM / Francileide
        const respMap = this.getResponsaveisMap();
        const modalMap = this.getModalidadesMap();
        unidades.forEach(u => {
            const cleanCnes = (u.cnes || '').replace(/\D/g, '');
            u.responsavel = respMap[cleanCnes] || respMap[u.cnes] || respMap[u.nome] || respMap[u.id];
            if (!u.responsavel) {
                for (const [k, resp] of Object.entries(respMap)) {
                    if (u.nome.includes(k) || k.includes(u.nome)) {
                        u.responsavel = resp;
                        break;
                    }
                }
            }
            if (!u.responsavel) u.responsavel = 'Não atribuído';

            // Modalidade esperada: 'AMBOS' (BPA-C + BPA-I), 'BPA-C' ou 'BPA-I'
            u.modalidade = modalMap[cleanCnes] || modalMap[u.cnes] || modalMap[u.nome] || modalMap[u.id];
            if (!u.modalidade) {
                for (const [k, mod] of Object.entries(modalMap)) {
                    if (u.nome.includes(k) || k.includes(u.nome)) {
                        u.modalidade = mod;
                        break;
                    }
                }
            }
            if (!u.modalidade) u.modalidade = 'AMBOS';
        });

        return unidades;
    },

    /* =========================================================
       GESTÃO DE RESPONSÁVEIS (EXCLUSIVO ADM E FRANCILEIDE)
       ========================================================= */
    getCurrentUser() {
        try {
            const str = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
            if (str) return JSON.parse(str);
        } catch(e){}
        return { username: 'digitador', name: 'Digitador', role: 'DIGITADOR' };
    },

    isAdminOrFrancileide(user) {
        if (!user) user = this.getCurrentUser();
        if (!user) return false;
        const uname = (user.username || '').toLowerCase();
        const role = (user.role || '').toUpperCase();
        return uname === 'airton' || uname === 'francileide' || role === 'ADM' || role === 'SUPERINTENDENTE';
    },

    getSystemUsers() {
        if (window.UsersModule && Array.isArray(window.UsersModule.users) && window.UsersModule.users.length > 0) {
            return window.UsersModule.users;
        }
        return [
            { username: 'ewerton', name: 'Ewerton', role: 'DIGITADOR' },
            { username: 'aline', name: 'Aline', role: 'DIGITADOR' },
            { username: 'flavia', name: 'Flávia', role: 'DIGITADOR' },
            { username: 'jessica', name: 'Jéssica', role: 'DIGITADOR' },
            { username: 'carol', name: 'Carol', role: 'DIGITADOR' },
            { username: 'mariline', name: 'Mariline', role: 'DIGITADOR' },
            { username: 'francileide', name: 'Francileide', role: 'SUPERINTENDENTE' },
            { username: 'airton', name: 'Airton Costa', role: 'ADM' }
        ];
    },

    getResponsaveisMap() {
        try {
            const str = localStorage.getItem(this.responsaveisKey);
            if (str) return JSON.parse(str);
        } catch(e){}
        return {
            'HOSPITAL MARIA SOCORRO BRANDÃO': 'Flávia',
            'HOSPITAL MATERNO INFANTIL': 'Jéssica',
            'CENTRO DE ESPECIALIDADES DR. COELHO': 'Carol',
            'CENTRO DE ESPECIALIDADES DR COELHO': 'Carol',
            'LABORATÓRIO CENTRAL DR. COELHO DIAS': 'Jéssica',
            'LABORATORIO CENTRAL DR COELHO DIAS': 'Jéssica',
            'CENTRO DE FISIOTERAPIA': 'Flávia',
            'CENTRO DE FISIOTERAPIA DE BACABAL': 'Flávia',
            '2389149': 'Flávia',
            'SAE': 'Aline',
            'SAE SERVICO AMBULATORIAL ESPECIALIZ': 'Aline',
            'TFD': 'Ewerton',
            'UNIDADE DE TRATAMENTO FORA DO DOMIC': 'Ewerton',
            'CAPS': 'Carol',
            'CENTRO DE ATENCAO PSICOSSOCIAL CAPS': 'Carol',
            'CAPSI': 'Carol',
            'CENTRO DE ATENCAO PSICOSSOCIAL INFA': 'Carol',
            'CTA': 'Aline',
            'COACTA CENTRO DE TESTAGEM ANONIMA P': 'Aline',
            'POLICLÍNICA DE BACABAL': 'Aline',
            'POLICLINICA DE BACABAL': 'Aline',
            'CEO': 'Mariline',
            'CENTRO DE ESPECIALIDADE ODONTOLOGIC': 'Mariline',
            'CENTRAL DE REGULAÇÃO': 'Ewerton',
            'CENTRAL DE REGULACAO DAS URGENCIAS': 'Ewerton',
            'VIGILÂNCIA SANITÁRIA': 'Flávia',
            'SERVICO DE VIGILANCIA SANITARIA BAC': 'Flávia',
            'SAMU SAV 01': 'Ewerton',
            'SAMU 192 SAV BACABAL 01': 'Ewerton',
            'SAMU SBV 01': 'Ewerton',
            'SAMU 192 SBV BACABAL 01': 'Ewerton',
            'SAMU SBV 02': 'Ewerton',
            'SAMU 192 SBV BACABAL 02': 'Ewerton',
            'SAMU SBV 03': 'Ewerton',
            'SAMU 192 SBV BACABAL 03': 'Ewerton',
            'MOTOLÂNCIA 01': 'Ewerton',
            'MOTOLANCIA BACABAL 01': 'Ewerton',
            'MOTOLÂNCIA 02': 'Ewerton',
            'MOTOLANCIA BACABAL 02': 'Ewerton',
            'MOTOLÂNCIA 03': 'Ewerton',
            'MOTOLANCIA BACABAL 03': 'Ewerton'
        };
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

    openAssignResponsaveisModal() {
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

        let html = '';
        unidades.forEach(u => {
            const currentResp = currentMap[u.cnes] || currentMap[u.nome] || currentMap[u.id] || '';
            const currentModal = modalMap[u.cnes] || modalMap[u.nome] || modalMap[u.id] || u.modalidade || 'AMBOS';

            let options = `<option value="">-- Não Atribuído --</option>`;
            users.forEach(usr => {
                const isSelected = (usr.name.toLowerCase() === currentResp.toLowerCase() || usr.username.toLowerCase() === currentResp.toLowerCase());
                options += `<option value="${usr.name}" ${isSelected ? 'selected' : ''}>${usr.name} (@${usr.username})</option>`;
            });

            html += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 0.65rem 1rem; font-weight: 600; color: #1e293b;">
                        ${u.nome}
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
                </tr>
            `;
        });

        tbody.innerHTML = html;
        modal.classList.remove('hidden');
    },

    closeAssignResponsaveisModal() {
        const modal = document.getElementById('modalGerenciarResponsaveisBpa');
        if (modal) modal.classList.add('hidden');
    },

    saveResponsaveis() {
        if (!this.isAdminOrFrancileide()) return;

        // Salvar Responsáveis
        const selects = document.querySelectorAll('.bpa-select-resp-row');
        const newMap = this.getResponsaveisMap();
        selects.forEach(sel => {
            const key = sel.getAttribute('data-key');
            const cnes = sel.getAttribute('data-cnes');
            const val = sel.value;
            if (key) newMap[key] = val;
            if (cnes) newMap[cnes] = val;
        });
        localStorage.setItem(this.responsaveisKey, JSON.stringify(newMap));

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
        localStorage.setItem(this.modalidadesKey, JSON.stringify(newModalMap));

        // Tentar salvar no Supabase se conectado
        try {
            if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                const client = window.SupabaseConfig.getClient();
                if (client) {
                    client.from('configuracoes').upsert({
                        chave: 'bpa_responsaveis',
                        valor: JSON.stringify(newMap)
                    });
                    client.from('configuracoes').upsert({
                        chave: 'bpa_modalidades',
                        valor: JSON.stringify(newModalMap)
                    });
                }
            }
        } catch(e){}

        this.closeAssignResponsaveisModal();
        this.populateResponsaveisFilter();
        this.renderAll();
        this.showToast('Responsáveis e modalidades esperadas atualizados com sucesso!', 'success');
    },

    /* =========================================================
       PARSER INTELIGENTE E LEITURA PROFUNDA DO ARQUIVO BPA
       ========================================================= */
    parseBpaFile(file, textContent) {
        const fileName = (file && file.name) ? file.name.trim() : '';
        const sizeBytes = file ? file.size : (textContent ? textContent.length : 0);
        const sizeFormatted = this.formatFileSize(sizeBytes);

        let detectedComp = '';
        let detectedYear = '2026';
        let detectedMonth = '07';
        let detectedEstabelecimento = '';
        let detectedCnes = '';
        let detectedTipo = 'BPA-C';
        let tipoExplicacao = '';
        let countBpaI = 0; // Registros Individualizados (03)
        let countBpaC = 0; // Registros Consolidados (02)
        let totalLinhas = 0;
        let totalAtendimentos = 0;
        let procedimentosMap = {};

        const lines = (textContent || '').split(/\r?\n/).filter(l => l.trim().length > 0);
        totalLinhas = lines.length;

        // 1. LEITURA DO CABEÇALHO DATASUS (Registro 01)
        if (lines.length > 0 && lines[0].startsWith('01') && lines[0].includes('#BPA#')) {
            const header = lines[0];
            // 01#BPA#AAAAMM
            const compMatch = header.match(/#BPA#(\d{4})(\d{2})/);
            if (compMatch) {
                detectedYear = compMatch[1];
                detectedMonth = compMatch[2];
                detectedComp = `${detectedMonth}/${detectedYear}`;
            }

            // CNES no cabeçalho
            const cnesMatch = header.match(/#BPA#\d{6}\d{6}\d{6}(\d{7})/);
            if (cnesMatch) {
                detectedCnes = cnesMatch[1];
            } else if (header.length >= 34) {
                const cnesSub = header.substring(27, 34).trim();
                if (/^\d{7}$/.test(cnesSub)) {
                    detectedCnes = cnesSub;
                }
            }

            // Nome do Órgão / Estabelecimento no cabeçalho
            if (header.length >= 70) {
                const rawNome = header.substring(34, 74).trim();
                // Ignorar se vazio, apenas zeros ou números isolados (ex: 00000000)
                if (rawNome && rawNome.length > 3 && !/^0+$/.test(rawNome) && !/^\d+$/.test(rawNome)) {
                    detectedEstabelecimento = rawNome;
                }
            }
        }

        // 2. LEITURA DOS REGISTROS DE CORPO (03 = Individualizado, 02 = Consolidado)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('03')) {
                // REGISTRO 03 = BPA-I (Individualizado)
                countBpaI++;
                if (!detectedCnes && line.length >= 9) {
                    detectedCnes = line.substring(2, 9).trim();
                }
                if (!detectedComp && line.length >= 15) {
                    const y = line.substring(9, 13);
                    const m = line.substring(13, 15);
                    if (m >= '01' && m <= '12' && y.startsWith('20')) {
                        detectedComp = `${m}/${y}`;
                        detectedMonth = m;
                        detectedYear = y;
                    }
                }
                // Procedimento no BPA-I: pos 36..46 (10 dígitos)
                if (line.length >= 46) {
                    const procCode = line.substring(36, 46).trim();
                    if (/^\d{10}$/.test(procCode)) {
                        let qtd = 1;
                        if (line.length >= 81) {
                            const qtdStr = line.substring(75, 81).trim();
                            qtd = parseInt(qtdStr, 10) || 1;
                        }
                        procedimentosMap[procCode] = (procedimentosMap[procCode] || 0) + qtd;
                        totalAtendimentos += qtd;
                    } else {
                        totalAtendimentos++;
                    }
                } else {
                    totalAtendimentos++;
                }
            } else if (line.startsWith('02')) {
                // REGISTRO 02 = BPA-C (Consolidado)
                countBpaC++;
                if (!detectedCnes && line.length >= 9) {
                    detectedCnes = line.substring(2, 9).trim();
                }
                if (!detectedComp && line.length >= 15) {
                    const y = line.substring(9, 13);
                    const m = line.substring(13, 15);
                    if (m >= '01' && m <= '12' && y.startsWith('20')) {
                        detectedComp = `${m}/${y}`;
                        detectedMonth = m;
                        detectedYear = y;
                    }
                }
                // Procedimento no BPA-C: pos 26..36 (10 dígitos)
                if (line.length >= 36) {
                    const procCode = line.substring(26, 36).trim();
                    if (/^\d{10}$/.test(procCode)) {
                        let qtd = 1;
                        if (line.length >= 44) {
                            const qtdStr = line.substring(38, 44).trim();
                            qtd = parseInt(qtdStr, 10) || 1;
                        }
                        procedimentosMap[procCode] = (procedimentosMap[procCode] || 0) + qtd;
                        totalAtendimentos += qtd;
                    } else {
                        totalAtendimentos++;
                    }
                } else {
                    totalAtendimentos++;
                }
            }
        }

        // 3. DETERMINAÇÃO DO TIPO: INDIVIDUALIZADO (BPA-I) OU CONSOLIDADO (BPA-C)
        const upperName = fileName.toUpperCase();
        const isNameBpaI = upperName.includes('BPA_I') || upperName.includes('BPA-I') || upperName.includes('BPAI') || upperName.includes('INDIV');
        const isNameBpaC = upperName.includes('BPA_C') || upperName.includes('BPA-C') || upperName.includes('BPAC') || upperName.includes('CONSOLID');

        if (countBpaI > 0 && countBpaI >= countBpaC) {
            detectedTipo = 'BPA-I';
            tipoExplicacao = `✅ <strong>BPA Individualizado (BPA-I)</strong> detectado: foram lidos <strong>${countBpaI} registros de atendimentos individualizados</strong> com identificação de profissionais e pacientes.`;
        } else if (countBpaC > 0) {
            detectedTipo = 'BPA-C';
            tipoExplicacao = `✅ <strong>BPA Consolidado (BPA-C)</strong> detectado: foram lidos <strong>${countBpaC} registros consolidados</strong> de faturamento ambulatorial.`;
        } else if (isNameBpaI) {
            detectedTipo = 'BPA-I';
            tipoExplicacao = `✅ <strong>BPA Individualizado (BPA-I)</strong> detectado pela identificação nominal do arquivo.`;
        } else if (isNameBpaC) {
            detectedTipo = 'BPA-C';
            tipoExplicacao = `✅ <strong>BPA Consolidado (BPA-C)</strong> detectado pela identificação nominal do arquivo.`;
        } else if (upperName.startsWith('PB') || upperName.startsWith('PI') || upperName.startsWith('BI')) {
            detectedTipo = 'BPA-I';
            tipoExplicacao = `✅ <strong>BPA Individualizado (BPA-I)</strong> identificado pelo prefixo DATASUS (<code>${upperName.substring(0, 2)}</code>).`;
        } else {
            detectedTipo = 'BPA-C';
            tipoExplicacao = `✅ <strong>BPA Consolidado (BPA-C)</strong> identificado pelo padrão do arquivo.`;
        }

        // 4. ANÁLISE COMPLEMENTAR POR NOME DO ARQUIVO (ex: PAFISIO_JUNHO_2026_BPA_I_CORRIGIDO.TXT ou PATOMO7-.JUL)
        const ext = upperName.split('.').pop() || '';
        if (this.siglasMeses[ext]) {
            detectedMonth = this.siglasMeses[ext];
        }

        const yearMatch = upperName.match(/202\d/);
        if (yearMatch) detectedYear = yearMatch[0];

        const mesesNomes = {
            'JANEIRO': '01', 'FEVEREIRO': '02', 'MARCO': '03', 'MARÇO': '03', 'ABRIL': '04',
            'MAIO': '05', 'JUNHO': '06', 'JULHO': '07', 'AGOSTO': '08', 'SETEMBRO': '09',
            'OUTUBRO': '10', 'NOVEMBRO': '11', 'DEZEMBRO': '12'
        };
        for (const [mNome, mNum] of Object.entries(mesesNomes)) {
            if (upperName.includes(mNome)) {
                detectedMonth = mNum;
                break;
            }
        }

        const singleMonthMatch = upperName.match(/[A-Z]+(\d{1,2})[-_.]/);
        if (singleMonthMatch && !detectedComp) {
            const m = parseInt(singleMonthMatch[1], 10);
            if (m >= 1 && m <= 12) detectedMonth = String(m).padStart(2, '0');
        }

        if (!detectedComp) {
            detectedComp = `${detectedMonth}/${detectedYear}`;
        }

        // 5. IDENTIFICAÇÃO DO ESTABELECIMENTO E CNES
        const catalog = this.getUnidadesSistema();

        // Cruzar CNES extraído do arquivo com o catálogo do sistema
        if (detectedCnes) {
            const cleanDetectedCnes = detectedCnes.replace(/\D/g, '');
            const matchCnes = catalog.find(u => (u.cnes || '').replace(/\D/g, '') === cleanDetectedCnes);
            if (matchCnes) {
                detectedEstabelecimento = matchCnes.nome;
            } else if (this.cnesUnidadesMap && this.cnesUnidadesMap[detectedCnes]) {
                detectedEstabelecimento = this.cnesUnidadesMap[detectedCnes];
            }
        }

        // Se ainda não detectou ou veio apenas zeros/números (ex: "00000000"), buscar por siglas no nome
        if (!detectedEstabelecimento || /^0+$/.test(detectedEstabelecimento) || /^\d+$/.test(detectedEstabelecimento)) {
            for (const [sigla, nome] of Object.entries(this.siglasUnidades)) {
                if (upperName.includes(sigla)) {
                    const matchCatalog = catalog.find(u => u.nome.includes(nome) || nome.includes(u.nome));
                    detectedEstabelecimento = matchCatalog ? matchCatalog.nome : nome;
                    if (matchCatalog && matchCatalog.cnes) {
                        detectedCnes = matchCatalog.cnes;
                    }
                    break;
                }
            }
        }

        // Se encontrou estabelecimento mas ainda não tem CNES, buscar do catálogo
        if (detectedEstabelecimento && !detectedCnes) {
            const matchNome = catalog.find(u => u.nome.toUpperCase() === detectedEstabelecimento.toUpperCase() || u.nome.includes(detectedEstabelecimento) || detectedEstabelecimento.includes(u.nome));
            if (matchNome && matchNome.cnes) {
                detectedCnes = matchNome.cnes;
            }
        }

        // Fallback seguro se não reconheceu nenhum estabelecimento
        if (!detectedEstabelecimento || /^0+$/.test(detectedEstabelecimento) || /^\d+$/.test(detectedEstabelecimento)) {
            if (catalog.length > 0) {
                detectedEstabelecimento = catalog[0].nome;
                detectedCnes = catalog[0].cnes || detectedCnes;
            } else {
                detectedEstabelecimento = 'ESTABELECIMENTO NÃO IDENTIFICADO';
            }
        }

        // 6. VALORAÇÃO FINANCEIRA REAL COM BASE NO SIGTAP OFICIAL (SUS)
        let valorTotalEstimado = 0;
        const procedimentosDetalhados = Object.entries(procedimentosMap).map(([cod, qtd]) => {
            const clean = cod.replace(/\D/g, '');
            const sigtapItem = (window.getSigtapProcedimento && window.getSigtapProcedimento(clean)) || (window.SIGTAP_TABELA && window.SIGTAP_TABELA[clean]);
            const desc = (sigtapItem && sigtapItem.nome) || (window.SIGTAP && window.SIGTAP[clean]) || `Procedimento ${cod}`;
            const vlSa = sigtapItem ? (sigtapItem.vl_sa || 0) : 0;
            const subtotal = Math.round((qtd * vlSa + Number.EPSILON) * 100) / 100;
            valorTotalEstimado += subtotal;
            return {
                codigo: cod,
                descricao: desc,
                quantidade: qtd,
                valorUnitario: vlSa,
                valorTotal: subtotal,
                financiamento: sigtapItem ? sigtapItem.financiamento : ''
            };
        });
        valorTotalEstimado = Math.round((valorTotalEstimado + Number.EPSILON) * 100) / 100;

        const formatMoedaBpa = (v) => (window.fmt && typeof window.fmt.moeda === 'function') 
            ? window.fmt.moeda(v) 
            : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const procedimentosAmostra = procedimentosDetalhados.slice(0, 5).map(p => {
            const valorTxt = p.valorTotal > 0 
                ? ` — Estimado: <strong>${formatMoedaBpa(p.valorTotal)}</strong>` 
                : ' <em>(PAB/Financ. Global)</em>';
            return `• <code>${p.codigo}</code>: ${p.descricao} (Qtd: <strong>${p.quantidade}</strong>${valorTxt})`;
        });

        return {
            nomeArquivo: fileName,
            estabelecimentoNome: detectedEstabelecimento,
            cnes: detectedCnes,
            competencia: detectedComp,
            competenciaFormatada: this.formatCompetenciaLabel(detectedComp),
            tipoBpa: detectedTipo,
            tipoExplicacao: tipoExplicacao,
            count02: countBpaC,
            count03: countBpaI,
            totalLinhas: totalLinhas,
            totalAtendimentos: totalAtendimentos || totalLinhas,
            valorTotalEstimado: valorTotalEstimado,
            valorTotalFormatado: formatMoedaBpa(valorTotalEstimado),
            procedimentosDetalhados: procedimentosDetalhados,
            procedimentosAmostra: procedimentosAmostra,
            tamanhoBytes: sizeBytes,
            tamanhoFormatado: sizeFormatted,
            conteudo: textContent
        };
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
    async loadProducoes() {
        this.renderLoadingState(true);
        let loaded = [];

        // 1. Tentar carregar do Supabase
        try {
            if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                const client = window.SupabaseConfig.getClient();
                if (client) {
                    const { data, error } = await client
                        .from('producoes_bpa')
                        .select('*')
                        .order('criado_em', { ascending: false });

                    if (!error && Array.isArray(data)) {
                        loaded = data;
                        localStorage.setItem(this.storageKey, JSON.stringify(loaded));
                    }
                }
            }
        } catch (e) {
            console.warn('Erro ao carregar do Supabase em Produções BPA:', e);
        }

        // 2. Fallback no LocalStorage
        if (!loaded || loaded.length === 0) {
            try {
                const localData = localStorage.getItem(this.storageKey);
                if (localData) loaded = JSON.parse(localData);
            } catch (e) {
                loaded = [];
            }
        }

        // 3. Carga de exemplo no primeiro acesso
        if (!loaded || loaded.length === 0) {
            loaded = this.getMockInitialData();
            localStorage.setItem(this.storageKey, JSON.stringify(loaded));
        } else {
            // Garantir que a produção BPA-I de exemplo conste se os mocks iniciais antigos estiverem salvos
            const hasBpaI = loaded.some(p => p.tipo_bpa === 'BPA-I');
            if (!hasBpaI && loaded.some(p => p.id === 'bpa-mock-2')) {
                loaded.push({
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
                    observacoes: 'Produção BPA-I Individualizada HMSO Julho/2026.',
                    status: 'ENVIADO',
                    criado_em: new Date('2026-08-06T14:30:00Z').toISOString()
                });
                localStorage.setItem(this.storageKey, JSON.stringify(loaded));
            }
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
        const currentUser = this.getCurrentUser();
        const newRecord = {
            id: 'bpa_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
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
            if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                const client = window.SupabaseConfig.getClient();
                if (client) {
                    const { data, error } = await client.from('producoes_bpa').insert([newRecord]).select();
                    if (!error && data && data[0]) {
                        newRecord.id = data[0].id;
                    }
                }
            }
        } catch (e) {
            console.warn('Erro ao inserir no Supabase, gravando localmente:', e);
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
            if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                const client = window.SupabaseConfig.getClient();
                if (client) {
                    await client.from('producoes_bpa').delete().eq('id', id);
                }
            }
        } catch (e) {
            console.warn('Erro ao excluir no Supabase:', e);
        }

        // Deletar localmente
        this.producoes.splice(index, 1);
        localStorage.setItem(this.storageKey, JSON.stringify(this.producoes));

        this.renderAll();
        this.showToast('Produção removida com sucesso.', 'info');
        return true;
    },

    /* =========================================================
       DOWNLOAD DE ARQUIVOS
       ========================================================= */
    downloadFile(id) {
        const prod = this.producoes.find(p => p.id === id);
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
        const filtradas = this.producoes.filter(p => !comp || p.competencia === comp);

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
        // Permite envio por qualquer usuário autenticado no ARGOS
        return true;
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
        const prod = this.producoes.find(p => p.id === producaoId);
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
        if (!this.pendingEmailProducao) return;
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
        if (!this.pendingEmailProducao) return;
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
        if (!this.pendingEmailProducao) return;

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

        const competenciasUnicas = [...new Set(this.producoes.map(p => p.competencia))].sort().reverse();
        if (!competenciasUnicas.includes('07/2026')) {
            competenciasUnicas.unshift('07/2026');
        }

        const currentVal = select.value || this.currentCompetenciaFiltro || competenciasUnicas[0] || '';
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
        const comps = [...new Set(this.producoes.map(p => p.competencia))].sort().reverse();
        return comps[0] || '07/2026';
    },

    renderAll() {
        // Controlar visibilidade do botão de atribuição de responsáveis
        const btnResp = document.getElementById('btnGerenciarResponsaveisBpa');
        if (btnResp) {
            btnResp.style.display = this.isAdminOrFrancileide() ? 'inline-flex' : 'none';
        }

        this.populateResponsaveisFilter();
        this.renderKPIs();
        this.renderActiveFiltersBar();
        this.renderChecklistFrancileide();
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
        const enviadosComp = this.producoes.filter(p => !comp || p.competencia === comp);

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
                const titleText = `${name}: ${s.completas} de ${s.total} completas` + 
                    (s.parciais > 0 ? `, ${s.parciais} entrega(s) parcial(is)` : '') + 
                    (s.pendentes > 0 ? `, ${s.pendentes} sem envio` : '');

                chipsHtml += `
                    <div class="bpa-chip ${isActive ? 'active' : ''}" onclick="BpaModule.setResponsavelFilter('${escapedName}')" title="${titleText}">
                        <span class="bpa-chip-avatar">${s.initials}</span>
                        <span>${name}</span>
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

    setUnitModalidade(nome, cnes, novaModalidade) {
        if (!nome && !cnes) return;

        const map = this.getModalidadesMap();
        if (nome) map[nome] = novaModalidade;
        if (cnes) map[cnes] = novaModalidade;
        localStorage.setItem(this.modalidadesKey, JSON.stringify(map));

        // Sincronizar com Supabase se conectado
        try {
            if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                const client = window.SupabaseConfig.getClient();
                if (client) {
                    client.from('configuracoes').upsert({
                        chave: 'bpa_modalidades',
                        valor: map,
                        atualizado_em: new Date().toISOString()
                    }, { onConflict: 'chave' }).then();
                }
            }
        } catch(e) {}

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
        const prods = enviadosComp.filter(p => {
            const cnesP = (p.cnes || '').trim().replace(/\D/g, '');
            const nomeP = (p.estabelecimento_nome || '').toUpperCase().trim();
            if (cnesE && cnesP && cnesE === cnesP) return true;
            if (nomeE && nomeP && (nomeP.includes(nomeE) || nomeE.includes(nomeP))) return true;
            return false;
        });

        const isBpaC = (p) => {
            if (p.tipo_bpa === 'BPA-C') return true;
            if (p.tipo_bpa === 'BPA-I') return false;
            if (p.count02 > 0 && (!p.count03 || p.count03 === 0)) return true;
            const upName = (p.nome_arquivo || '').toUpperCase();
            if (upName.startsWith('PA') || upName.startsWith('PC') || upName.startsWith('BC')) return true;
            return false;
        };

        const isBpaI = (p) => {
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
        const enviadosComp = this.producoes.filter(p => !comp || p.competencia === comp);
        
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
        const enviadosComp = this.producoes.filter(p => !comp || p.competencia === comp);
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
        const unidades = this.getUnidadesSistema();

        // CASO 1: SE O FILTRO DE STATUS FOR 'pending' (FALTAM ENVIAR / PENDÊNCIAS)
        if (this.currentStatusFilter === 'pending') {
            const enviadosComp = this.producoes.filter(p => !comp || p.competencia === comp);
            
            // Avaliar unidades com pendências (totais ou parciais)
            const pendingList = [];

            unidades.forEach(estab => {
                const evalRes = this.evaluateUnitDeliveries(estab, enviadosComp);
                if (evalRes.isComplete) return; // Unidade 100% entregue não entra aqui

                const nomeE = estab.nome.toLowerCase();
                const cnesE = estab.cnes || '';
                const respE = (estab.responsavel || '').toLowerCase();

                // Filtro de Responsável
                if (respFilter && respE !== respFilter) return;

                // Filtro de Modalidade
                if (tipoFilter === 'AMBOS' && evalRes.modalidade !== 'AMBOS') return;
                if (tipoFilter === 'PARTIAL' && !evalRes.isPartial) return;
                if (tipoFilter === 'BPA-C' && !evalRes.needsBpaC) return;
                if (tipoFilter === 'BPA-I' && !evalRes.needsBpaI) return;

                // Filtro de Busca
                if (search && !nomeE.includes(search) && !cnesE.includes(search) && !respE.includes(search)) {
                    return;
                }

                // Gerar linhas de pendência específicas:
                if (evalRes.modalidade === 'AMBOS') {
                    if (evalRes.needsBpaC) {
                        pendingList.push({
                            estab,
                            tipoPendente: 'BPA-C',
                            isPartial: evalRes.isPartial,
                            descricaoTipo: 'BPA Consolidado (BPA-C)'
                        });
                    }
                    if (evalRes.needsBpaI) {
                        pendingList.push({
                            estab,
                            tipoPendente: 'BPA-I',
                            isPartial: evalRes.isPartial,
                            descricaoTipo: 'BPA Individualizado (BPA-I)'
                        });
                    }
                } else if (evalRes.modalidade === 'BPA-C' && evalRes.needsBpaC) {
                    pendingList.push({
                        estab,
                        tipoPendente: 'BPA-C',
                        isPartial: false,
                        descricaoTipo: 'BPA Consolidado (BPA-C)'
                    });
                } else if (evalRes.modalidade === 'BPA-I' && evalRes.needsBpaI) {
                    pendingList.push({
                        estab,
                        tipoPendente: 'BPA-I',
                        isPartial: false,
                        descricaoTipo: 'BPA Individualizado (BPA-I)'
                    });
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
            const compLabel = this.formatCompetenciaLabel(comp || '07/2026');

            pendingList.forEach(item => {
                const u = item.estab;
                const escapedNome = (u.nome || '').replace(/'/g, "\\'");
                const tagColor = item.tipoPendente === 'BPA-I' ? '#0284c7' : '#16a34a';
                const tagBg = item.tipoPendente === 'BPA-I' ? '#e0f2fe' : '#dcfce7';

                html += `
                    <tr class="bpa-table-row pending-unit-row">
                        <!-- ARQUIVO (PENDENTE) -->
                        <td class="bpa-cell-file">
                            <span class="bpa-file-pending-pill" style="border-color: ${item.isPartial ? '#fde68a' : '#fed7aa'}; color: ${item.isPartial ? '#b45309' : '#c2410c'};">
                                <i class="fas fa-hourglass-half"></i> Falta ${item.tipoPendente} ${item.isPartial ? '<small style="font-weight: 700;">(Parcial)</small>' : ''}
                            </span>
                        </td>

                        <!-- ESTABELECIMENTO -->
                        <td class="bpa-cell-estab">
                            <div class="estab-name" title="${u.nome}">${u.nome}</div>
                            <div class="estab-sub">
                                <span class="bpa-badge-tipo" style="background: ${tagBg}; color: ${tagColor}; border: 1px solid ${tagColor}40;">
                                    ${item.tipoPendente}
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
                            <div class="author-date" style="color: #94a3b8;">Aguardando envio de ${item.tipoPendente}</div>
                        </td>

                        <!-- TAMANHO -->
                        <td class="bpa-cell-size">
                            <span class="size-text">-</span>
                        </td>

                        <!-- AÇÃO: ANEXAR PRODUÇÃO -->
                        <td class="bpa-cell-actions">
                            <div class="bpa-action-group">
                                <button class="bpa-btn-upload-direct-table" onclick="BpaModule.openUploadModalFor('${escapedNome}', '${u.cnes}', '${item.tipoPendente}')" title="Anexar ${item.tipoPendente} desta unidade">
                                    <i class="fas fa-upload"></i>
                                    <span>Anexar ${item.tipoPendente}</span>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
            return;
        }

        // CASO 2: SE O FILTRO DE STATUS FOR 'delivered' OU '' (ARQUIVOS ENVIADOS)
        const filtered = this.producoes.filter(p => {
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
                        const evalU = this.evaluateUnitDeliveries(u, this.producoes.filter(pr => !comp || pr.competencia === comp));
                        matchTipo = evalU.isPartial;
                    }
                }
            }

            return matchComp && matchSearch && matchResp && matchTipo;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center" style="padding: 2.5rem 1rem; color: #94a3b8;">
                        <i class="fas fa-folder-open" style="font-size: 2.2rem; margin-bottom: 0.8rem; color: #475569; display: block;"></i>
                        <span style="font-size: 0.95rem; font-weight: 600;">Nenhum arquivo de produção BPA encontrado</span><br>
                        <span style="font-size: 0.8rem; color: #64748b;">
                            ${(this.currentResponsavelFiltro || this.currentSearchTerm || this.currentStatusFilter || this.currentTipoFiltro) ? 
                                '<button class="btn-secondary" onclick="BpaModule.clearAllFilters()" style="margin-top: 0.6rem; padding: 0.35rem 0.75rem;"><i class="fas fa-times-circle"></i> Limpar Filtros</button>' : 
                                'Utilize o botão "+ Enviar Produção BPA" para anexar um novo arquivo.'}
                        </span>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        filtered.forEach(p => {
            const compLabel = this.formatCompetenciaLabel(p.competencia);
            const canDelete = isPrivileged || (currentUser.username === p.digitador_username);
            const isBpaI = p.tipo_bpa === 'BPA-I';
            const badgeClass = isBpaI ? 'bpa-badge-tipo bpa-i' : 'bpa-badge-tipo bpa-c';
            const badgeIcon = isBpaI ? '<i class="fas fa-user-tag"></i>' : '<i class="fas fa-layer-group"></i>';

            html += `
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
        const modal = document.getElementById('modalUploadBpa');
        if (!modal) return;

        this.filePendingUpload = null;
        document.getElementById('bpaFileInput').value = '';
        document.getElementById('bpaDropzone').classList.remove('has-file');
        document.getElementById('bpaFileInfoCard').style.display = 'none';
        document.getElementById('bpaDropPrompt').style.display = 'block';
        document.getElementById('btnConfirmarUploadBpa').disabled = true;

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
        const modal = document.getElementById('modalUploadBpa');
        if (modal) modal.classList.add('hidden');
        this.filePendingUpload = null;
    },

    handleFileSelect(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const textContent = e.target.result;
            const parsed = this.parseBpaFile(file, textContent);

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
                badgeTipo.innerHTML = `<i class="fas fa-check-circle"></i> ${parsed.tipoBpa === 'BPA-I' ? 'BPA-I (Individualizado)' : 'BPA-C (Consolidado)'}`;
                badgeTipo.style.background = parsed.tipoBpa === 'BPA-I' ? '#0284c7' : '#10b981';
            }

            // Exibição do Raio-X com explicação e amostra
            const elExplicacao = document.getElementById('bpaTipoExplicacao');
            const elAmostra = document.getElementById('bpaProcedimentosAmostra');
            if (elExplicacao) elExplicacao.innerHTML = parsed.tipoExplicacao;
            if (elAmostra) {
                if (parsed.procedimentosAmostra && parsed.procedimentosAmostra.length > 0) {
                    elAmostra.innerHTML = `<strong>Principais Procedimentos no Arquivo:</strong><br>` + parsed.procedimentosAmostra.join('<br>');
                } else {
                    elAmostra.innerHTML = `<em>Estrutura padrão de faturamento reconhecida com sucesso.</em>`;
                }
            }

            // Preencher campos do formulário
            document.getElementById('inputBpaEstabelecimento').value = parsed.estabelecimentoNome;
            document.getElementById('inputBpaCompetencia').value = parsed.competencia;
            document.getElementById('selectBpaTipo').value = parsed.tipoBpa;

            // Transição visual
            document.getElementById('bpaDropPrompt').style.display = 'none';
            document.getElementById('bpaFileInfoCard').style.display = 'block';
            document.getElementById('bpaDropzone').classList.add('has-file');
            document.getElementById('btnConfirmarUploadBpa').disabled = false;
        };

        reader.readAsText(file, 'ISO-8859-1');
    },

    async handleFormSubmit() {
        if (!this.filePendingUpload) {
            alert('Por favor, selecione ou arraste um arquivo de produção BPA.');
            return;
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
            this.showToast(`Produção "${finalData.nomeArquivo}" salva com sucesso!`, 'success');

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

        // Atribuir Responsáveis (ADM / Francileide)
        const btnResp = document.getElementById('btnGerenciarResponsaveisBpa');
        if (btnResp) btnResp.addEventListener('click', () => this.openAssignResponsaveisModal());
        const btnCloseResp = document.getElementById('btnCloseModalResponsaveisBpa');
        if (btnCloseResp) btnCloseResp.addEventListener('click', () => this.closeAssignResponsaveisModal());
        const btnCancelResp = document.getElementById('btnCancelResponsaveisBpa');
        if (btnCancelResp) btnCancelResp.addEventListener('click', () => this.closeAssignResponsaveisModal());
        const btnSalvarResp = document.getElementById('btnSalvarResponsaveisBpa');
        if (btnSalvarResp) btnSalvarResp.addEventListener('click', () => this.saveResponsaveis());

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
            searchInput.addEventListener('input', (e) => {
                this.currentSearchTerm = e.target.value;
                this.renderAll();
            });
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
        if (!tbody) return;
        if (isLoading) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center" style="padding: 2rem; color: #94a3b8;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i><br>
                        <span>Carregando produções da nuvem...</span>
                    </td>
                </tr>
            `;
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

window.BpaModule = BpaModule;
