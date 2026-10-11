import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('dist/manifest.json', root), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
assert.equal(manifest.version, pkg.version, '扩展和源码版本必须一致');
const paths = [manifest.background.service_worker, manifest.action.default_popup,
  ...manifest.content_scripts.flatMap(script => script.js), ...Object.values(manifest.action.default_icon)];
for (const path of paths) {
  assert.ok(!path.includes('..') && !path.startsWith('/'), '资源必须位于扩展目录内');
  await access(new URL(`dist/${path}`, root));
}
for (const size of [16, 32, 48, 128]) {
  const png = await readFile(new URL(`dist/${manifest.icons[size]}`, root));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', '图标必须是 PNG');
  assert.equal(png.readUInt32BE(16), size, 'PNG 宽度必须匹配声明尺寸');
  assert.equal(png.readUInt32BE(20), size, 'PNG 高度必须匹配声明尺寸');
}
console.log(`扩展 ${pkg.version} 的入口、版本及四种图标尺寸检查通过。`);
