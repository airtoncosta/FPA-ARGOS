const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source=fs.readFileSync(path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js'),'utf8');
function setup(user={username:'jessica',name:'Jéssica',role:'DIGITADOR'}) {
 const store=new Map(); const session=new Map([['argos_user',JSON.stringify(user)]]);
 const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
 const ctx={window:{},document:{getElementById:()=>null,querySelectorAll:()=>[]},localStorage:storage(store),sessionStorage:storage(session),console:{error(){},warn(){}},alert(){},confirm:()=>true,crypto:require('node:crypto').webcrypto};
 ctx.window.BpaAuditCore=require('../../code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js');
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const b=ctx.window.BpaModule;
 return {b,ctx,store,session};
}
const own={id:'own',cnes:'2387439',estabelecimento_nome:'HOSPITAL MATERNO INFANTIL',digitador_username:'jessica'};
const other={id:'other',cnes:'2387412',estabelecimento_nome:'HOSPITAL MARIA SOCORRO BRANDÃO',digitador_username:'jessica'};
test('usuária vê somente unidades atribuídas, com acentos no nome',()=>{const {b}=setup();assert.equal(b.getUnidadesSistema().length,2);assert.ok(b.getUnidadesSistema().every(u=>u.responsavel==='Jéssica'));});
test('ADM e Francileide têm visão geral; outro superintendente não',()=>{for(const u of [{username:'admin',role:'ADM'},{username:'francileide',role:'SUPERINTENDENTE'}])assert.equal(setup(u).b.getUnidadesSistema().length,21);assert.equal(setup({username:'outro',role:'SUPERINTENDENTE'}).b.getUnidadesSistema().length,0);});
test('nome airton sozinho não concede administração',()=>assert.equal(setup({username:'airton',role:'DIGITADOR'}).b.isAdminOrFrancileide(),false));
test('sessão ausente não recebe unidades ou produções',()=>{const {b}=setup({});assert.equal(b.getUnidadesSistema().length,0);assert.equal(b.canAccessProducao(own),false);});
test('autoria de produção não concede acesso a outra unidade',()=>{const {b}=setup();b.producoes=[own,other];assert.equal(b.getAccessibleProducoes().length,1);assert.equal(b.canAccessProducao(other),false);});
test('CNES diferente não passa pelo nome de unidade autorizada',()=>{const {b}=setup();assert.equal(b.canAccessProducao({...other,estabelecimento_nome:own.estabelecimento_nome}),false);});
test('legado sem CNES exige nome completo; prefixos não concedem acesso',()=>{const {b}=setup();assert.equal(b.canAccessProducao({...own,cnes:''}),true);assert.equal(b.canAccessProducao({...own,cnes:'',estabelecimento_nome:'HOSPITAL'}),false);});
test('remoção explícita da atribuição vence aliases antigos',()=>{const {b,store}=setup();store.set(b.responsaveisKey,JSON.stringify({'2387439':'','HOSPITAL MATERNO INFANTIL':'Jéssica'}));assert.equal(b.getUnidadesSistema().length,0);});
test('upload recusa unidade alheia ou nome incompatível com CNES',()=>{const {b}=setup();assert.throws(()=>b.assertUploadAccess({cnes:other.cnes,estabelecimentoNome:other.estabelecimento_nome}));assert.throws(()=>b.assertUploadAccess({cnes:own.cnes,estabelecimentoNome:'Outra unidade'}));});
test('upload legado preenche CNES da unidade escolhida',()=>{const {b}=setup();const data={cnes:'',estabelecimentoNome:own.estabelecimento_nome};b.assertUploadAccess(data);assert.equal(data.cnes,own.cnes);});
test('download e exclusão diretos recusam unidade alheia',async()=>{const {b}=setup();b.producoes=[other];b.downloadFile(other.id);assert.equal(await b.deleteProducao(other.id),false);assert.equal(b.producoes.length,1);});
test('e-mail também depende da unidade atribuída',()=>{const {b}=setup();assert.equal(b.canSendEmail(own),true);assert.equal(b.canSendEmail(other),false);});
test('cache de produção é separado por conta',()=>{const {b,session}=setup();const key=b.storageKey;session.set('argos_user',JSON.stringify({username:'flavia'}));assert.notEqual(b.storageKey,key);});
test('erro de carregamento bloqueia ações e listagem',()=>{const {b}=setup();b.accessLoadError='erro';assert.equal(b.canAccessProducao(own),false);assert.equal(b.getUnidadesSistema().length,0);});
test('usuário sem atribuição não consulta tabela de produções',async()=>{const {b,ctx}=setup({username:'novo',role:'DIGITADOR'});ctx.window.SupabaseConfig={isConnected:()=>true,getClient:()=>({from:table=>{assert.equal(table,'configuracoes');return {select:()=>({in:async()=>({data:[]})})};}})};b.renderAll=()=>{};await b.loadProducoes();assert.equal(b.producoes.length,0);assert.equal(b.accessLoadError,'');});
test('falha online não restaura produções do cache',async()=>{const {b,ctx,store}=setup();store.set(b.storageKey,JSON.stringify([own]));ctx.window.SupabaseConfig={isConnected:()=>true,getClient:()=>({from:()=>({select:()=>({in:async()=>({error:new Error('negado')})})})})};b.renderAll=()=>{};await b.loadProducoes();assert.equal(b.producoes.length,0);assert.ok(b.accessLoadError);});
test('falha ao gravar nuvem não anuncia produção como salva',async()=>{const {b,ctx}=setup();ctx.window.SupabaseConfig={isConnected:()=>true,getClient:()=>({from:()=>({insert:()=>({select:async()=>({error:new Error('negado')})})})})};await assert.rejects(b.saveProducao({cnes:own.cnes,estabelecimentoNome:own.estabelecimento_nome}),/Não foi possível salvar/);assert.equal(b.producoes.length,0);});
test('arquivo desconhecido não é atribuído à primeira unidade',()=>{const {b}=setup();const parsed=b.parseBpaFile({name:'desconhecido.txt',size:3},'abc');assert.equal(parsed.estabelecimentoNome,'');assert.equal(parsed.cnes,'');});

const ewerton={username:'ewerton',name:'Ewerton',role:'GERENTE'};
const tfd={id:'bpa-local-ewerton',cnes:'0000001',estabelecimento_nome:'UNIDADE DE TRATAMENTO FORA DO DOMIC',digitador_username:'ewerton',nome_arquivo:'TFD.JAN',conteudo_arquivo:'original',competencia:'01/2026'};
function missingBpa(ctx, code='PGRST205') {
 ctx.window.SupabaseConfig={isConnected:()=>true,getClient:()=>({from:table=>{
  const response=table==='configuracoes'?{data:[]}:{error:{code,message:'Could not find the table public.producoes_bpa'}};
  const q={select:()=>q,in:()=>q,is:()=>q,eq:()=>q,order:()=>q,then:(resolve,reject)=>Promise.resolve(response).then(resolve,reject)};return q;
 }})};
}
test('regressão Ewerton: tabela ausente recupera arquivo antigo e mantém suas unidades',async()=>{
 const {b,ctx,store}=setup(ewerton);store.set(b.localProducoesKey,JSON.stringify([tfd,other]));missingBpa(ctx);b.renderAll=()=>{};
 await b.loadProducoes();assert.equal(b.accessLoadError,'');assert.equal(b.persistenceMode,'local');assert.ok(b.getUnidadesSistema().length>0);assert.equal(b.producoes.length,1);assert.equal(b.producoes[0].conteudo_arquivo,'original');assert.equal(JSON.parse(store.get(b.localProducoesKey)).length,2);
});
test('modo local: botão superior fica habilitado para Ewerton',async()=>{
 const {b,ctx}=setup(ewerton);missingBpa(ctx);const render=b.renderAll;b.renderAll=()=>{};await b.loadProducoes();
 for(const name of ['populateResponsaveisFilter','renderKPIs','renderActiveFiltersBar','renderChecklistFrancileide','renderTable'])b[name]=()=>{};
 const button={disabled:true},scope={textContent:''};ctx.document.getElementById=id=>id==='btnNovoEnvioBpa'?button:id==='bpaAccessScope'?scope:null;
 render.call(b);assert.equal(button.disabled,false);assert.match(scope.textContent,/navegador/);
});
test('modo local: novo anexo preserva arquivos de outras contas e aparece para ADM',async()=>{
 const {b,ctx,store,session}=setup(ewerton);store.set(b.localProducoesKey,JSON.stringify([other]));missingBpa(ctx);b.renderAll=()=>{};await b.loadProducoes();
 const saved=await b.saveProducao({estabelecimentoNome:tfd.estabelecimento_nome,cnes:tfd.cnes,nomeArquivo:'TFD.FEV',conteudo:'novo',competencia:'02/2026'});
 assert.equal(saved._localOnly,true);assert.equal(JSON.parse(store.get(b.localProducoesKey)).length,2);
 session.set('argos_user',JSON.stringify({username:'admin',role:'ADM'}));await b.loadProducoes();assert.ok(b.producoes.some(p=>p.id===saved.id));assert.ok(b.producoes.some(p=>p.id===other.id));
});
test('exclusão local não reaparece após recarga nem pelo cache de outra conta',async()=>{
 const {b,ctx,store,session}=setup(ewerton);store.set(b.localProducoesKey,JSON.stringify([tfd,other]));store.set('argos_producoes_bpa:admin',JSON.stringify([{...tfd,_localOnly:true}]));missingBpa(ctx);b.renderAll=()=>{};b.showToast=()=>{};await b.loadProducoes();
 assert.equal(await b.deleteProducao(tfd.id),true);await b.loadProducoes();assert.equal(b.producoes.length,0);
 session.set('argos_user',JSON.stringify({username:'admin',role:'ADM'}));await b.loadProducoes();assert.equal(b.producoes.some(p=>p.id===tfd.id),false);assert.equal(b.producoes.length,1);
});
test('permissão negada continua bloqueando; não vira modo local',async()=>{
 const {b,ctx,store}=setup(ewerton);store.set(b.localProducoesKey,JSON.stringify([tfd]));missingBpa(ctx,'42501');b.renderAll=()=>{};await b.loadProducoes();assert.ok(b.accessLoadError);assert.equal(b.producoes.length,0);assert.equal(b.persistenceMode,'cloud');
});
