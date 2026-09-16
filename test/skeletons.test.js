const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Skeleton Shimmer Loading System', () => {
    const cssPath = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357/css/style.css');
    const jsPath = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357/js/perf-utils.js');
    const bpaPath = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js');

    test('contém regras de animação @keyframes argos-shimmer e classes .skeleton-* no CSS', () => {
        const css = fs.readFileSync(cssPath, 'utf8');
        assert.ok(css.includes('@keyframes argos-shimmer'), 'Deve conter keyframes argos-shimmer');
        assert.ok(css.includes('.skeleton-shimmer'), 'Deve conter classe .skeleton-shimmer');
        assert.ok(css.includes('.skeleton-card'), 'Deve conter classe .skeleton-card');
        assert.ok(css.includes('.skeleton-line'), 'Deve conter classe .skeleton-line');
    });

    test('perf-utils.js expõe renderSkeletonCards e renderSkeletonTable', () => {
        const js = fs.readFileSync(jsPath, 'utf8');
        assert.ok(js.includes('function renderSkeletonCards'), 'Deve declarar renderSkeletonCards');
        assert.ok(js.includes('function renderSkeletonTable'), 'Deve declarar renderSkeletonTable');
        assert.ok(js.includes('skeleton-shimmer'), 'Deve gerar markup com skeleton-shimmer');
    });

    test('bpa-module.js renderLoadingState invoca skeleton screens para tabela e cards', () => {
        const bpa = fs.readFileSync(bpaPath, 'utf8');
        assert.ok(bpa.includes('renderSkeletonTable'), 'Deve chamar renderSkeletonTable no loading');
        assert.ok(bpa.includes('renderSkeletonCards'), 'Deve chamar renderSkeletonCards no loading');
    });
});
