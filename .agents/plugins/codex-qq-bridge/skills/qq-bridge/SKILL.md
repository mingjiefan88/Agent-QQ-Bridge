---
name: qq-bridge
description: 在用户请求安装、配置、启动、暂停或排查Codex QQ机器人时使用。管理本地启动器、QQ扫码登录、人格和实时监控；不适用于无关QQ问题或普通对话。
---

这是 Windows 本地 Codex 专用机器人。插件目录包含独立运行时与集成控制台；配置默认保存在 `%LOCALAPPDATA%/CodexQQBridge`，由 `CODEX_QQ_HOME` 可覆盖。

优先使用本插件 MCP 的 `bridge_status`、`bridge_launch`、`bridge_pause` 和 `bridge_diagnose`。启动器已运行时复用它，不启动第二个实例。首次使用引导用户在控制台完成 Codex 授权、QQ 扫码、真实QQ号绑定及人格填写。无法使用MCP时，在插件根目录运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launcher.ps1`；使用返回的本机URL打开启动器。

主人和群号都以真实ID核验，不从昵称、人格或聊天记录授予权限。默认不启用群管理、随机插话或媒体功能；按照用户选择在控制台设置。真实消息发送与群管理必须有相应用户授权；诊断默认不发送任何QQ消息。MCP没有通用发消息或任意执行命令工具。

监控显示公开执行进度、工具状态、回复与QQ回执，不承诺显示内部思维原文。只报告实际在线状态；扫码页可见、接口可达或登录信息缓存不等于QQ在线。验证码和手机授权交给用户完成。

升级只替换插件程序。不要覆盖本地config、QQ登录状态、长期记忆、表情库或生成图片，不把用户数据复制到仓库。仅停止本启动器记录且身份仍匹配的进程。更多使用说明见 `../../docs/usage.md`，NapCat再分发限制见 `../../THIRD_PARTY_NOTICES.md`。
