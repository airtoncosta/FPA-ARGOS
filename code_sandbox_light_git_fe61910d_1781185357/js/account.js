/**
 * ARGOS FPA — account.js
 * Gerenciamento da tela "Minha Conta" e Histórico de Ações
 */

const AccountModule = {
    init() {
        this.renderProfileData();
        this.renderActionHistory();

        // Sempre que clicar no footer (botão do perfil), atualiza a view para dados em tempo real
        document.addEventListener('click', (e) => {
            const footerUser = e.target.closest('#headerUser');
            if (footerUser) {
                this.refreshAccountView();
            }
        });
    },

    refreshAccountView() {
        this.renderProfileData();
        this.renderActionHistory();
    },

    renderProfileData() {
        const userStr = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        if (!userStr) return;

        try {
            const user = JSON.parse(userStr);
            const elNome = document.getElementById('accNome');
            const elUsername = document.getElementById('accUsername');
            const elRole = document.getElementById('accRole');
            const elLastLogin = document.getElementById('accLastLogin');

            if(elNome) elNome.textContent = user.name || '-';
            if(elUsername) elUsername.textContent = user.email || user.username || '-';
            
            if(elRole) {
                let roleName = user.role;
                if(roleName === 'ADM') roleName = 'Administrador (ADM)';
                if(roleName === 'GERENTE') roleName = 'Gerente do Sistema';
                elRole.textContent = roleName;
            }

            // Busca último login do histórico do usuário
            let history = [];
            try { history = JSON.parse(localStorage.getItem('argos_user_history') || '[]'); } catch(e){}
            
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

    renderActionHistory() {
        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;

        let history = [];
        try { history = JSON.parse(localStorage.getItem('argos_user_history') || '[]'); } catch(e){}

        const userStr = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        if (!userStr) return;
        
        let currentUser = null;
        try { currentUser = JSON.parse(userStr).username; } catch(e){}

        // Filtrar apenas histórico do usuário atual
        const userHistory = history.filter(h => h.user === currentUser);

        if (userHistory.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">Nenhum registro de ação encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        userHistory.forEach(reg => {
            const tr = document.createElement('tr');
            
            const dateStr = this.formatDateStr(reg.date);
            const badgeClass = reg.action === 'LOGIN' ? 'badge-login' : 'badge-logout';

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
