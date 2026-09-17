/**
 * WebIntelligenceBridge - Ponte de integração corporativa entre Node.js e o motor Python do ARGOS.
 * Segue estritamente o Playbook de Arquitetura Enterprise:
 * - Não bloqueia o Event Loop (utiliza child_process.spawn assíncrono).
 * - Sanitização e observabilidade.
 * - Timeouts rigorosos com abort controller / timeout handler.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

class WebIntelligenceBridge {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || path.resolve(__dirname, '..');
        this.pythonBinary = options.pythonBinary || path.join(this.projectRoot, '.venv', 'Scripts', 'python.exe');
        this.defaultTimeoutMs = options.timeoutMs || 60000;
    }

    /**
     * Executa uma consulta ou varredura através do motor Python.
     * @param {Object} params
     * @param {'stealth'|'reach'|'smart'|'radar-sweep'} [params.mode='reach']
     * @param {string} [params.url]
     * @param {string} [params.query]
     * @param {string} [params.prompt]
     * @param {string} [params.selector]
     * @param {number} [params.limit=5]
     * @returns {Promise<Object>} Resultado JSON sanitizado
     */
    async execute(params = {}) {
        const mode = params.mode || 'reach';
        const args = ['-m', 'workers.web_intelligence.cli', '--mode', mode];

        if (params.url) args.push('--url', params.url);
        if (params.query) args.push('--query', params.query);
        if (params.prompt) args.push('--prompt', params.prompt);
        if (params.selector) args.push('--selector', params.selector);
        if (params.limit) args.push('--limit', String(params.limit));

        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let stdoutData = '';
            let stderrData = '';
            let isTimedOut = false;

            const child = spawn(this.pythonBinary, args, {
                cwd: this.projectRoot,
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUTF8: '1'
                },
                windowsHide: true
            });

            const timer = setTimeout(() => {
                isTimedOut = true;
                child.kill();
                reject(new Error(`WebIntelligenceBridge: Timeout de ${this.defaultTimeoutMs}ms excedido para o modo ${mode}`));
            }, this.defaultTimeoutMs);

            child.stdout.on('data', (chunk) => {
                stdoutData += chunk.toString('utf-8');
            });

            child.stderr.on('data', (chunk) => {
                stderrData += chunk.toString('utf-8');
            });

            child.on('error', (err) => {
                clearTimeout(timer);
                reject(new Error(`Falha ao spawnar o executável Python (${this.pythonBinary}): ${err.message}`));
            });

            child.on('close', (code) => {
                clearTimeout(timer);
                if (isTimedOut) return;

                const durationMs = Date.now() - startTime;
                if (code !== 0) {
                    try {
                        const parsed = JSON.parse(stdoutData.trim());
                        return resolve({ ...parsed, durationMs, exitCode: code });
                    } catch {
                        return reject(new Error(`Processo Python finalizado com código ${code}. Stderr: ${stderrData.trim() || 'Sem detalhes'}`));
                    }
                }

                try {
                    const trimmed = stdoutData.trim();
                    const firstBrace = trimmed.indexOf('{');
                    const lastBrace = trimmed.lastIndexOf('}');
                    if (firstBrace !== -1 && lastBrace !== -1) {
                        const jsonStr = trimmed.substring(firstBrace, lastBrace + 1);
                        const result = JSON.parse(jsonStr);
                        return resolve({ ...result, durationMs, exitCode: 0 });
                    }
                    return resolve({ success: true, rawOutput: trimmed, durationMs });
                } catch (parseError) {
                    return reject(new Error(`Erro ao fazer parse do JSON do WebIntelligenceBridge: ${parseError.message}. Stdout: ${stdoutData.substring(0, 300)}`));
                }
            });
        });
    }
}

module.exports = { WebIntelligenceBridge };
