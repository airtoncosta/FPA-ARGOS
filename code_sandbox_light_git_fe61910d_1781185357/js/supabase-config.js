/**
 * ARGOS — supabase-config.js
 * Configuração e inicialização do cliente Supabase
 */

const SupabaseConfig = {
    // Chaves de conexão obtidas do painel do Supabase
    getUrl() {
        // Remove chaves locais que possam estar desatualizadas ou inválidas no navegador
        if (localStorage.getItem('ARGOS_SUPABASE_URL')) {
            localStorage.removeItem('ARGOS_SUPABASE_URL');
        }
        return 'https://zrzaktbxzpyjpyhidrsu.supabase.co';
    },
    
    getAnonKey() {
        if (localStorage.getItem('ARGOS_SUPABASE_ANON_KEY')) {
            localStorage.removeItem('ARGOS_SUPABASE_ANON_KEY');
        }
        return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyemFrdGJ4enB5anB5aGlkcnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTg2NjIsImV4cCI6MjA5NzA3NDY2Mn0.db2d_4TFanE6KEJh7m8-nVBALvqv3erwwT8OJiMmU7k';
    },

    setCredentials(url, key) {
        // Credenciais gerenciadas de forma unificada e automática
    },

    clearCredentials() {
        localStorage.removeItem('ARGOS_SUPABASE_URL');
        localStorage.removeItem('ARGOS_SUPABASE_ANON_KEY');
    },

    isConnected() {
        return true; // Sempre conectado à nuvem oficial do projeto
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
