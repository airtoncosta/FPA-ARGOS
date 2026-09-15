const fs = require('fs');
const path = require('path');
const base = path.resolve('code_sandbox_light_git_fe61910d_1781185357');
const preview = fs.readFileSync(path.join(base, 'login-opcoes.html'), 'utf8');
let content = preview.match(/<main class="scene">([\s\S]*?)<\/main>/)[1];
content = content.replace('class="shell"', 'class="shell login-card"').replace('aria-label="Proposta de login ARGOS"','aria-label="Login ARGOS"');
content = content.replace('<form id="preview-form" autocomplete="off">', '<div id="login-error-msg" class="hidden" role="alert"></div><form id="login-form">')
 .replaceAll('preview-user','login-username').replaceAll('preview-password','login-password')
 .replace('aria-describedby="preview-note"','autocomplete="username" required')
 .replace('autocomplete="off"','autocomplete="current-password" required')
 .replace('class="eye-toggle"','class="eye-toggle" id="toggle-password-visibility"')
 .replace('<input type="checkbox">','<input type="checkbox" id="login-remember">')
 .replace('class="enter" type="submit"','class="enter" id="btn-login-submit" type="submit"')
 .replace('<p class="message" role="status"></p>','')
 .replace(/<small id="preview-note"[\s\S]*?<\/small>/,'');
const htmlPath = path.join(base,'index.html');
let html = fs.readFileSync(htmlPath,'utf8');
const start = html.indexOf('    <!-- ===== TELA DE LOGIN');
const end = html.indexOf('    <!-- ===== MOBILE OVERLAY');
if(start<0 || end<0) throw Error('Login section missing');
html = html.slice(0,start) + `    <!-- Observatório no desktop, Órbita no mobile. -->
    <div id="login-container" class="hidden"><div class="auth-scene">${content}</div></div>
    <!-- O vídeo original só é reproduzido após autenticação bem-sucedida. -->
    <div id="login-transition" class="hidden" role="status" aria-live="polite" tabindex="-1" aria-label="Acesso confirmado. Entrando no ARGOS.">
        <div class="auth-opening-fallback" aria-hidden="true"><img src="img/olho-cyber.png" alt=""></div>
        <video id="login-opening-video" muted playsinline preload="auto" aria-hidden="true"><source src="img/logo_background.mp4" type="video/mp4"></video>
        <div class="auth-opening-caption"><strong>ARGOS</strong><span>Acesso confirmado · Entrando no sistema</span></div>
    </div>

` + html.slice(end);
html = html.replace('<script src="js/login.js">','<script src="js/login-transition.js"></script>\n    <script src="js/login.js">');
fs.writeFileSync(htmlPath,html);
const loginPath=path.join(base,'js/login.js');
let login=fs.readFileSync(loginPath,'utf8');
login=login.replace('    async handleLogin() {', `    async handleLogin() {
        if (this._loginPending) return;
        this._loginPending = true;
        const button = document.getElementById('btn-login-submit');
        if (button) button.disabled = true;
        try {
            await this.authenticateLogin();
        } finally {
            this._loginPending = false;
            if (button) button.disabled = false;
        }
    },

    async completeLogin(user) {
        if (window.ArgosLoginTransition) await window.ArgosLoginTransition.play();
        // A restauração de sessões continua usando loginUI diretamente, sem repetir o vídeo.
        this.loginUI(user).catch(error => console.error('Erro ao preparar painel:', error));
    },

    async authenticateLogin() {`);
login=login.replaceAll('this.loginUI(sessionUser);','await this.completeLogin(sessionUser);');
// O SVG permanece estável; o estado acessível já é atualizado pelo listener.
login=login.replaceAll("togglePassword.classList.remove('fa-eye');",'').replaceAll("togglePassword.classList.add('fa-eye-slash');",'').replaceAll("togglePassword.classList.remove('fa-eye-slash');",'').replaceAll("togglePassword.classList.add('fa-eye');",'');
fs.writeFileSync(loginPath,login);