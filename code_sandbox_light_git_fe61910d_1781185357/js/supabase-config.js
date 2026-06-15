/**
 * ARGOS FPA — supabase-config.js
 * Configuração e inicialização do cliente Supabase
 */

const SupabaseConfig = {
    // Chaves de conexão obtidas do painel do Supabase
    getUrl() {
        return localStorage.getItem('ARGOS_SUPABASE_URL') || '';
    },
    
    getAnonKey() {
        return localStorage.getItem('ARGOS_SUPABASE_ANON_KEY') || '';
    },

    setCredentials(url, key) {
        localStorage.setItem('ARGOS_SUPABASE_URL', url.trim());
        localStorage.setItem('ARGOS_SUPABASE_ANON_KEY', key.trim());
    },

    clearCredentials() {
        localStorage.removeItem('ARGOS_SUPABASE_URL');
        localStorage.removeItem('ARGOS_SUPABASE_ANON_KEY');
    },

    isConnected() {
        return this.getUrl() !== '' && this.getAnonKey() !== '';
    },

    /**
     * Inicializa a instância do cliente Supabase usando a lib CDN
     */
    getClient() {
        if (!this.isConnected()) return null;
        
        if (typeof supabase === 'undefined') {
            console.error('Supabase SDK não está carregado. Verifique se a tag script está no index.html.');
            return null;
        }

        try {
            return supabase.createClient(this.getUrl(), this.getAnonKey());
        } catch (e) {
            console.error('Erro ao inicializar cliente Supabase:', e);
            return null;
        }
    }
};

window.SupabaseConfig = SupabaseConfig;
