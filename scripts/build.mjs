import { build } from 'esbuild';
import { mkdir, copyFile, cp } from 'node:fs/promises';
import './generate-icons.mjs';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/background.ts', 'src/popup.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'chrome121',
  sourcemap: true,
});
await build({
  entryPoints: ['src/comment-page.ts', 'src/comment-bridge.ts', 'src/profile-page.ts', 'src/article-page.ts', 'src/dynamic-main.ts', 'src/dynamic-page.ts'],
  outdir: 'dist', bundle: true, format: 'iife', target: 'chrome121', sourcemap: true,
});
for (const name of ['manifest.json', 'popup.html', 'popup.css']) {
  await copyFile(`static/${name}`, `dist/${name}`);
}
await cp('licenses', 'dist/licenses', { recursive: true });
await cp('static/icons', 'dist/icons', { recursive: true });
console.log('评论、动态、专栏与主页版本已构建到 dist/');
