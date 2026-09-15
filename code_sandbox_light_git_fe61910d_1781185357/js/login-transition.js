/* Reutiliza o vídeo original do ARGOS somente na entrada autenticada. */
window.ArgosLoginTransition = {
    pending: null,
    play() {
        if (this.pending) return this.pending;
        const overlay = document.getElementById('login-transition');
        const video = document.getElementById('login-opening-video');
        const login = document.getElementById('login-container');
        if (!overlay || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return Promise.resolve();
        }
        this.pending = new Promise(resolve => {
            const previousFocus = document.activeElement;
            const wasInert = login?.inert || false;
            if (login) login.inert = true;
            overlay.classList.remove('hidden', 'video-playing');
            overlay.focus({ preventScroll: true });
            const playing = () => overlay.classList.add('video-playing');
            const fallback = () => overlay.classList.remove('video-playing');
            // Timer independente do vídeo: erro, autoplay bloqueado ou rede lenta
            // nunca impedem o usuário autenticado de entrar no painel.
            setTimeout(() => {
                if (video) {
                    video.removeEventListener('playing', playing);
                    video.removeEventListener('error', fallback);
                    video.pause();
                }
                overlay.classList.add('hidden');
                overlay.classList.remove('video-playing');
                if (login) login.inert = wasInert;
                if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
                resolve();
            }, 3000);
            if (video) {
                video.addEventListener('playing', playing);
                video.addEventListener('error', fallback);
                video.muted = true;
                video.loop = false;
                try {
                    video.currentTime = 0;
                    const playback = video.play();
                    if (playback) playback.catch(fallback);
                } catch (_) {
                    fallback();
                }
            }
        }).finally(() => { this.pending = null; });
        return this.pending;
    }
};