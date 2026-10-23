# 架构与接入约定

本页描述通用版目标，除独立在线诊断外尚未实现。

QQ / NapCat OneBot → 机器人核心 → Agent 适配器 → 回复投递。

核心负责事件去重、可信身份、权限、上下文隔离、并发、超时、冷却、媒体与投递回执。适配器负责提交任务、会话映射、取消、提取最终回复及上报公开进度。群消息不能直接执行核心管理工具。

每个会话同一时刻只允许一个引擎负责出站回复。切换时先处理旧任务，再切换路由；未知发送结果不自动重发。群和私聊上下文独立，不把管理密钥或无关会话提供给模型。

## 平台入口

| 平台 | 目标路线 | 尚需验证 |
| --- | --- | --- |
| Codex | 先保留 CLI 适配，再提供官方格式的安装与运维插件 | 干净环境登录、取消、工具能力探测、插件安装 |
| DeepSeek Harness | 评估官方 SDK 会话接口，提供 Cordis 插件入口 | 版本、会话行为、授权、重连和能力 |
| 其他 Agent | 按实际 SDK / CLI / HTTP 能力增加适配器 | 不凭 MCP 支持声明兼容 |

MCP 可把机器人状态和工具提供给 Agent，但不会自动把 QQ 入站消息变成 Agent 任务。适配器仍需负责驱动模型回复。Codex 与 DSH 的原生插件结构不同，应分别打包。

DSH headless 默认不继承 GUI 凭据存储。检测到命令不等于授权可用，必须执行平台对应的连接测试。图像理解、生图、公开进度分别探测；缺失能力要禁用入口并给出原因。

## 连接恢复

分别显示进程、WebUI、QQ 登录和 OneBot 状态。只有账号状态及接口均确认后才显示在线。二维码过期可刷新；需要人工授权时显示扫码入口。服务器失效票据不能靠循环重启恢复。

点歌临时搜索错误允许一次有限恢复；限流和人工验证直接停止。下载与转换可以清理临时文件，但不能把“任务已提交”当作“语音已发送”。

## 官方参考

- [OpenAI 插件格式](https://developers.openai.com/plugins/build/plugins)
- [DSH 官方项目](https://github.com/deepseek-ai/deepseek-harness)
- [DSH 插件开发](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)
- [DSH SDK](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-app/README.md)
- [DSH headless](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/headless/README.md)

资料核对日期：2026-10-23。适配实现时应按固定版本再次核对并记录实测版本。
