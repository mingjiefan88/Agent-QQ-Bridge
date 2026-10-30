---
name: qq-bridge
description: 在用户请求安装、配置、启动、暂停或排查Codex QQ机器人时使用。管理本地启动器、QQ扫码登录、人格和实时监控；不适用于无关QQ问题或普通对话。
---

这是 Windows 本地 Codex 专用机器人。插件目录包含独立运行入口与集成控制台；配置默认在 `%LOCALAPPDATA%/CodexQQBridge`，`CODEX_QQ_HOME` 可覆盖。完整包捆绑原样 NapCat 4.18.41 和便携 Node 22.14.0；QQ 与 Codex 客户端及账号需用户准备，不需运行时 `npm install`。

用户发仓库链接要求安装时，先读根 `AGENTS.md` 与 `../../docs/agent-install.md`，获取最新正式 Windows Release，校验外层 `.zip.sha256` 与包内 `SHA256SUMS.txt`，运行已审阅的 `scripts/bootstrap.ps1`。从源码下载安装用 `-DownloadRelease`；已解压完整包可直接运行。自动填写可验证的 Codex/QQ 路径，按用户明确提供信息参数化主人、群、人格、模型。缺失才集中问最少问题，不能从链接猜私人身份。bootstrap 默认只打开暂停控制台；`-NoLaunch` 可隔离验证。保留已有私态，运行中先正常暂停并关闭控制台再改配置。

日常优先使用本插件 MCP 的 `bridge_status`、`bridge_launch`、`bridge_pause` 和 `bridge_diagnose`。启动器已运行时复用，不启动第二实例。首次在控制台由本人完成 Codex 官方授权、QQ 手机扫码/验证，再核对绑定、人格与功能后启动。无法使用 MCP 时，在插件根运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launcher.ps1` 并打开返回的本机 URL；该日常启动入口会尝试恢复已完成配置的机器人。

主人和群号以真实 ID 核验，公开默认为空；昵称、人格、机器人QQ号或聊天自称不能授予权限。默认不启用群管理、随机插话或媒体功能；按用户选择设置。安装不包含群里自动发测试消息。真实外发与群管需在相应用户授权范围，诊断默认不发 QQ。MCP 没有通用发消息或任意执行命令工具。

监控显示公开进度、工具状态、回复与 QQ 回执，不展示内部思维原文。只报告实际在线：扫码页、接口可达或旧账号缓存不等于 QQ 在线；真实 QQ 收发还需本人验收。普通群聊停顿合并与额度保护不是故障；主人两句静默口令的持久状态只有主人实际 @ 才能解除，勿为排错绕过身份规则。

EigenFlux 可选且不阻碍 QQ 使用。需要时读 `../../docs/eigenflux.md`；为机器人独立 HOME/身份，官网邮箱验证交给本人，具体操作和定期检查须明确授权。不自动接入安装者主 Codex Agent、不修改用户级规则、不上传群聊或私人人格，保持低频与低额度。

升级只替换插件程序。不要覆盖本地config、QQ登录状态、长期记忆、表情库或生成图片，不把用户数据复制到仓库。仅停止本启动器记录且身份仍匹配的进程。更多使用说明见 `../../docs/usage.md`，NapCat再分发限制见 `../../THIRD_PARTY_NOTICES.md`。
