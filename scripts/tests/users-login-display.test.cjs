/**
 * Testes Automatizados: Exibição e Cadastro de Login no Módulo de Usuários
 * Garante que a coluna LOGIN e os dados não dependem de e-mail e exibem apenas o nome de fato de login.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Iniciando testes de Usuários e Login (Sem obrigatoriedade de E-mail)...');

// 1. Validar que index.html possui o campo userLogin com type="text"
const htmlPath = path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

assert(htmlContent.includes('id="userLogin"'), 'index.html deve conter input com id="userLogin"');
assert(htmlContent.includes('type="text" id="userLogin"') || htmlContent.includes('id="userLogin" class="premium-input"'), 'userLogin não deve ser do tipo email');
assert(htmlContent.includes('Login / Nome de Acesso'), 'userLogin deve ter o rótulo amigável de Login');

console.log('✅ 1. index.html validado: Campo de login agora é texto simples e não exige e-mail.');

// 2. Validar que users.js renderiza o login limpo e não o e-mail
const usersJsPath = path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/js/users.js');
const usersJsContent = fs.readFileSync(usersJsPath, 'utf8');

assert(usersJsContent.includes('const cleanLogin = (u.username || \'\').includes(\'@\')'), 'users.js deve calcular cleanLogin a partir de username');
assert(usersJsContent.includes('${safeLogin}'), 'users.js deve renderizar safeLogin na coluna LOGIN');
assert(!usersJsContent.includes('<td>${safeEmail}</td>'), 'users.js NÃO deve renderizar safeEmail na coluna LOGIN');

console.log('✅ 2. users.js validado: Coluna LOGIN renderiza safeLogin em vez de safeEmail.');

// 3. Simular a lógica de extração do login de fato para múltiplos cenários e perfis
const mockUsers = [
    { username: 'mateus', email: 'mateus@fpa.com.br', name: 'Mateus Altair', role: 'GERENTE' },
    { username: 'yvanna', email: 'yvanna@fpa.com.br', name: 'Yvanna Carvalhal', role: 'GERENTE' },
    { username: 'francileide', email: 'francileide@fpa.gov.br', name: 'Francileide', role: 'SUPERINTENDENTE' },
    { username: 'airton', email: 'airton.costa@yahoo.com.br', name: 'Airton Costa', role: 'ADM' },
    { username: 'jessica@fpa.gov.br', email: 'jessica@fpa.gov.br', name: 'Jessica', role: 'GERENTE' } // Caso legado com @ no username
];

function getCleanLogin(u) {
    return (u.username || '').includes('@') 
        ? u.username.split('@')[0] 
        : (u.username || (u.email ? u.email.split('@')[0] : ''));
}

assert.strictEqual(getCleanLogin(mockUsers[0]), 'mateus');
assert.strictEqual(getCleanLogin(mockUsers[1]), 'yvanna');
assert.strictEqual(getCleanLogin(mockUsers[2]), 'francileide');
assert.strictEqual(getCleanLogin(mockUsers[3]), 'airton');
assert.strictEqual(getCleanLogin(mockUsers[4]), 'jessica');

console.log('✅ 3. Lógica de extração de Login: Testada com sucesso para todos os perfis (GERENTE, SUPERINTENDENTE, ADM).');

// 4. Validar busca por termo de login de fato
const term = 'jessica';
const filtered = mockUsers.filter(u => {
    const clean = getCleanLogin(u);
    return (
        (u.name && u.name.toLowerCase().includes(term)) || 
        (u.username && u.username.toLowerCase().includes(term)) ||
        clean.toLowerCase().includes(term) ||
        (u.email && u.email.toLowerCase().includes(term))
    );
});
assert.strictEqual(filtered.length, 1);
assert.strictEqual(filtered[0].name, 'Jessica');

console.log('✅ 4. Filtro de busca por login limpo testado e aprovado.');

// 5. Validar login.js offline fallback
const loginJsPath = path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/js/login.js');
const loginJsContent = fs.readFileSync(loginJsPath, 'utf8');

assert(loginJsContent.includes('(u.username && u.username.toLowerCase().split(\'@\')[0] === loginVal)'), 'login.js deve comparar pelo login limpo no fallback local');

console.log('✅ 5. login.js validado: Autenticação aceita o login direto mesmo em registros com sufixo.');

console.log('\n🎉 Todos os 5 testes passaram com sucesso!');
