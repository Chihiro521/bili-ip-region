$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
$taskInfo = Get-Content -LiteralPath (Join-Path $taskProjectRoot 'package.json') -Raw | ConvertFrom-Json
$taskManifestPath = Join-Path $taskProjectRoot 'dist/manifest.json'
if (-not (Test-Path -LiteralPath $taskManifestPath)) { throw '请先执行 npm run build。' }
$taskManifest = Get-Content -LiteralPath $taskManifestPath -Raw | ConvertFrom-Json
if ($taskManifest.version -ne $taskInfo.version) { throw '构建版本与源码不一致，请重新构建。' }
$taskStage = Join-Path $taskProjectRoot ('work/package-' + [Guid]::NewGuid().ToString('N') + '/bili-ip-region')
$taskRuntime = Join-Path $taskStage 'dist'
$null = New-Item -ItemType Directory -Path $taskRuntime -Force
foreach ($taskName in @('background.js','popup.js','comment-page.js','comment-bridge.js','profile-page.js','manifest.json','popup.html','popup.css')) {
  Copy-Item -LiteralPath (Join-Path $taskProjectRoot ('dist/' + $taskName)) -Destination $taskRuntime
}
foreach ($taskName in @('icons','licenses')) {
  Copy-Item -LiteralPath (Join-Path $taskProjectRoot ('dist/' + $taskName)) -Destination $taskRuntime -Recurse
}
foreach ($taskName in @('README.md','README.en.md','LICENSE','THIRD_PARTY_NOTICES.md','CHANGELOG.md','licenses')) {
  Copy-Item -LiteralPath (Join-Path $taskProjectRoot $taskName) -Destination $taskStage -Recurse
}
$null = New-Item -ItemType Directory -Path (Join-Path $taskStage 'docs') -Force
Copy-Item -LiteralPath (Join-Path $taskProjectRoot 'docs/assets') -Destination (Join-Path $taskStage 'docs') -Recurse
$taskInstall = @"
Chrome / Edge 安装：
1. 解压这个 ZIP。
2. Chrome 打开 chrome://extensions，Edge 打开 edge://extensions。
3. 开启开发者模式，点击“加载已解压的扩展程序”。
4. 选择本目录下的 dist 文件夹。
5. 刷新 B 站网页。主页属地需要在扩展弹窗点击“授权主页查询”。
详细说明见 README.md。
"@
$taskInstall | Set-Content -LiteralPath (Join-Path $taskStage '安装说明.txt') -Encoding utf8
$taskOutputs = Join-Path $taskProjectRoot 'outputs'
$null = New-Item -ItemType Directory -Path $taskOutputs -Force
$taskArchive = Join-Path $taskOutputs ('bili-ip-region-' + $taskInfo.version + '.zip')
Compress-Archive -LiteralPath $taskStage -DestinationPath $taskArchive -Force
Get-Item -LiteralPath $taskArchive | Select-Object FullName,Length
