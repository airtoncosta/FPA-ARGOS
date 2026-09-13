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
    producoes: [],
    currentCompetenciaFiltro: '',
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
        'TOMO': 'TOMOGRAFIA',
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

        // 4. Garantir que a TOMOGRAFIA conste na lista se não estiver
        const hasTomo = unidades.some(u => u.nome.includes('TOMOGRAFIA') || u.nome === 'TOMO');
        if (!hasTomo) {
            unidades.unshift({
                id: 'tomo',
                nome: 'TOMOGRAFIA',
                cnes: '2387412'
            });
        }

        // 5. Incluir também unidades de produções já enviadas que sejam casos isolados
        this.producoes.forEach(p => {
            if (p.estabelecimento_nome) {
                const nomeNorm = p.estabelecimento_nome.trim().toUpperCase();
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

        // 6. Vincular o responsável definido pelo ADM / Francileide
        const respMap = this.getResponsaveisMap();
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
            'TOMOGRAFIA': 'Ewerton',
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

        let html = '';
        unidades.forEach(u => {
            const currentResp = currentMap[u.cnes] || currentMap[u.nome] || currentMap[u.id] || '';
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

        // Tentar salvar no Supabase se conectado
        try {
            if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                const client = window.SupabaseConfig.getClient();
                if (client) {
                    client.from('configuracoes').upsert({
                        chave: 'bpa_responsaveis',
                        valor: JSON.stringify(newMap)
                    });
                }
            }
        } catch(e){}

        this.closeAssignResponsaveisModal();
        this.renderAll();
        this.showToast('Responsáveis pelas produções atualizados com sucesso!', 'success');
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

        // 6. AMOSTRA DE PROCEDIMENTOS DO ARQUIVO COM DESCRIÇÃO SIGTAP
        const procedimentosAmostra = Object.entries(procedimentosMap).slice(0, 5).map(([cod, qtd]) => {
            const clean = cod.replace(/\D/g, '');
            let desc = (window.SIGTAP && window.SIGTAP[clean]);
            if (!desc) {
                const sub = clean.substring(0, 4);
                const subMap = {
                    '0302': 'Fisioterapia e Reabilitação',
                    '0301': 'Consultas / Atendimento Especializado',
                    '0204': 'Radiologia / Tomografia / Ultrassom',
                    '0202': 'Diagnóstico Laboratorial Clínico',
                    '0307': 'Tratamentos Odontológicos',
                    '0201': 'Coletas e Procedimentos Clínicos'
                };
                desc = subMap[sub] ? `${subMap[sub]} (SIA/SUS)` : `Procedimento SIA/SUS ${cod}`;
            }
            return `• <code>${cod}</code>: ${desc} (Qtd: <strong>${qtd}</strong>)`;
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
        }

        this.producoes = loaded;
        this.renderLoadingState(false);
        this.populateCompetenciaFilter();
        this.populateDatalistUnidades();
        this.renderAll();
    },

    getMockInitialData() {
        return [
            {
                id: 'bpa-mock-1',
                nome_arquivo: 'PATOMO7-.JUL',
                estabelecimento_nome: 'TOMOGRAFIA',
                cnes: '2387412',
                competencia: '07/2026',
                tipo_bpa: 'BPA-C',
                tamanho_bytes: 124800,
                tamanho_formatado: '124K',
                conteudo_arquivo: '01#BPA#2026070001200000042387412TOMOGRAFIA HOSPITAL GERAL          02.00\r\n03238741220260722512502040101780001',
                digitador_username: 'ewerton',
                digitador_nome: 'Ewerton',
                observacoes: 'Produção de tomografias do mês de Julho/2026 finalizada e validada no BPA Mag.',
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
                observacoes: 'Arquivo de faturamento ambulatorial HMSO Julho/2026.',
                status: 'ENVIADO',
                criado_em: new Date('2026-08-06T10:15:00Z').toISOString()
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

        this.renderKPIs();
        this.renderChecklistFrancileide();
        this.renderTable();
    },

    renderKPIs() {
        const comp = this.currentCompetenciaFiltro || this.getLatestCompetencia();
        const unidades = this.getUnidadesSistema();
        const totalEsperado = unidades.length;

        // Arquivos enviados na competência
        const enviadosComp = this.producoes.filter(p => !comp || p.competencia === comp);
        
        let countEnviadas = 0;
        unidades.forEach(estab => {
            const nomeE = (estab.nome || '').toUpperCase().trim();
            const cnesE = (estab.cnes || '').trim();
            const hasSent = enviadosComp.some(p => {
                const cnesP = (p.cnes || '').trim();
                const nomeP = (p.estabelecimento_nome || '').toUpperCase().trim();
                if (cnesE && cnesP && cnesE.replace(/\D/g, '') === cnesP.replace(/\D/g, '')) return true;
                if (nomeE && nomeP && (nomeP.includes(nomeE) || nomeE.includes(nomeP))) return true;
                return false;
            });
            if (hasSent) countEnviadas++;
        });

        countEnviadas = Math.max(countEnviadas, Math.min(totalEsperado, enviadosComp.length));
        const countPendentes = Math.max(0, totalEsperado - countEnviadas);
        const percentual = totalEsperado > 0 ? Math.round((countEnviadas / totalEsperado) * 100) : 0;

        const elTotal = document.getElementById('bpaKpiTotal');
        const elEnviadas = document.getElementById('bpaKpiEnviadas');
        const elPendentes = document.getElementById('bpaKpiPendentes');
        const elTaxa = document.getElementById('bpaKpiTaxa');
        const elProgress = document.getElementById('bpaProgressBar');
        const elCompLabel = document.getElementById('bpaKpiCompLabel');

        if (elTotal) elTotal.textContent = totalEsperado;
        if (elEnviadas) elEnviadas.textContent = countEnviadas;
        if (elPendentes) elPendentes.textContent = countPendentes;
        if (elTaxa) elTaxa.textContent = `${percentual}%`;
        if (elProgress) elProgress.style.width = `${percentual}%`;
        if (elCompLabel) elCompLabel.textContent = comp ? `Competência ${this.formatCompetenciaLabel(comp)}` : 'Geral';
    },

    renderChecklistFrancileide() {
        const container = document.getElementById('bpaChecklistContainer');
        if (!container) return;

        const comp = this.currentCompetenciaFiltro || this.getLatestCompetencia();
        const unidades = this.getUnidadesSistema();
        const enviadosComp = this.producoes.filter(p => !comp || p.competencia === comp);
        const isPrivileged = this.isAdminOrFrancileide();

        let html = '';

        unidades.forEach(estab => {
            const nomeE = (estab.nome || '').toUpperCase().trim();
            const cnesE = (estab.cnes || '').trim();

            const prod = enviadosComp.find(p => {
                const cnesP = (p.cnes || '').trim();
                const nomeP = (p.estabelecimento_nome || '').toUpperCase().trim();
                if (cnesE && cnesP && cnesE.replace(/\D/g, '') === cnesP.replace(/\D/g, '')) return true;
                if (nomeE && nomeP && (nomeP.includes(nomeE) || nomeE.includes(nomeP))) return true;
                return false;
            });

            if (prod) {
                // Unidade Entregue (Verde)
                html += `
                    <div class="bpa-status-card delivered">
                        <div class="bpa-card-header">
                            <div class="bpa-card-title">
                                <i class="fas fa-check-circle bpa-status-icon delivered"></i>
                                <strong>${estab.nome}</strong>
                            </div>
                            <span class="bpa-badge-delivered">Enviado</span>
                        </div>
                        <div class="bpa-card-meta">
                            <span class="bpa-file-pill"><i class="fas fa-file-code"></i> ${prod.nome_arquivo}</span>
                            <span class="bpa-meta-item"><i class="fas fa-user"></i> Enviado por: <strong>${prod.digitador_nome}</strong></span>
                            <span class="bpa-meta-item"><i class="fas fa-clock"></i> ${this.formatTimestamp(prod.criado_em)}</span>
                            <span class="bpa-meta-item"><i class="fas fa-database"></i> ${prod.tamanho_formatado}</span>
                        </div>
                        <div class="bpa-card-actions">
                            <button class="bpa-btn-download-sm" onclick="BpaModule.downloadFile('${prod.id}')" title="Baixar ${prod.nome_arquivo}">
                                <i class="fas fa-download"></i> Baixar Arquivo
                            </button>
                        </div>
                    </div>
                `;
            } else {
                // Unidade Pendente (Laranja / Alerta)
                html += `
                    <div class="bpa-status-card pending">
                        <div class="bpa-card-header">
                            <div class="bpa-card-title">
                                <i class="fas fa-exclamation-circle bpa-status-icon pending"></i>
                                <strong>${estab.nome}</strong>
                                ${estab.isIsolado ? '<span style="font-size: 0.65rem; background: #e0f2fe; color: #0284c7; padding: 1px 5px; border-radius: 4px;">Isolado</span>' : ''}
                            </div>
                            <span class="bpa-badge-pending">Falta Enviar</span>
                        </div>
                        <div class="bpa-card-meta">
                            <span class="bpa-meta-item text-muted">
                                <i class="fas fa-user-edit"></i> Responsável: <strong>${estab.responsavel}</strong>
                                ${isPrivileged ? `<button onclick="BpaModule.openAssignResponsaveisModal()" style="background: none; border: none; color: #0284c7; cursor: pointer; font-size: 0.75rem; padding: 0 4px;" title="Alterar responsável"><i class="fas fa-pen"></i></button>` : ''}
                            </span>
                            <span class="bpa-meta-item text-muted"><i class="fas fa-hospital"></i> CNES: ${estab.cnes || 'N/D'}</span>
                            <span class="bpa-meta-item text-muted"><i class="fas fa-calendar-alt"></i> Comp: ${comp || '07/2026'}</span>
                        </div>
                        <div class="bpa-card-actions">
                            <button class="bpa-btn-upload-direct" onclick="BpaModule.openUploadModalFor('${estab.nome}', '${estab.cnes}')" title="Anexar arquivo desta unidade">
                                <i class="fas fa-upload"></i> Anexar Produção
                            </button>
                        </div>
                    </div>
                `;
            }
        });

        container.innerHTML = html;
    },

    renderTable() {
        const tbody = document.getElementById('tbodyBpaArquivos');
        if (!tbody) return;

        const comp = this.currentCompetenciaFiltro;
        const search = (this.currentSearchTerm || '').toLowerCase().trim();
        const currentUser = this.getCurrentUser();
        const isPrivileged = this.isAdminOrFrancileide(currentUser);

        const filtered = this.producoes.filter(p => {
            const matchComp = !comp || p.competencia === comp;
            const matchSearch = !search || 
                (p.nome_arquivo && p.nome_arquivo.toLowerCase().includes(search)) ||
                (p.estabelecimento_nome && p.estabelecimento_nome.toLowerCase().includes(search)) ||
                (p.digitador_nome && p.digitador_nome.toLowerCase().includes(search)) ||
                (p.competencia && p.competencia.toLowerCase().includes(search));
            return matchComp && matchSearch;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center" style="padding: 2.5rem 1rem; color: #94a3b8;">
                        <i class="fas fa-folder-open" style="font-size: 2.2rem; margin-bottom: 0.8rem; color: #475569; display: block;"></i>
                        <span style="font-size: 0.95rem; font-weight: 600;">Nenhum arquivo de produção BPA encontrado</span><br>
                        <span style="font-size: 0.8rem; color: #64748b;">Utilize o botão "+ Enviar Produção BPA" para anexar um novo arquivo.</span>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        filtered.forEach(p => {
            const compLabel = this.formatCompetenciaLabel(p.competencia);
            // Permissão de exclusão: Apenas ADM, Francileide ou quem enviou o arquivo
            const canDelete = isPrivileged || (currentUser.username === p.digitador_username);

            html += `
                <tr class="bpa-table-row">
                    <!-- ARQUIVO (Badge escuro idêntico ao print) -->
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
                            <span class="bpa-badge-tipo">${p.tipo_bpa || 'BPA-C'}</span>
                            ${p.cnes ? `<span class="cnes-code">CNES: ${p.cnes}</span>` : ''}
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
    openUploadModal(prefillEstab = '', prefillCnes = '') {
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

        const defaultComp = this.currentCompetenciaFiltro || '07/2026';
        document.getElementById('inputBpaCompetencia').value = defaultComp;
        document.getElementById('inputBpaObservacoes').value = '';

        this.populateDatalistUnidades();
        modal.classList.remove('hidden');
    },

    openUploadModalFor(estabNome, cnes) {
        this.openUploadModal(estabNome, cnes);
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
            document.getElementById('inputBpaProcedimentosCount').textContent = `${parsed.totalAtendimentos} itens/atendimentos`;

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

            await this.saveProducao(finalData);
            this.closeUploadModal();
            this.showToast(`Produção "${finalData.nomeArquivo}" enviada com sucesso!`, 'success');
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

        // Filtros
        const selectComp = document.getElementById('selectBpaCompetencia');
        if (selectComp) {
            selectComp.addEventListener('change', (e) => {
                this.currentCompetenciaFiltro = e.target.value;
                this.renderAll();
            });
        }

        const searchInput = document.getElementById('searchBpaInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentSearchTerm = e.target.value;
                this.renderTable();
            });
        }

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
