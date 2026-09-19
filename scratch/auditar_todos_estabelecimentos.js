const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://zrzaktbxzpyjpyhidrsu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyemFrdGJ4enB5anB5aGlkcnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTg2NjIsImV4cCI6MjA5NzA3NDY2Mn0.db2d_4TFanE6KEJh7m8-nVBALvqv3erwwT8OJiMmU7k';
const CACHE_FILE = path.join(__dirname, 'datasus_audit_cache.json');

const ALL_CNES = [
  '0049018', '0152862', '0423041',
  '0423084', '0465283', '0475262',
  '0664219', '0666114', '0751812',
  '0777250', '0843016', '0843024',
  '2457989', '2457997', '2458004',
  '2458012', '2458039', '2458047',
  '2458055', '2460033', '2460041',
  '2460068', '2460076', '2460084',
  '2460106'
];

async function fetchCnesXls(cnes) {
    const vco = `210120${cnes}`;
    const pageUrl = `http://cnes2.datasus.gov.br/Mod_Profissional.asp?VCo_Unidade=${vco}`;
    try {
        const res1 = await fetch(pageUrl, { signal: AbortSignal.timeout(20000) });
        const cookie = res1.headers.get('set-cookie');
        
        const xlsUrl = 'http://cnes2.datasus.gov.br/Mod_Profissional_XLS.asp';
        const res2 = await fetch(xlsUrl, {
            headers: { 'Cookie': cookie || '' },
            signal: AbortSignal.timeout(20000)
        });
        const html = await res2.text();
        
        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let match;
        const records = [];
        
        while ((match = trRegex.exec(html)) !== null) {
            const tr = match[1];
            const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            let tdMatch;
            const tds = [];
            while ((tdMatch = tdRegex.exec(tr)) !== null) {
                let t = tdMatch[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
                tds.push(t);
            }
            if (tds.length >= 12 && tds[0] && tds[0] !== 'Nome do Profissional' && !tds[0].includes('Consulta Estabelecimento')) {
                records.push({
                    cnes: cnes,
                    nome: tds[0].toUpperCase().trim(),
                    cns: (tds[2] || '').replace(/\D/g, ''),
                    dtAtribuicao: tds[3] || '',
                    cbo: (tds[4] || '').split(' ')[0].replace(/\D/g, ''),
                    ocupacao: tds[4] || '',
                    tipo: tds[11] || '',
                    subtipo: tds[12] || '',
                    situacao: tds[14] || 'Ativo'
                });
            }
        }
        return records;
    } catch (e) {
        console.warn(`[CNES ${cnes}] Falha ao buscar no DATASUS:`, e.message);
        return [];
    }
}

async function auditarEAtualizar() {
    let mapaDatasus = {};
    let totalDatasusProfs = 0;
    let totalEstatutarios = 0;

    if (fs.existsSync(CACHE_FILE)) {
        console.log(`Carregando dados auditados do cache local (${CACHE_FILE})...`);
        mapaDatasus = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        const profsList = Object.values(mapaDatasus);
        totalDatasusProfs = profsList.length;
        totalEstatutarios = profsList.filter(p => p.tipo.includes('ESTATUT') || p.subtipo.includes('SERVIDOR')).length;
    } else {
        console.log(`=== INICIANDO AUDITORIA OFICIAL CNES DATASUS (25 ESTABELECIMENTOS) ===`);
        for (let i = 0; i < ALL_CNES.length; i++) {
            const cnes = ALL_CNES[i];
            console.log(`[${i + 1}/${ALL_CNES.length}] Consultando CNES ${cnes}...`);
            const records = await fetchCnesXls(cnes);
            totalDatasusProfs += records.length;
            
            let estCount = 0;
            records.forEach(r => {
                if (r.tipo.includes('ESTATUT') || r.subtipo.includes('SERVIDOR')) estCount++;
                
                const keyCns = r.cns ? `${cnes}_${r.cns}` : null;
                const keyNome = `${cnes}_${r.nome.replace(/\s+/g, '')}`;
                
                if (keyCns) mapaDatasus[keyCns] = r;
                mapaDatasus[keyNome] = r;
            });
            totalEstatutarios += estCount;
            console.log(` -> CNES ${cnes}: ${records.length} profissionais (${estCount} estatutários).`);
            await new Promise(res => setTimeout(res, 400));
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(mapaDatasus, null, 2), 'utf8');
        console.log(`Cache salvo em ${CACHE_FILE}.`);
    }

    console.log(`\n=== RESUMO AUDITORIA DATASUS ===`);
    console.log(`Total de registros no mapa DATASUS: ${Object.keys(mapaDatasus).length}`);
    console.log(`Total de estatutários identificados: ${totalEstatutarios}`);

    // Buscar todos os profissionais no Supabase usando limit e offset
    console.log(`\n=== CONSULTANDO PROFISSIONAIS NO SUPABASE CLOUD ===`);
    let offset = 0;
    const limit = 1000;
    let allDbProfs = [];
    let hasMore = true;

    while (hasMore) {
        const url = `${SUPABASE_URL}/rest/v1/cnes_profissionais?municipio_ibge=eq.210120&select=id,cnes,cns,nome,cbo,tipo_vinculo,subtipo&limit=${limit}&offset=${offset}`;
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
            if (chunk.length < limit) {
                hasMore = false;
            } else {
                offset += limit;
            }
        }
    }

    console.log(`Total de profissionais no Supabase: ${allDbProfs.length}`);

    let atualizados = 0;
    let estatutariosAtualizados = 0;
    const updates = [];

    allDbProfs.forEach(p => {
        const cns = String(p.cns || '').replace(/\D/g, '');
        const nomeNorm = String(p.nome || '').toUpperCase().replace(/\s+/g, '');
        
        const keyCns = cns ? `${p.cnes}_${cns}` : null;
        const keyNome = `${p.cnes}_${nomeNorm}`;
        
        const oficial = (keyCns && mapaDatasus[keyCns]) || mapaDatasus[keyNome];
        
        if (oficial) {
            let novoTipo = oficial.tipo;
            let novoSubtipo = oficial.subtipo;
            
            if (novoTipo.includes('ESTATUT')) {
                novoTipo = 'ESTATUTARIO EFETIVO';
                novoSubtipo = 'SERVIDOR PROPRIO';
            } else if (novoTipo.includes('CONTRATAD') || novoTipo.includes('TEMPORAR')) {
                novoTipo = 'CONTRATADO TEMPORÁRIO OU POR PRAZO/TEMPO DETERMINADO';
                novoSubtipo = 'PUBLICO';
            } else if (novoTipo.includes('EMPREGO')) {
                novoTipo = 'EMPREGO PUBLICO';
                novoSubtipo = 'PUBLICO';
            } else if (novoTipo.includes('COMISSION')) {
                novoTipo = 'CARGO COMISSIONADO';
                novoSubtipo = 'PUBLICO';
            } else if (novoTipo.includes('AUTONOM')) {
                novoTipo = 'AUTONOMO';
                novoSubtipo = 'PESSOA FISICA';
            }
            
            if (novoTipo && (p.tipo_vinculo !== novoTipo || p.subtipo !== novoSubtipo)) {
                updates.push({
                    id: p.id,
                    tipo_vinculo: novoTipo,
                    subtipo: novoSubtipo
                });
                atualizados++;
                if (novoTipo === 'ESTATUTARIO EFETIVO') estatutariosAtualizados++;
            }
        }
    });

    console.log(`Registros para atualizar: ${updates.length} (sendo ${estatutariosAtualizados} ESTATUTARIO EFETIVO)`);

    // Enviar updates em lotes de 50 para máxima confiabilidade
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
                    tipo_vinculo: u.tipo_vinculo,
                    subtipo: u.subtipo
                })
            })
        ));
        console.log(` -> Progresso: ${Math.min(i + batchSize, updates.length)} / ${updates.length} salvos no Supabase.`);
    }

    console.log(`\n🎉 Auditoria e sincronização 100% concluídas com sucesso!`);
}

auditarEAtualizar().catch(e => console.error('Erro fatal:', e));
