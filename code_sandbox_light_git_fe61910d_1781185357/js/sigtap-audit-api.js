/* Adaptador da API já utilizada pelo módulo SIGTAP. Envia somente código público e competência. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SigtapAuditApi=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';const origin='https://sigtap-api.vercel.app';const prefix=origin+'/api/v1/sigtap/procedimentos/';
async function request(url,fetcher){const r=await fetcher(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('SIGTAP HTTP '+r.status);return r.json();}
async function relation(code,cm,name,fetcher){let url=prefix+code+'/'+name+'/?competencia='+cm+'&page_size=200';const all=[],visited=new Set();let total=null;while(url){const u=new URL(url);if(u.origin!==origin||u.pathname!==new URL(prefix+code+'/'+name+'/').pathname||u.searchParams.get('competencia')!==cm||visited.has(url))throw Error('Paginação SIGTAP inconsistente.');visited.add(url);const d=await request(url,fetcher);if(d.competencia!==cm||!Array.isArray(d.results)||!Number.isInteger(d.count))throw Error('Relação SIGTAP sem competência/cobertura confirmada.');if(total!==null&&total!==d.count)throw Error('Relação alterada durante consulta.');total=d.count;all.push(...d.results);url=d.next;}if(all.length!==total)throw Error('Relação SIGTAP incompleta.');return all;}
async function load(records,fetcher=fetch){const grouped=new Map();for(const r of records)if(/^\d{10}$/.test(r.procedimento)&&/^\d{4}(0[1-9]|1[0-2])$/.test(r.competencia))grouped.set(r.competencia+':'+r.procedimento,r);
 const bases={},sources=[];const queue=[...grouped.values()];let cursor=0;const concurrency=3;
 async function worker(){while(cursor<queue.length){const r=queue[cursor++],cm=r.competencia,code=r.procedimento;const base=bases[cm]||(bases[cm]={competencia:cm,validada:true,completo:false,fonte:'API SIGTAP configurada: '+origin,procedimentos:{},cobertura:{}});
 try{const d=await request(prefix+code+'/?competencia='+cm,fetcher);if(d.competencia!==cm||d.co_procedimento!==code)throw Error('Código/competência divergente na resposta.');
 const numeric=v=>{const n=typeof v==='number'?v:Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null;};
 const proc={codigo:code,nome:d.no_procedimento,sexo:d.tp_sexo,idade:{min:d.vl_idade_minima,max:d.vl_idade_maxima,unidade:'meses'},limiteQuantidade:d.qt_maxima_execucao===9999?{aplicavel:false}:{max:d.qt_maxima_execucao,escopo:'registro'},valorSa:numeric(d.vl_sa),valorSh:numeric(d.vl_sh),valorSp:numeric(d.vl_sp),valorSaConhecido:Object.prototype.hasOwnProperty.call(d,'vl_sa'),cobertura:{}};
 if(Array.isArray(d.registros)){proc.instrumentos=d.registros.map(x=>x.co_registro);proc.cobertura.instrumentos=true;}
 const relations=[['cbos','ocupacoes',x=>x.ocupacao?.co_ocupacao],['cids','cids',x=>x.cid?.co_cid],['servicos','servicos',x=>({servico:x.servico_classificacao?.co_servico,classificacao:x.servico_classificacao?.co_classificacao})],['habilitacoes','habilitacoes',x=>x.habilitacao?.co_habilitacao]];
 // Limite global de três procedimentos, com relações sequenciais para não saturar o serviço.
 for(const [key,path,mapper]of relations){try{const rows=await relation(code,cm,path,fetcher);proc[key]=rows.map(mapper).filter(x=>x!==null);if(proc[key].some(x=>x===undefined||typeof x==='object'&&(!x.servico||!x.classificacao)))throw Error('Formato da relação inválido.');proc.cobertura[key]=true;}catch(e){proc.cobertura[key]=false;}}
  try{const attrs=await relation(code,cm,'detalhes',fetcher),rules=await relation(code,cm,'regras-condicionadas',fetcher),compat=await relation(code,cm,'compativeis',fetcher);
  // Detalhes 058 (CPF obrigatório) e 012 (idade no BPA-C) são exigências verificáveis por linha.
  // Demais detalhes (ex: 053 PMAE, 060 modalidade), regras de financiamento e compatibilidades
  // são atributos informativos do procedimento: sem verificação por linha, não bloqueiam o parecer.
  const mapearDetalhe=x=>{const a=x.detalhe||{};const co=String(a.co_detalhe||'').trim();const nome=String(a.no_detalhe||'não identificado').trim();
  if(co==='058')return{tipo:'campoObrigatorio',campo:'cpfPaciente',codigo:co,fonte:nome};
  if(co==='012')return{tipo:'idadeBpaC',codigo:co,fonte:nome};
  return{tipo:'informativo',codigo:co,fonte:nome};};
  proc.regrasComplementares=attrs.map(mapearDetalhe);
  proc.regrasComplementares.push(...rules.map(x=>{const rc=x.regra_condicionada||{};const co=String(rc.co_regra_condicionada||'').trim();const ds=String(rc.ds_regra_condicionada||rc.no_regra_condicionada||'Regra condicionada').trim();return{tipo:'informativo',codigo:co,fonte:'Regra '+co+': '+ds};}),...compat.map(x=>{const co=String(x.procedimento_compativel?.co_procedimento||'').trim();return{tipo:'informativo',codigo:co,fonte:'Compatibilidade '+String(x.tp_compatibilidade||'?')+' com '+co};}));
  proc.cobertura.regrasComplementares=true;
  }catch(e){proc.cobertura.regrasComplementares=false;}
 base.procedimentos[code]=proc;sources.push({tipo:'SIGTAP API',competencia:cm,estado:'Procedimento '+code+' consultado',fonte:base.fonte});
 }catch(e){sources.push({tipo:'SIGTAP API',competencia:cm,estado:'Não verificado: '+code,fonte:e.message});}
 }}await Promise.all(Array.from({length:Math.min(concurrency,queue.length)},worker));return {bases,sources};}
return {load,relation};});
