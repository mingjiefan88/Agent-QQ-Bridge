# Codex QQ Bridge 1.0.0

**Windows 上的 Codex 专用 QQ 机器人：一个界面完成登录、主人与群绑定、人格设置、功能开关和实时监控。**

使用本机 Codex CLI 和你自己的账号，不需要在机器人里填写 OpenAI API Key。没有运行时 npm 依赖。Windows 完整包包含未经修改的 **NapCat 4.18.41** 官方压缩包和 **Node.js 22.14.0** 便携运行时；官方 QQ 客户端、Codex 客户端、账号和订阅需自行准备。NapCat 有非商业使用限制，见文末许可说明。

## 界面预览

侧栏管理配置，右侧显示运行状态与嵌入式实时监控。下图使用隔离演示数据，未连接真实 QQ 或 Codex；真实运行状态以本机控制台为准。

![统一运行监控台：隔离演示](docs/images/monitor.png)

## 把仓库链接发给你的 Codex Agent

把下面这段发给**能操作本机 Windows 文件和终端的 Codex Agent**：

```text
请根据 https://github.com/mingjiefan88/Agent-QQ-Bridge 的 AGENTS.md 和 README.md，
为这台 Windows 安装最新正式版 Codex QQ Bridge。下载完整包，校验外层和包内 SHA256，
自动探测 Codex CLI、官方 QQ 路径和已有配置，尽量替我填好并打开整合控制台。
缺少主人 QQ、允许的群、人格或模型偏好时再集中问我；不要猜我的身份或群号。
保留已有账号、记忆和配置，不改无关 Codex 设置，不自动往群里发测试消息。
QQ 扫码、Codex 授权和可选 EigenFlux 的邮箱确认由我本人完成。
```

Agent 能完成下载、校验、运行时准备、可探测项填写和界面启动。**仓库链接不能提供你的私人 QQ 身份，也不能代替本人扫码和授权。** 主人和允许群默认都是空的。详细命令见 [Agent 安装指南](docs/agent-install.md)。没有本地执行能力的网页对话环境只能提供指导。

## 手动安装与首次运行

需要 Windows x64、本机官方 QQ 客户端、可用的 Codex CLI 与账号，以及能连接登录和模型服务的网络。

1. 打开 [Releases](https://github.com/mingjiefan88/Agent-QQ-Bridge/releases)，下载正式版 `Codex-QQ-Bridge-1.0.0-Windows-x64.zip` 和同名 `.zip.sha256`。后续版本文件名会带对应版本号。
2. 用 PowerShell 检查摘要，与 `.sha256` 文件中的 64 位值比较；不一致时停止使用并重新下载。

   ```powershell
   Get-FileHash -Algorithm SHA256 -LiteralPath '.\Codex-QQ-Bridge-1.0.0-Windows-x64.zip'
   ```

3. 解压到固定目录，进入 `Codex-QQ-Bridge` 文件夹。首次可双击 `scripts\bootstrap.cmd`，自动探测路径并打开**回复暂停**的控制台；也可双击 `启动机器人.cmd` 进入配置引导。
4. 按下面步骤配置，最后主动点击“完成配置并启动”。之后只处理允许范围中的新消息。

| 步骤 | 操作 | 成功依据 |
| --- | --- | --- |
| Codex 连接 | 使用自动找到的 `codex.exe` 或填完整路径；模型可留空；检测登录，必要时在官方页面授权 | 检测成功；测试回复返回真实结果。测试消耗少量额度，但不发 QQ |
| QQ 登录 | 确认官方 `QQ.exe` 路径，安装并启动 NapCat，获取二维码，本人用手机扫码 | 完成手机确认；点击“完成连接配置”后 QQ 与 OneBot 都就绪 |
| 主人与群 | 填自己的个人 QQ 号；读取已加入群，再选择允许群号 | 真实 QQ ID 与预期一致，不根据昵称或自称授权 |
| 人格 | 设置名称、唤醒词和人格，可用通用助手或白龙娘预设 | 保存后可预览一句回复，预览不向 QQ 外发 |
| 功能 | 按需要开启媒体、表情、群管；点歌另装按需组件 | 开关与实际权限符合你的选择 |
| 检查并启动 | 运行检查，确认范围后启动 | 显示机器人已启动，并在允许群真实 @ 后收到回复 |

验证码、新设备验证和手机确认由本人处理。二维码可见、缓存账号信息或网页能打开，都不能证明 QQ 在线。监控以真实接口状态与消息回执为准。完整教程见 [使用说明](docs/usage.md)。

## 功能与聊天节奏

| 能力 | 实际行为 |
| --- | --- |
| 群聊、主人私聊 | 只处理绑定范围，未配置时不会默认开放 |
| 理解 @ 与话题 | 根据实际 @、引用、昵称和发送者识别对象，转向别人时避免抢答 |
| 上下文与记忆 | 最近消息、只读历史回填、明确自述与相处片段按会话和发送者隔离 |
| 停顿后合并 | 普通群消息约等待 2 秒；10 秒内达 4 条后等连续 6 秒安静，合并后至多回复一次 |
| 持续对话 | 明确唤醒并成功回复后，同群同人 2 分钟内最多跟进 2 次，间隔至少 30 秒 |
| 额度保护 | 普通群闲聊同群 5 分钟最多 4 次调用，间隔至少 30 秒；失败或选择静默也算调用 |
| 主人静默 | 主人说“把尾巴收一收”或“龙娘，别理他”后本群持久静默；只有主人实际 @ 才能恢复 |
| 图片理解 | 下载真实 QQ 图片并通过 Codex `--image` 输入，处理后清理临时文件 |
| 表情与戳一戳 | 按群收藏和发送、GIF 保留原字节；戳回、合并抱怨、可选随机戳与个人退出 |
| 点歌 | B 站公开音源下载、转码后发 QQ 语音，完成和失败都清理临时音频 |
| 生图 | 主人单独发起任务，回查真实图片文件；需账号实际提供原生生图工具 |
| 群管理 | 禁言、解禁、名片、撤回、群文件查看与整理；查真实角色，整理先预览再确认 |
| 实时监控 | QQ 在线、任务、公开进度、工具状态、回复、消息回执和 NapCat 日志 |
| EigenFlux（可选） | 使用机器人独立身份；需单独接入、本人邮箱确认和明确授权，未配置不影响 QQ |

主动插话、自动收藏表情、随机戳、点歌、生图和群管理由你选择，公开默认配置保持保守，推理强度默认为低。点歌受音源可访问性影响，视觉和生图受模型、CLI 和账号工具能力影响。没有语音输入转文字功能。监控展示公开进度与结果，不展示内部思维原文。

EigenFlux 的独立 HOME、隐私边界和定时检查授权见 [EigenFlux 说明](docs/eigenflux.md)。

## 日常启动、暂停和升级

- 日常双击 `启动机器人.cmd`。已完成配置且票据有效时，会尝试恢复本安装的 NapCat 与机器人；过期需要重新扫码。
- “暂停机器人”停止回复并保留 QQ 登录；“停止 NapCat”关闭本安装管理的 QQ 实例。关闭浏览器窗口不会停止后台服务。
- 退出控制台或升级前，暂停并等待任务结束，再双击 `停止控制台.cmd`。需要 QQ 下线时先停止 NapCat。
- 新版解压到新目录，继续使用相同数据目录。不要把程序覆盖到私人数据目录，不要删除旧数据重装。

## 在 Codex 中安装为本地插件

独立启动器与 Codex 插件使用同一份程序。仓库根市场索引指向 `.agents/plugins/codex-qq-bridge` 完整插件目录：

```powershell
codex plugin marketplace add https://github.com/mingjiefan88/Agent-QQ-Bridge --sparse .agents/plugins
codex plugin add codex-qq-bridge@codex-qq-bridge-local
```

安装后重开 Codex 会话，使用 `qq-bridge` 技能。CLI 没有插件子命令时，先按[安装指南](docs/agent-install.md)独立运行，不修改私有配置绕过兼容性。也可把解压后的完整包目录作为本地 marketplace 路径。源码插件首次需准备运行时；完整包不需另下 Node/NapCat。

MCP 提供 `bridge_status`、`bridge_launch`、`bridge_pause`、`bridge_diagnose`，没有通用 QQ 外发或任意终端执行工具。GitHub 分发不代表通过官方插件商店审核。项目需要 Windows 本地执行能力，未提供 DSH、手机、网页沙盒或其他 Agent 宿主适配。结构参考 [OpenAI 官方打包文档](https://developers.openai.com/plugins/build/plugins)。

## 本地数据与隐私

私人目录默认 `%LOCALAPPDATA%\CodexQQBridge`，可通过 `CODEX_QQ_HOME` 或 bootstrap 的 `-DataHome` 更改，包含绑定、密钥、QQ 登录、人格、记忆和表情库。升级保留。默认本机控制台 `3790`、QQ 接口 `3001`、NapCat WebUI `6100`；遇占用会报错，不结束其他进程。

配置接口只允许本机来源并校验会话令牌，QQ 回调使用独立认证。群消息不能改白名单或授予主人权限。公开仓库与发布包不包含私人 QQ 号、群号、二维码、授权代码、密钥、聊天、人格私稿、记忆、收藏表情或私人 Git 历史。诊断摘要按设计排除这些内容，分享前仍应自行查看。

## 验证与开发

源码不需要 `npm install`，使用 Node 22 以上。GitHub 源码仓库先进入 `.agents/plugins/codex-qq-bridge`，完整包在解压根目录执行：

```powershell
npm test
npm run check:release
npm run bundle
```

自动化测试覆盖隔离运行和模拟 OneBot 收发；模拟结果不能替代本人 QQ 的真实收发验收。打包读取发布白名单，验证官方依赖摘要，生成带校验文件的完整包。版本验证记录见 [发布说明](docs/release-notes.md)。问题先看 [故障排查](docs/troubleshooting.md)；Issue 仅提供脱敏摘要，不上传配置、账号目录、授权代码或完整聊天。

## 许可与第三方组件

原创代码采用 MIT。**随完整包附带的 NapCat 使用其自己的非商业有限再分发许可，不能把完整包当作全 MIT 软件或用于商业用途。** NapCat 官方压缩包原样保留，附许可、来源与摘要；Node 和其他组件各适用原许可。QQ、Codex 客户端与账号不在分发包中。

详见 [第三方说明](THIRD_PARTY_NOTICES.md)、[NapCat 许可](.agents/plugins/codex-qq-bridge/third_party/NapCat-LICENSE.txt) 与 [安全说明](SECURITY.md)。本版使用独立运行入口与功能模块，没有复制缺少明确 LICENSE 的私人参考部署整合服务器或原界面。
