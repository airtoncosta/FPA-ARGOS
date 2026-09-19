const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://zrzaktbxzpyjpyhidrsu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyemFrdGJ4enB5anB5aGlkcnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTg2NjIsImV4cCI6MjA5NzA3NDY2Mn0.db2d_4TFanE6KEJh7m8-nVBALvqv3erwwT8OJiMmU7k';

const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`
};

async function fetchCompetenceData(competencia) {
    console.log(`Baixando dados reais da competência ${competencia}...`);
    
    // 1. Estabelecimentos
    const rEstabs = await fetch(`${SUPABASE_URL}/rest/v1/cnes_estabelecimentos?codigo_ibge=eq.210120&competencia=eq.${competencia}`, { headers });
    const sEstabs = await rEstabs.json();

    // 2. Profissionais paginados
    let allProfs = [];
    for (let page = 0; page < 5; page++) {
        const h = { ...headers, Range: `${page * 1000}-${page * 1000 + 999}` };
        const rProfs = await fetch(`${SUPABASE_URL}/rest/v1/cnes_profissionais?municipio_ibge=eq.210120&competencia=eq.${competencia}`, { headers: h });
        const data = await rProfs.json();
        allProfs.push(...data);
        if (data.length < 1000) break;
    }

    console.log(`Competência ${competencia}: ${sEstabs.length} unidades e ${allProfs.length} profissionais.`);

    const profsMap = {};
    allProfs.forEach(p => {
        if (!profsMap[p.cnes]) profsMap[p.cnes] = [];
        profsMap[p.cnes].push({
            nome: p.nome,
            cns: p.cns,
            cnsMaster: p.cns,
            cbo: p.cbo,
            ocupacao: p.ocupacao,
            chAmb: p.ch_amb,
            chHosp: p.ch_hosp,
            chOutros: p.ch_outros,
            chTotal: p.ch_total,
            atendimentoSus: p.atendimento_sus,
            vinculacao: p.vinculacao,
            tipoVinculo: p.tipo_vinculo,
            subtipo: p.subtipo,
            situacao: p.situacao,
            dtAtribuicao: p.dt_atribuicao || '',
            portaria134: p.portaria134 || '',
            portaria134Fonte: p.portaria134 ? 'CNES_OFICIAL' : ''
        });
    });

    const payload = {
        codigoIbge: '210120',
        municipio: 'BACABAL',
        uf: 'MA',
        competencia: competencia,
        competenciaPadrao: competencia,
        fonte: 'DATASUS CNES (Auditoria Real Oficial)',
        source_type: 'published_snapshot',
        counts: {
            establishments: sEstabs.length,
            professional_links: allProfs.length
        },
        estabelecimentos: sEstabs.map(u => ({
            cnes: u.cnes,
            nomeFantasia: u.nome_fantasia || u.razao_social,
            razaoSocial: u.razao_social,
            tipoUnidade: u.tipo_unidade,
            tipoGestao: u.tipo_gestao,
            atendimentoSus: u.atendimento_sus,
            profissionais: profsMap[u.cnes] || []
        }))
    };

    return payload;
}

async function run() {
    const data07 = await fetchCompetenceData('202607');
    const out07 = path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'cnes_210120_202607.json');
    fs.writeFileSync(out07, JSON.stringify(data07, null, 2), 'utf8');
    console.log(`Salvo com sucesso: ${out07}`);

    const data08 = await fetchCompetenceData('202608');
    const out08 = path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'cnes_210120_202608.json');
    fs.writeFileSync(out08, JSON.stringify(data08, null, 2), 'utf8');
    console.log(`Salvo com sucesso: ${out08}`);
}

run().catch(console.error);
