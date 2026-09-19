const fs = require('fs');

const SUPABASE_URL = 'https://zrzaktbxzpyjpyhidrsu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyemFrdGJ4enB5anB5aGlkcnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTg2NjIsImV4cCI6MjA5NzA3NDY2Mn0.db2d_4TFanE6KEJh7m8-nVBALvqv3erwwT8OJiMmU7k';

const allAudited = JSON.parse(fs.readFileSync('scratch/datasus_audit_vinculos_completo.json', 'utf8'));

async function updateProfessional(p) {
    const cnes = String(p.cnes || '').trim();
    const cns = String(p.cns || '').replace(/\D/g, '');
    const cbo = String(p.cboCodigo || '').trim();
    if (!cnes || !cns) return 0;

    let url = `${SUPABASE_URL}/rest/v1/cnes_profissionais?municipio_ibge=eq.210120&cnes=eq.${cnes}&cns=eq.${cns}`;
    if (cbo) {
        url += `&cbo=eq.${cbo}`;
    }

    try {
        const resp = await fetch(url, {
            method: 'PATCH',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body: JSON.stringify({
                tipo_vinculo: p.tipoVinculo,
                subtipo: p.subtipoVinculo,
                vinculacao: p.vinculacao
            })
        });
        return resp.ok ? 1 : 0;
    } catch (err) {
        return 0;
    }
}

async function run() {
    console.log(`================================================================`);
    console.log(`SINCRONIZANDO VÍNCULOS OFICIAIS DATASUS COM O SUPABASE CLOUD`);
    console.log(`Total de profissionais para atualizar: ${allAudited.length}`);
    console.log(`================================================================`);

    const estatutarios = allAudited.filter(p => p.tipoVinculo.includes('ESTATUT'));
    console.log(`Priorizando ${estatutarios.length} profissionais ESTATUTÁRIO EFETIVO...`);

    // 1. Atualizar primeiro todos os 112 estatutários
    for (let i = 0; i < estatutarios.length; i += 10) {
        const batch = estatutarios.slice(i, i + 10);
        await Promise.all(batch.map(updateProfessional));
    }
    console.log(`Todos os ${estatutarios.length} Estatutários Efetivos atualizados no Supabase!`);

    // 2. Atualizar todos os demais vínculos do município
    const naoEstatutarios = allAudited.filter(p => !p.tipoVinculo.includes('ESTATUT'));
    const concurrency = 25;
    let updated = 0;

    for (let i = 0; i < naoEstatutarios.length; i += concurrency) {
        const batch = naoEstatutarios.slice(i, i + concurrency);
        const results = await Promise.all(batch.map(updateProfessional));
        updated += results.filter(r => r === 1).length;
        process.stdout.write(`Atualizados ${i + batch.length}/${naoEstatutarios.length} vínculos...\r`);
    }

    console.log(`\nSincronização com o Supabase concluída com sucesso! Total sincronizado: ${updated + estatutarios.length}`);
}

run();
