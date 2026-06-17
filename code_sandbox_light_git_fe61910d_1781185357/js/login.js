/**
 * ARGOS FPA — login.js
 * Gerenciamento de Autenticação, Perfis de Usuário e Segurança de Acesso
 */

const ARGOS_USERS = [
    { 
        username: 'airton', 
        email: 'airton.costa@yahoo.com.br', 
        name: 'Airton Costa', 
        password: 'airton@2026', 
        role: 'ADM' 
    },
    { 
        username: 'francileide', 
        email: 'francileide@fpa.gov.br', 
        name: 'Francileide', 
        password: 'francileide@2026', 
        role: 'GERENTE' 
    },
    { 
        username: 'jessica', 
        email: 'jessica@fpa.gov.br', 
        name: 'Jessica', 
        password: 'jessica@2026', 
        role: 'GERENTE' 
    },
    { 
        username: 'aline', 
        email: 'aline@fpa.gov.br', 
        name: 'Aline', 
        password: 'aline@2026', 
        role: 'GERENTE' 
    },
    { 
        username: 'ewerton', 
        email: 'ewerton@fpa.gov.br', 
        name: 'Ewerton', 
        password: 'ewerton@2026', 
        role: 'GERENTE' 
    },
    { 
        username: 'mariline', 
        email: 'mariline@fpa.gov.br', 
        name: 'Mariline', 
        password: 'mariline@2026', 
        role: 'GERENTE' 
    },
    { 
        username: 'flavia', 
        email: 'flavia@fpa.gov.br', 
        name: 'Flavia', 
        password: 'flavia@2026', 
        role: 'GERENTE' 
    }
];

const LoginModule = {
    init() {
        // Forçar rebuild do banco local caso não tenha as novas atualizações
        let dbStr = localStorage.getItem('argos_users_db');
        if (dbStr && !dbStr.includes('francileide')) {
            localStorage.removeItem('argos_users_db');
            dbStr = null;
        }

        // Inicializar banco de usuários se não existir
        if (!dbStr) {
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
            btnLogout.addEventListener('click', () => {
                this.handleLogout();
            });
        }
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
                    if (res.isPasswordWrong && res.user) {
                        // Incrementar tentativas falhas no Supabase via Relação Local/Remota
                        let failedAttempts = parseInt(localStorage.getItem('failed_attempts_' + res.user.username) || '0');
                        failedAttempts++;
                        
                        if (failedAttempts >= 5) {
                            await window.SupabaseService.updateUserStatus(res.user.username, 'BLOQUEADO');
                            localStorage.removeItem('failed_attempts_' + res.user.username);
                            this.showToast('⛔ CONTA BLOQUEADA: Você excedeu o limite de 5 tentativas inválidas. Contate o Administrador.', 'error');
                        } else {
                            localStorage.setItem('failed_attempts_' + res.user.username, failedAttempts);
                            this.showToast(`❌ Senha incorreta. Tentativa ${failedAttempts} de 5.`, 'error');
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
                    role: user.role
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
        try { dbUsers = JSON.parse(localStorage.getItem('argos_users_db') || '[]'); } catch(e){}
        if(dbUsers.length === 0) dbUsers = ARGOS_USERS; // fallback

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

        // Validar a senha correspondente
        if (user.password !== passwordVal) {
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
            role: user.role
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
            } catch(e) {
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
            } catch(e) {
                console.error("Erro ao carregar SIGTAP no login:", e);
            }
        }

        // Dispara re-render da central de arquivos caso o app principal esteja carregado
        if (window.renderArquivosManager) {
            await window.renderArquivosManager();
        }
    },

    applyPermissions(role) {
        // Obter elementos interativos para restrição
        const btnLimpar = document.getElementById('btnLimparDados');
        const btnSupabase = document.getElementById('btnConfigSupabase');
        const btnImportar = document.getElementById('btnImportar');
        const btnImportarPage = document.getElementById('btnImportarArquivosPage');
        const btnUploadLogo = document.getElementById('btnUploadLogo');
        const btnExcluirLogo = document.getElementById('btnExcluirLogo');
        const btnUploadSigtap = document.getElementById('btnUploadSigtap');
        const navMenuAdmin = document.getElementById('navMenuAdmin'); // Container do Menu Administração

        // ADM -> Acesso a tudo
        if (role === 'ADM') {
            if (btnLimpar) btnLimpar.classList.remove('hidden');
            if (btnSupabase) btnSupabase.classList.remove('hidden');
            if (btnImportar) btnImportar.classList.remove('hidden');
            if (btnImportarPage) btnImportarPage.classList.remove('hidden');
            if (btnUploadLogo) btnUploadLogo.classList.remove('hidden');
            if (btnExcluirLogo) btnExcluirLogo.classList.remove('hidden');
            if (btnUploadSigtap) btnUploadSigtap.classList.remove('hidden');
            if (navMenuAdmin) navMenuAdmin.style.display = 'block';
        } 
        // GERENTE -> Não limpa DB nem configura Supabase, não acessa usuários
        else if (role === 'GERENTE') {
            if (btnLimpar) btnLimpar.classList.add('hidden');
            if (btnSupabase) btnSupabase.classList.add('hidden');
            if (btnImportar) btnImportar.classList.remove('hidden');
            if (btnImportarPage) btnImportarPage.classList.remove('hidden');
            if (btnUploadLogo) btnUploadLogo.classList.remove('hidden');
            if (btnExcluirLogo) btnExcluirLogo.classList.remove('hidden');
            if (btnUploadSigtap) btnUploadSigtap.classList.remove('hidden');
            if (navMenuAdmin) navMenuAdmin.style.display = 'none';
        }
    },

    checkSession() {
        const userStr = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                this.loginUI(user);
            } catch (e) {
                console.error("Erro ao ler sessão do usuário:", e);
                this.showLoginUI();
            }
        } else {
            this.showLoginUI();
        }
    },

    showLoginUI() {
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

    async handleLogout() {
        const userStr = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                await this.logAction(user.username, 'LOGOUT');
            } catch(e) {}
        }
        
        sessionStorage.removeItem('argos_user');
        localStorage.removeItem('argos_user');
        this.showToast('ℹ️ Você saiu do sistema.', 'info');
        
        // Retorna a navegação para a seção inicial default (Dashboard Executivo)
        if (window.navigateTo) {
            window.navigateTo('executivo');
        }

        // Limpa a tela Minha Conta imediatamente ao deslogar
        if (window.AccountModule) {
            await window.AccountModule.refreshAccountView();
        }

        this.showLoginUI();
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
        } catch(e){}
        
        history.unshift({
            date: new Date().toISOString(),
            user: username,
            action: action,
            module: 'SISTEMA',
            desc: desc
        });
        
        // Manter os últimos 100 registros locais
        if(history.length > 100) history = history.slice(0, 100);
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
