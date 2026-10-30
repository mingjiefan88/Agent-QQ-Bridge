# 让 Codex Agent 完成安装

这是给能操作本机 Windows 的 Codex Agent 与用户的完整流程。分享仓库链接后，Agent 可以自动下载、校验、准备运行时、探测路径并填入已知设置。主人 QQ、允许群、本人登录和私人偏好需要明确来源；链接本身不含这些信息。

## 1. 检查环境与已有安装

确认 Windows x64、官方 QQ 客户端、Codex CLI 和可用账号。机器人使用 `codex.exe`，不要求在配置里填写 API Key，也不要求 `npm install`。桌面版带 CLI 时先探测它的实际路径；找不到时再让用户提供或自行安装官方 CLI，勿把 `.cmd` 包装器当可直接启动的 `.exe`。

读取 `CODEX_QQ_HOME`；未指定时数据目录是 `%LOCALAPPDATA%\CodexQQBridge`。已有 `config.json` 时保留绑定、端口、人格、模型、密钥和功能选择；JSON 损坏时保留原件，先定位问题。升级先正常暂停、等待队列结束、关闭控制台，保留 QQ 登录和私人目录。不要直接覆盖运行中实例的磁盘配置。

## 2. 下载正式完整包并校验

官方仓库：[mingjiefan88/Agent-QQ-Bridge](https://github.com/mingjiefan88/Agent-QQ-Bridge)。入口是 `AGENTS.md` 与 `README.md`。Agent 获取 GitHub 最新正式 Release，不选择 draft 或 prerelease，下载：

- `Codex-QQ-Bridge-<version>-Windows-x64.zip`
- `Codex-QQ-Bridge-<version>-Windows-x64.zip.sha256`

先校验压缩包 SHA256，再检查解压路径，最后逐项校验包内 `Codex-QQ-Bridge/SHA256SUMS.txt`。摘要可发现传输损坏，但摘要与包来自同一仓库，不能视为独立代码签名。需要更强信任时自行审阅源码和来源。

GitHub 源码仓库把完整插件放在 `.agents/plugins/codex-qq-bridge`。先切到该目录，再执行已读取并审阅的脚本；以下路径都以**插件根目录**为基准：

```powershell
Set-Location .\.agents\plugins\codex-qq-bridge
& .\scripts\bootstrap.ps1 -DownloadRelease
```

脚本会下载最新正式包，校验外层和包内摘要，并安装到 `%LOCALAPPDATA%\Programs\CodexQQBridge\<version>`。`-InstallDir 'D:\Apps\CodexQQBridge\1.0.0'` 可覆盖程序位置。已有同版文件与正式包摘要一致时可复用；不同或修改过的目录不会被覆盖，请选新目录。没有正式 Release 或缺校验文件时停止并报告，不能编造下载成功。

已经下载并解压完整包时，在解压根运行 `scripts\bootstrap.cmd` 或：

```powershell
& .\scripts\bootstrap.ps1
```

完整包使用原样捆绑的 Node 22.14.0 / NapCat 4.18.41 官方压缩包；本机已有合适 Node 时可复用。源码版会按 lock 文件固定地址下载并验摘要。QQ 与 Codex 本体不在包中。

## 3. 自动填配置，最少提问

bootstrap 自动寻找 PATH 上的 `codex.exe`、Codex 桌面 CLI 目录和官方 QQ 常见安装/注册表路径。保留现有配置中的明确路径；QQ 有多个候选时不猜。缺少路径可通过参数指定。路径检测不是登录成功证明。

优先使用用户本次提供的信息，其次使用用户自己已有的本地配置；无法确认的主人和群号才集中询问。机器人 QQ 号不是主人号。人格与唤醒词由用户选择；模型未指定时可留空用 Codex 默认。不要硬编码维护者身份、群号或“龙娘主人”绑定。

例如用户已经明确提供真实 ID 后，在 **PowerShell** 中运行（下列数字仅示范格式，必须替换）：

```powershell
& .\scripts\bootstrap.ps1 `
  -OwnerUserIds @('12345678') `
  -AllowedGroups @('23456789', '34567890') `
  -Name '小白' `
  -Aliases @('小白', '白龙娘') `
  -PersonaFile 'D:\Private\qq-persona.txt' `
  -CodexPath 'C:\实际目录\codex.exe' `
  -QQPath 'C:\实际目录\QQ.exe'
```

`PersonaFile` 为本地 UTF-8 文本；`-Model` 只接受账号实际可用模型。参数未提供时保留已有值，首次配置使用公开默认值，owner/group 始终为空。数据目录可用 `-DataHome 'D:\Private\CodexQQBridge'`；以后用相同 `CODEX_QQ_HOME` 启动。

`-NoLaunch` 只准备运行时、校验并写入私有配置，不打开窗口、不启动后台服务，适合隔离验证。bootstrap 不执行 Codex 模型调用、不发送 QQ 消息，也不把配置打印到终端。检测到控制台端口已有服务时会停止配置并报错，不关闭任何进程。

PowerShell 的数组参数请直接在 PowerShell 里传；`bootstrap.cmd` 适合无参数双击。不要把多项数组误写成逗号连接的单个 QQ 号。

## 4. 本人完成登录，Agent 帮助检查

bootstrap 默认打开暂停的控制台，不因旧配置标记为完成就自动启用 QQ 回复。在界面中：

1. 检测 Codex 登录；未登录时点登录，由本人在官方页面授权，再检测。测试回复可按本人选择执行，会消耗少量额度但不发 QQ。
2. 确认官方 QQ 路径，安装/启动 NapCat，显示二维码，本人手机扫码确认。遇验证码或新设备确认使用原生高级界面处理。
3. 点“完成连接配置”，确认真实 QQ 在线及 OneBot 就绪。只有扫码页面或旧登录信息不算连接成功。
4. 核对主人和群，确认人格与功能开关；完成检查后由用户主动启动机器人。
5. 用户在允许群里实际 @ 机器人，核对监控中的成功消息回执和手机收到的内容。只有这一步完成才叫真实 QQ 收发验收。

安装范围不包含给群自动发一条“测试成功”，也不包含自动群管或开启所有功能。用户未给真实外发授权时停在“已安装、控制台可用、待本人登录/启动”的准确状态。

## 5. 作为 Codex 插件使用

CLI 支持插件时可添加仓库 marketplace，参见 README 命令。完整插件位于 `.agents/plugins/codex-qq-bridge`，仓库根不是另一个功能不同的机器人。也可使用已校验的完整包作为本地市场路径：

```powershell
codex plugin marketplace add 'D:\Apps\Codex-QQ-Bridge'
codex plugin add codex-qq-bridge@codex-qq-bridge-local
```

重新打开会话使技能与 MCP 生效。先完成本地运行时准备，再用 `bridge_status`、`bridge_launch`、`bridge_pause`、`bridge_diagnose`。插件安装不代表外部平台审核通过。

## 6. 可选 EigenFlux 与升级

QQ 不依赖 EigenFlux。用户想用时单独接入机器人身份、确认官网邮件、明确允许的操作和检查频率；不要替主 Codex Agent 注册，不更改用户级规则，不上传群聊或私人人格。见 [EigenFlux 指南](eigenflux.md)。

升级新程序，保留同一数据目录。退回旧程序也不要用旧默认配置覆盖新私人配置。需要卸载程序时先暂停、关闭控制台与本安装 NapCat，再移走程序目录；私人数据是否删除由用户另外决定。

交付时说明程序目录、私人目录、控制台地址、已核验的版本/摘要/界面，以及仍待本人完成的登录或真实收发。不打印 token、二维码、授权代码和私人配置。
