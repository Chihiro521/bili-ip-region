async (page) => {
  const worker = page.context().serviceWorkers().find(worker => worker.url().endsWith('/background.js'));
  if (!worker) throw new Error('扩展后台未加载');
  const version = await worker.evaluate(() => chrome.runtime.getManifest().version);
  const popupUrl = worker.url().replace(/\/background\.js$/, '/popup.html#diagnostics');
  await worker.evaluate(async () => {
    await chrome.storage.local.remove(['profileAuth', 'lastProbe']);
    await chrome.storage.sync.set({ articlesEnabled: true, dynamicsEnabled: false });
    self.fixtureArticleCalls = {}; self.fixtureArticleAuthAttached = false;
    const originalFetch = self.fetch;
    self.fixtureOriginalFetch = originalFetch;
    self.fixturePermissionContains = chrome.permissions.contains;
    chrome.permissions.contains = async () => true;
    self.fixtureAuthSteps = [];
    const join = (...parts) => { const out = new Uint8Array(parts.reduce((n,p)=>n+p.length,0)); let i=0; for(const p of parts){out.set(p,i);i+=p.length;}return out; };
    const vi = value => { let n=BigInt(value),out=[];do{const b=Number(n&127n);n>>=7n;out.push(b|(n?128:0));}while(n);return Uint8Array.from(out); };
    const num = (field,value)=>join(vi(field*8),vi(value));
    const bytes = (field,value)=>join(vi(field*8+2),vi(value.length),value);
    const text = (field,value)=>bytes(field,new TextEncoder().encode(value));
    const opusFor = cv => '1245177092906156'+cv.padStart(3,'0');
    const frame = (cv, bad=false) => {
      const id=opusFor(cv), item=join(num(1,id),num(2,1),num(3,bad?'999':cv),bytes(4,bytes(2,num(1,10))),bytes(4,bytes(31,text(1,'IP属地：广东'))),bytes(5,text(1,id)));
      const payload=bytes(1,item),header=new Uint8Array(5);new DataView(header.buffer).setUint32(1,payload.length);return join(header,payload);
    };
    const bodyCv = input => { const body=new Uint8Array(input);let pos=5;const read=()=>{let n=0n,shift=0n;while(pos<body.length){const b=body[pos++];n|=BigInt(b&127)<<shift;if(!(b&128))return n;shift+=7n;}throw Error('truncated fixture request');};while(pos<body.length){const tag=read(),wire=Number(tag&7n);if(wire===0){const value=read();if((tag>>3n)===2n)return value.toString();}else if(wire===2){pos+=Number(read());}else throw Error('fixture wire');}throw Error('no oid'); };
    self.fetch = async function(input,init){
      if(this!==undefined && this!==globalThis) throw new TypeError('Illegal invocation');
      const url=new URL(String(input));
      if(url.pathname==='/x/web-interface/nav') return Response.json({code:0,data:{isLogin:true,mid:999}});
      if(url.hostname==='passport.bilibili.com') {
        self.fixtureAuthSteps.push(url.pathname.split('/').at(-1));
        if(url.pathname.endsWith('/auth_code')) return Response.json({code:0,data:{auth_code:'fixture-auth-code'}});
        if(url.pathname.endsWith('/confirm')) return Response.json({code:0});
        return Response.json({code:0,data:{mid:999,access_token:'fixture-only-access-token',expires_in:3600}});
      }
      if(url.pathname==='/x/polymer/web-dynamic/v1/detail') {
        const id=url.searchParams.get('id'),cv=id.slice(-3);
        return Response.json({code:0,data:{item:{id_str:id,type:cv==='910'?'DYNAMIC_TYPE_DRAW':'DYNAMIC_TYPE_ARTICLE',basic:{rid_str:cv},modules:{module_author:{mid:10}}}}});
      }
      if(url.pathname==='/x/article/viewinfo') {
        const cv=url.searchParams.get('id');self.fixtureArticleCalls[cv]=(self.fixtureArticleCalls[cv]??0)+1;
        if(cv==='400') return new Response('failed',{status:503});
        if(cv==='600') await new Promise(resolve=>setTimeout(resolve,900));
        return Response.json({code:0,data:{mid:cv==='500'?99:10,location:({'100':'河北','200':'浙江','600':'福建','700':'上海'})[cv]??''}});
      }
      if(url.pathname==='/bilibili.app.dynamic.v2.Opus/OpusDetail') {
        self.fixtureArticleAuthAttached = new Headers(init.headers).get('authorization')==='identify_v1 fixture-only-access-token';
        const cv=bodyCv(init.body);return new Response(frame(cv,cv==='900'),{headers:{'grpc-status':'0'}});
      }
      return originalFetch(input,init);
    };
  });
  await page.route('https://www.bilibili.com/**', route=>route.fulfill({contentType:'text/html',body:__FIXTURE_HTML__}));
  await page.goto('https://www.bilibili.com/read/cv100');
  const settings = await page.context().newPage();await settings.goto(popupUrl);
  const labels=page.locator('[data-bili-ip-region-article],[data-bili-ip-region-body]'),checks={};
  await labels.filter({hasText:'河北'}).waitFor();
  checks.legacyCvAndTimestamp = await labels.getAttribute('data-article-id')==='100' && await labels.evaluate(el=>el.previousElementSibling.matches('.publish-text'));
  await page.evaluate(()=>fixtureArticle.switch('/opus/1245177092906156200'));
  await labels.filter({hasText:'浙江'}).waitFor();
  checks.opusMappedToCv = await labels.getAttribute('data-content-id')==='1245177092906156200' && await labels.getAttribute('data-article-id')==='200';
  checks.sameAuthorDifferentContents = await labels.innerText()==='IP属地：浙江';
  await page.evaluate(()=>fixtureArticle.render()); await labels.filter({hasText:'浙江'}).waitFor();
  checks.reusedAnchor = await labels.count()===1;
  await page.evaluate(()=>{for(let i=0;i<8;i++) document.querySelector('#app').classList.toggle('changed');});
  checks.noDuplicates = await labels.count()===1;
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  checks.themeAndCompactSize = await labels.evaluate(el=>{const s=getComputedStyle(el),anchor=el.previousElementSibling??el.parentElement;return s.color==='rgb(255, 255, 255)'&&s.backgroundColor==='rgb(97, 102, 109)'&&s.fontSize===getComputedStyle(anchor).fontSize&&s.borderRadius==='999px'&&el.getBoundingClientRect().height<22;});
  await settings.locator('#articles-enabled').uncheck();await labels.waitFor({state:'detached'});checks.switchOff=true;
  await settings.locator('#articles-enabled').check();await labels.filter({hasText:'浙江'}).waitFor();checks.switchOn=true;
  await page.evaluate(()=>fixtureArticle.switch('/read/cv100'));await labels.filter({hasText:'河北'}).waitFor();
  checks.cacheByContent = await worker.evaluate(()=>self.fixtureArticleCalls['100']===1&&self.fixtureArticleCalls['200']===1);
  for(const cv of ['300','400','500']) {
    await page.evaluate(cv=>fixtureArticle.switch('/opus/1245177092906156'+cv),cv);await labels.waitFor({state:'detached'});
    await worker.evaluate(async cv=>{for(let i=0;i<60&&!self.fixtureArticleCalls[cv];i++)await new Promise(r=>setTimeout(r,30));if(!self.fixtureArticleCalls[cv])throw Error('query missing');},cv);
    checks[{'300':'emptyNoLabel','400':'failureNoLabel','500':'wrongAuthorNoLabel'}[cv]]=await labels.count()===0;
  }
  await page.evaluate(()=>fixtureArticle.switch('/read/cv600'));
  await worker.evaluate(async()=>{while(!self.fixtureArticleCalls['600'])await new Promise(r=>setTimeout(r,30));});
  await page.evaluate(()=>fixtureArticle.switch('/read/cv700'));await labels.filter({hasText:'上海'}).waitFor();
  await worker.evaluate(()=>new Promise(r=>setTimeout(r,1000)));
  checks.staleResponseNoCrossArticle=await labels.getAttribute('data-article-id')==='700' && await labels.innerText()==='IP属地：上海';
  await settings.evaluate(()=>{chrome.permissions.request=async()=>true;});
  await settings.bringToFront();await settings.locator('#profile-authorize').click();
  await settings.locator('#profile-status').filter({hasText:'已授权'}).waitFor();
  checks.authorizeFromFullPageUsesBiliTab=await worker.evaluate(()=>self.fixtureAuthSteps.join(',')==='auth_code,confirm,poll');
  await page.evaluate(()=>fixtureArticle.switch('/opus/1245177092906156800'));await labels.filter({hasText:'广东'}).waitFor();
  checks.authenticatedArticleFallback=await worker.evaluate(()=>self.fixtureArticleAuthAttached===true);
  checks.noCredentialInDom=!(await page.content()).includes('fixture-only-access-token');
  await page.evaluate(()=>fixtureArticle.switch('/opus/1245177092906156900'));await labels.waitFor({state:'detached'});
  await worker.evaluate(async()=>{while(!self.fixtureArticleCalls['900'])await new Promise(r=>setTimeout(r,30));});
  checks.wrongAppCvNoLabel=await labels.count()===0;
  await page.evaluate(()=>fixtureArticle.switch('/opus/1245177092906156910'));await labels.waitFor({state:'detached'});
  checks.normalPostNoArticleLabel=await labels.count()===0;
  await settings.locator('#article-url').fill('https://www.bilibili.com/read/cv100');await settings.locator('#run').click();
  await settings.locator('#status').filter({hasText:'专栏查询已完成'}).waitFor();
  checks.reportVersionAndAuthorization=await settings.locator('#version').innerText()===`评论 · 动态 · 专栏 · 主页 · ${version}` && (await settings.locator('#session').innerText()).includes('App 会话：已授权');
  const report=await worker.evaluate(async()=>(await chrome.storage.local.get('lastProbe')).lastProbe);
  checks.reportNoCredential=report.version===version&&report.appAuthorized===true&&!JSON.stringify(report).includes('fixture-only-access-token');
  await settings.locator('#profile-clear').click();
  await page.evaluate(()=>fixtureArticle.switch('/opus/1245177092906156800'));
  await labels.waitFor({state:'detached'});
  checks.clearAuthorizationDropsAppResult=await labels.count()===0;
  await worker.evaluate(async()=>{await chrome.storage.local.remove(['profileAuth','lastProbe']);});
  await settings.close();
  await worker.evaluate(()=>{self.fetch=self.fixtureOriginalFetch;chrome.permissions.contains=self.fixturePermissionContains;delete self.fixtureOriginalFetch;delete self.fixturePermissionContains;});
  const result={version,source:'isolated browser; unpacked extension; synthetic article and App responses',checks,allPassed:Object.values(checks).every(Boolean),realArticleRegionVerified:false};
  if(!result.allPassed)throw Error(JSON.stringify(result));return result;
}
