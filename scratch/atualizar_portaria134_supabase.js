const fs = require('fs');

const SUPABASE_URL = 'https://zrzaktbxzpyjpyhidrsu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyemFrdGJ4enB5anB5aGlkcnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTg2NjIsImV4cCI6MjA5NzA3NDY2Mn0.db2d_4TFanE6KEJh7m8-nVBALvqv3erwwT8OJiMmU7k';

const portariaList = JSON.parse(fs.readFileSync('scratch/portaria134_municipio_completo.json', 'utf8'));

async function updatePortaria134() {
    console.log(`=== ATUALIZANDO PORTARIA 134 NO SUPABASE CLOUD ===`);
    console.log(`Total de registros da Portaria 134 identificados: ${portariaList.length}`);
    
    // Criar mapa para busca rápida
    const mapaPortaria = {};
    portariaList.forEach(item => {
        const cns = (item.cns || '').replace(/\D/g, '');
        const nome = item.nome.toUpperCase().replace(/\s+/g, '');
        if (cns) mapaPortaria[`${item.cnes}_${cns}`] = item.artigo;
        mapaPortaria[`${item.cnes}_${nome}`] = item.artigo;
    });

    // 1. Buscar todos os profissionais no Supabase de Bacabal
    let offset = 0;
    const limit = 1000;
    let allDbProfs = [];
    let hasMore = true;

    while (hasMore) {
        const url = `${SUPABASE_URL}/rest/v1/cnes_profissionais?municipio_ibge=eq.210120&select=id,cnes,cns,nome,portaria134&limit=${limit}&offset=${offset}`;
        const resp = await fetch(url, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`
            }
        });
        const chunk = await resp.json();
        if (!Array.isArray(chunk) || chunk.length === 0) {
            hasMore = false;
        } else {
            allDbProfs.push(...chunk);
            if (chunk.length < limit) hasMore = false;
            else offset += limit;
        }
    }

    console.log(`Total de profissionais no Supabase: ${allDbProfs.length}`);

    const updates = [];
    allDbProfs.forEach(p => {
        const cns = String(p.cns || '').replace(/\D/g, '');
        const nome = String(p.nome || '').toUpperCase().replace(/\s+/g, '');
        
        const keyCns = cns ? `${p.cnes}_${cns}` : null;
        const keyNome = `${p.cnes}_${nome}`;
        
        const artigo = (keyCns && mapaPortaria[keyCns]) || mapaPortaria[keyNome] || '';
        
        // Se deve ter Portaria 134 e o banco não tem, ou se o banco tem e não deveria ter
        if (p.portaria134 !== artigo) {
            updates.push({
                id: p.id,
                portaria134: artigo
            });
        }
    });

    console.log(`Registros para sincronizar: ${updates.length}`);
    const comArtigo = updates.filter(u => u.portaria134);
    console.log(` -> Sendo ${comArtigo.length} ativações de Portaria 134 (Artigo 2º).`);

    // Enviar updates em lotes de 50
    const batchSize = 50;
    for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        await Promise.all(batch.map(u =>
            fetch(`${SUPABASE_URL}/rest/v1/cnes_profissionais?id=eq.${u.id}`, {
                method: 'PATCH',
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify({
                    portaria134: u.portaria134
                })
            })
        ));
        console.log(` -> Progresso: ${Math.min(i + batchSize, updates.length)} / ${updates.length} salvos no Supabase.`);
    }

    console.log(`\n🎉 Sincronização de Portaria 134 concluída com sucesso!`);
}

updatePortaria134().catch(e => console.error(e));
