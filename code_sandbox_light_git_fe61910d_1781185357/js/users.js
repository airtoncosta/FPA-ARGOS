/**
 * ARGOS FPA — users.js
 * Lógica do painel de Gerenciamento de Usuários (Apenas ADM)
 */

const UsersModule = {
    dbKey: 'argos_users_db',
    users: [],
    currentHistoryData: [],
    currentHistoryUser: null,

    init() {
        this.loadUsers();
        this.bindEvents();
    },

    async loadUsers() {
        try {
            if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                this.users = await window.SupabaseService.getUsers();
            } else {
                this.users = JSON.parse(localStorage.getItem(this.dbKey) || '[]');
            }
        } catch(e) {
            console.error("Erro ao carregar usuários:", e);
            this.users = [];
        }
        this.renderKPIs();
        this.renderTable(this.users);
    },

    saveUsersLocal() {
        localStorage.setItem(this.dbKey, JSON.stringify(this.users));
        this.loadUsers();
    },

    bindEvents() {
        const btnNovo = document.getElementById('btnNovoUsuario');
        const btnCloseModal = document.getElementById('btnCloseModalUser');
        const btnCancel = document.getElementById('btnCancelUser');
        const formUser = document.getElementById('formUser');
        const searchInput = document.getElementById('searchUser');
        const btnBack = document.getElementById('btnBackToUsers');
        const btnApplyHistoryFilters = document.getElementById('btnApplyHistoryFilters');
        const btnClearHistoryFilters = document.getElementById('btnClearHistoryFilters');

        if (btnNovo) btnNovo.addEventListener('click', () => this.openModal());
        if (btnCloseModal) btnCloseModal.addEventListener('click', () => this.closeModal());
        if (btnCancel) btnCancel.addEventListener('click', () => this.closeModal());
        if (formUser) formUser.addEventListener('submit', (e) => this.handleSaveUser(e));
        if (btnBack) btnBack.addEventListener('click', () => this.backToUserList());
        if (btnApplyHistoryFilters) btnApplyHistoryFilters.addEventListener('click', () => this.applyHistoryFilters());
        if (btnClearHistoryFilters) btnClearHistoryFilters.addEventListener('click', () => this.clearHistoryFilters());
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = this.users.filter(u => 
                    u.name.toLowerCase().includes(term) || 
                    u.username.toLowerCase().includes(term) ||
                    (u.email && u.email.toLowerCase().includes(term))
                );
                this.renderTable(filtered);
            });
        }

        // Se a seção for ativada, recarregar os dados
        document.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item[data-section="usuarios"]');
            if (navItem) {
                this.backToUserList();
                this.loadUsers();
            }
        });
    },

    renderKPIs() {
        const total = this.users.length;
        const ativos = this.users.filter(u => u.status === 'ATIVO').length;
        const bloqueados = this.users.filter(u => u.status === 'BLOQUEADO').length;
        const admins = this.users.filter(u => u.role === 'ADM').length;
        const superints = this.users.filter(u => u.role === 'SUPERINTENDENTE').length;
        const gerentes = this.users.filter(u => u.role === 'GERENTE').length;

        const updateEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        updateEl('kpiTotalUsers', total);
        updateEl('kpiAtivosUsers', ativos);
        updateEl('kpiBloqueadosUsers', bloqueados);
        updateEl('kpiAdminUsers', admins);
        updateEl('kpiSuperintUsers', superints);
        updateEl('kpiComumUsers', gerentes);
    },

    renderTable(userList) {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (userList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Nenhum usuário encontrado.</td></tr>';
            return;
        }

        const currentUser = this.getCurrentUser();

        userList.forEach(u => {
            const tr = document.createElement('tr');
            
            // Status Badge
            let statusBadge = `<span class="badge-action" style="background:#e8f5e9;color:#2e7d32;">Ativo</span>`;
            if (u.status === 'BLOQUEADO') statusBadge = `<span class="badge-action" style="background:#ffebee;color:#c62828;">Bloqueado</span>`;
            if (u.status === 'INATIVO') statusBadge = `<span class="badge-action" style="background:#eceff1;color:#546e7a;">Inativo</span>`;

            // Tentativas falhas
            const failedCount = this.getFailedAttempts(u);
            let failedHtml = '';
            if (failedCount > 0) {
                const badgeColor = failedCount >= 4 ? '#d32f2f' : '#f57c00';
                failedHtml = `<div style="font-size:0.7rem;color:${badgeColor};font-weight:600;margin-top:4px;"><i class="fas fa-exclamation-triangle"></i> Falhas: ${failedCount}/5</div>`;
            }

            // Role Badge
            let roleBadge = `<span class="badge-action" style="background:#fff3e0;color:#ef6c00;">Administrador</span>`;
            if (u.role === 'SUPERINTENDENTE') roleBadge = `<span class="badge-action" style="background:rgba(224, 64, 251, 0.12);color:#e040fb; border: 1px solid rgba(224, 64, 251, 0.25);">Superintendente</span>`;
            if (u.role === 'GERENTE') roleBadge = `<span class="badge-action" style="background:#e3f2fd;color:#1565c0;">Gerente</span>`;

            // Data último login
            const lastLogin = this.getLastLogin(u.username);
            
            const isMe = currentUser && currentUser.username === u.username;
            const nameSpan = `<span class="clickable-user-name" onclick="UsersModule.viewUserHistory('${u.username}', '${u.name}')" style="color: var(--sus-blue); cursor: pointer; font-weight: 700; transition: color 0.2s;" onmouseover="this.style.color='var(--sus-blue-light)'; this.style.textDecoration='underline';" onmouseout="this.style.color='var(--sus-blue)'; this.style.textDecoration='none';">${u.name}</span>`;
            const nameHtml = isMe ? `${nameSpan} <span style="background:#e0f2f1;color:#00796b;font-size:0.6rem;padding:2px 6px;border-radius:10px;margin-left:5px;">Você</span>` : nameSpan;

            const registerDate = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : (u.createdAt ? u.createdAt.split(',')[0] : '-');

            tr.innerHTML = `
                <td style="font-weight:600;">${nameHtml}</td>
                <td>${u.email}</td>
                <td>${roleBadge}</td>
                <td>${statusBadge}${failedHtml}</td>
                <td>${registerDate}</td>
                <td>${lastLogin}</td>
                <td style="text-align:right;">
                    ${this.getActionButtons(u, isMe, failedCount)}
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    getActionButtons(user, isMe, failedCount) {
        let html = '';
        
        // Editar
        html += `<button class="btn-user-action btn-edit" title="Editar Usuário" onclick="UsersModule.editUser('${user.username}')"><i class="fas fa-pencil-alt"></i></button>`;
        
        // Redefinir Senha
        html += `<button class="btn-user-action btn-key" title="Redefinir Senha" onclick="UsersModule.resetPassword('${user.username}')"><i class="fas fa-key"></i></button>`;

        // Zerar tentativas (se não for o próprio usuário, sempre visível para facilitar auditoria)
        if (!isMe) {
            html += `<button class="btn-user-action btn-reset-attempts" title="Zerar Tentativas Falhas" onclick="UsersModule.resetFailedAttempts('${user.username}')"><i class="fas fa-redo"></i></button>`;
        }

        // Bloquear (Se não for eu mesmo)
        if (!isMe) {
            if (user.status === 'BLOQUEADO') {
                html += `<button class="btn-user-action btn-unlock" title="Desbloquear/Ativar Usuário" onclick="UsersModule.toggleBlock('${user.username}')"><i class="fas fa-lock-open"></i></button>`;
            } else {
                html += `<button class="btn-user-action btn-lock" title="Bloquear Usuário" onclick="UsersModule.toggleBlock('${user.username}')"><i class="fas fa-lock"></i></button>`;
            }
            
            // Excluir
            html += `<button class="btn-user-action btn-delete" title="Excluir Usuário" onclick="UsersModule.deleteUser('${user.username}')"><i class="fas fa-trash"></i></button>`;
        } else {
            // Placeholder para alinhar botões quando é o próprio admin
            html += `<button class="btn-user-action" style="visibility:hidden;"><i class="fas fa-lock"></i></button>`;
        }

        return `<div class="action-buttons-group">${html}</div>`;
    },

    getCurrentUser() {
        const str = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        if (str) return JSON.parse(str);
        return null;
    },

    getLastLogin(username) {
        let history = [];
        try { history = JSON.parse(localStorage.getItem('argos_user_history') || '[]'); } catch(e){}
        const logins = history.filter(h => h.action === 'LOGIN' && h.user === username);
        if (logins.length > 0) return AccountModule.formatDateStr(logins[0].date);
        return '-';
    },

    openModal(userLogin = null) {
        const modal = document.getElementById('modalUser');
        const form = document.getElementById('formUser');
        const title = document.getElementById('modalUserTitle');
        const divPassword = document.getElementById('divUserPassword');
        const passInput = document.getElementById('userPassword');
        
        // v4.0: Campos multi-município
        const divMulti = document.getElementById('divMultiMunicipio');
        const chkMulti = document.getElementById('userMultiMunicipio');
        const selectVinculado = document.getElementById('userMunicipioVinculado');
        const divVinculado = document.getElementById('divMunicipioVinculado');
        const roleSelect = document.getElementById('userRole');

        // Permissões Customizadas para Superintendente
        const divPermissoesCustom = document.getElementById('divPermissoesCustom');
        const chkPermUsuarios = document.getElementById('permUsuarios');
        const chkPermImportar = document.getElementById('permImportar');
        const chkPermLimparDB = document.getElementById('permLimparDB');
        const chkPermConfigSupabase = document.getElementById('permConfigSupabase');
        
        // Mostrar campos dependendo da role selecionada no dropdown
        const handleRoleChange = () => {
            const r = roleSelect.value;
            if (r === 'SUPERINTENDENTE') {
                if(divPermissoesCustom) divPermissoesCustom.style.display = 'block';
                if(divMulti) divMulti.style.display = 'none';
                if(divVinculado) divVinculado.style.display = 'none';
            } else if (r === 'GERENTE') {
                if(divPermissoesCustom) divPermissoesCustom.style.display = 'none';
                if(divMulti) divMulti.style.display = 'block';
                if(chkMulti && chkMulti.checked) {
                    if(divVinculado) divVinculado.style.display = 'none';
                } else {
                    if(divVinculado) divVinculado.style.display = 'block';
                }
            } else { // ADM
                if(divPermissoesCustom) divPermissoesCustom.style.display = 'none';
                if(divMulti) divMulti.style.display = 'block';
                if(chkMulti && chkMulti.checked) {
                    if(divVinculado) divVinculado.style.display = 'none';
                } else {
                    if(divVinculado) divVinculado.style.display = 'block';
                }
            }
        };

        if(roleSelect) roleSelect.onchange = handleRoleChange;
        
        // Popular dropdown de municípios vinculados
        if (selectVinculado && window.MUNICIPIOS_BR) {
            const options = ['<option value="Bacabal-MA">Bacabal-MA</option>'];
            Object.keys(window.MUNICIPIOS_BR).sort().forEach(uf => {
                window.MUNICIPIOS_BR[uf].forEach(nome => {
                    const val = `${nome}-${uf}`;
                    if (val !== 'Bacabal-MA') {
                        options.push(`<option value="${val}">${val}</option>`);
                    }
                });
            });
            selectVinculado.innerHTML = options.join('');
        }
        
        // Toggle: esconder dropdown quando checkbox marcado (Apenas para ADM)
        if (chkMulti && divVinculado) {
            chkMulti.onchange = () => {
                if(roleSelect.value === 'ADM') {
                    divVinculado.style.display = chkMulti.checked ? 'none' : 'block';
                }
            };
        }
        
        form.reset();

        if (userLogin) {
            const user = this.users.find(u => u.username === userLogin);
            if (!user) return;

            title.textContent = 'Editar Usuário';
            document.getElementById('userOriginalLogin').value = user.username;
            document.getElementById('userName').value = user.name;
            document.getElementById('userEmail').value = user.email;
            if(roleSelect) roleSelect.value = user.role || 'GERENTE';
            
            // v4.0: Preencher campos multi-município e permissões
            if (chkMulti) chkMulti.checked = user.acesso_multi_municipio === true;
            if (selectVinculado) selectVinculado.value = user.municipio_vinculado || 'Bacabal-MA';
            
            if (chkPermUsuarios) chkPermUsuarios.checked = user.perm_usuarios || false;
            if (chkPermImportar) chkPermImportar.checked = user.perm_importar || false;
            if (chkPermLimparDB) chkPermLimparDB.checked = user.perm_limpar_db || false;
            if (chkPermConfigSupabase) chkPermConfigSupabase.checked = user.perm_config_supabase || false;

            handleRoleChange();
            
            // Ocultar campo de senha na edição
            divPassword.style.display = 'none';
            passInput.removeAttribute('required');
        } else {
            title.textContent = 'Novo Usuário';
            document.getElementById('userOriginalLogin').value = '';
            divPassword.style.display = 'block';
            passInput.setAttribute('required', 'true');
            
            // v4.0: Reset para novo usuário
            if (chkMulti) chkMulti.checked = false;
            if (selectVinculado) selectVinculado.value = 'Bacabal-MA';
            
            if (chkPermUsuarios) chkPermUsuarios.checked = true;
            if (chkPermImportar) chkPermImportar.checked = true;
            if (chkPermLimparDB) chkPermLimparDB.checked = false;
            if (chkPermConfigSupabase) chkPermConfigSupabase.checked = false;
            
            if(roleSelect) roleSelect.value = 'GERENTE';
            handleRoleChange();
        }

        modal.classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('modalUser').classList.add('hidden');
    },

    async handleSaveUser(e) {
        e.preventDefault();
        
        const originalLogin = document.getElementById('userOriginalLogin').value;
        const name = document.getElementById('userName').value.trim();
        const email = document.getElementById('userEmail').value.trim();
        const role = document.getElementById('userRole').value;
        
        // O username será baseado no email para novos usuários, mas preservado na edição
        const username = originalLogin ? originalLogin : email;

        const isOnline = window.SupabaseConfig && window.SupabaseConfig.isConnected();
        const loggedUser = this.getCurrentUser();

        if (originalLogin) {
            // --- EDIÇÃO ---
            const userIndex = this.users.findIndex(u => u.username === originalLogin);
            if (userIndex > -1) {
                // Verificar se novo email já existe em outro user
                const emailExists = this.users.find(u => u.username === username && u.username !== originalLogin);
                if (emailExists) {
                    alert('Este E-mail/Login já está sendo usado por outro usuário!');
                    return;
                }

                const updatedUser = {
                    ...this.users[userIndex],
                    name: name,
                    email: email,
                    username: username,
                    role: role,
                    acesso_multi_municipio: document.getElementById('userMultiMunicipio')?.checked || false,
                    municipio_vinculado: document.getElementById('userMunicipioVinculado')?.value || 'Bacabal-MA',
                    perm_usuarios: document.getElementById('permUsuarios')?.checked || false,
                    perm_importar: document.getElementById('permImportar')?.checked || false,
                    perm_limpar_db: document.getElementById('permLimparDB')?.checked || false,
                    perm_config_supabase: document.getElementById('permConfigSupabase')?.checked || false
                };

                if (isOnline) {
                    try {
                        await window.SupabaseService.upsertUser(updatedUser);
                        if (loggedUser) {
                            await window.SupabaseService.logAction(loggedUser.username, 'USUARIOS', 'EDICAO_USUARIO', `Usuário ${name} (${username}) editado.`);
                        }
                    } catch (err) {
                        alert("Erro ao salvar no Supabase: " + err.message);
                        return;
                    }
                } else {
                    this.users[userIndex] = updatedUser;
                    this.saveUsersLocal();
                }

                // Se o usuário editou a si mesmo, atualizar a sessão ativa no navegador
                if (loggedUser && loggedUser.username === username) {
                    if (sessionStorage.getItem('argos_user')) {
                        sessionStorage.setItem('argos_user', JSON.stringify(updatedUser));
                    }
                    if (localStorage.getItem('argos_user')) {
                        localStorage.setItem('argos_user', JSON.stringify(updatedUser));
                    }
                }

                await this.loadUsers();
                if (window.LoginModule) LoginModule.showToast('Usuário atualizado com sucesso!', 'success');
                this.closeModal();
            }
        } else {
            // --- NOVO USUÁRIO ---
            const password = document.getElementById('userPassword').value;
            
            // Validar regras de senha
            if (window.LoginModule && !window.LoginModule.validatePasswordRules(password)) {
                alert('A senha inicial não cumpre os requisitos de complexidade exigidos (letras, números e caracteres especiais).');
                return;
            }

            const emailExists = this.users.find(u => u.username === username);
            if (emailExists) {
                alert('Este E-mail/Login já está cadastrado!');
                return;
            }

            const pad = (n) => n.toString().padStart(2, '0');
            const d = new Date();
            const created = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

            const newUser = {
                username: username,
                email: email,
                name: name,
                password: password,
                role: role,
                status: 'ATIVO',
                createdAt: created,
                acesso_multi_municipio: document.getElementById('userMultiMunicipio')?.checked || false,
                municipio_vinculado: document.getElementById('userMunicipioVinculado')?.value || 'Bacabal-MA',
                perm_usuarios: document.getElementById('permUsuarios')?.checked || false,
                perm_importar: document.getElementById('permImportar')?.checked || false,
                perm_limpar_db: document.getElementById('permLimparDB')?.checked || false,
                perm_config_supabase: document.getElementById('permConfigSupabase')?.checked || false
            };

            if (isOnline) {
                try {
                    await window.SupabaseService.upsertUser(newUser);
                    if (loggedUser) {
                        await window.SupabaseService.logAction(loggedUser.username, 'USUARIOS', 'CADASTRO_USUARIO', `Novo usuário ${name} (${username}) cadastrado.`);
                    }
                } catch (err) {
                    alert("Erro ao salvar no Supabase: " + err.message);
                    return;
                }
            } else {
                this.users.unshift(newUser);
                this.saveUsersLocal();
            }

            await this.loadUsers();
            if (window.LoginModule) LoginModule.showToast('Usuário criado com sucesso!', 'success');
            this.closeModal();
        }
    },

    editUser(login) {
        this.openModal(login);
    },

    async toggleBlock(login) {
        const user = this.users.find(u => u.username === login);
        if (!user) return;

        const isOnline = window.SupabaseConfig && window.SupabaseConfig.isConnected();
        const loggedUser = this.getCurrentUser();
        let newStatus = '';

        if (user.status === 'BLOQUEADO') {
            newStatus = 'ATIVO';
        } else {
            if (confirm(`Tem certeza que deseja bloquear o acesso de ${user.name}?`)) {
                newStatus = 'BLOQUEADO';
            } else {
                return;
            }
        }

        if (isOnline) {
            try {
                await window.SupabaseService.updateUserStatus(login, newStatus);
                if (loggedUser) {
                    await window.SupabaseService.logAction(loggedUser.username, 'USUARIOS', 'STATUS_USUARIO', `Usuário ${user.name} alterado para status ${newStatus}.`);
                }
                if (window.LoginModule) LoginModule.showToast(`Usuário ${user.name} está ${newStatus === 'ATIVO' ? 'desbloqueado' : 'bloqueado'}.`, 'success');
            } catch (err) {
                alert("Erro ao atualizar status no Supabase: " + err.message);
                return;
            }
        } else {
            user.status = newStatus;
            this.saveUsersLocal();
            if (window.LoginModule) LoginModule.showToast(`Usuário ${user.name} está ${newStatus === 'ATIVO' ? 'desbloqueado' : 'bloqueado'}.`, 'success');
        }
        await this.loadUsers();
    },

    async deleteUser(login) {
        const user = this.users.find(u => u.username === login);
        if (!user) return;

        if (confirm(`Atenção: Tem certeza que deseja excluir permanentemente o usuário ${user.name}?`)) {
            const isOnline = window.SupabaseConfig && window.SupabaseConfig.isConnected();
            const loggedUser = this.getCurrentUser();

            if (isOnline) {
                try {
                    await window.SupabaseService.deleteUser(login);
                    if (loggedUser) {
                        await window.SupabaseService.logAction(loggedUser.username, 'USUARIOS', 'EXCLUSAO_USUARIO', `Usuário ${user.name} (${login}) excluído.`);
                    }
                } catch (err) {
                    alert("Erro ao excluir usuário no Supabase: " + err.message);
                    return;
                }
            } else {
                const userIndex = this.users.findIndex(u => u.username === login);
                if (userIndex > -1) {
                    this.users.splice(userIndex, 1);
                    this.saveUsersLocal();
                }
            }
            await this.loadUsers();
            if (window.LoginModule) LoginModule.showToast('Usuário excluído com sucesso.', 'info');
        }
    },

    async resetPassword(login) {
        const user = this.users.find(u => u.username === login);
        if (!user) return;

        const newPass = prompt(`Digite a nova senha para ${user.name}:\n(Deve conter letras, números e especial)`);
        if (!newPass) return; // Cancelou

        if (window.LoginModule && !window.LoginModule.validatePasswordRules(newPass)) {
            alert('A nova senha NÃO cumpre os requisitos de complexidade exigidos.');
            return;
        }

        const isOnline = window.SupabaseConfig && window.SupabaseConfig.isConnected();
        const loggedUser = this.getCurrentUser();

        if (isOnline) {
            try {
                await window.SupabaseService.resetPassword(login, newPass);
                if (loggedUser) {
                    await window.SupabaseService.logAction(loggedUser.username, 'USUARIOS', 'SENHA_USUARIO', `Senha de ${user.name} redefinida.`);
                }
            } catch (err) {
                alert("Erro ao redefinir senha no Supabase: " + err.message);
                return;
            }
        } else {
            user.password = newPass;
            this.saveUsersLocal();
        }
        if (window.LoginModule) LoginModule.showToast(`Senha redefinida para ${user.name}.`, 'success');
    },

    async viewUserHistory(username, fullName) {
        this.currentHistoryUser = username;
        
        const listContainer = document.getElementById('users-list-container');
        const historyContainer = document.getElementById('users-history-container');
        const labelUser = document.getElementById('historySelectedUser');
        const btnNovoUsuario = document.getElementById('btnNovoUsuario');

        if (!listContainer || !historyContainer || !labelUser || !btnNovoUsuario) return;

        // Ocultar a lista de usuários e o botão de criar novo
        listContainer.classList.add('hidden');
        btnNovoUsuario.classList.add('hidden');
        historyContainer.classList.remove('hidden');

        labelUser.textContent = fullName;
        this.clearHistoryFilters(); // Zera os campos visualmente antes de carregar
        
        const tbody = document.getElementById('userSingleHistoryTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Carregando histórico...</td></tr>';
        }

        // Buscar histórico do usuário
        let userHistory = [];
        if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
            try {
                userHistory = await window.SupabaseService.getUserActionHistory(username);
            } catch (err) {
                console.error("Erro ao buscar logs do Supabase, usando local:", err);
                let history = [];
                try { history = JSON.parse(localStorage.getItem('argos_user_history') || '[]'); } catch(e){}
                userHistory = history.filter(h => h.user === username);
            }
        } else {
            let history = [];
            try { history = JSON.parse(localStorage.getItem('argos_user_history') || '[]'); } catch(e){}
            userHistory = history.filter(h => h.user === username);
        }

        this.currentHistoryData = userHistory;
        this.renderHistoryTable(userHistory);
    },

    renderHistoryTable(historyList) {
        const tbody = document.getElementById('userSingleHistoryTableBody');
        if (!tbody) return;

        if (historyList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;padding:20px;">Nenhum registro de ação atende aos filtros aplicados.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        historyList.forEach(reg => {
            const tr = document.createElement('tr');
            
            const dateStr = AccountModule.formatDateStr(reg.date);
            const badgeClass = reg.action === 'LOGIN' ? 'badge-login' : 
                               reg.action === 'LOGOUT' ? 'badge-logout' : 'badge-general';

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td><span class="badge-action ${badgeClass}">${reg.action}</span></td>
                <td>${reg.module}</td>
                <td>${reg.desc}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    applyHistoryFilters() {
        const startDateVal = document.getElementById('historyFilterStartDate').value;
        const endDateVal = document.getElementById('historyFilterEndDate').value;
        const actionVal = document.getElementById('historyFilterAction').value;
        const moduleVal = document.getElementById('historyFilterModule').value;

        let filtered = [...this.currentHistoryData];

        // Filtro por data de início
        if (startDateVal) {
            const start = new Date(startDateVal + 'T00:00:00');
            filtered = filtered.filter(h => {
                const date = new Date(h.date);
                return date >= start;
            });
        }

        // Filtro por data de término
        if (endDateVal) {
            const end = new Date(endDateVal + 'T23:59:59');
            filtered = filtered.filter(h => {
                const date = new Date(h.date);
                return date <= end;
            });
        }

        // Filtro por ação
        if (actionVal !== 'all') {
            filtered = filtered.filter(h => h.action === actionVal);
        }

        // Filtro por módulo
        if (moduleVal !== 'all') {
            filtered = filtered.filter(h => h.module === moduleVal);
        }

        this.renderHistoryTable(filtered);
    },

    clearHistoryFilters() {
        const start = document.getElementById('historyFilterStartDate');
        const end = document.getElementById('historyFilterEndDate');
        const action = document.getElementById('historyFilterAction');
        const module = document.getElementById('historyFilterModule');

        if (start) start.value = '';
        if (end) end.value = '';
        if (action) action.value = 'all';
        if (module) module.value = 'all';

        this.renderHistoryTable(this.currentHistoryData);
    },

    backToUserList() {
        const listContainer = document.getElementById('users-list-container');
        const historyContainer = document.getElementById('users-history-container');
        const btnNovoUsuario = document.getElementById('btnNovoUsuario');

        if (listContainer && historyContainer && btnNovoUsuario) {
            listContainer.classList.remove('hidden');
            btnNovoUsuario.classList.remove('hidden');
            historyContainer.classList.add('hidden');
        }
    },

    getFailedAttempts(user) {
        if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
            return parseInt(localStorage.getItem('failed_attempts_' + user.username) || '0');
        }
        return user.failedAttempts || 0;
    },

    async resetFailedAttempts(username) {
        const isOnline = window.SupabaseConfig && window.SupabaseConfig.isConnected();
        const loggedUser = this.getCurrentUser();
        const user = this.users.find(u => u.username === username);

        if (!user) return;

        if (isOnline) {
            // Zerar localmente para o navegador do admin
            localStorage.removeItem('failed_attempts_' + username);
            
            // Se o usuário estiver BLOQUEADO, desbloqueia ele na nuvem (status -> ATIVO)
            if (user.status === 'BLOQUEADO') {
                try {
                    await window.SupabaseService.updateUserStatus(username, 'ATIVO');
                    if (loggedUser) {
                        await window.SupabaseService.logAction(loggedUser.username, 'USUARIOS', 'STATUS_USUARIO', `Conta de ${user.name} desbloqueada e tentativas resetadas.`);
                    }
                } catch (err) {
                    alert("Erro ao desbloquear usuário no Supabase: " + err.message);
                    return;
                }
            }
        } else {
            user.failedAttempts = 0;
            if (user.status === 'BLOQUEADO') {
                user.status = 'ATIVO';
            }
            this.saveUsersLocal();
        }
        
        await this.loadUsers();
        if (window.LoginModule) LoginModule.showToast(`Contador de tentativas de ${user.name} zerado com sucesso!`, 'success');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    UsersModule.init();
});

window.UsersModule = UsersModule;
