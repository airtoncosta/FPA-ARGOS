/**
 * ARGOS FPA — account.js
 * Gerenciamento da tela "Minha Conta" e Histórico de Ações
 */

const AccountModule = {
    async init() {
        await this.refreshAccountView();

        // Sempre que clicar no footer (botão do perfil), atualiza a view para dados em tempo real
        document.addEventListener('click', async (e) => {
            const footerUser = e.target.closest('#headerUser');
            if (footerUser) {
                await this.refreshAccountView();
            }
        });
    },

    async refreshAccountView() {
        await this.renderProfileData();
        await this.renderActionHistory();
    },

    async renderProfileData() {
        const userStr = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        const elNome = document.getElementById('accNome');
        const elUsername = document.getElementById('accUsername');
        const elRole = document.getElementById('accRole');
        const elLastLogin = document.getElementById('accLastLogin');

        if (!userStr) {
            if(elNome) elNome.textContent = '-';
            if(elUsername) elUsername.textContent = '-';
            if(elRole) elRole.textContent = '-';
            if(elLastLogin) elLastLogin.textContent = '-';
            return;
        }

        try {
            const user = JSON.parse(userStr);
            if(elNome) elNome.textContent = user.name || '-';
            if(elUsername) elUsername.textContent = user.email || user.username || '-';
            
            if(elRole) {
                let roleName = user.role;
                if(roleName === 'ADM') roleName = 'Administrador (ADM)';
                if(roleName === 'SUPERINTENDENTE') roleName = 'Superintendente';
                if(roleName === 'GERENTE') roleName = 'Gerente do Sistema';
                elRole.textContent = roleName;
            }

            // Busca último login do histórico do usuário
            let history = [];
            if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
                try {
                    history = await window.SupabaseService.getUserActionHistory(user.username);
                } catch (err) {
                    console.error("Erro ao carregar log no Supabase, usando local:", err);
                    history = JSON.parse(localStorage.getItem('argos_user_history') || '[]');
                }
            } else {
                try { history = JSON.parse(localStorage.getItem('argos_user_history') || '[]'); } catch(e){}
            }
            
            const logins = history.filter(h => h.action === 'LOGIN' && h.user === user.username);
            if(elLastLogin) {
                if (logins.length > 0) {
                    elLastLogin.textContent = this.formatDateStr(logins[0].date);
                } else {
                    elLastLogin.textContent = 'Indisponível';
                }
            }
        } catch(e) {
            console.error('Erro ao renderizar perfil:', e);
        }
    },

    async renderActionHistory() {
        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;

        const userStr = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        if (!userStr) {
            tbody.innerHTML = '';
            return;
        }
        
        let currentUser = null;
        try { currentUser = JSON.parse(userStr).username; } catch(e){}
        if (!currentUser) return;

        let userHistory = [];

        if (window.SupabaseConfig && window.SupabaseConfig.isConnected()) {
            try {
                userHistory = await window.SupabaseService.getUserActionHistory(currentUser);
            } catch (err) {
                console.error("Erro ao buscar logs do Supabase, usando local:", err);
                let history = [];
                try { history = JSON.parse(localStorage.getItem('argos_user_history') || '[]'); } catch(e){}
                userHistory = history.filter(h => h.user === currentUser);
            }
        } else {
            let history = [];
            try { history = JSON.parse(localStorage.getItem('argos_user_history') || '[]'); } catch(e){}
            userHistory = history.filter(h => h.user === currentUser);
        }

        if (userHistory.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">Nenhum registro de ação encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        userHistory.forEach(reg => {
            const tr = document.createElement('tr');
            
            const dateStr = this.formatDateStr(reg.date);
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

    formatDateStr(isoString) {
        if (!isoString) return '-';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        
        const pad = (n) => n.toString().padStart(2, '0');
        const day = pad(d.getDate());
        const mon = pad(d.getMonth() + 1);
        const yea = d.getFullYear();
        const hor = pad(d.getHours());
        const min = pad(d.getMinutes());
        const sec = pad(d.getSeconds());
        
        return `${day}/${mon}/${yea}, ${hor}:${min}:${sec}`;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    AccountModule.init();
});

window.AccountModule = AccountModule;
