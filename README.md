<p align="center"><img src="docs/assets/logo.png" width="96" height="96" alt="B站 IP 属地 Logo"></p>

# B站网页 IP 属地

在 B 站网页中显示评论、楼中楼和 UP 主个人主页的 IP 属地。支持 Chrome / Edge，使用 Manifest V3 和 TypeScript。

[下载最新版](https://github.com/Chihiro521/bili-ip-region/releases/latest) · [更新记录](CHANGELOG.md) · [MIT 许可](LICENSE)

当前版本：**0.3.4 预览版**。

## 功能

| 位置 | 显示方式 | 状态 |
| --- | --- | --- |
| 视频与动态评论 | 时间后显示地区，例如「刚刚 河北 回复」 | 已接入 |
| 楼中楼回复 | 每条回复显示自身发表时的地区 | 已接入 |
| UP 主个人主页 | 用户名旁显示灰底白字的「IP属地：地区」胶囊 | 已接入，需首次授权 |
| 动态正文 | 扩展弹窗内提供取数诊断 | 实验阶段 |
| 专栏正文 | 尚未接入页面显示 | 计划中 |

评论和主页开关默认开启。接口返回非空地区且内容 ID / UID 对应时显示；空字段、失败或不对应时移除标签。支持滚动加载、页面切换、节点复用和主题切换。

个人主页胶囊样式（合成数据示例）：

![主页属地胶囊示例](docs/assets/profile-badge.png)

## 安装

1. 从 [GitHub Releases](https://github.com/Chihiro521/bili-ip-region/releases/latest) 下载 `bili-ip-region-版本号.zip` 并解压。
2. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`，开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择解压后的 **`bili-ip-region/dist`** 目录。
4. 刷新已经打开的 B 站网页，进入评论区即可使用。

更新时覆盖原目录，点击扩展管理页的刷新按钮，再刷新 B 站网页。工具栏中固定扩展图标后，可随时打开设置。

## 使用个人主页属地

1. 在当前浏览器登录 B 站，打开一个 UP 主主页。
2. 点击扩展图标，保持「个人主页属地」开启，点击「授权主页查询」。
3. 允许扩展访问 B 站登录接口。此操作会为当前网页登录账号创建设备登录凭据，保存在此浏览器的扩展本地存储中。
4. 显示「已授权」后自动查询当前主页。之后打开其他 UP 主主页，会按各自 UID 查询对应账号。

查看者的凭据用于请求资料，标签展示的是**当前打开的目标账号**的主页属地。评论继续使用每条评论发表时的属地。

「清除本地授权」会清除扩展中的凭据与主页缓存。要撤销对应设备登录，可到 B 站账号设置操作；授权过期时重新点击授权按钮。

## 未显示时

- 更新扩展后，同时刷新扩展和 B 站页面，让新的页面脚本加载。
- 评论数据需要包含 `reply_control.location`；未返回或返回空字符串时不显示。
- 主页需要完成授权，且接口返回该账号的 `location` 标签。
- 两个开关只控制各自的显示。清除授权后，主页标签会移除。

## 数据与权限

评论模块读取网页已经取得的评论组件与接口数据，不增加逐条评论查询。主页由扩展后台请求 B 站 App 资料接口，并核对返回 UID。

开关存储在 `chrome.storage.sync`；登录凭据仅存储在当前浏览器的扩展本地存储，并限制为扩展可信上下文访问。页面脚本只取得目标 UID 和地区，凭据不会放入页面 DOM 或动态诊断报告。

主页缓存以目标 UID 为键：非空结果 30 分钟，空结果 5 分钟，最多 200 项。重新授权或清除授权会清空缓存。

访问 B 站网页用于注入标签；访问 B 站 API / App 主机用于取数；登录主机权限只在点击主页授权按钮时申请。

## 动态正文

动态正文仍在验证阶段。可在弹窗展开「动态正文取数诊断」并打开完整验证页面，输入动态 ID 或链接，查看请求和返回 ID、发布者、地区及结果。

当前解析 `ptime_location_text` 和顶层 `ModuleCopyright` 中明确标注「IP属地」的文字。取得至少两个真实发布者的非空发布属地、核对动态 ID 后，再接入动态列表、详情及个人空间的正文标签。

## 开发

需要 Node.js 24 或更新版本。Windows 可使用 PowerShell 7。

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

## 验证范围

23 项代码测试覆盖 ID 精度、地区解析、账号对应、授权顺序、默认请求上下文及动态协议。浏览器检查使用实际加载的扩展与明确标注的合成数据，覆盖评论组件、楼中楼、主页节点、授权开关、主题、缓存和快速切换。原生 Worker `fetch` 的旧报错已复现并修复。

已有真实 Chrome 评论页面的地区核对记录。浏览器自动检查中的 App 授权和地区返回使用模拟响应；Chrome / Edge 全场景验证仍需更多实际页面记录。参见 [验证说明](docs/verification.md)。

## 许可与来源

本项目采用 [MIT 许可](LICENSE)。评论 Hook 参考 BiliReveal，主页取数参考 BiliRevealForSpace，设备授权流程改编自 libBilibiliToken，保留对应 MIT 声明。

完整来源和依赖声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
