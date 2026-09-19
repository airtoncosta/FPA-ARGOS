const fs = require('fs');

const SUPABASE_URL = 'https://zrzaktbxzpyjpyhidrsu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyemFrdGJ4enB5anB5aGlkcnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTg2NjIsImV4cCI6MjA5NzA3NDY2Mn0.db2d_4TFanE6KEJh7m8-nVBALvqv3erwwT8OJiMmU7k';

const mapaDt = JSON.parse(fs.readFileSync('code_sandbox_light_git_fe61910d_1781185357/cnes_data/datasus_dt_atribuicao.json', 'utf8'));

async function checkAndSync() {
    console.log('=== TESTANDO SE COLUNA dt_atribuicao EXISTE NO SUPABASE ===');
    const testResp = await fetch(`${SUPABASE_URL}/rest/v1/cnes_profissionais?select=id,dt_atribuicao&limit=1`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });

    if (!testResp.ok) {
        console.log('Coluna dt_atribuicao ainda não adicionada ao Supabase.');
        console.log('Para adicionar no Supabase Cloud, execute a seguinte instrução no SQL Editor:');
        console.log('ALTER TABLE public.cnes_profissionais ADD COLUMN IF NOT EXISTS dt_atribuicao VARCHAR(50);');
        return false;
    }

    console.log('Coluna dt_atribuicao detectada no banco Supabase! Iniciando atualização em lote...');
    
    let offset = 0;
    const limit = 1000;
    let allDbProfs = [];
    let hasMore = true;

    while (hasMore) {
        const url = `${SUPABASE_URL}/rest/v1/cnes_profissionais?municipio_ibge=eq.210120&select=id,cnes,cns,nome,cbo,dt_atribuicao&limit=${limit}&offset=${offset}`;
        const resp = await fetch(url, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
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

    console.log(`Total de registros no Supabase: ${allDbProfs.length}`);
    let atualizados = 0;

    for (const p of allDbProfs) {
        const cns = String(p.cns || '').replace(/\D/g, '');
        const cbo = String(p.cbo || '').split(' ')[0].replace(/\D/g, '');
        const nome = String(p.nome || '').toUpperCase().replace(/\s+/g, ' ').trim();
        
        const dt = (cns && cbo && mapaDt[`${p.cnes}_${cns}_${cbo}`])
            || (cns && mapaDt[`${p.cnes}_${cns}`])
            || (nome && cbo && mapaDt[`${p.cnes}_${nome}_${cbo}`])
            || (nome && mapaDt[`${p.cnes}_${nome}`])
            || (cns && mapaDt[`CNS_${cns}`])
            || '';

        if (dt && p.dt_atribuicao !== dt) {
            await fetch(`${SUPABASE_URL}/rest/v1/cnes_profissionais?id=eq.${p.id}`, {
                method: 'PATCH',
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ dt_atribuicao: dt })
            });
            atualizados++;
            if (atualizados % 50 === 0) {
                process.stdout.write(`Atualizados no Supabase: ${atualizados}...\r`);
            }
        }
    }

    console.log(`\nSincronização concluída! Total de registros atualizados no Supabase: ${atualizados}`);
    return true;
}

checkAndSync().catch(console.error);
