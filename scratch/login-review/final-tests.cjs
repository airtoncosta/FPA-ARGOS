const {chromium}=require('C:/Users/Controle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage();
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(/supabase|consultafns|apidadosabertos/.test(u.hostname)||u.pathname.startsWith('/api/'))return r.abort();return r.continue();});
 await page.goto('http://localhost:3000/',{waitUntil:'domcontentloaded'});
 await page.locator('#login-container').waitFor({state:'visible'});
 const results=[];
 for(const [w,h] of [[1600,777],[1366,650],[1024,768],[1920,1080],[2560,1080],[760,900],[761,900],[390,844],[320,568],[844,390]]){
  await page.setViewportSize({width:w,height:h});
  const m=await page.locator('#login-container').evaluate(el=>{const card=el.querySelector('.login-card');return {width:card.getBoundingClientRect().width,columns:getComputedStyle(card).gridTemplateColumns.split(' ').length,hero:getComputedStyle(el.querySelector('.hero-copy')).display,subtitle:getComputedStyle(el.querySelector('.brand-subtitle')).display,overflow:el.scrollWidth>el.clientWidth+1,font:getComputedStyle(el.querySelector('#login-username')).fontSize};});
  if(m.overflow||m.font!=='16px'||m.columns!==(w<=760?1:2)||m.width>(w<=760?433:1017))throw Error(JSON.stringify({w,h,m}));
  if(w<=760&&(m.hero!=='none'||m.subtitle==='none'))throw Error('Mobile deve usar Órbita');
  if(w===1600||w===390)await page.screenshot({path:`scratch/login-review/final-${w}.png`,fullPage:true});
  results.push({w,h,...m});
 }
 await page.setViewportSize({width:1366,height:768});
 await page.evaluate(()=>{
  window.__calls=0;
  SupabaseConfig.isConnected=()=>true;
  SupabaseService.authLogin=async()=>{window.__calls++;return {success:false,message:'Credenciais inválidas.'};};
  LoginModule.logAction=async()=>{};
  window.AccountModule=null;window.MunicipioContext=null;window.renderArquivosManager=null;
  SupabaseService.loadLogo=async()=>null;SupabaseService.loadSigtap=async()=>null;
 });
 await page.locator('#login-username').fill('interface-teste');await page.locator('#login-password').fill('Teste123!');
 await page.locator('#btn-login-submit').click();
 await page.getByRole('alert').filter({hasText:'Credenciais inválidas.'}).waitFor();
 if(await page.locator('#login-transition').isVisible())throw Error('Animou login inválido');
 await page.evaluate(()=>{SupabaseService.authLogin=async()=>{window.__calls++;return {success:true,user:{username:'interface-teste',name:'Teste de Interface',role:'VISITANTE',email:'teste@example.invalid'}};};});
 const started=Date.now();await page.locator('#btn-login-submit').click();
 await page.locator('#login-transition').waitFor({state:'visible'});
 if(await page.evaluate(()=>document.body.classList.contains('logged-in')))throw Error('Painel abriu antes da animação');
 await page.evaluate(()=>{LoginModule.handleLogin();LoginModule.handleLogin();});
 await page.waitForTimeout(1000);
 const media=await page.locator('#login-opening-video').evaluate(v=>({time:v.currentTime,paused:v.paused,ready:v.readyState,duration:v.duration,playing:v.parentElement.classList.contains('video-playing')}));
 await page.screenshot({path:'scratch/login-review/entrada-olho.png'});
 await page.locator('#login-transition').waitFor({state:'hidden'});
 const elapsed=Date.now()-started;
 if(elapsed<2800||elapsed>5500)throw Error('Duração inesperada: '+elapsed);
 await page.waitForFunction(()=>document.body.classList.contains('logged-in'));
 if(await page.evaluate(()=>window.__calls)!==2)throw Error('Login duplicado');
 const paused=await page.locator('#login-opening-video').evaluate(v=>v.paused);if(!paused)throw Error('Vídeo não parou');
 await page.evaluate(()=>LoginModule.checkSession());
 if(await page.locator('#login-transition').isVisible())throw Error('Repetiu animação na sessão existente');
 // Login local e falha de autoplay: permanecem funcionais.
 await page.evaluate(async()=>{
  LoginModule.showLoginUI();sessionStorage.removeItem('argos_user');localStorage.removeItem('argos_user');
  SupabaseConfig.isConnected=()=>false;
  const password=await CryptoUtils.sha256('Teste123!');
  localStorage.setItem('argos_users_db',JSON.stringify([{username:'interface-teste',name:'Teste',email:'teste@example.invalid',role:'VISITANTE',status:'ATIVO',password}]));
  document.querySelector('#login-opening-video').play=()=>Promise.reject(new Error('Autoplay bloqueado no teste'));
 });
 await page.locator('#login-username').fill('interface-teste');await page.locator('#login-password').fill('Teste123!');
 await page.locator('#btn-login-submit').click();await page.locator('#login-transition').waitFor({state:'visible'});
 await page.locator('#login-transition').waitFor({state:'hidden'});await page.waitForFunction(()=>document.body.classList.contains('logged-in'));
 await page.evaluate(()=>LoginModule.showLoginUI());await page.emulateMedia({reducedMotion:'reduce'});
 const reduced=await page.evaluate(async()=>{const start=performance.now();await ArgosLoginTransition.play();return performance.now()-start;});
 if(reduced>250||await page.locator('#login-transition').isVisible())throw Error('Movimento reduzido');
 await page.locator('#toggle-password-visibility').focus();await page.keyboard.press('Enter');
 if(await page.locator('#login-password').getAttribute('type')!=='text')throw Error('Toggle teclado');
 fs.writeFileSync('scratch/login-review/final-tests.json',JSON.stringify({passed:true,results,elapsed,media,tests:['invalid login','online login','offline login','duplicate submission','video playback and pause','autoplay fallback','session restore','reduced motion','keyboard']},null,2));
 console.log(JSON.stringify({passed:true,viewports:results.length,elapsed,media}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});