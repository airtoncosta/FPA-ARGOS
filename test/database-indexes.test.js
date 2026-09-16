const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Database Indexes Migration v8 Integrity & Coverage', () => {
    const migrationPath = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357/supabase/migration_v8_indices_performance.sql');

    test('o arquivo migration_v8_indices_performance.sql deve existir e não estar vazio', () => {
        assert.ok(fs.existsSync(migrationPath), 'migration_v8_indices_performance.sql deve existir');
        const content = fs.readFileSync(migrationPath, 'utf8').trim();
        assert.ok(content.length > 500, 'Migration deve conter conteúdo substancial');
    });

    test('todos os índices devem ser estritamente idempotentes (CREATE INDEX IF NOT EXISTS)', () => {
        const content = fs.readFileSync(migrationPath, 'utf8');
        const lines = content.split('\n');
        const createIndexLines = lines.filter(l => /CREATE\s+(UNIQUE\s+)?INDEX/i.test(l));
        assert.ok(createIndexLines.length >= 10, `Deve definir pelo menos 10 índices (encontrados: ${createIndexLines.length})`);

        for (const line of createIndexLines) {
            assert.ok(
                /CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/i.test(line),
                `Índice deve usar IF NOT EXISTS para segurança e idempotência: ${line}`
            );
        }
    });

    test('deve cobrir as tabelas essenciais do sistema', () => {
        const content = fs.readFileSync(migrationPath, 'utf8');
        const requiredTables = [
            'producoes_bpa',
            'producao_sia',
            'cnes_movimentacoes',
            'cnes_profissionais',
            'cnes_estabelecimentos',
            'historico_acoes',
            'usuarios',
            'logomarcas_municipio',
            'procedimentos',
            'municipios_sistema'
        ];

        for (const table of requiredTables) {
            assert.ok(
                content.includes(table),
                `Migration deve criar índices para a tabela ${table}`
            );
        }
    });

    test('deve conter índices GIN para colunas JSONB', () => {
        const content = fs.readFileSync(migrationPath, 'utf8');
        assert.ok(/USING\s+gin\s*\(\s*dados_json\b/i.test(content), 'deve conter índice GIN para producao_sia.dados_json');
        assert.ok(/USING\s+gin\s*\(\s*detalhes\b/i.test(content), 'deve conter índice GIN para cnes_movimentacoes.detalhes');
        assert.ok(/USING\s+gin\s*\(\s*dados\b/i.test(content), 'deve conter índice GIN para cnes_estabelecimentos.dados');
    });

    test('deve conter índices parciais estratégicos (WHERE clause)', () => {
        const content = fs.readFileSync(migrationPath, 'utf8');
        assert.ok(/WHERE\s+ativa\s*=\s*(true|TRUE)/i.test(content), 'deve conter índice parcial para logomarcas ativas');
        assert.ok(/WHERE\s+portaria134\b/i.test(content), 'deve conter índice parcial para inconsistências de portaria 134');
        assert.ok(/WHERE\s+email_status\b/i.test(content), 'deve conter índice parcial para status de e-mail de BPA');
    });

    test('deve conter índices compostos para ordenação e queries frequentes', () => {
        const content = fs.readFileSync(migrationPath, 'utf8');
        assert.ok(/historico_acoes\s*\(\s*usuario_login\s*,\s*created_at\s+DESC\s*\)/i.test(content), 'deve indexar historico_acoes(usuario_login, created_at DESC)');
        assert.ok(/producoes_bpa\s*\(\s*municipio_id\s*,\s*competencia/i.test(content), 'deve indexar producoes_bpa por municipio e competencia');
    });
});
