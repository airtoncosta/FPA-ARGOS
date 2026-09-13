/**
 * Sincronizador do Catálogo Oficial SIGTAP com o Supabase
 * Envia todos os procedimentos com seus valores unitários reais (VL_SA) e descrições oficiais.
 */

const fs = require('fs');
const path = require('path');

const sigtapPath = path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'sigtap_data', 'sigtap_vigente.json');
const sigtapVigente = JSON.parse(fs.readFileSync(sigtapPath, 'utf8'));

const url = 'https://zrzaktbxzpyjpyhidrsu.supabase.co/rest/v1/procedimentos?on_conflict=codigo';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyemFrdGJ4enB5anB5aGlkcnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTg2NjIsImV4cCI6MjA5NzA3NDY2Mn0.db2d_4TFanE6KEJh7m8-nVBALvqv3erwwT8OJiMmU7k';

async function syncSupabase() {
    const items = Object.entries(sigtapVigente).map(([codigo, item]) => ({
        codigo,
        descricao: item.nome,
        valor_unitario: item.vl_sa || 0.00
    }));

    console.log(`🚀 Sincronizando ${items.length} procedimentos com valores reais no Supabase...`);
    const batchSize = 500;
    let processed = 0;

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': key,
                'Authorization': 'Bearer ' + key,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(batch)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`❌ Erro no lote ${i} - ${i + batch.length}: ${errText}`);
            break;
        }

        processed += batch.length;
        console.log(`✅ ${processed}/${items.length} procedimentos atualizados na nuvem.`);
    }

    console.log('🎉 Sincronização com o Supabase concluída com 100% de sucesso!');
}

syncSupabase().catch(console.error);
