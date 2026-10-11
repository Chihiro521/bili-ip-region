<p align="center">
  <img src="docs/assets/logo.png" width="96" height="96" alt="B站 IP 属地 Logo">
</p>

<h1 align="center">B站网页 IP 属地</h1>

<p align="center">在 B 站网页中显示评论、楼中楼、动态、专栏与 UP 主个人主页的 IP 属地。</p>
<p align="center"><strong>Chrome / Edge · 0.4.5 预览版</strong></p>

<p align="center">
  <strong>简体中文</strong> · <a href="README.en.md">English</a><br>
  <a href="https://github.com/Chihiro521/bili-ip-region/releases/latest">下载最新版</a> ·
  <a href="CHANGELOG.md">更新记录</a> ·
  <a href="LICENSE">MIT 许可</a>
</p>

<p align="center">
  <a href="#实际效果">实际效果</a> ·
  <a href="#安装">安装</a> ·
  <a href="#授权动态与个人主页查询">首次授权</a> ·
  <a href="#未显示时">常见问题</a> ·
  <a href="#开发">开发</a>
</p>

## 功能

| 位置 | 显示方式 | 状态 |
| --- | --- | --- |
| 视频与动态评论 | 时间后显示地区，例如「刚刚 河北 回复」 | 已接入 |
| 楼中楼回复 | 每条回复显示自身发表时的地区 | 已接入 |
| UP 主个人主页 | 用户名旁显示灰底白字的「IP属地：地区」胶囊 | 已接入，需首次授权 |
| 动态正文 | 列表、详情和个人空间的地区胶囊；转发与原动态分别查询 | 已接入，需首次授权 |
| 专栏正文 | 旧版 `cv` 和新版 `opus`，在发表时间旁显示地区胶囊 | 已接入；接口需返回有效属地 |

四个显示开关默认开启。接口返回非空地区且内容 ID / UID 对应时显示；空字段、失败或不对应时移除标签。支持滚动加载、页面切换、节点复用和主题切换。

## 实际效果

以下截图来自真实 B 站网页，部分昵称已遮挡。点击图片可查看原图。

### 个人主页

用户名旁显示灰底白字的属地胶囊，示例为「IP属地：上海」。

<p>
  <a href="docs/assets/profile.png"><img src="docs/assets/profile.png" width="694" alt="真实 UP 主个人主页：用户名旁显示 IP属地：上海"></a>
</p>

### 评论与楼中楼

地区嵌入评论的时间行，楼中楼按每条回复分别显示。图中回复显示「广东」。

<p>
  <a href="docs/assets/comments.png"><img src="docs/assets/comments.png" width="840" alt="真实评论区与楼中楼：回复的发表时间后显示广东"></a>
</p>

### 动态与转发

转发动态和原动态各有自己的属地标签；图中两条内容均为「上海」。

<p>
  <a href="docs/assets/dynamic-repost.png"><img src="docs/assets/dynamic-repost.png" width="840" alt="真实动态转发：外层动态与原动态分别显示上海属地胶囊"></a>
</p>

### 专栏文章

文章时间旁显示属地胶囊，示例为「IP属地：北京」。

<p>
  <a href="docs/assets/article.png"><img src="docs/assets/article.png" width="700" alt="真实专栏文章：文章时间旁显示 IP属地：北京"></a>
</p>

## 安装

1. 从 [GitHub Releases](https://github.com/Chihiro521/bili-ip-region/releases/latest) 下载 `bili-ip-region-版本号.zip` 并解压。
2. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`，开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择解压后的 **`bili-ip-region/dist`** 目录。
4. 刷新已经打开的 B 站网页，进入评论区即可使用。

更新时覆盖原目录，点击扩展管理页的刷新按钮，再刷新 B 站网页。工具栏中固定扩展图标后，可随时打开设置。

## 授权动态与个人主页查询

1. 在当前浏览器登录 B 站，打开一个 UP 主主页。
2. 点击扩展图标，保持「个人主页属地」开启，点击「授权主页查询」。
3. 允许读取当前 B 站会话及访问登录接口。此操作会为当前网页登录账号创建设备登录凭据，保存在此浏览器的扩展本地存储中。
4. 扩展使用所选标签页所在窗口的会话，核对账号后完成授权；网页登录 Cookie 只用于此次后台确认，不写入扩展存储，接口返回的 Cookie 更新会被隔离。显示「已授权」后，动态和主页复用这份授权。其他 UP 主主页按各自 UID 查询。完整验证页也可以直接点击授权，扩展会使用最近打开的 B 站标签页。

主页标签展示的是**当前打开的目标账号**的主页属地。评论、动态和专栏使用各自内容发表时的属地，同一作者的不同内容可以显示不同地区。

「清除本地授权」会清除扩展中的凭据与动态、主页缓存，并移除依赖授权的标签。要撤销对应设备登录，可到 B 站账号设置操作；授权过期时重新点击授权按钮。

如果网页登录正常，但授权确认返回 `-101`，表示授权接口未认可该次请求的登录凭据。可重新登录 B 站后再点击授权；弹窗会保留接口返回的错误码和错误文字。

## 未显示时

- 更新扩展后，同时刷新扩展和 B 站页面，让新的页面脚本加载。
- 评论数据需要包含 `reply_control.location`；未返回或返回空字符串时不显示。
- 动态和主页需要完成授权，且接口返回对应内容或账号的属地。
- 专栏先读取文章自身的字段；网页属地为空时，可复用授权查询 App 文章详情。
- 四个开关只控制各自的显示。更新后确认设置顶部版本号与安装包一致。

## 数据与权限

评论模块读取网页已经取得的评论组件与接口数据，不增加逐条评论查询。动态由页面读取对应内容 ID，后台请求 App 详情；专栏核对 Opus 对应的 CV ID 后查询文章资料；主页由后台请求 App 资料接口，并核对返回 UID。

开关存储在 `chrome.storage.sync`；登录凭据仅存储在当前浏览器的扩展本地存储，并限制为扩展可信上下文访问。页面脚本只取得内容 ID、目标 UID 和地区，凭据不会放入页面 DOM 或诊断报告。

动态缓存以内容 ID 为键，主页缓存以目标 UID 为键：非空结果 30 分钟，空结果 5 分钟，各最多 200 项。重新授权或清除授权会清空缓存。动态按接近可见区域的卡片取数，后台最多同时处理三条动态请求。

访问 B 站网页用于注入标签；访问 B 站 API / App 主机用于取数；读取 Cookie 和访问登录主机的权限只在点击主页授权按钮时申请。会话读取仅发生在授权流程中，临时请求规则在结束后移除。

## 查询诊断

展开「动态与专栏查询诊断」，输入动态 ID 或专栏链接，可查看对应内容的结果。「复制报告」复制诊断结果；旧版本报告会提示重新验证。

## 开发

使用 Manifest V3 和 TypeScript。开发需要 Node.js 24 或更新版本，Windows 可使用 PowerShell 7。

```powershell
npm ci
npm run check
npm test
npm run build
npm run check:assets
pwsh -NoProfile -File scripts/package.ps1
```

构建输出在 `dist/`，安装包在 `outputs/`。修改 Logo 源文件 `static/icons/logo.svg` 后，构建会自动生成各尺寸 PNG。

项目提供 GitHub Actions：检查公开文件、TypeScript、代码测试、构建、图标和打包，并上传构建产物。

## 许可与来源

本项目采用 [MIT 许可](LICENSE)。评论 Hook 参考 BiliReveal，主页取数参考 BiliRevealForSpace，设备授权流程改编自 libBilibiliToken，保留对应 MIT 声明。

完整来源和依赖声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
