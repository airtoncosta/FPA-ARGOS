/**
 * ARGOS — account.js
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
        await this.renderAssignedUnits();
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

    async renderAssignedUnits() {
        const container = document.getElementById('accountUnitsListContainer');
        const badgeCount = document.getElementById('accountUnitsBadgeCount');
        if (!container) return;

        const userStr = sessionStorage.getItem('argos_user') || localStorage.getItem('argos_user');
        if (!userStr) {
            container.innerHTML = '<div style="color: #64748b; font-size: 0.9rem;">Nenhum usuário logado.</div>';
            if (badgeCount) badgeCount.textContent = '0 unidades';
            return;
        }

        let userObj = null;
        try { userObj = JSON.parse(userStr); } catch (e) {}
        if (!userObj) return;

        // Sincroniza configurações da nuvem se o BpaModule estiver disponível
        if (window.BpaModule && typeof BpaModule.loadConfiguracoesCloud === 'function') {
            try {
                await BpaModule.loadConfiguracoesCloud();
            } catch (e) {
                console.warn('[AccountModule] Erro ao sincronizar configs BPA:', e);
            }
        }

        const allUnits = window.BpaModule && typeof BpaModule.getUnidadesSistema === 'function'
            ? BpaModule.getUnidadesSistema()
            : [];

        // Filtra unidades atribuídas a este usuário usando a inteligência do BpaModule
        const myUnits = allUnits.filter(unit => {
            if (window.BpaModule && typeof BpaModule.isAssignedToUser === 'function') {
                return BpaModule.isAssignedToUser(unit, userObj);
            }
            const resp = (unit.responsavel || '').toLowerCase().trim();
            const uName = (userObj.name || '').toLowerCase().trim();
            const uUser = (userObj.username || '').toLowerCase().trim();
            return resp && (resp === uName || resp === uUser);
        });

        if (badgeCount) {
            badgeCount.textContent = `${myUnits.length} unidade${myUnits.length !== 1 ? 's' : ''}`;
        }

        if (myUnits.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 1.5rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 0.75rem; text-align: center; color: #64748b;">
                    <i class="fas fa-clipboard-check" style="font-size: 1.8rem; color: #94a3b8; margin-bottom: 0.5rem; display: block;"></i>
                    <p style="margin: 0; font-weight: 600; color: #334155;">Nenhuma unidade atribuída no momento</p>
                    <p style="margin: 0.25rem 0 0 0; font-size: 0.8rem;">O administrador do sistema pode atribuir unidades para você no módulo Produções BPA.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = myUnits.map(unit => {
            const mod = unit.modalidade || 'AMBOS';
            const modBadge = mod === 'AMBOS' ? '<span style="background: #e0e7ff; color: #4338ca; padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 700;">BPA-C + BPA-I</span>' :
                             mod === 'BPA-C' ? '<span style="background: #dbeafe; color: #1d4ed8; padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 700;">Apenas BPA-C</span>' :
                             '<span style="background: #fef3c7; color: #b45309; padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.72rem; font-weight: 700;">Apenas BPA-I</span>';

            const cnesClean = unit.cnes || 'S/N';

            return `
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; justify-content: space-between; gap: 0.75rem; border-left: 4px solid #0284c7;">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.35rem;">
                            <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: #0f172a;">${CryptoUtils.escapeHtml(unit.nome)}</h4>
                            ${modBadge}
                        </div>
                        <div style="font-size: 0.78rem; color: #64748b; font-family: monospace;">CNES: ${CryptoUtils.escapeHtml(cnesClean)}</div>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: flex-end; border-top: 1px solid #f1f5f9; padding-top: 0.5rem; margin-top: 0.25rem;">
                        <button onclick="if(window.Router && typeof Router.navigate === 'function') { Router.navigate('producoes-bpa'); } else { document.querySelector('[data-section=\\'producoes-bpa\\']')?.click(); }" 
                                style="background: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd; border-radius: 0.4rem; padding: 0.4rem 0.75rem; font-size: 0.78rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; transition: background 0.2s;"
                                onmouseover="this.style.background='#e0f2fe'" onmouseout="this.style.background='#f0f9ff'">
                            <i class="fas fa-file-upload"></i> Acessar no BPA
                        </button>
                    </div>
                </div>
            `;
        }).join('');
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
                <td><span class="badge-action ${badgeClass}">${CryptoUtils.escapeHtml(reg.action)}</span></td>
                <td>${CryptoUtils.escapeHtml(reg.module)}</td>
                <td>${CryptoUtils.escapeHtml(reg.desc)}</td>
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
