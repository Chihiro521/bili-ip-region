import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
if (!files.length) throw new Error('请先将准备公开的文件加入 Git 暂存区。');
const findings = [];
for (const file of files) {
  if (/^(?:work|outputs|node_modules|dist|\.playwright-cli)\/|(?:^|\/)\.env(?:\.|$)|\.(?:pem|crx|zip|sqlite|db|log)$/i.test(file)) {
    findings.push(`${file}: 包含本地数据或构建产物`);
    continue;
  }
  if (/\.png$/i.test(file)) continue;
  const text = await readFile(file, 'utf8');
  for (const [label, pattern] of [
    ['本机绝对路径', /[A-Za-z]:[\\/](?:Users|workspace|Dev)[\\/]/],
    ['GitHub 凭据', /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/],
    ['私钥', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ]) if (pattern.test(text)) findings.push(`${file}: ${label}`);
  const credentials = /(?:SESSDATA|bili_jct|access_token|accessToken|refresh_token)\s*["']?\s*[:=]\s*["']([A-Za-z0-9_.%-]{8,})["']/g;
  for (const match of text.matchAll(credentials)) {
    if (!/^(?:fixture|unused|example|mock|test)[_.-]/i.test(match[1])) findings.push(`${file}: 硬编码登录字段`);
  }
}
if (findings.length) throw new Error(findings.join('\n'));
console.log(`公开文件检查通过：${files.length} 个 Git 文件；模拟凭据均使用明确的 fixture 标记。`);
