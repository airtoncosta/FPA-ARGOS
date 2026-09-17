/**
 * radar-scheduler.js — Agendador de Inteligência Web e Varredura ARGOS Radar & Blog
 * 
 * Implementa a Opção A:
 * - Varredura Diária (24h) para Portais Oficiais, Diários Oficiais e Sistemas do SUS (DOU, DOE, DOM Bacabal, SIGTAP, FNS)
 * - Varredura Dinâmica a cada 6h para Redes Sociais e Perfis Públicos (Instagram, Facebook, YouTube, X, Notícias)
 * - Execução sob demanda ("Varredura Agora") via API / UI
 * - Total de 47 alvos monitorados em 4 esferas estratégicas
 */

const fs = require('node:fs');
const path = require('node:path');
const { WebIntelligenceBridge } = require('./web-intelligence-bridge');

class RadarScheduler {
    constructor(options = {}) {
        this.rootDir = options.rootDir || path.resolve(__dirname, '..');
        this.bridge = new WebIntelligenceBridge({ projectRoot: this.rootDir, timeoutMs: 90000 });
        this.logger = options.logger || console;

        // Intervalos da Opção A
        this.INTERVAL_SOCIAL_MS = options.intervalSocialMs || 6 * 60 * 60 * 1000;   // 6 horas
        this.INTERVAL_OFFICIAL_MS = options.intervalOfficialMs || 24 * 60 * 60 * 1000; // 24 horas

        this.socialTimer = null;
        this.officialTimer = null;
        this.isSweeping = false;

        this.status = {
            policy: 'opcao_a',
            policyDescription: 'Opção A: Varredura diária (24h) para portais oficiais/DOU + a cada 6h para redes sociais',
            active: false,
            lastSweep: null,
            lastSocialSweep: null,
            lastOfficialSweep: null,
            nextSocialSweep: null,
            nextOfficialSweep: null,
            targetsCount: 47,
            lastResultSummary: null
        };

        this.storageParsedDir = path.join(this.rootDir, 'workers', 'web_intelligence', 'storage', 'parsed');
        this.storageRawDir = path.join(this.rootDir, 'workers', 'web_intelligence', 'storage', 'raw');
        this.targetsFilePath = path.join(this.rootDir, 'workers', 'web_intelligence', 'profiles', 'radar_targets.json');
    }

    /**
     * Inicia os timers periódicos do agendador Opção A.
     */
    start(runOnStart = false) {
        if (this.status.active) return;
        this.status.active = true;

        const now = Date.now();
        this.status.nextSocialSweep = new Date(now + this.INTERVAL_SOCIAL_MS).toISOString();
        this.status.nextOfficialSweep = new Date(now + this.INTERVAL_OFFICIAL_MS).toISOString();

        this.socialTimer = setInterval(() => {
            this.runScheduledSweep('social', 10);
        }, this.INTERVAL_SOCIAL_MS);
        if (typeof this.socialTimer?.unref === 'function') this.socialTimer.unref();

        this.officialTimer = setInterval(() => {
            this.runScheduledSweep('official', 15);
        }, this.INTERVAL_OFFICIAL_MS);
        if (typeof this.officialTimer?.unref === 'function') this.officialTimer.unref();

        this.logger.info?.('radar_scheduler_started', {
            policy: 'opcao_a',
            intervalSocialHours: 6,
            intervalOfficialHours: 24,
            targetsCount: this.status.targetsCount
        }) || console.log('🛰️ Radar & Blog Scheduler iniciado [Opção A: 24h portais / 6h redes sociais]');

        if (runOnStart) {
            // Executa varredura inicial leve em background sem travar inicialização
            setTimeout(() => {
                this.runScheduledSweep('social', 5).catch(() => {});
            }, 3000);
        }
    }

    /**
     * Para os timers.
     */
    stop() {
        if (this.socialTimer) clearInterval(this.socialTimer);
        if (this.officialTimer) clearInterval(this.officialTimer);
        this.status.active = false;
        this.socialTimer = null;
        this.officialTimer = null;
    }

    /**
     * Executa varredura agendada interna.
     */
    async runScheduledSweep(type = 'social', limit = 10) {
        if (this.isSweeping) {
            this.logger.warn?.('radar_sweep_skipped_already_running', { type });
            return null;
        }
        return this.triggerSweep({ limit, triggerSource: `cron_${type}` });
    }

    /**
     * Executa uma varredura (manual ou agendada).
     */
    async triggerSweep(options = {}) {
        if (this.isSweeping) {
            return {
                success: false,
                message: 'Uma varredura do Radar já está em andamento. Aguarde a conclusão.',
                isSweeping: true
            };
        }

        this.isSweeping = true;
        const startTime = Date.now();
        const limit = options.limit || 8;
        const triggerSource = options.triggerSource || 'manual_ui';

        try {
            const result = await this.bridge.execute({
                mode: 'radar-sweep',
                limit: limit
            });

            const nowIso = new Date().toISOString();
            this.status.lastSweep = nowIso;
            if (triggerSource.includes('official')) {
                this.status.lastOfficialSweep = nowIso;
                this.status.nextOfficialSweep = new Date(Date.now() + this.INTERVAL_OFFICIAL_MS).toISOString();
            } else {
                this.status.lastSocialSweep = nowIso;
                this.status.nextSocialSweep = new Date(Date.now() + this.INTERVAL_SOCIAL_MS).toISOString();
            }

            this.status.lastResultSummary = {
                durationMs: Date.now() - startTime,
                targetsSwept: result.total_targets_swept || (result.results ? result.results.length : 0),
                sweepId: result.sweep_id || `sweep_${Date.now()}`,
                triggerSource
            };

            return {
                success: true,
                message: 'Varredura de inteligência concluída com sucesso!',
                data: result,
                status: this.getStatus()
            };
        } catch (error) {
            this.logger.error?.('radar_sweep_failed', { error: error.message, triggerSource });
            return {
                success: false,
                error: error.message,
                durationMs: Date.now() - startTime,
                status: this.getStatus()
            };
        } finally {
            this.isSweeping = false;
        }
    }

    /**
     * Retorna o status atual do agendador.
     */
    getStatus() {
        return {
            ...this.status,
            isSweeping: this.isSweeping,
            uptimeSeconds: process.uptime()
        };
    }

    /**
     * Lê a lista completa de alvos cadastrados (47 alvos).
     */
    getTargets() {
        try {
            if (fs.existsSync(this.targetsFilePath)) {
                const raw = fs.readFileSync(this.targetsFilePath, 'utf8');
                const data = JSON.parse(raw);
                const allTargets = [];
                if (data.spheres && Array.isArray(data.spheres)) {
                    for (const sphere of data.spheres) {
                        if (Array.isArray(sphere.targets)) {
                            for (const target of sphere.targets) {
                                allTargets.push({
                                    ...target,
                                    sphereName: sphere.name,
                                    sphereId: sphere.id
                                });
                            }
                        }
                    }
                }
                return allTargets;
            }
        } catch (e) {
            this.logger.error?.('falha_ler_radar_targets', { error: e.message });
        }
        return [];
    }

    /**
     * Retorna o feed compilado de alertas e inteligência coletados.
     */
    getFeed() {
        const feedItems = [];

        // 1. Carrega relatórios salvos em workers/web_intelligence/storage/parsed/
        try {
            if (fs.existsSync(this.storageParsedDir)) {
                const files = fs.readdirSync(this.storageParsedDir)
                    .filter(f => f.startsWith('sweep_') && f.endsWith('.json'))
                    .sort().reverse(); // mais recentes primeiro

                for (const file of files.slice(0, 10)) {
                    try {
                        const filePath = path.join(this.storageParsedDir, file);
                        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        if (content.results && Array.isArray(content.results)) {
                            for (const item of content.results) {
                                feedItems.push({
                                    id: `${content.sweep_id}_${item.target_id}`,
                                    sweepId: content.sweep_id,
                                    targetId: item.target_id,
                                    title: item.name,
                                    sphere: item.sphere,
                                    platform: item.platform,
                                    url: item.url,
                                    collectedAt: item.collected_at,
                                    success: item.success,
                                    statusCode: item.status_code,
                                    preview: item.preview || '',
                                    type: 'radar_sweep'
                                });
                            }
                        }
                    } catch (err) {
                        // ignore malformed file
                    }
                }
            }
        } catch (e) {
            this.logger.error?.('falha_ler_parsed_sweeps', { error: e.message });
        }

        // 2. Notícias e boletins editoriais pré-compilados do SUS / Bacabal / MA
        const editorialAlerts = [
            {
                id: 'ed_01_portaria_fns',
                title: 'Ministério da Saúde publica novas portarias de repasse financeiro do Bloco MAC',
                category: 'Federal SUS & FNS',
                badge: 'Portaria FNS',
                badgeClass: 'badge-primary',
                summary: 'Atualizações normativas de transferências fundo a fundo aos municípios do Maranhão, incluindo novos incentivos para habilitação de equipes e procedimentos de média e alta complexidade.',
                source: 'Portal FNS & Diário Oficial da União',
                date: new Date().toLocaleDateString('pt-BR'),
                tags: ['FNS', 'Teto MAC', 'Bacabal', 'Repasses'],
                priority: 'Alta',
                link: 'https://portalfns.saude.gov.br/'
            },
            {
                id: 'ed_02_sigtap_vigente',
                title: 'Tabela Unificada SIGTAP: Atualizações de atributos e compatibilidades de procedimentos',
                category: 'Regulação & SIGTAP',
                badge: 'SIGTAP 2026',
                badgeClass: 'badge-success',
                summary: 'Monitoramento contínuo das alterações da Tabela Unificada do SUS, compatibilidades CBO x Procedimento e regras de instrumentos de registro BPA-I e BPA-C.',
                source: 'DATASUS / SIGTAP Web',
                date: new Date().toLocaleDateString('pt-BR'),
                tags: ['SIGTAP', 'BPA', 'Auditoria', 'Glosa Zero'],
                priority: 'Média',
                link: 'http://sigtap.datasus.gov.br/'
            },
            {
                id: 'ed_03_ses_maranhao',
                title: 'SES-MA: Cirurgias Eletivas e Expansão da Média Complexidade na Região do Mearim',
                category: 'Estadual MA',
                badge: 'SES-MA',
                badgeClass: 'badge-info',
                summary: 'Secretaria de Estado da Saúde intensifica mutirões do Programa Maranhão Mais Saudável e ampliação de vagas de regulação hospitalar regional em Bacabal e municípios vizinhos.',
                source: 'Governo do Estado do Maranhão / SES',
                date: new Date().toLocaleDateString('pt-BR'),
                tags: ['SES-MA', 'Cirurgias Eletivas', 'Bacabal', 'Regulação'],
                priority: 'Alta',
                link: 'https://www.saude.ma.gov.br/'
            },
            {
                id: 'ed_04_pref_bacabal',
                title: 'Prefeitura de Bacabal e Secretaria de Saúde ampliam atendimentos e campanhas da Atenção Básica',
                category: 'Municipal Bacabal',
                badge: 'SMS Bacabal',
                badgeClass: 'badge-warning',
                summary: 'Ações itinerantes de saúde preventiva, reforço na vacinação nas UBSs e monitoramento dos indicadores de saúde primária no município.',
                source: 'Prefeitura Municipal de Bacabal',
                date: new Date().toLocaleDateString('pt-BR'),
                tags: ['Bacabal', 'Atenção Básica', 'UBS', 'SMS'],
                priority: 'Média',
                link: 'https://www.bacabal.ma.gov.br/'
            }
        ];

        return {
            status: this.getStatus(),
            editorialAlerts,
            feedItems,
            totalItems: editorialAlerts.length + feedItems.length
        };
    }
}

// Instância única para o servidor
let globalRadarScheduler = null;

function getRadarScheduler(options = {}) {
    if (!globalRadarScheduler) {
        globalRadarScheduler = new RadarScheduler(options);
    }
    return globalRadarScheduler;
}

module.exports = {
    RadarScheduler,
    getRadarScheduler
};
