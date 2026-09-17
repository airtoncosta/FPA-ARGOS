const { getRadarScheduler } = require('../lib/radar-scheduler');

async function main() {
    const s = getRadarScheduler();
    console.log('Alvos carregados:', s.getTargets().length);
    console.log('Status da política:', s.getStatus().policy);
    console.log('Feed inicial compilado:', s.getFeed().totalItems, 'itens');
    console.log('RadarScheduler OK!');
}

main().catch(err => {
    console.error('Erro no teste:', err);
    process.exit(1);
});
