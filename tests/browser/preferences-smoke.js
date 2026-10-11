// 先在此独立测试配置中设置旧版 local.commentsEnabled=false，删除 sync 设置，重启浏览器。
async (page) => {
  const worker = page.context().serviceWorkers().find(worker => worker.url().endsWith('/background.js'));
  if (!worker) throw new Error('扩展后台未加载');
  await page.goto(worker.url().replace(/\/background\.js$/, '/popup.html'));
  await page.locator('#profile-status').filter({ hasText: '尚未授权' }).waitFor();
  const checks = {
    oldCommentSwitchMigrated: !await page.locator('#comments-enabled').isChecked(),
    homepageDefaultEnabled: await page.locator('#profiles-enabled').isChecked(),
  };
  const response = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'preferences:get' }));
  checks.backgroundReturnsMigratedPreferences = response?.ok && response.preferences.commentsEnabled === false && response.preferences.profilesEnabled === true;
  await worker.evaluate(async () => { await chrome.storage.sync.set({ commentsEnabled: true, profilesEnabled: true }); await chrome.storage.local.remove('commentsEnabled'); });
  const report = { version: '0.3.0', source: 'isolated Chromium; persisted old preference; actual extension restart', testedAt: new Date().toISOString(), checks, allPassed: Object.values(checks).every(Boolean) };
  if (!report.allPassed) throw new Error(JSON.stringify(report));
  return report;
}
