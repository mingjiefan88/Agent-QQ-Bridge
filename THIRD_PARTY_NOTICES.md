# 来源、许可与分发边界

**许可按组件分别适用。根目录 MIT 仅覆盖本项目原创代码与图标；Windows 完整包还含 NapCat 的非商业再分发条款，不能把整个完整包表述为 MIT 授权。** 本文件、`LICENSE`、`third_party/NapCat-LICENSE.txt` 及各官方压缩包内的许可声明应随发布保留。

## 本项目原创实现

Codex QQ Bridge 原创源码采用根目录 MIT 许可。`src/server.js`、`bot.js`、`codex.js`、`napcat.js`、配置、启动器、网页与MCP入口为独立实现。`qq-*` 功能模块来自为该机器人独立新增的模块，本次迁入时删除私人默认配置并接入新入口。

`icons/bridge.svg`、其 PNG/ICO 导出与 `public/bridge.svg`、`public/favicon.ico` 为本项目原创桥接图标，不使用腾讯 QQ 或 OpenAI 官方标志。图片逐项 SHA256 见 `third_party/assets.lock.json`；`scripts/generate-icons.py` 仅用于维护者重建导出，运行插件不依赖 Python 或 Pillow。

历史私人部署基于 [Epic0522/Codex-Remote-Contact](https://github.com/Epic0522/Codex-Remote-Contact)，截至2026-10-29其根目录没有明确LICENSE。本包不包含该上游的整合 `server.js`、原网页、macOS模块或私人Git历史。引用项目名称不表示获得额外授权。

## NapCatQQ 4.18.41

- 作者与版权：Copyright © 2024 Mlikiowa，NapNeko/NapCatQQ。
- 来源：[固定发布页](https://github.com/NapNeko/NapCatQQ/releases/tag/v4.18.41)、[对应源码](https://github.com/NapNeko/NapCatQQ/tree/v4.18.41)。
- 包：`NapCat.Shell.zip`，官方文件原字节，SHA256见`third_party/napcat.lock.json`。
- 许可：**Limited Redistribution License for NapCat**，完整原文在`third_party/NapCat-LICENSE.txt`。该许可限制商业使用，要求再分发附完整许可和清楚的来源版权说明。
- Windows完整包包含原压缩包，安装后仅在用户本地实例写入连接配置。没有公开发布修改后的NapCat源码。其附带原生模块与依赖保留官方文件内容和原有声明。

本项目MIT许可不覆盖NapCat及其依赖；含NapCat的完整包限非商业使用。没有把本项目标成NapCat官方作品。QQ客户端由用户从腾讯官方渠道单独安装，不再分发QQ安装包或任何账号票据。

## Node.js 22.14.0 Windows x64

完整包附带 [Node.js官方便携发行包](https://nodejs.org/dist/v22.14.0/)，SHA256对照同目录官方SHASUMS256.txt记录于`third_party/node.lock.json`。原压缩包保留全部LICENSE及第三方声明，MIT及包内列出的第三方许可分别适用。安装器不注册系统服务、不改变系统Node版本。

## QR Code Generator for JavaScript 1.4.4

Copyright (c) 2009 Kazuhiko Arase，MIT。固定npm包`qrcode-generator@1.4.4`已按npm元数据SHA512验证，浏览器脚本保持原样。来源与单文件SHA256见`third_party/qrcode.lock.json`，完整MIT声明在`third_party/qrcode-LICENSE.txt`。

## yt-dlp

点歌下载组件由用户在控制台点击安装时，从[官方固定版本发布页](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.26)下载并按官方摘要验证。本仓库和Windows包不再分发其可执行文件。Windows预构建程序包含第三方依赖，其分发许可不应简化成只有源码的Unlicense；使用者应查阅该版本上游与附带组件声明。下载来源记录在安装数据目录。

## Codex

使用本机Codex CLI及用户自己的登录，未捆绑Codex可执行文件、账户凭据或授权。使用遵循对应OpenAI服务与软件条款。此仓库分发不是官方商店审核或背书。

## EigenFlux CLI 0.7.7（可选下载）

机器人可按用户选择，从 [EigenFlux 官方 CDN](https://cdn.eigenflux.ai/cli/0.7.7/eigenflux-windows-amd64.exe) 下载固定版本 Windows AMD64 CLI；版本、大小与 SHA256 见 `third_party/eigenflux.lock.json`。本仓库和 Windows 完整包不捆绑该可执行文件。下载后的 CLI、官方签名技能与身份数据保存在机器人的独立本地目录，不写入主 Codex Agent 的目录。

上游源码与许可来自 [phronesis-io/eigenflux](https://github.com/phronesis-io/eigenflux) 的 [LICENSE](https://github.com/phronesis-io/eigenflux/blob/main/LICENSE)：Apache License 2.0 基础许可及 EigenFlux 商标附加限制，保留原文于 `third_party/EigenFlux-LICENSE.txt`，并附 [Apache 官方基础条款全文](https://www.apache.org/licenses/LICENSE-2.0.txt) 于 `third_party/Apache-2.0.txt`。品牌与商标权不因源码许可而转让；本项目仅描述与 EigenFlux 的兼容，不代表上游官方服务或背书。官方服务的邮箱验证、账户使用与相应服务条款另行适用。
