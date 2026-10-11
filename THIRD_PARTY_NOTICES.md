# 第三方来源与许可

本项目采用 MIT 许可。第三方代码与依赖的声明分别保留如下：

| 来源 | 用途 | 许可 |
| --- | --- | --- |
| [maxchang3/BiliReveal](https://github.com/maxchang3/BiliReveal) | 评论组件 Hook；参考提交 `15fdd5a6a789579c9abc4ea99cb1ce4114e68160` | [MIT](licenses/BiliReveal-MIT.txt) |
| [BiliRevealForSpace](https://github.com/maxchang3/userscripts/blob/main/BiliRevealForSpace/BiliRevealForSpace.user.js) | 主页属地字段与页面布局参考 | MaxChang3 的 MIT 项目 |
| [lzghzr/libBilibiliToken](https://github.com/lzghzr/TampermonkeyJS/blob/master/libBilibiliToken/libBilibiliToken.ts) | 设备授权流程及公开客户端签名参数 | [MIT](licenses/libBilibiliToken-MIT.txt) |
| [emn178/js-md5](https://github.com/emn178/js-md5) | App 请求签名所需 MD5 | [MIT](licenses/js-md5-MIT.txt) |
| [yisibl/resvg-js](https://github.com/yisibl/resvg-js) | 构建时把 SVG Logo 渲染为 PNG | MPL-2.0，仅开发依赖 |
| [bilibili-API-collect](https://github.com/pskdje/bilibili-API-collect) | 动态 protobuf 协议字段参考 | 仅作协议参考 |

`src/profile-client-constants.ts` 中的值来自公开客户端实现，用于请求签名。使用者的登录凭据仅在运行时保存在扩展本地存储中。
