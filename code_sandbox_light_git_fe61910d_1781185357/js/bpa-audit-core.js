/* Auditoria determinística BPA. Nenhuma linha simulada, inferência de idade ou regra por prefixo. */
(function(root,factory){ const api=factory(); if(typeof module==='object'&&module.exports) module.exports=api; else root.BpaAuditCore=api; })(typeof window==='object'?window:globalThis,function(){
'use strict';
const comp=v=>{const s=String(v||'').trim();return /^\d{4}(0[1-9]|1[0-2])$/.test(s)?s:/^(0[1-9]|1[0-2])\/\d{4}$/.test(s)?s.slice(3)+s.slice(0,2):'';};
const integer=v=>/^\d+$/.test(String(v))?Number(v):null;
function date(v){if(!/^\d{8}$/.test(v||''))return null;const d=new Date(Date.UTC(+v.slice(0,4),+v.slice(4,6)-1,+v.slice(6)));return d.toISOString().slice(0,10).replace(/-/g,'')===v?d:null;}
function validCns(v){return /^[12789]\d{14}$/.test(v||'')&&!/^(.)\1+$/.test(v)&&[...v].reduce((a,n,i)=>a+Number(n)*(15-i),0)%11===0;}
function validCpf(v){if(!/^\d{11}$/.test(v||'')||/^(.)\1+$/.test(v))return false;for(let n=9;n<11;n++){let sum=0;for(let i=0;i<n;i++)sum+=Number(v[i])*(n+1-i);const digit=(sum*10%11)%10;if(digit!==Number(v[n]))return false;}return true;}
function parse(text){
 const records=[],issues=[];let header=null;const source=String(text||'').replace(/^\uFEFF/,'').split(/\r\n|\n|\r/);
 source.forEach((raw,i)=>{if(raw==='')return;const line=i+1;const field=(a,b)=>raw.slice(a-1,b).trim();const type=raw.slice(0,2);
 if(type==='01'){if(header)issues.push({linha:line,mensagem:'Cabeçalho duplicado.'});header={competencia:field(8,13),quantidade:integer(field(14,19)),controle:integer(field(26,29))};const headerLength=raw.length;if(i!==0||!raw.startsWith('01#BPA#')||![130,131,132].includes(headerLength)||!comp(header.competencia))issues.push({linha:line,mensagem:'Cabeçalho fora do layout BPA (130 caracteres de conteúdo, sem CR/LF).'});return;}
 if(!['02','03'].includes(type)){issues.push({linha:line,mensagem:'Tipo de registro não reconhecido: '+type+'.'});return;}
 const individual=type==='03';const r={linha:line,tipo:individual?'BPA-I':'BPA-C',cnes:field(3,9),competencia:field(10,15),cbo:individual?field(31,36):field(16,21),cnsProfissional:individual?field(16,30):'',dataAtendimento:individual?field(37,44):'',folha:individual?field(45,47):field(22,24),sequencia:individual?field(48,49):field(25,26),procedimento:individual?field(50,59):field(27,36),idade:individual?field(86,88):field(37,39),quantidade:individual?field(89,94):field(40,45),cnsPaciente:individual?field(60,74):'',sexo:individual?field(75,75):'',cid:individual?field(82,85):'',nascimento:individual?field(143,150):'',servico:individual?field(160,162):'',classificacao:individual?field(163,165):'',cpfPaciente:individual?field(339,349):'',raw};
 // O exportador pode acrescentar até dois campos de extensão antes do CR/LF.
 // Espaços de preenchimento no fim não alteram o layout; os campos oficiais continuam nas mesmas posições.
 const expectedLength=individual?349:48;const contentLength=raw.length;
 r.layoutKnown=contentLength>=expectedLength&&contentLength<=expectedLength+2;
 if(!r.layoutKnown)issues.push({linha:line,mensagem:'Comprimento '+contentLength+' não corresponde ao layout validado '+r.tipo+' ('+expectedLength+' a '+(expectedLength+2)+' caracteres de conteúdo). Conferir versão da exportação.'});
 records.push(r);
 });
 if(!header)issues.push({linha:1,mensagem:'Cabeçalho BPA não encontrado.'});
 if(header&&header.quantidade!==records.length)issues.push({linha:1,mensagem:'Cabeçalho informa '+header.quantidade+' registros, mas foram lidos '+records.length+'.'});
 if(header&&records.length&&records.every(r=>/^\d{10}$/.test(r.procedimento)&&integer(r.quantidade)!==null)){
 const sum=records.reduce((a,r)=>(a+BigInt(r.procedimento)+BigInt(r.quantidade))%1111n,0n);if(header.controle!==Number(sum)+1111)issues.push({linha:1,mensagem:'Campo de controle do cabeçalho difere do cálculo dos procedimentos e quantidades.'});}
 return {records,issues,header};
}
function audit(input,bases={}){
 const parsed=typeof input==='string'?parse(input):input;const records=parsed.records||[];const findings=[];const checks={};const seen=new Map();let conformes=0,naoConformes=0,inconclusivos=0;let valorReferenciaSa=0,valorNaoConformeSa=0,registrosValorizados=0,registrosSemValor=0;
 function add(r,rule,status,message,expected='',observed=''){
  const c=checks[rule]||(checks[rule]={CONFORME:0,NAO_CONFORME:0,NAO_VERIFICADO:0,NAO_APLICAVEL:0,ALERTA:0});c[status]++;
  if(status==='CONFORME'||status==='NAO_APLICAVEL')return;
  findings.push({linha:r.linha||0,competencia:r.competencia||'',cnes:r.cnes||'',cns:r.cnsProfissional||'',procedimento:r.procedimento||'',tipo:r.tipo||'',regra:rule,status,mensagem:message,esperado:String(expected),encontrado:String(observed)});
 }
 for(const problem of parsed.issues||[])add(problem,'ESTRUTURA','NAO_CONFORME',problem.mensagem,'Layout BPA documentado');
 if(!records.length)add({},'ARQUIVO','NAO_VERIFICADO','Nenhum registro real de produção foi encontrado.');
 for(const r of records){const before=findings.length;let rowValorSa=null;const individual=r.tipo==='BPA-I';const cm=comp(r.competencia);const base=bases[cm]||{};const cnesBase=base.cnes;const sig=base.sigtap;const qty=integer(r.quantidade);const age=integer(r.idade);
 const mark=(rule,status,msg,expected,observed)=>add(r,rule,status,msg,expected,observed);
 const check=(rule,ok,msg,expected,observed)=>mark(rule,ok?'CONFORME':'NAO_CONFORME',msg,expected,observed);
 const missing=(rule,msg)=>mark(rule,'NAO_VERIFICADO',msg);
 check('COMPETENCIA',!!cm,'Competência do atendimento inválida.','AAAAMM',r.competencia);
 check('CNES_FORMATO',/^\d{7}$/.test(r.cnes),'CNES deve conter sete dígitos.','7 dígitos',r.cnes);
 check('PROCEDIMENTO_FORMATO',/^\d{10}$/.test(r.procedimento),'Código de procedimento inválido.','10 dígitos',r.procedimento);
 check('QUANTIDADE',qty!==null&&qty>0,'Quantidade deve ser um inteiro positivo.','Maior que zero',r.quantidade);
 check('IDADE_FORMATO',age!==null&&age<=130,'Idade ausente ou inválida.','0 a 130 anos',r.idade);
 if(!individual&&!r.cbo)mark('CBO_FORMATO','NAO_APLICAVEL','CBO consolidado não informado; a exigência será confrontada com SIGTAP.');else check('CBO_FORMATO',/^[A-Z0-9]{6}$/.test(r.cbo),'CBO ausente ou inválido.','6 caracteres CBO',r.cbo);
 check('FOLHA_SEQUENCIA',integer(r.folha)>0&&integer(r.folha)<=999&&integer(r.sequencia)>0&&integer(r.sequencia)<=20,'Folha ou sequência fora do domínio do layout.','Folha 001..999; sequência 01..20',r.folha+'/'+r.sequencia);
 if(individual){check('SEXO_FORMATO',['M','F'].includes(r.sexo),'Sexo no BPA-I deve ser M ou F.','M ou F',r.sexo);
 if(r.cid)check('CID_FORMATO',/^[A-Z][0-9]{2}[A-Z0-9]?$/.test(r.cid),'CID informado fora do formato esperado.','Código CID sem pontuação',r.cid);
 check('CNS_PROFISSIONAL',validCns(r.cnsProfissional),'CNS do profissional inválido (formato/dígito verificador).','CNS válido',r.cnsProfissional);
 const dt=date(r.dataAtendimento),dn=date(r.nascimento);
 check('DATA_ATENDIMENTO',!!dt&&r.dataAtendimento.slice(0,6)===cm,'Data de atendimento inválida ou fora da competência da linha.',cm,r.dataAtendimento);
 check('NASCIMENTO',!!dn&&!!dt&&dn<=dt,'Nascimento inválido ou posterior ao atendimento.','Data válida anterior ao atendimento',r.nascimento);
 if(dt&&dn&&dn<=dt){const years=dt.getUTCFullYear()-dn.getUTCFullYear()-((r.dataAtendimento.slice(4)<r.nascimento.slice(4))?1:0);check('IDADE_CALCULADA',years===age,'Idade informada difere da calculada na data do atendimento.',years,r.idade);}
 if(r.cpfPaciente)check('CPF_PACIENTE',validCpf(r.cpfPaciente),'CPF do paciente preenchido é inválido.','CPF válido',r.cpfPaciente);
 if(r.cnsPaciente)check('CNS_PACIENTE',validCns(r.cnsPaciente),'CNS do paciente preenchido é inválido.','CNS válido',r.cnsPaciente);
 }else mark('CNS_PROFISSIONAL','NAO_APLICAVEL','BPA-C não identifica profissional por CNS.');
 const cnesReady=cnesBase&&comp(cnesBase.competencia)===cm&&cnesBase.oficial===true;
 let unit=null;
 if(!cnesReady)missing('BASE_CNES','Base CNES oficial da competência '+(cm||'inválida')+' indisponível; não será usada outra competência.');
 else {unit=(cnesBase.estabelecimentos||[]).find(u=>String(u.cnes)===r.cnes);
 if(!unit){if(cnesBase.completo===true)mark('UNIDADE_CNES','NAO_CONFORME','Unidade não localizada na base CNES da competência.',cm,r.cnes);else missing('UNIDADE_CNES','Cobertura da base CNES não permite concluir ausência da unidade.');}
 else{check('UNIDADE_CNES',unit.desabilitado!==true,'Unidade desabilitada na competência consultada.','Unidade ativa',r.cnes);
 if(!individual&&!r.cbo)mark('VINCULO_PROFISSIONAL','NAO_APLICAVEL','BPA-C sem identificação de CBO.');
 else if(!Array.isArray(unit.profissionais))missing('VINCULO_PROFISSIONAL','Relação de profissionais não importada.');
 else {const links=unit.profissionais.filter(p=>(!individual||String(p.cns)===r.cnsProfissional)&&String(p.cbo)===r.cbo&&p.ativo!==false&&!/inativo|desligado/i.test(p.situacao||'')&&(!comp(p.compDesativacao)||comp(p.compDesativacao)>cm));
 if(links.length)mark('VINCULO_PROFISSIONAL','CONFORME','Vínculo CNS/CBO na unidade e competência confirmado.');
 else if(cnesBase.cobertura?.profissionais===true)mark('VINCULO_PROFISSIONAL','NAO_CONFORME',individual?'Não localizado vínculo ativo deste CNS com este CBO na unidade e competência.':'Não localizado profissional com este CBO na unidade e competência.',cm+' / '+r.cnes+' / '+r.cbo,r.cnsProfissional);
 else missing('VINCULO_PROFISSIONAL','Cadastro parcial: ausência de vínculo não pode ser confirmada.');}
 }}
 const sigReady=sig&&comp(sig.competencia)===cm&&(sig.oficial===true||sig.validada===true);
 if(!sigReady){missing('BASE_SIGTAP','SIGTAP oficial com relações da competência '+(cm||'inválida')+' indisponível.');}
 else {const proc=sig.procedimentos?.[r.procedimento];
 if(!proc){if(sig.completo===true)mark('PROCEDIMENTO_VIGENTE','NAO_CONFORME','Procedimento inexistente na tabela da competência.',cm,r.procedimento);else missing('PROCEDIMENTO_VIGENTE','Catálogo parcial: não é possível concluir se o procedimento está vigente.');}
 else{mark('PROCEDIMENTO_VIGENTE','CONFORME','Procedimento localizado na competência.');
 const valorRaw=proc.valorSa??proc.vl_sa??proc.valor_sa;const valorSa=typeof valorRaw==='number'?valorRaw:Number(String(valorRaw??'').replace(',','.'));const valorConhecido=proc.valorSaConhecido===true||Object.prototype.hasOwnProperty.call(proc,'valorSa')||Object.prototype.hasOwnProperty.call(proc,'vl_sa')||Object.prototype.hasOwnProperty.call(proc,'valor_sa');if(valorConhecido&&Number.isFinite(valorSa)&&qty!==null&&qty>0){rowValorSa=valorSa*qty;mark('VALOR_SIGTAP','CONFORME','Valor ambulatorial SA localizado na tabela SIGTAP.',valorSa.toFixed(2),rowValorSa.toFixed(2));}else if(!Number.isFinite(valorSa)){registrosSemValor++;}
 const relation=(name,fn)=>{if((proc.cobertura||sig.cobertura)?.[name]!==true||!Array.isArray(proc[name]))missing(name.toUpperCase(),'Relação '+name+' não importada integralmente para este procedimento/competência.');else fn(proc[name]);};
 relation('cbos',values=>values.length?check('CBO_SIGTAP',values.includes(r.cbo),'CBO incompatível com o código completo do procedimento.',values.join(', '),r.cbo):mark('CBO_SIGTAP','NAO_APLICAVEL','Sem exigência de CBO na relação completa.'));
 relation('instrumentos',values=>check('INSTRUMENTO',values.includes(individual?'02':'01')||(individual&&values.includes('01')),'Instrumento BPA incompatível com o procedimento.',values.join(', '),r.tipo));
 relation('cids',values=>{if(!individual)return mark('CID','NAO_APLICAVEL','BPA-C não identifica CID individual.');if(!values.length)return mark('CID','NAO_APLICAVEL','Procedimento sem relação CID na tabela completa.');check('CID',values.includes(String(r.cid).toUpperCase().replace(/\./g,'')),'CID ausente ou incompatível com o procedimento.',values.join(', '),r.cid);});
 relation('servicos',values=>{if(!values.length)return mark('SERVICO_CLASSIFICACAO','NAO_APLICAVEL','Procedimento sem exigência nessa relação completa.');
 const pairs=values.map(x=>String(x.servico)+'/'+String(x.classificacao));
 if(individual)check('SERVICO_INFORMADO',pairs.includes(r.servico+'/'+r.classificacao),'Serviço/classificação informado incompatível com o procedimento.',pairs.join(', '),r.servico+'/'+r.classificacao);
 if(!unit||cnesBase.cobertura?.servicos!==true||!Array.isArray(unit.servicos))return missing('SERVICO_CNES','Serviços/classificações da unidade não importados integralmente nesta competência.');
 const candidates=individual?values.filter(v=>v.servico===r.servico&&v.classificacao===r.classificacao):values;
 check('SERVICO_CNES',candidates.some(v=>unit.servicos.some(u=>String(u.codigo||u.servico)===v.servico&&String(u.classificacao)===v.classificacao)),'Serviço e classificação não encontrados juntos no CNES da unidade.',pairs.join(', '),r.servico+'/'+r.classificacao);});
 relation('habilitacoes',values=>{if(!values.length)return mark('HABILITACAO','NAO_APLICAVEL','Sem exigência nesta relação completa.');if(!unit||cnesBase.cobertura?.habilitacoes!==true||!Array.isArray(unit.habilitacoes))return missing('HABILITACAO','Habilitações da unidade não importadas para a competência.');check('HABILITACAO',values.some(v=>unit.habilitacoes.includes(v)),'Nenhuma habilitação exigida consta no CNES da unidade.',values.join(', '),unit.habilitacoes.join(', '));});
 if(individual){if(!['M','F','I','N'].includes(proc.sexo))missing('SEXO','Restrição de sexo não disponível no SIGTAP.');else if(proc.sexo==='M'||proc.sexo==='F')check('SEXO',r.sexo===proc.sexo,'Sexo incompatível com o procedimento.',proc.sexo,r.sexo);else mark('SEXO','NAO_APLICAVEL','Sem restrição de sexo.');}else mark('SEXO','NAO_APLICAVEL','BPA-C não identifica sexo individual.');
 if(!proc.idade||!['anos','meses'].includes(proc.idade.unidade)||!Number.isFinite(proc.idade.min)||!Number.isFinite(proc.idade.max))missing('FAIXA_ETARIA','Faixa etária com unidade conhecida não importada.');
 else {let low=age,high=age;if(proc.idade.unidade==='meses'){const dn=date(r.nascimento),dt=date(r.dataAtendimento);if(individual&&dn&&dt){low=(dt.getUTCFullYear()-dn.getUTCFullYear())*12+dt.getUTCMonth()-dn.getUTCMonth()-(dt.getUTCDate()<dn.getUTCDate()?1:0);high=low;}else {low=age===null?null:age*12;high=low===null?null:low+11;}}
 if(low===null)missing('FAIXA_ETARIA','Idade não informada.');else if(low>=proc.idade.min&&high<=proc.idade.max)mark('FAIXA_ETARIA','CONFORME','Idade compatível.');else if(high<proc.idade.min||low>proc.idade.max)mark('FAIXA_ETARIA','NAO_CONFORME','Idade fora da faixa SIGTAP.',proc.idade.min+'..'+proc.idade.max+' '+proc.idade.unidade,low+'..'+high);else missing('FAIXA_ETARIA','Idade consolidada em anos não permite resolver limite em meses.');}
 // Quantidade consolidada não equivale a quantidade por paciente.
 if(!individual)mark('LIMITE_QUANTIDADE','NAO_APLICAVEL','Quantidade agregada BPA-C: limite individual não pode ser aplicado ao total.');
 else if(proc.limiteQuantidade?.aplicavel===false)mark('LIMITE_QUANTIDADE','NAO_APLICAVEL','SIGTAP informa limite não aplicável (9999).');
 else if(!proc.limiteQuantidade||!Number.isFinite(proc.limiteQuantidade.max)||proc.limiteQuantidade.escopo!=='registro')missing('LIMITE_QUANTIDADE','Limite e escopo de quantidade não disponíveis; não será aplicado teto arbitrário.');else check('LIMITE_QUANTIDADE',qty!==null&&qty<=proc.limiteQuantidade.max,'Quantidade excede o limite por registro da regra importada.',proc.limiteQuantidade.max,qty);
 // Relações adicionais não carregadas impedem parecer integral.
 relation('regrasComplementares',rules=>{for(const rule of rules){if(!individual&&rule.tipo==='campoObrigatorio')mark('ATRIBUTO_COMPLEMENTAR','NAO_APLICAVEL','Campo individual não consta no BPA-C.');else if(rule.tipo==='campoObrigatorio'&&['cid','cnsPaciente','cpfPaciente','servico','classificacao'].includes(rule.campo))check('ATRIBUTO_COMPLEMENTAR',!!r[rule.campo],'Campo obrigatório pela regra importada: '+rule.campo,rule.fonte||'Regra complementar',r[rule.campo]);else if(rule.tipo==='idadeBpaC'&&individual)mark('IDADE_BPA_C','NAO_APLICAVEL','Atributo específico do BPA-C.');else if(rule.tipo==='idadeBpaC')check('IDADE_BPA_C',age!==null,'Idade exigida no BPA-C.','Idade preenchida',r.idade);else missing('REGRAS_COMPLEMENTARES','Exige conferência da regra: '+String(rule.tipo));}});
 }}
 const dupKey=r.raw||JSON.stringify(r);if(seen.has(dupKey))mark('DUPLICIDADE','ALERTA','Linha idêntica à linha '+seen.get(dupKey)+'. Conferir possível duplicidade; não excluir automaticamente.');else seen.set(dupKey,r.linha);
 const rowFindings=findings.slice(before);if(Number.isFinite(rowValorSa)){for(const finding of rowFindings)if(finding.valorSa===undefined)finding.valorSa=rowValorSa;valorReferenciaSa+=rowValorSa;registrosValorizados++;if(rowFindings.some(f=>f.status==='NAO_CONFORME'))valorNaoConformeSa+=rowValorSa;}if(rowFindings.some(f=>f.status==='NAO_CONFORME'))naoConformes++;else if(rowFindings.length||!r.layoutKnown)inconclusivos++;else conformes++;
 }
 const critical=findings.filter(f=>f.status==='NAO_CONFORME').length;const pending=findings.filter(f=>f.status==='NAO_VERIFICADO').length;const alerts=findings.filter(f=>f.status==='ALERTA').length;
 const status=critical?'NAO_CONFORME':pending||alerts||!records.length?'INCONCLUSIVO':'CONFORME';
 return {status,totalLinhas:records.length,registrosConformes:conformes,registrosNaoConformes:naoConformes,registrosInconclusivos:inconclusivos,naoConformidades:critical,naoVerificados:pending,alertas:alerts,checks,findings,competencias:[...new Set(records.map(r=>r.competencia))],valorReferenciaSa,valorNaoConformeSa,registrosValorizados,registrosSemValor,geradoEm:new Date().toISOString(),header:parsed.header||null};
}
return {parse,audit,validCns,competencia:comp};
});
