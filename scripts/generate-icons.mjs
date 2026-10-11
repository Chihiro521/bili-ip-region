import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const svg = await readFile(new URL('../static/icons/logo.svg', import.meta.url));
for (const size of [16, 32, 48, 128]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  await writeFile(new URL(`../static/icons/icon-${size}.png`, import.meta.url), png);
}
await mkdir(new URL('../docs/assets/', import.meta.url), { recursive: true });
const preview = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng();
await writeFile(new URL('../docs/assets/logo.png', import.meta.url), preview);
console.log('已生成 16 / 32 / 48 / 128 图标及 README Logo。');
