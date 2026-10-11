async (page) => {
  await page.route('https://www.bilibili.com/__bili_ip_fixture__', route => route.fulfill({ contentType: 'text/html', body: __FIXTURE_HTML__ }));
  await page.route('https://api.bilibili.com/x/v2/reply?fixture=1', route => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': 'https://www.bilibili.com' },
    body: JSON.stringify({ code: 0, data: { replies: [{ rpid_str: '1006', reply_control: { location: 'IP属地：广东' } }] } }),
  }));
  await page.goto('https://www.bilibili.com/__bili_ip_fixture__');
  async function waitLabels(expected) {
    await page.waitForFunction(n => {
      const visit = root => [...root.querySelectorAll('*')].reduce((sum, el) =>
        sum + (el.matches('[data-bili-ip-region]') ? 1 : 0) + (el.shadowRoot ? visit(el.shadowRoot) : 0), 0);
      return visit(document) === n;
    }, expected, { timeout: 10000 });
  }
  const checks = {};
  await waitLabels(6);
  const initialRegions = await page.locator('[data-bili-ip-region]').allTextContents();
  checks.litLegacyVueAndFetch = ['河北', '浙江', '北京', '上海', '四川', '广东'].every(s => initialRegions.includes(s));
  checks.afterTime = await page.locator('[data-bili-ip-region]').evaluateAll(nodes => nodes.every(n => n.previousElementSibling?.matches('#pubdate,.reply-time,.sub-reply-time')));
  checks.directShadowRootTime = await page.locator('#main').evaluate(node => {
    const time = node.shadowRoot.querySelector('#pubdate');
    const label = node.shadowRoot.querySelector('[data-bili-ip-region]');
    return time.parentElement === null && time.parentNode === node.shadowRoot && time.nextElementSibling === label && label.textContent === '河北';
  });
  await page.locator('.sub-reply-item').evaluate(n => {
    n.__vueParentComponent = { props: {}, parent: { props: { reply: { rpid_str: '1004', reply_control: { location: 'IP属地：上海' } } } } };
    n.classList.add('updated');
  });
  await waitLabels(5);
  checks.subReplyDoesNotUseParentRegion = await page.locator('.sub-reply-item [data-bili-ip-region]').count() === 0;
  await page.locator('.sub-reply-item').evaluate(n => {
    n.__vueParentComponent = { props: { subReply: { rpid_str: '1005', reply_control: { location: 'IP属地：四川' } } } };
    n.classList.remove('updated');
  });
  await waitLabels(6);
  await page.evaluate(() => fixture.update('1007', 'IP属地：安徽'));
  checks.nodeReuse = await page.locator('#main [data-bili-ip-region]').evaluate(n => n.dataset.replyId === '1007' && n.textContent === '安徽');
  await page.evaluate(() => fixture.update('1008', ''));
  await waitLabels(5);
  checks.emptyRemoves = await page.locator('#main [data-bili-ip-region]').count() === 0;
  await page.evaluate(() => { for (let i = 0; i < 10; i++) fixture.update('1001', 'IP属地：河北'); });
  await waitLabels(6);
  checks.noDuplicates = await page.locator('#main [data-bili-ip-region]').count() === 1;
  await page.evaluate(() => { fixture.append('1010', 'IP属地：福建').id = 'added'; });
  await waitLabels(7);
  checks.addedNodes = await page.locator('#added [data-bili-ip-region]').innerText() === '福建';
  await page.evaluate(() => document.getElementById('added').remove());
  await waitLabels(6);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForFunction(() => {
    const root = document.getElementById('main').shadowRoot;
    const label = root.querySelector('[data-bili-ip-region]'), time = root.querySelector('#pubdate');
    return getComputedStyle(label).color === getComputedStyle(time).color;
  }, null, { timeout: 10000 });
  checks.theme = true;
  const settings = await page.context().newPage();
  const worker = page.context().serviceWorkers().find(worker => worker.url().endsWith('/background.js'));
  if (!worker) throw new Error('扩展后台未加载');
  await settings.goto(worker.url().replace(/\/background\.js$/, '/popup.html'));
  await settings.locator('#comments-enabled').uncheck();
  await waitLabels(0);
  checks.switchOff = true;
  await settings.locator('#comments-enabled').check();
  await waitLabels(6);
  checks.switchOn = true;
  await settings.close();
  await page.route('https://api.bilibili.com/x/v2/reply?fixture=xhr', route => route.fulfill({
    contentType: 'application/json', headers: { 'access-control-allow-origin': 'https://www.bilibili.com' },
    body: JSON.stringify({ code: 0, data: { replies: [{ rpid_str: '1011', reply_control: { location: 'IP属地：宁夏' } }] } }),
  }));
  await page.evaluate(() => new Promise(resolve => {
    const node = document.createElement('div'); node.id = 'xhr'; node.className = 'reply-item card'; node.dataset.id = '1011';
    node.innerHTML = 'XHR 响应匹配评论 ID<div class="reply-info"><span class="reply-time">刚刚</span><button>回复</button></div>';
    document.body.append(node);
    const xhr = new XMLHttpRequest(); xhr.open('GET', 'https://api.bilibili.com/x/v2/reply?fixture=xhr'); xhr.onload = resolve; xhr.send();
  }));
  await waitLabels(7);
  checks.xhr = await page.locator('#xhr [data-bili-ip-region]').innerText() === '宁夏';
  await page.evaluate(() => document.getElementById('xhr').dataset.id = '1012');
  await waitLabels(6);
  checks.legacyNodeReuse = await page.locator('#xhr [data-bili-ip-region]').count() === 0;
  await page.evaluate(() => { document.getElementById('xhr').dataset.id = '1011'; document.documentElement.classList.remove('dark'); });
  await waitLabels(7);
  await page.screenshot({ path: 'outputs/评论行内效果.png', fullPage: true });
  const report = { version: await worker.evaluate(() => chrome.runtime.getManifest().version), source: 'isolated Chromium 153; synthetic fixture; actual unpacked extension', testedAt: new Date().toISOString(), checks, initialRegions, allPassed: Object.values(checks).every(Boolean) };
  if (!report.allPassed) throw new Error(JSON.stringify(report));
  return report;
}
