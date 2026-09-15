const { chromium } = require('C:/Users/Controle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
(async () => {
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 const page = await browser.newPage();
 // Nenhuma integração externa de dados é executada na verificação de interface.
 await page.route('**/*', route => {
  const u = new URL(route.request().url());
  if (/supabase|consultafns|apidadosabertos/.test(u.hostname) || u.pathname.startsWith('/api/')) return route.abort();
  return route.continue();
 });
 const results=[];
 for (const [width,height] of [[1600,777],[1366,650],[1024,768],[1920,1080],[2560,1080],[390,844],[320,568],[844,390]]) {
  await page.setViewportSize({width,height});
  await page.goto('http://localhost:3000/',{waitUntil:'domcontentloaded'});
  await page.locator('#login-container').waitFor({state:'visible'});
  await page.waitForTimeout(650);
  const metrics=await page.locator('#login-container').evaluate(el => {
   const card=el.querySelector('.login-card').getBoundingClientRect();
   const input=el.querySelector('#login-username');
   return {cardWidth:card.width,left:card.left,top:card.top,font:getComputedStyle(input).fontSize,overflow:el.scrollWidth>el.clientWidth+1};
  });
  if(metrics.cardWidth>461||metrics.left<0||metrics.top<0||metrics.overflow||metrics.font!=='16px') throw Error(JSON.stringify({width,height,metrics}));
  results.push({screen:`${width}x${height}`,login:metrics});
 }
 for(const variant of ['orbita','observatorio']) {
  for(const [width,height] of [[1440,900],[1366,650],[390,844],[320,568],[844,390]]) {
   await page.setViewportSize({width,height});
   await page.goto('http://localhost:3000/login-opcoes.html#'+variant,{waitUntil:'networkidle'});
   if(await page.locator('body').getAttribute('data-variant')!==variant) throw Error('Wrong variant');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   if(overflow) throw Error(`Overflow ${variant} ${width}x${height}`);
   if(width===1440 || width===390) await page.screenshot({path:`scratch/login-review/${variant}-${width}.png`,fullPage:true});
   results.push({variant,screen:`${width}x${height}`,overflow});
  }
 }
 await page.getByRole('button',{name:'01 · Órbita'}).click();
 if(await page.locator('body').getAttribute('data-variant')!=='orbita') throw Error('Variant switch');
 await page.getByLabel('Senha',{exact:true}).fill('Exemplo123!');
 await page.getByRole('button',{name:'Mostrar senha'}).click();
 if(await page.locator('#preview-password').getAttribute('type')!=='text') throw Error('Password toggle');
 await page.getByRole('button',{name:'Entrar no sistema'}).click();
 await page.getByRole('status').filter({hasText:'prévia de design'}).waitFor();
 await page.emulateMedia({reducedMotion:'reduce'});
 const animation=await page.locator('.scan').evaluate(el=>getComputedStyle(el).animationName);
 if(animation!=='none') throw Error('Reduced motion');
 await page.setViewportSize({width:1600,height:777});
 await page.goto('http://localhost:3000/',{waitUntil:'domcontentloaded'});
 await page.locator('#login-container').waitFor({state:'visible'});
 await page.getByRole('button',{name:'Mostrar senha'}).focus();
 await page.keyboard.press('Enter');
 if(await page.locator('#login-password').getAttribute('type')!=='text') throw Error('Keyboard toggle');
 await page.screenshot({path:'scratch/login-review/login-corrigido.png',fullPage:true});
 fs.writeFileSync('scratch/login-review/resultados.json',JSON.stringify({passed:true,results,interactions:'switch, password, demo submit, reduced motion'},null,2));
 console.log(JSON.stringify({passed:true,viewports:results.length,interactions:4}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});