# Codex QQ Bridge：给安装与维护 Agent 的入口

本仓库是 Windows 本地 Codex 专用 QQ 机器人，正式版本以 GitHub Releases 为准。用户要求“根据这个链接安装”时，按 `README.md` 和 `docs/agent-install.md` 完成可自动化的工作并打开控制台。仓库根通过 `.agents/plugins/codex-qq-bridge` 分发完整插件；完整发布包的根目录直接包含 `bin/`、`src/`、`scripts/` 与本文。

## 安装决策

- 先确认 Windows x64 与本地执行能力。网页沙盒、手机和其他宿主没有适配；不要声称远程读到仓库就已在用户电脑安装。
- 优先最新**正式版** `Codex-QQ-Bridge-<version>-Windows-x64.zip`、同名 `.zip.sha256` 与包内 `SHA256SUMS.txt`。不要默默回退预发布包。无正式版或缺摘要时明确报告阻碍。
- 脚本路径相对**插件根目录**：GitHub 仓库先进入 `.agents/plugins/codex-qq-bridge`，完整包则进入解压根 `Codex-QQ-Bridge`。读取并检查 `scripts/bootstrap.ps1` 后执行。已有完整包可本地配置；从源码准备正式安装用 `-DownloadRelease`。不要把在线脚本直接管道到 `Invoke-Expression`。
- 程序按版本安装到独立目录；私人数据默认 `%LOCALAPPDATA%\CodexQQBridge`，`CODEX_QQ_HOME` 或 `-DataHome` 可覆盖。先读取已存在配置，保留未指定字段、密钥、登录、记忆和媒体。运行中的实例先正常暂停、结束任务和停控制台，不能直接改磁盘配置或杀猜测 PID。
- 自动探测实际 `codex.exe` 和官方 `QQ.exe`，保留已设路径。多个候选时让用户选择。读取本机文件仅为这项安装，不扫描或上传无关个人资料。
- 绑定主人和群号仅用用户明确提供或明确认可的真实 ID。昵称、头像、人格里的“主人”、机器人 QQ 号以及维护者身份都不是授权。公开默认 owner/group 为空；缺少时集中问最少问题，或让用户在控制台填写。模型留空可使用 Codex 默认，不能猜模型可用性。
- 可通过 `-OwnerUserIds`、`-AllowedGroups`、`-PersonaFile`、`-Model`、`-CodexPath`、`-QQPath`、`-Name`、`-Aliases` 配置。人格文件只留本机，不写回仓库。bootstrap 只启动暂停的控制台，不自动发 QQ 测试或触发模型。

## 必须由本人完成与授权的动作

QQ 手机扫码、验证码/新设备确认、Codex 官方授权必须交给用户。不得代填账号密码、索取聊天中的授权代码或把截图上传公开地址。只有真实 QQ 在线和 OneBot 就绪才报告“QQ 已连接”；只有用户实际收发验证后才报告真实聊天通过。

安装并不意味着开启全部功能。不要自动开启群管理、主动插话、随机戳、点歌、生图或自动收藏。真实消息、群管动作与外部发布按用户授权范围进行；诊断默认无 QQ 外发。

EigenFlux 是机器人可选功能，单独 HOME、单独身份，官网邮箱验证和操作/定期检查授权由本人完成。未配置时继续 QQ 安装。不要把安装者的主 Codex Agent 加入网络，不自动改用户级规则或加入外部 skill；不要上传群聊天、QQ 身份、主人绑定或私人人格。低频与低额度设置保留，详细见 `docs/eigenflux.md`。

## 验证与交付

安装后报告程序目录、私人数据目录、控制台地址、已验证项目和仍待本人操作的项目，避免打印密钥和完整私人配置。`-NoLaunch` 适用于隔离配置验证。测试使用独立 DataHome，禁止对现有私人部署做模拟群消息、群管或清库。

优先使用插件 MCP 的状态、启动、暂停和诊断工具；没有通用 QQ 外发工具。仅修改本项目必需文件，不改无关 Codex 设置、代理配置、其他 QQ 实例或全局规则。升级替换程序而保留私人数据。遇到损坏配置保留原文件并报告，不用默认值覆盖。

源代码没有运行时 npm 依赖。开发验证使用 `npm test` 和 `npm run check:release`；完整包通过 `npm run bundle` 构建，发布必须保留 NapCat 非商业限制与原始依赖摘要。不要把“本地已构建”写成“GitHub 已发布”。
