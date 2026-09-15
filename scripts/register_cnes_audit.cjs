// Registra snapshots mensais normalizados, sem copiar agosto para meses anteriores.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [input,cm]=process.argv.slice(2);if(!input||!/^\d{4}(0[1-9]|1[0-2])$/.test(cm||''))throw Error('Uso: node scripts/register_cnes_audit.cjs caminho_snapshot.json AAAAMM');
const raw=fs.readFileSync(input),data=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));
const declared=data.competencia||String(data.versao||'').replace(/\D/g,'');
if(declared!==cm)throw Error('A competência interna do snapshot não corresponde à solicitada.');
if(!Array.isArray(data.estabelecimentos)||!data.estabelecimentos.length)throw Error('Snapshot sem estabelecimentos.');
if(!/dump oficial/i.test(data.fonte||''))throw Error('A origem do snapshot precisa identificar o dump oficial CNES utilizado.');
for(const unit of data.estabelecimentos)if(!/^\d{7}$/.test(String(unit.cnes))||!Array.isArray(unit.profissionais))throw Error('Estrutura incompleta de CNES/profissionais.');
const dir=path.resolve(__dirname,'../code_sandbox_light_git_fe61910d_1781185357/audit_data');const hash=crypto.createHash('sha256').update(raw).digest('hex');
const filename='cnes_'+cm+'_'+hash.slice(0,12)+'.json';fs.writeFileSync(path.join(dir,filename),JSON.stringify({...data,competencia:cm}));
const mpath=path.join(dir,'manifest.json'),manifest=JSON.parse(fs.readFileSync(mpath,'utf8'));
manifest.cnes[cm]={url:'audit_data/'+filename,fonte:data.fonte,sha256Original:hash,oficial:true,completo:true,cobertura:{profissionais:true,servicos:data.cobertura?.servicos===true,habilitacoes:data.cobertura?.habilitacoes===true}};
fs.writeFileSync(mpath,JSON.stringify(manifest,null,2)+'\n');console.log('Snapshot CNES registrado em '+cm+'. Outras competências foram preservadas.');
