/**
 * ARGOS FPA — users.js
 * Lógica do painel de Gerenciamento de Usuários (Apenas ADM)
 */

const UsersModule = {
    dbKey: 'argos_users_db',
    users: [],

    init() {
        this.loadUsers();
        this.bindEvents();
    },

    loadUsers() {
        try {
            this.users = JSON.parse(localStorage.getItem(this.dbKey) || '[]');
        } catch(e) {
            this.users = [];
        }
        this.renderKPIs();
        this.renderTable(this.users);
    },

    saveUsers() {
        localStorage.setItem(this.dbKey, JSON.stringify(this.users));
        this.loadUsers();
    },

    bindEvents() {
        const btnNovo = document.getElementById('btnNovoUsuario');
        const btnCloseModal = document.getElementById('btnCloseModalUser');
        const btnCancel = document.getElementById('btnCancelUser');
        const formUser = document.getElementById('formUser');
        const searchInput = document.getElementById('searchUser');

        if (btnNovo) btnNovo.addEventListener('click', () => this.openModal());
        if (btnCloseModal) btnCloseModal.addEventListener('click', () => this.closeModal());
        if (btnCancel) btnCancel.addEventListener('click', () => this.closeModal());
        if (formUser) formUser.addEventListener('submit', (e) => this.handleSaveUser(e));
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = this.users.filter(u => 
                    u.name.toLowerCase().includes(term) || 
                    u.username.toLowerCase().includes(term) ||
                    u.email.toLowerCase().includes(term)
                );
                this.renderTable(filtered);
            });
        }

        // Se a seção for ativada, recarregar os dados
        document.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item[data-section="usuarios"]');
            if (navItem) {
                this.loadUsers();
            }
        });
    },

    renderKPIs() {
        const total = this.users.length;
        const ativos = this.users.filter(u => u.status === 'ATIVO').length;
        const bloqueados = this.users.filter(u => u.status === 'BLOQUEADO').length;
        const admins = this.users.filter(u => u.role === 'ADM').length;
        const gerentes = this.users.filter(u => u.role === 'GERENTE').length;

        const updateEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        updateEl('kpiTotalUsers', total);
        updateEl('kpiAtivosUsers', ativos);
        updateEl('kpiBloqueadosUsers', bloqueados);
        updateEl('kpiAdminUsers', admins);
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

            // Role Badge
            let roleBadge = `<span class="badge-action" style="background:#fff3e0;color:#ef6c00;">Administrador</span>`;
            if (u.role === 'GERENTE') roleBadge = `<span class="badge-action" style="background:#e3f2fd;color:#1565c0;">Gerente</span>`;

            // Data último login
            const lastLogin = this.getLastLogin(u.username);
            
            const isMe = currentUser && currentUser.username === u.username;
            const nameHtml = isMe ? `${u.name} <span style="background:#e0f2f1;color:#00796b;font-size:0.6rem;padding:2px 6px;border-radius:10px;margin-left:5px;">Você</span>` : u.name;

            tr.innerHTML = `
                <td style="font-weight:600;">${nameHtml}</td>
                <td>${u.email}</td>
                <td>${roleBadge}</td>
                <td>${statusBadge}</td>
                <td>${u.createdAt || '-'}</td>
                <td>${lastLogin}</td>
                <td style="text-align:right;">
                    ${this.getActionButtons(u, isMe)}
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    getActionButtons(user, isMe) {
        let html = '';
        
        // Editar
        html += `<button class="btn-user-action btn-edit" title="Editar Usuário" onclick="UsersModule.editUser('${user.username}')"><i class="fas fa-pencil-alt"></i></button>`;
        
        // Redefinir Senha
        html += `<button class="btn-user-action btn-key" title="Redefinir Senha" onclick="UsersModule.resetPassword('${user.username}')"><i class="fas fa-key"></i></button>`;

        // Bloquear (Se não for eu mesmo)
        if (!isMe) {
            if (user.status === 'BLOQUEADO') {
                html += `<button class="btn-user-action btn-unlock" title="Desbloquear Usuário" onclick="UsersModule.toggleBlock('${user.username}')"><i class="fas fa-lock-open"></i></button>`;
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
        
        form.reset();

        if (userLogin) {
            const user = this.users.find(u => u.username === userLogin);
            if (!user) return;

            title.textContent = 'Editar Usuário';
            document.getElementById('userOriginalLogin').value = user.username;
            document.getElementById('userName').value = user.name;
            document.getElementById('userEmail').value = user.email;
            document.getElementById('userRole').value = user.role;
            
            // Ocultar campo de senha na edição (senha é feita por botão específico)
            divPassword.style.display = 'none';
            passInput.removeAttribute('required');
        } else {
            title.textContent = 'Novo Usuário';
            document.getElementById('userOriginalLogin').value = '';
            divPassword.style.display = 'block';
            passInput.setAttribute('required', 'true');
        }

        modal.classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('modalUser').classList.add('hidden');
    },

    handleSaveUser(e) {
        e.preventDefault();
        
        const originalLogin = document.getElementById('userOriginalLogin').value;
        const name = document.getElementById('userName').value.trim();
        const email = document.getElementById('userEmail').value.trim();
        const role = document.getElementById('userRole').value;
        
        // Simular username baseado no email para o sistema
        const username = email;

        if (originalLogin) {
            // Edição
            const userIndex = this.users.findIndex(u => u.username === originalLogin);
            if (userIndex > -1) {
                // Verificar se novo email já existe em outro user
                const emailExists = this.users.find(u => u.username === username && u.username !== originalLogin);
                if (emailExists) {
                    alert('Este E-mail/Login já está sendo usado por outro usuário!');
                    return;
                }

                this.users[userIndex].name = name;
                this.users[userIndex].email = email;
                this.users[userIndex].username = username;
                this.users[userIndex].role = role;
                
                this.saveUsers();
                if (window.LoginModule) LoginModule.showToast('Usuário atualizado com sucesso!', 'success');
                this.closeModal();
            }
        } else {
            // Novo
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
                createdAt: created
            };

            this.users.unshift(newUser);
            this.saveUsers();
            if (window.LoginModule) LoginModule.showToast('Usuário criado com sucesso!', 'success');
            this.closeModal();
        }
    },

    editUser(login) {
        this.openModal(login);
    },

    toggleBlock(login) {
        const user = this.users.find(u => u.username === login);
        if (!user) return;

        if (user.status === 'BLOQUEADO') {
            user.status = 'ATIVO';
            if (window.LoginModule) LoginModule.showToast(`Usuário ${user.name} foi desbloqueado.`, 'success');
        } else {
            if (confirm(`Tem certeza que deseja bloquear o acesso de ${user.name}?`)) {
                user.status = 'BLOQUEADO';
                if (window.LoginModule) LoginModule.showToast(`Usuário ${user.name} bloqueado.`, 'warn');
            } else {
                return;
            }
        }
        this.saveUsers();
    },

    deleteUser(login) {
        const userIndex = this.users.findIndex(u => u.username === login);
        if (userIndex === -1) return;

        if (confirm(`Atenção: Tem certeza que deseja excluir permanentemente o usuário ${this.users[userIndex].name}?`)) {
            this.users.splice(userIndex, 1);
            this.saveUsers();
            if (window.LoginModule) LoginModule.showToast('Usuário excluído com sucesso.', 'info');
        }
    },

    resetPassword(login) {
        const user = this.users.find(u => u.username === login);
        if (!user) return;

        const newPass = prompt(`Digite a nova senha para ${user.name}:\n(Deve conter letras, números e especial)`);
        if (!newPass) return; // Cancelou

        if (window.LoginModule && !window.LoginModule.validatePasswordRules(newPass)) {
            alert('A nova senha NÃO cumpre os requisitos de complexidade exigidos.');
            return;
        }

        user.password = newPass;
        this.saveUsers();
        if (window.LoginModule) LoginModule.showToast(`Senha redefinida para ${user.name}.`, 'success');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    UsersModule.init();
});
