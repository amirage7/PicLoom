# AI Image Canvas 软件说明书

文档版本：1.1
对应软件版本：0.2.0
适用平台：Windows 10/11 x64
更新日期：2026-08-25

## 1. 软件简介

AI Image Canvas 是一套本地优先的 AI 图片创作与资产管理工作台。它不在本机运行或训练图片模型，而是集中管理项目、Prompt、图片版本、父子关系、素材和创作过程。

桌面版可以在应用右侧显示真实的官方 ChatGPT 普通 Chat 页面。用户本人登录自己的 ChatGPT 网页账号后，软件可提交 Prompt、等待图片回复完成、收集本次回复中的图片并导入当前本地项目。

本软件不调用 OpenAI API，不使用 Codex 或 Work 执行生图，不保存 ChatGPT 密码，也不能绕过 ChatGPT 套餐额度、内容政策或账号限制。

## 2. 产品定位

AI Image Canvas 结合了 Figma 式无限画布、Midjourney Canvas 式图片创作管理、ComfyUI 式版本关系，以及本地项目库和 Prompt Library。适用于概念设计、产品视觉、建筑渲染、人物设定、电影感画面和插画探索。

## 3. 系统架构

```text
AI Image Canvas 桌面应用（Electron）
├─ React + TypeScript + Vite 界面
├─ React Flow 无限画布
├─ 内嵌 ChatGPT 官方网页会话
└─ 本地 FastAPI 后端
   ├─ SQLite 数据库
   └─ 本地图片文件目录
```

| 模块 | 职责 |
| --- | --- |
| Electron | 桌面窗口、ChatGPT 独立登录会话、本地后端生命周期 |
| React | 三栏界面、项目、Prompt、Canvas、详情和生图状态 |
| React Flow | 图片节点、无限平移缩放、节点位置和连接关系 |
| FastAPI | 项目、Prompt、图片和生成任务接口 |
| SQLite | 保存项目、Prompt、图片元数据、位置、标签和任务状态 |
| 本地文件系统 | 保存 PNG、JPEG、WEBP 原始图片 |
| ChatGPT 适配器 | 检测登录、提交 Prompt、观察回复和收集图片 |

## 4. 运行要求

安装版要求 Windows 10/11 x64、可访问 chatgpt.com 的网络和一个可用的普通 ChatGPT 网页账号。开发版还需要 Node.js 20+、Python 3.11+ 和 npm。

## 5. 安装与启动

### 5.1 Windows 安装包

```text
desktop/release/AI Image Canvas-Setup-0.2.0.exe
```

运行安装包并选择安装目录。安装完成后从桌面快捷方式或开始菜单启动。应用会自动启动仅监听本机回环地址的 FastAPI 后端。

### 5.2 免安装验证版

```text
desktop/release/win-unpacked/AI Image Canvas.exe
```

### 5.3 开发模式

```powershell
# 终端 1
cd frontend
npm run dev -- --host 127.0.0.1 --port 3000

# 终端 2，从项目根目录运行
$env:VITE_DEV_SERVER_URL='http://127.0.0.1:3000'
npm run desktop:dev
```

## 6. 主界面

### 6.1 左侧栏

项目管理支持新建、切换、重命名和删除项目，并显示项目图片数量。系统至少保留一个项目。

Prompt Library 中每条 Prompt 包含标题、正文、分类和创建时间，支持新建、编辑、复制、删除和分类管理。

### 6.2 中间画布

画布支持平移、滚轮缩放、适应内容、节点拖动、选择、复制和删除。图片节点显示可识别的图片名称、缩略图、Prompt 摘要和创建时间，并通过连接线表达父图到子图的版本关系。用户可以点击上传区域或直接拖入本地图片。图片名称可在右侧“图片详情”中修改；同一项目内按全角/半角和大小写归一后不得重名，不同项目可以使用相同名称。

### 6.3 右侧栏

“图片详情”用于预览图片、修改图片名称、编辑 Prompt 和标签、查看创建时间与版本关系、复制 Prompt、查看或保存原图。打开原图时默认使用“适应窗口”，完整显示整张图片；放大后可滚动查看细节，再次打开会恢复适应模式。

“ChatGPT”包含登录/查看、隐藏、重新加载、Prompt 输入、开始生成、取消任务、重试收集和状态提示。

## 7. 第一次登录 ChatGPT

1. 打开右侧“ChatGPT”标签。
2. 点击“登录 / 查看 ChatGPT”。
3. 在右侧真实的官方 ChatGPT 页面中完成登录。
4. 如果账号最初使用 Google、Microsoft 或 Apple 注册，必须继续点击对应的登录方式；只在邮箱框输入同一个邮箱不等于使用原登录方式。
5. 登录成功并看到 ChatGPT 对话界面后，可以隐藏 ChatGPT 页面。

ChatGPT 登录信息由 Electron 的独立持久会话保存。软件代码不会接收或保存密码。

### 7.1 登录页无反应或一直回到登录页

按顺序排查：

1. 使用账号最初的注册方式，例如“使用 Google 继续”。
2. 点击“重新加载 ChatGPT 页面”后重试。
3. 关闭 VPN、代理、广告拦截器和脚本拦截器。
4. 确认 Windows 时间和时区正确。
5. 换一个网络，例如手机热点。
6. 多次失败后等待一小时，避免临时登录限制。
7. 在普通浏览器打开 https://chatgpt.com/auth/login，确认账号本身可以登录。

应用 0.2.0 的早期构建会把登录弹窗错误地发送到系统浏览器，导致结果无法返回内嵌会话。修复版会让受信任的 OpenAI、Google、Microsoft 和 Apple 登录页面留在同一个持久应用会话中。

### 7.2 重置独立登录会话

仅在普通浏览器可以登录、应用内仍持续失败时使用：

1. 完全退出 AI Image Canvas。
2. 先备份 `%APPDATA%\ai-image-canvas-desktop\data`。
3. 将 `%APPDATA%\ai-image-canvas-desktop\Partitions\ai-image-canvas-chatgpt` 重命名为备份名称。
4. 重新启动应用并再次登录。

不要直接删除整个 `%APPDATA%\ai-image-canvas-desktop`，其中同时包含 Canvas 数据库和图片资料。

## 8. 使用 ChatGPT 生图

1. 选择目标项目。
2. 打开右侧“ChatGPT”并确认已登录。
3. 在 Prompt 输入框填写图片描述；如果需要引用项目图片，输入 `@` 并从候选列表选择图片名称。
4. 可在同一条 Prompt 中引用多张图，例如：`将@假面骑士build的身体和@喜羊羊的头部合成一个新的角色`。
5. 点击“使用 ChatGPT 生成”。软件按 Prompt 中第一次出现的顺序上传所有被引用图片，并向 ChatGPT 提供附件与名称的对应关系。
6. 软件提交一次 Prompt 并等待本次新回复完成。
7. 软件收集图片并导入当前项目；第一张被 `@` 引用的图片同时作为新图的父版本。
8. Canvas 刷新、选中第一张新图片并高亮本批次。

不需要参考图时直接输入普通 Prompt 即可。候选列表支持键盘上下键、Enter/Tab 选择和 Escape 关闭；系统会阻止发送不存在或已改名的 `@图片名`，避免引用错图。单次最多引用 12 张图片，重复提及同一张图只上传一次，但附件顺序仍以它第一次出现在 Prompt 中的位置为准。

软件不会在超时后自动重复提交 Prompt，避免重复消耗额度。“重试收集图片”只观察或收集原回复，不会再次发送 Prompt。

### 8.1 任务状态

| 状态 | 含义 |
| --- | --- |
| queued / opening_chatgpt | 任务已创建，正在打开 ChatGPT |
| login_required | 需要用户登录 |
| ready / sending | 页面已准备，正在提交 Prompt |
| generating | ChatGPT 正在生成 |
| collecting / importing | 正在收集并导入图片 |
| completed | 已完成并导入 |
| refused | ChatGPT 拒绝请求 |
| rate_limited | 当前额度或频率受限 |
| page_changed | ChatGPT 页面结构发生变化 |
| failed / cancelled | 任务失败或被取消 |

### 8.2 图片名称与引用建议

- 名称应简短、明确，例如“假面骑士build”“喜羊羊正面”“产品A侧视图”。
- 上传图片时默认取文件名（不含扩展名）；ChatGPT 生成图默认根据 Prompt 生成名称；复制版本会自动追加“副本”并在冲突时编号。
- 修改名称后，旧 Prompt 中的旧 `@名称` 不会静默指向其他图片；发送前会提示重新选择。
- 多图合成时建议在 Prompt 中明确各图用途，例如身体、头部、服装、构图或风格。

## 9. 图片管理、原图查看与限制

支持 PNG、JPEG/JPG 和 WEBP。用户上传和 ChatGPT 收集的单张图片上限为 20 MB，一次 ChatGPT 回复收集总量上限为 80 MB。SVG、HTML 错误页和伪装图片会被拒绝。

导入时校验图片真实魔数；相同内容使用 SHA-256 去重，同时保持页面中的原始顺序。点击节点后可在右侧“图片详情”选择“查看原图”或“保存原图”。查看器初始为适应窗口；工具栏和鼠标滚轮可切换到 25%–400% 的数值缩放，点击“适应窗口”可重新完整显示。

## 10. 图片版本关系

图片可设置 parent_id 表示派生关系。使用 `@` 多图生成时，Prompt 中第一张被引用的图片作为 parent_id，其他图片作为本次生成的辅助参考，不会额外制造错误的父子连线。系统阻止跨项目父子关系、自引用和循环关系。复制图片时会复制本地文件和元数据并生成新记录。

## 11. 数据存储、备份与恢复

开发版：

```text
项目根目录/data/database.sqlite
项目根目录/data/images/<project-id>/
```

安装版：

```text
%APPDATA%\ai-image-canvas-desktop\data\database.sqlite
%APPDATA%\ai-image-canvas-desktop\data\images\<project-id>\
```

备份时先完全退出软件并确认 127.0.0.1:8001 已释放，然后复制完整 data 目录。恢复前先备份当前 data，再用历史备份替换。卸载软件默认不会主动删除用户数据。

## 12. 快捷键

| 快捷键 | 功能 |
| --- | --- |
| V | 选择工具 |
| H | 抓手工具 |
| 0 | 适应全部内容 |
| [ / ] | 切换项目导航 / 图片详情 |
| Escape | 关闭抽屉或清除选择 |
| Delete / Backspace | 删除选中节点 |

在 Prompt、标签或项目名称输入框中输入时不会触发画布快捷键。

## 13. 常见故障

| 现象 | 原因与处理 |
| --- | --- |
| 本地服务离线 | 完全退出后重启；检查 8001 端口 |
| 登录页“下一步”无反应 | 更新到修复版；使用原注册方式；重载页面；检查 VPN/网络 |
| Google 登录跳到外部浏览器 | 使用了早期构建，需要重新打包或安装修复版 |
| 一直要求登录 | 检查网络/Cookie；必要时重置独立登录分区 |
| 页面结构已变化 | 打开页面检查，更新适配器后重试收集 |
| Receiving end does not exist | 浏览器扩展未注入；桌面版不需要扩展 |
| Not Found | 前后端端口或旧接口不匹配，使用最新桌面版 |
| 生成完成但未导入 | 保持原对话，点击“重试收集图片”；该操作不会重新发送 Prompt |
| `@图片名` 标红或无法发送 | 图片已改名、删除或不在当前项目；删除旧文字并从 `@` 候选中重新选择 |
| 多图引用结果对应错误 | 检查 Prompt 中 `@名称` 与用途是否明确；附件按第一次出现的顺序上传 |
| 额度或频率受限 | 稍后在原对话重试，不要重复创建任务 |
| 退出后 8001 仍占用 | 更新到包含进程树退出修复的版本 |

## 14. 浏览器扩展兼容模式

纯浏览器访问 http://127.0.0.1:3000 时可使用 Chrome/Edge 扩展兼容方案：

```powershell
cd extension
npm install
npm run build
```

在扩展管理页开启开发者模式并加载 extension/dist。桌面版不需要配对码或扩展。

## 15. 安全与隐私

- ChatGPT 页面启用 nodeIntegration=false、contextIsolation=true、sandbox=true 和 webSecurity=true。
- 登录会话使用独立持久分区。
- 软件不接收或记录 ChatGPT 密码、Cookie 或访问令牌。
- 非预期权限和下载默认拒绝。
- 登录导航仅允许 ChatGPT、OpenAI 和明确的身份提供商 HTTPS 域名。
- 本地后端只监听 127.0.0.1。
- 图片和 SQLite 数据只保存在本机。

## 16. 已知限制

- ChatGPT 网页自动化不是官方 API，网页结构更新后可能需要更新适配器。
- Cloudflare、CAPTCHA、地区、网络、账号风控和套餐额度不受本软件控制。
- 用户必须本人完成登录和必要的人机验证。
- 单次 `@` 引用最多 12 张图片；ChatGPT 是否遵循多图合成指令仍受其网页能力、套餐和内容政策影响。
- 当前 Windows 安装包使用默认 Electron 图标。

## 17. 测试与打包

```powershell
npm.cmd --prefix frontend test -- --run
npm.cmd --prefix frontend run build
backend\.venv\Scripts\python.exe -m pytest -q
npm.cmd --prefix desktop test -- --run
npm.cmd --prefix desktop run typecheck
npm.cmd --prefix extension test -- --run
npm.cmd --prefix extension run build
npm.cmd run build:desktop
```

## 18. 未来扩展

项目已预留 ImageProvider 和 PromptProvider，可扩展 Chrome Extension、图片自动下载、Prompt 优化、图片标签识别以及其他用户授权的图片来源。

## 19. 官方登录排查参考

OpenAI 官方建议：使用原注册方式，允许 Cookie 和 JavaScript，关闭 VPN、代理和拦截工具，尝试不同网络；多次失败后等待再试。
