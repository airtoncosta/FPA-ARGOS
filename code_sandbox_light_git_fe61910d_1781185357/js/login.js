/**
 * ARGOS — login.js
 * Gerenciamento de Autenticação, Perfis de Usuário e Segurança de Acesso
 */

const ARGOS_USERS_HASHES = {
    'airton': '3b711afd736b9a7a8008f776a7a37fd0a2aa0cb9ecab20d1e0ee9880ef94591d',
    'francileide': '5ee51df5f54fe34491eca667d200890a7d6b9a7a3d86c54207bc945e9fd8db24',
    'jessica': '22d4954d6dd4a39356d3329d1b48f54425d3bb3f33ca45adcc559f6e81c759f5',
    'aline': 'c6e9ca89f3378cc107bfba66e613793f9696e1d0695f2e51f54a025cd827dce6',
    'ewerton': 'f5b1f7e02f7c4262c58aa0ef7414e850a610d4b8c051e12c3c48acc2bbac3973',
    'marilene': '2ee5551e6e31e7cd748d42f7a9beb2878aa3ece2e7124e8b72cdacbc94eea7d4',
    'flavia': '17f40d3c094d044dc7f94bd3724e8e88d4225205345d1b54035b55cc249b2e2e',
    'mateus': 'd5ba7ab9de1cf0bca3bb33cad947cc61671ad4d469bc9c1627492c24810b322c'
};

const ARGOS_USERS = [
    {
        username: 'airton',
        email: 'airton.costa@yahoo.com.br',
        name: 'Airton Costa',
        password: ARGOS_USERS_HASHES['airton'],
        role: 'ADM'
    },
    {
        username: 'francileide',
        email: 'francileide@fpa.gov.br',
        name: 'Francileide',
        password: ARGOS_USERS_HASHES['francileide'],
        role: 'SUPERINTENDENTE',
        perm_usuarios: true,
        perm_importar: true,
        perm_limpar_db: false,
        perm_config_supabase: false
    },
    {
        username: 'jessica',
        email: 'jessica@fpa.gov.br',
        name: 'Jessica',
        password: ARGOS_USERS_HASHES['jessica'],
        role: 'GERENTE'
    },
    {
        username: 'aline',
        email: 'aline@fpa.gov.br',
        name: 'Aline',
        password: ARGOS_USERS_HASHES['aline'],
        role: 'GERENTE'
    },
    {
        username: 'ewerton',
        email: 'ewerton@fpa.gov.br',
        name: 'Ewerton',
        password: ARGOS_USERS_HASHES['ewerton'],
        role: 'GERENTE'
    },
    {
        username: 'marilene',
        email: 'marilene@fpa.gov.br',
        name: 'Marilene',
        password: ARGOS_USERS_HASHES['marilene'],
        role: 'GERENTE'
    },
    {
        username: 'flavia',
        email: 'flavia@fpa.gov.br',
        name: 'Flavia',
        password: ARGOS_USERS_HASHES['flavia'],
        role: 'GERENTE'
    },
    {
        username: 'mateus',
        email: 'mateus@fpa.gov.br',
        name: 'Mateus',
        password: ARGOS_USERS_HASHES['mateus'],
        role: 'GERENTE',
        municipio_vinculado: 'Bacabal-MA'
    }
];

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutos
const INACTIVITY_WARNING = 2 * 60 * 1000;  // 2 minutos antes

const LoginModule = {
    _inactivityTimer: null,
    _warningTimer: null,

    startInactivityTimer() {
        this.clearInactivityTimer();
        if (!this._isLoggedIn()) return;

        this._warningTimer = setTimeout(() => {
            this.showInactivityWarning();
        }, INACTIVITY_TIMEOUT - INACTIVITY_WARNING);

        this._inactivityTimer = setTimeout(() => {
            this.handleLogout(true);
        }, INACTIVITY_TIMEOUT);
    },

    clearInactivityTimer() {
        if (this._inactivityTimer) {
            clearTimeout(this._inactivityTimer);
            this._inactivityTimer = null;
        }
        if (this._warningTimer) {
            clearTimeout(this._warningTimer);
            this._warningTimer = null;
        }
        this.hideInactivityWarning();
    },

    resetInactivityTimer() {
        this.startInactivityTimer();
    },

    _isLoggedIn() {
        return !!(sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user'));
    },

    showInactivityWarning() {
        const existing = document.getElementById('inactivity-modal');
        if (existing) return;

        const modal = document.createElement('div');
        modal.id = 'inactivity-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; align-items: center;
            justify-content: center; z-index: 99999;
        `;
        modal.innerHTML = `
            <div style="background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px;
                padding: 32px; max-width: 400px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                text-align: center;">
                <i class="fas fa-clock" style="font-size: 3rem; color: #ffa726; margin-bottom: 16px;"></i>
                <h3 style="color: #fff; margin: 0 0 8px 0;">Sessão Expirando</h3>
                <p style="color: #aaa; margin: 0 0 24px 0; font-size: 0.9rem;">
                    Sua sessão será encerrada em <strong id="inactivity-countdown" style="color: #ffa726;">2:00</strong> por inatividade.
                </p>
                <button id="btn-continue-session" style="
                    background: linear-gradient(135deg, #00c853, #00e676); color: #000;
                    border: none; padding: 12px 32px; border-radius: 8px;
                    font-weight: 700; font-size: 0.95rem; cursor: pointer;
                    transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'"
                    onmouseout="this.style.transform='scale(1)'">
                    <i class="fas fa-play"></i> Continuar Sessão
                </button>
            </div>
        `;
        document.body.appendChild(modal);

        let countdown = 120;
        const countdownEl = document.getElementById('inactivity-countdown');
        const countdownInterval = setInterval(() => {
            countdown--;
            const min = Math.floor(countdown / 60);
            const sec = countdown % 60;
            if (countdownEl) countdownEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
            if (countdown <= 0) clearInterval(countdownInterval);
        }, 1000);

        document.getElementById('btn-continue-session').onclick = () => {
            clearInterval(countdownInterval);
            this.clearInactivityTimer();
            this.resetInactivityTimer();
        };
    },

    hideInactivityWarning() {
        const modal = document.getElementById('inactivity-modal');
        if (modal) modal.remove();
    },

    init() {
        let dbStr = localStorage.getItem('argos_users_db');
        let needsUpdate = false;

        if (dbStr) {
            let users = [];
            try { users = JSON.parse(dbStr); } catch(e) {}

            // Migrar senhas em texto puro para hash SHA-256
            users = users.map(u => {
                const hashLookup = ARGOS_USERS_HASHES[u.username];
                if (hashLookup && u.password !== hashLookup && u.password.length !== 64) {
                    if (hashLookup) {
                        u.password = hashLookup;
                        needsUpdate = true;
                    }
                }
                return u;
            });

            // Migrar se não tiver o hash (senha ainda em texto puro)
            if (!dbStr.includes('francileide') || needsUpdate) {
                localStorage.setItem('argos_users_db', JSON.stringify(users));
            }
        } else {
            // Inicializar banco de usuários com hashes
            const initialUsers = ARGOS_USERS.map(u => ({
                ...u,
                status: 'ATIVO',
                createdAt: '18/05/2026, 21:00:00'
            }));
            localStorage.setItem('argos_users_db', JSON.stringify(initialUsers));
        }

        this.bindEvents();
        this.checkSession();
    },

    bindEvents() {
        const loginForm = document.getElementById('login-form');
        const passwordInput = document.getElementById('login-password');
        const togglePassword = document.getElementById('toggle-password-visibility');
        const btnLogout = document.getElementById('btnLogout');

        // Validação dinâmica de complexidade da senha ao digitar
        if (passwordInput) {
            passwordInput.addEventListener('input', () => {
                const val = passwordInput.value;
                this.validatePasswordRules(val);
            });
        }

        // Alternar visualização da senha (olho)
        if (togglePassword && passwordInput) {
            togglePassword.addEventListener('click', () => {
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    togglePassword.classList.remove('fa-eye');
                    togglePassword.classList.add('fa-eye-slash');
                } else {
                    passwordInput.type = 'password';
                    togglePassword.classList.remove('fa-eye-slash');
                    togglePassword.classList.add('fa-eye');
                }
            });
        }

        // Envio do formulário de login
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        // Botão de Logout no cabeçalho
        if (btnLogout) {
            btnLogout.addEventListener('click', (e) => {
                e.stopPropagation(); // Evita que o clique se propague e abra o perfil
                this.handleLogout();
            });
        }

        // Monitoramento de inatividade
        ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, () => this.resetInactivityTimer(), { passive: true });
        });
    },

    validatePasswordRules(password) {
        const hasLetter = /[a-zA-Z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSpecial = /[^a-zA-Z0-9]/.test(password);

        this.updateRequirementUI('req-letter', hasLetter);
        this.updateRequirementUI('req-number', hasNumber);
        this.updateRequirementUI('req-special', hasSpecial);

        return hasLetter && hasNumber && hasSpecial;
    },

    updateRequirementUI(id, isMet) {
        const el = document.getElementById(id);
        if (!el) return;

        const icon = el.querySelector('i');
        if (isMet) {
            el.classList.add('met');
            if (icon) {
                icon.className = 'fas fa-check-circle';
            }
        } else {
            el.classList.remove('met');
            if (icon) {
                icon.className = 'fas fa-circle';
            }
        }
    },

    async handleLogin() {
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const rememberCheckbox = document.getElementById('login-remember');

        if (!usernameInput || !passwordInput) return;

        const loginVal = usernameInput.value.trim().toLowerCase();
        const passwordVal = passwordInput.value;
        const rememberMe = rememberCheckbox ? rememberCheckbox.checked : false;

        // 1. Validar complexidade da senha antes de validar credenciais
        const isPasswordSecure = this.validatePasswordRules(passwordVal);
        if (!isPasswordSecure) {
            this.showToast('⚠️ A senha digitada não cumpre os requisitos de complexidade exigidos (letras, números e caracteres especiais).', 'warn');
            return;
        }

        // --- MODO ONLINE: Supabase Conectado ---
        if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
            const btnSubmit = document.getElementById('btn-login-submit');
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
            }

            try {
                const res = await window.SupabaseService.authLogin(loginVal, passwordVal);

                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar no Sistema';
                }

                if (!res.success) {
                    if (res.isPasswordWrong) {
                        const attempts = res.failedAttempts || 
                            (parseInt(localStorage.getItem('failed_attempts_' + loginVal) || '0') + 1);
                        localStorage.setItem('failed_attempts_' + loginVal, attempts);

                        if (attempts >= 5) {
                            this.showToast('⛔ CONTA BLOQUEADA: Você excedeu o limite de 5 tentativas inválidas. Contate o Administrador.', 'error');
                        } else {
                            this.showToast(`❌ Senha incorreta. Tentativa ${attempts} de 5.`, 'error');
                        }
                    } else {
                        this.showToast(res.message, 'error');
                    }
                    return;
                }

                // Login Sucesso
                const user = res.user;
                localStorage.removeItem('failed_attempts_' + user.username);

                const sessionUser = {
                    username: user.username,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    perm_usuarios: user.perm_usuarios,
                    perm_importar: user.perm_importar,
                    perm_limpar_db: user.perm_limpar_db,
                    perm_config_supabase: user.perm_config_supabase,
                    municipio_vinculado: user.municipio_vinculado,
                    acesso_multi_municipio: user.acesso_multi_municipio
                };

                if (rememberMe) {
                    localStorage.setItem('argos_user', JSON.stringify(sessionUser));
                } else {
                    sessionStorage.setItem('argos_user', JSON.stringify(sessionUser));
                }

                // Registrar a auditoria no Supabase
                await this.logAction(user.username, 'LOGIN');
                this.showToast(`🔑 Acesso concedido via Nuvem! Bem-vindo(a), ${user.name}.`, 'success');
                this.loginUI(sessionUser);
                return;
            } catch (err) {
                console.error("Erro no login via Supabase:", err);
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar no Sistema';
                }
                this.showToast('⚠️ Erro ao conectar ao Supabase. Tentando login em Modo Local...', 'warn');
                // Fallback para o modo local abaixo
            }
        }

        // --- MODO OFFLINE: Fallback Local ---
        let dbUsers = [];
        try { dbUsers = JSON.parse(localStorage.getItem('argos_users_db') || '[]'); } catch (e) { }
        if (dbUsers.length === 0) dbUsers = ARGOS_USERS; // fallback

        // Buscar o usuário pelo username ou pelo e-mail
        const user = dbUsers.find(u =>
            u.username.toLowerCase() === loginVal ||
            u.email.toLowerCase() === loginVal
        );

        if (!user) {
            this.showToast('❌ Nome de acesso ou e-mail não cadastrado.', 'error');
            return;
        }

        // Checar se o usuário está bloqueado
        if (user.status === 'BLOQUEADO' || user.status === 'INATIVO') {
            this.showToast('⛔ Acesso Negado. Seu usuário foi bloqueado pelo Administrador.', 'error');
            return;
        }

        // Hashear a senha digitada para comparar com o hash armazenado
        const inputHash = await CryptoUtils.sha256(passwordVal);

        // Validar a senha correspondente (comparação de hashes)
        if (user.password !== inputHash) {
            user.failedAttempts = (user.failedAttempts || 0) + 1;
            if (user.failedAttempts >= 5) {
                user.status = 'BLOQUEADO';
                localStorage.setItem('argos_users_db', JSON.stringify(dbUsers));
                this.showToast('⛔ CONTA BLOQUEADA: Você excedeu o limite de 5 tentativas inválidas. Contate o Administrador.', 'error');
                return;
            }
            localStorage.setItem('argos_users_db', JSON.stringify(dbUsers));
            this.showToast(`❌ Senha incorreta. Tentativa ${user.failedAttempts} de 5.`, 'error');
            return;
        }

        // Sucesso no login local
        user.failedAttempts = 0;
        localStorage.setItem('argos_users_db', JSON.stringify(dbUsers));
        const sessionUser = {
            username: user.username,
            email: user.email,
            name: user.name,
            role: user.role,
            perm_usuarios: user.perm_usuarios,
            perm_importar: user.perm_importar,
            perm_limpar_db: user.perm_limpar_db,
            perm_config_supabase: user.perm_config_supabase,
            municipio_vinculado: user.municipio_vinculado
        };

        if (rememberMe) {
            localStorage.setItem('argos_user', JSON.stringify(sessionUser));
        } else {
            sessionStorage.setItem('argos_user', JSON.stringify(sessionUser));
        }

        await this.logAction(user.username, 'LOGIN');
        this.showToast(`🔑 Acesso concedido localmente! Bem-vindo(a), ${user.name}.`, 'success');
        this.loginUI(sessionUser);
    },

    async loginUI(user) {
        document.body.classList.add('logged-in');

        const loginContainer = document.getElementById('login-container');
        if (loginContainer) loginContainer.classList.add('hidden');

        this.resetInactivityTimer();

        // Atualizar informações do cabeçalho
        const userNameHeader = document.getElementById('userNameHeader');
        const userRoleHeader = document.getElementById('userRoleHeader');
        if (userNameHeader) userNameHeader.textContent = user.name;
        if (userRoleHeader) {
            userRoleHeader.textContent = user.role;
            // Cor do distintivo com base na permissão (Estilo Pill Premium)
            if (user.role === 'ADM') {
                userRoleHeader.style.color = '#ff8a80'; // Vermelho suave / Coral
                userRoleHeader.style.backgroundColor = 'rgba(255, 138, 128, 0.12)';
                userRoleHeader.style.border = '1px solid rgba(255, 138, 128, 0.25)';
            } else if (user.role === 'SUPERINTENDENTE') {
                userRoleHeader.style.color = '#e040fb'; // Roxo vibrante/Premium
                userRoleHeader.style.backgroundColor = 'rgba(224, 64, 251, 0.12)';
                userRoleHeader.style.border = '1px solid rgba(224, 64, 251, 0.25)';
            } else if (user.role === 'GERENTE') {
                userRoleHeader.style.color = '#82b1ff'; // Azul suave
                userRoleHeader.style.backgroundColor = 'rgba(130, 177, 255, 0.12)';
                userRoleHeader.style.border = '1px solid rgba(130, 177, 255, 0.25)';
            } else {
                userRoleHeader.style.color = '#b2dfdb'; // Verde/teal claro
                userRoleHeader.style.backgroundColor = 'rgba(178, 223, 219, 0.12)';
                userRoleHeader.style.border = '1px solid rgba(178, 223, 219, 0.25)';
            }
        }

        // Aplicar as permissões e restrições baseadas no cargo
        this.applyPermissions(user.role);

        // Atualiza a tela Minha Conta imediatamente com as informações do novo usuário
        if (window.AccountModule) {
            await window.AccountModule.refreshAccountView();
        }

        // Sincronizar Logomarca e SIGTAP da nuvem (Supabase) ao logar
        if (window.SupabaseConfig && window.SupabaseConfig.isConnected() && window.SupabaseService) {
            try {
                // Sincronizar Logo
                const cloudLogo = await window.SupabaseService.loadLogo();
                if (cloudLogo) {
                    localStorage.setItem('argos_custom_logo', cloudLogo);
                }
            } catch (e) {
                console.error("Erro ao carregar logo no login:", e);
            }

            try {
                // Sincronizar SIGTAP
                const cloudSigtap = await window.SupabaseService.loadSigtap();
                if (cloudSigtap && Object.keys(cloudSigtap).length > 0) {
                    window.SIGTAP = { ...(window.SIGTAP || {}), ...cloudSigtap };
                    if (window.AppDB) {
                        await window.AppDB.setItem('SIGTAP_DB', window.SIGTAP);
                        const sigtapMeta = await window.AppDB.getItem('sigtap_meta') || { fileName: 'Nuvem Supabase', importDate: 'Sincronizado' };
                        await window.AppDB.setItem('sigtap_meta', sigtapMeta);
                    }
                }
            } catch (e) {
                console.error("Erro ao carregar SIGTAP no login:", e);
            }
        }

        // Dispara re-render da central de arquivos caso o app principal esteja carregado
        if (window.renderArquivosManager) {
            await window.renderArquivosManager();
        }

        // Re-inicializa a UI de contexto de município com a nova sessão
        if (window.MunicipioContext && typeof window.MunicipioContext.initUI === 'function') {
            await window.MunicipioContext.initUI();
        }

        // v4.0: Auto-load do município vinculado para usuários restritos
        if ((user.username === 'yvanna' || user.username === 'mateus') && user.municipio_vinculado) {
            if (window.MunicipioContext && window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                const parts = user.municipio_vinculado.split('-');
                const nomeMun = parts[0].trim();
                const ufMun = parts.length > 1 ? parts[1].trim() : '';
                const idMun = await window.MunicipioContext.registrarOuObterMunicipio(nomeMun, ufMun);
                if (idMun) {
                    await window.MunicipioContext.carregarMunicipio(idMun);
                }
            }
        }
        
        // Garante que o modal de importar seja fechado caso tenha aberto no background
        if (typeof hideModal === 'function') {
            hideModal('modalImportar');
        }
    },

    applyPermissions(role) {
        // Obter usuário da sessão para pegar as permissões customizadas
        const userStr = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        let user = {};
        try { if (userStr) user = JSON.parse(userStr); } catch (e) { }

        // Obter elementos interativos para restrição
        const btnLimpar = document.getElementById('btnLimparDados');
        const btnSupabase = document.getElementById('btnConfigSupabase');
        const btnImportar = document.getElementById('btnImportar');
        const btnImportarPage = document.getElementById('btnImportarArquivosPage');
        const btnUploadLogo = document.getElementById('btnUploadLogo');
        const btnExcluirLogo = document.getElementById('btnExcluirLogo');
        const btnUploadSigtap = document.getElementById('btnUploadSigtap');
        const tabImportPortaria = document.getElementById('tabImportPortaria');
        const navMenuAdmin = document.getElementById('navMenuAdmin'); // Container do Menu Administração

        // Resetar para hidden (segurança)
        if (btnLimpar) btnLimpar.classList.add('hidden');
        if (btnSupabase) btnSupabase.classList.add('hidden');
        if (btnImportar) btnImportar.classList.add('hidden');
        if (btnImportarPage) btnImportarPage.classList.add('hidden');
        if (btnUploadLogo) btnUploadLogo.classList.add('hidden');
        if (btnExcluirLogo) btnExcluirLogo.classList.add('hidden');
        if (btnUploadSigtap) btnUploadSigtap.classList.add('hidden');
        if (tabImportPortaria) tabImportPortaria.classList.add('hidden');
        if (navMenuAdmin) navMenuAdmin.style.display = 'none';

        // ADM -> Acesso a tudo
        if (role === 'ADM') {
            if (btnLimpar) btnLimpar.classList.remove('hidden');
            if (btnSupabase) btnSupabase.classList.remove('hidden');
            if (btnImportar) btnImportar.classList.remove('hidden');
            if (btnImportarPage) btnImportarPage.classList.remove('hidden');
            if (btnUploadLogo) btnUploadLogo.classList.remove('hidden');
            if (btnExcluirLogo) btnExcluirLogo.classList.remove('hidden');
            if (btnUploadSigtap) btnUploadSigtap.classList.remove('hidden');
            if (tabImportPortaria) tabImportPortaria.classList.remove('hidden');
            if (navMenuAdmin) navMenuAdmin.style.display = 'block';
        }
        // SUPERINTENDENTE -> Acesso Customizado
        else if (role === 'SUPERINTENDENTE') {
            if (btnLimpar) btnLimpar.classList.remove('hidden');
            if (btnImportar) btnImportar.classList.remove('hidden');
            if (btnImportarPage) btnImportarPage.classList.remove('hidden');

            if (user.perm_config_supabase && btnSupabase) btnSupabase.classList.remove('hidden');

            // Habilitado para SUPERINTENDENTE conforme solicitado
            if (btnUploadLogo) btnUploadLogo.classList.remove('hidden');
            if (btnExcluirLogo) btnExcluirLogo.classList.remove('hidden');
            if (btnUploadSigtap) btnUploadSigtap.classList.remove('hidden');

            if (user.perm_importar) {
                if (tabImportPortaria) tabImportPortaria.classList.remove('hidden');
            }

            if (user.perm_usuarios && navMenuAdmin) {
                navMenuAdmin.style.display = 'block';
            }
        }
        // GERENTE -> Apenas Importação local / Visualização restrita
        else if (role === 'GERENTE') {
            if (btnImportar) btnImportar.classList.remove('hidden');
            if (btnImportarPage) btnImportarPage.classList.remove('hidden');
            // Oculta completamente o card do SIGTAP e Portaria para GERENTE
            const cardSigtap = document.querySelector('.arquivos-card.sigtap');
            if (cardSigtap) cardSigtap.style.display = 'none';
        }
    },

    checkSession() {
        const userStr = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                this.loginUI(user);
                this.resetInactivityTimer();
            } catch (e) {
                console.error("Erro ao ler sessão do usuário:", e);
                this.showLoginUI();
            }
        } else {
            this.showLoginUI();
        }
    },

    showLoginUI() {
        this.clearInactivityTimer();
        document.body.classList.remove('logged-in');

        const loginContainer = document.getElementById('login-container');
        if (loginContainer) loginContainer.classList.remove('hidden');

        // Resetar formulário
        const loginForm = document.getElementById('login-form');
        if (loginForm) loginForm.reset();

        // Ocultar e limpar a mensagem de erro/sucesso inline
        const loginErrorMsg = document.getElementById('login-error-msg');
        if (loginErrorMsg) {
            loginErrorMsg.textContent = '';
            loginErrorMsg.classList.add('hidden');
        }

        // Limpar dados do cabeçalho do usuário
        const userNameHeader = document.getElementById('userNameHeader');
        const userRoleHeader = document.getElementById('userRoleHeader');
        if (userNameHeader) userNameHeader.textContent = '-';
        if (userRoleHeader) {
            userRoleHeader.textContent = '-';
            userRoleHeader.style.color = '';
            userRoleHeader.style.backgroundColor = '';
            userRoleHeader.style.border = '';
        }

        // Resetar requisitos da senha
        this.updateRequirementUI('req-letter', false);
        this.updateRequirementUI('req-number', false);
        this.updateRequirementUI('req-special', false);
    },

    async handleLogout(inactivity = false) {
        this.clearInactivityTimer();

        const userStr = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                await this.logAction(user.username, 'LOGOUT');
            } catch (e) { }
        }

        sessionStorage.removeItem('argos_user');
        localStorage.removeItem('argos_user');

        // Limpar dados de sessão e cache local para não manter dados do usuário anterior
        if (window.MunicipioContext) {
            window.MunicipioContext.limparAtivo();
        }

        if (window.AppDB) {
            try {
                const municipioAtivo = window.MunicipioContext ? window.MunicipioContext.getAtivo() : null;
                if (municipioAtivo && municipioAtivo.id) {
                    await window.AppDB.removeItem('datasets_' + municipioAtivo.id);
                }
                await window.AppDB.removeItem('datasets');

                const imports = await window.AppDB.getItem('imported_files') || [];
                const globais = imports.filter(i => i.type === 'SIGTAP' || i.type === 'PORTARIA');
                await window.AppDB.setItem('imported_files', globais);
            } catch (err) {
                console.error("Erro ao limpar dados locais na saída:", err);
            }
        }

        // Limpar sessão do Supabase Auth se existir
        if (window.SupabaseConfig && window.SupabaseConfig.isConnected() && window.supabase) {
            try {
                await window.supabase.auth.signOut();
            } catch (e) { /* ignora */ }
        }

        this.showLoginUI();
        this.showToast(inactivity ? '⏰ Sessão encerrada por inatividade.' : 'ℹ️ Você saiu do sistema.', 'info');

        setTimeout(() => {
            window.location.reload();
        }, 500);
    },

    async logAction(username, action) {
        const desc = action === 'LOGIN' ? 'Login realizado' : 'Logout realizado';

        // Registrar na nuvem (Supabase) se conectado
        if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
            try {
                await window.SupabaseService.logAction(username, action, 'SISTEMA', desc);
            } catch (err) {
                console.error("Erro ao salvar log no Supabase:", err);
            }
        }

        // Salvar localmente como fallback
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem('argos_user_history') || '[]');
        } catch (e) { }

        history.unshift({
            date: new Date().toISOString(),
            user: username,
            action: action,
            module: 'SISTEMA',
            desc: desc
        });

        // Manter os últimos 100 registros locais
        if (history.length > 100) history = history.slice(0, 100);
        localStorage.setItem('argos_user_history', JSON.stringify(history));
    },

    showToast(msg, type = '') {
        const loginContainer = document.getElementById('login-container');
        const loginErrorMsg = document.getElementById('login-error-msg');
        const loginCard = document.querySelector('.login-card');

        // Se a tela de login estiver visível, mostra o erro dentro dela
        if (loginContainer && !loginContainer.classList.contains('hidden') && loginErrorMsg) {
            loginErrorMsg.textContent = msg;
            loginErrorMsg.classList.remove('hidden');

            // Adicionar shake effect se for erro ou aviso
            if (loginCard && (type === 'error' || type === 'warn')) {
                loginCard.classList.remove('shake');
                void loginCard.offsetWidth; // Força o reflow do DOM para reiniciar a animação
                loginCard.classList.add('shake');
            }
            return;
        }

        // Utiliza o toast global do app se disponível, senão implementa local
        if (window.showToast) {
            window.showToast(msg, type);
        } else {
            const toast = document.getElementById('toast');
            if (!toast) return;
            toast.textContent = msg;
            toast.className = `toast ${type ? 'toast-' + type : ''}`;
            toast.classList.remove('hidden');
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => toast.classList.add('hidden'), 3500);
        }
    }
};

// Inicializa no carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
    LoginModule.init();
});

// Exporta globalmente
window.LoginModule = LoginModule;
