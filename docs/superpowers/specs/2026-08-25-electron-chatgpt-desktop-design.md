# PicLoom Electron ChatGPT Desktop Design

## 目标

将 PicLoom 从纯浏览器 WebUI 扩展为 Windows 桌面应用。在桌面应用内部加载真实 `chatgpt.com`，用户手动登录自己的 ChatGPT 账号，并使用普通 Chat 的图片生成功能。系统不调用 OpenAI API，也不通过 Codex app-server 执行生成任务。

保留现有 React、FastAPI、SQLite、React Flow 和本地图片存储。Electron 只新增桌面运行层、内嵌浏览器、页面自动化和安全 IPC。

## 已确认的产品决策

- 使用 Electron 和 `WebContentsView`。
- 使用混合界面：平时显示 Canvas 生图控制，必要时展开真实 ChatGPT 页面。
- ChatGPT 使用独立持久化浏览器资料；登录一次后跨重启保留。
- 点击生成后自动发送 Prompt、等待结果、收集图片并导入 Canvas。
- 一次回复中的全部图片都导入，并归入同一生成批次。
- Chrome/Edge 扩展降级为备用方案，不再作为主要链路。
- Windows 桌面版是主要运行形态；现有 `127.0.0.1:3000` WebUI 保留用于开发和素材管理。

## 与 PPTStudio 的区别

PPTStudio 的 ChatGPT 登录实际连接 Codex app-server，随后使用 `thread/start` 和 `turn/start` 执行 Codex 任务。该方式不是普通 Chat 网页能力，会使用 Codex 体系，不符合本项目“不消耗 Codex额度”的目标。

本设计加载真实 `chatgpt.com`，通过用户可见的普通 Chat 页面完成生图。它不使用 OpenAI API 或 Codex，但依赖 ChatGPT 网页结构，页面更新后可能需要维护适配器。

## 总体架构

应用由四层组成：

1. **Canvas Renderer**：现有 React 工作台，负责项目、Prompt、图片节点、关系和任务 UI。
2. **ChatGPT WebContentsView**：加载真实 ChatGPT，用于登录、聊天、生图和人工处理异常。
3. **Electron Main**：管理窗口、浏览器资料、页面自动化、下载、任务编排和安全 IPC。
4. **FastAPI Backend**：继续负责项目数据、任务状态、SQLite、图片校验和原子落盘。

```text
React Canvas
  ↕ narrow IPC
Electron Main ── ChatGPT WebContentsView
  ↕ localhost API
FastAPI ── SQLite / data/images
```

Electron 启动 FastAPI 子进程，等待健康检查成功后加载 Canvas。退出桌面应用时先停止接收新任务，再关闭 FastAPI 子进程。

## 桌面模块

```text
desktop/
├── main/
│   ├── app.ts
│   ├── window-manager.ts
│   ├── chatgpt-view.ts
│   ├── chatgpt-session.ts
│   ├── download-manager.ts
│   └── generation-orchestrator.ts
├── preload/
│   └── canvas-bridge.ts
├── adapters/
│   ├── chatgpt-page-adapter.ts
│   ├── page-state-detector.ts
│   └── image-collector.ts
└── tests/
```

`generation-orchestrator` 是唯一能推进桌面生成任务状态的模块。Renderer、页面适配器和下载管理器只能提交事件，不能自行修改任务终态。

## 窗口与交互

主窗口保留三栏 Canvas。右侧区域增加“图片详情”和“ChatGPT”两个标签：

- 正常状态下显示图片详情，ChatGPT View 可折叠。
- 首次登录、登录过期、验证码、安全检查、页面无法识别或使用限额出现时，自动切换到 ChatGPT 标签。
- ChatGPT 标签显示未经仿制的真实官方页面。
- Canvas 可以在 ChatGPT View 折叠时继续显示任务阶段和结果。

首次登录流程：

```text
点击登录 ChatGPT
→ 展开真实 ChatGPT 页面
→ 用户手动登录
→ 检测到可用聊天输入框
→ 状态切换为 ready
→ 保存到独立 Electron 浏览器资料
```

独立资料目录为 `data/browser-profile/chatgpt/`。SQLite 不存储密码、Cookie、验证码或刷新令牌。

## 生成数据流

```text
Canvas 提交 Prompt 与可选父图片
→ FastAPI 创建 queued 任务
→ Electron 打开新的普通 Chat 对话
→ 页面适配器发送 Prompt
→ 检测 ChatGPT 生成状态
→ 收集本次回复内全部图片
→ Electron 下载图片字节
→ FastAPI 校验格式、大小并原子落盘
→ 创建生成批次和图片记录
→ Canvas 在空闲位置创建节点
→ 为父图片和批次图片建立关系
```

图片收集只处理本次回复容器内的图片，排除头像、图标、附件缩略图和历史消息图片。每张图片按内容哈希去重。

## Provider 与 IPC

桌面实现继续遵循 Provider 抽象：

```ts
interface ImageProvider {
  getStatus(): Promise<ProviderStatus>
  generate(input: GenerateImageInput): Promise<GenerationTask>
  cancel(taskId: string): Promise<void>
  resume(taskId: string): Promise<void>
  collectImages(taskId: string): Promise<GeneratedImage[]>
}
```

Renderer 只获得以下受控能力：

```ts
window.canvasDesktop.chatGpt.open()
window.canvasDesktop.chatGpt.getStatus()
window.canvasDesktop.generation.start(input)
window.canvasDesktop.generation.cancel(taskId)
window.canvasDesktop.generation.resume(taskId)
window.canvasDesktop.generation.retryCollect(taskId)
window.canvasDesktop.onGenerationEvent(listener)
```

IPC 使用结构化数据校验。Renderer 不能执行任意 Electron 命令、读取浏览器资料或访问 Cookie。

## 数据库扩展

新增 `generation_batches`：

- `id`
- `task_id`
- `project_id`
- `conversation_url`
- `created_time`

新增 `generation_images`：

- `id`
- `batch_id`
- `image_id`
- `source_url`
- `content_hash`
- `sort_order`

扩展 `generation_tasks`：

- `conversation_url`
- `adapter_version`
- `interruption_reason`
- `resumable`

扩展 `images`：

- `generation_batch_id`
- `source_type`

数据库只保存业务数据和可审计的来源信息，不保存 ChatGPT 身份认证数据。

## 状态机

```text
queued
→ opening_chat
→ sending
→ generating
→ collecting
→ downloading
→ saving
→ completed
```

可分支状态：

- `needs_login`
- `needs_user_action`
- `failed`
- `cancelled`
- `interrupted`

只有 `needs_login`、`needs_user_action` 和部分 `interrupted` 任务可以恢复。`failed` 任务不会自动重新发送 Prompt；只能由用户创建新任务或仅重试图片收集。

## 异常处理

- 登录过期：切换到 `needs_login` 并展开 ChatGPT。
- 验证码或安全检查：切换到 `needs_user_action`，等待用户点击继续。
- 页面结构未知：停止 DOM 操作，显示真实页面和“重新检测页面”。
- 内容拒绝或达到限额：记录官方页面提示，不自动改写或重发 Prompt。
- 下载失败：保留对话 URL，允许只重试图片收集与下载。
- 图片校验失败：拒绝保存异常内容，其他有效图片仍可完成导入。
- 应用退出：运行中任务标记为 `interrupted`，重启后不自动重复发送。
- FastAPI 异常退出：Electron 显示本地服务错误，并保留 ChatGPT 对话状态。

## 安全设计

- ChatGPT WebContents 禁用 `nodeIntegration`。
- 启用 `contextIsolation` 和 Chromium sandbox。
- 导航白名单只允许 `chatgpt.com`、必要的 OpenAI 登录域名和本机页面。
- 新窗口、下载、外部协议和权限请求由 Electron Main 显式决策。
- Canvas Renderer 无法访问 ChatGPT DOM、Cookie 和浏览器资料目录。
- 页面适配器只允许受控的 Prompt 提交、状态检测和图片收集操作。
- 用户密码、验证码和身份验证操作始终由用户在真实页面中完成。

## 测试与验收

### 自动测试

- 单元测试：页面状态识别、Prompt 提交、图片筛选、哈希去重和状态机。
- HTML Fixture：未登录、可用聊天页、生成中、多图完成、拒绝、限额和未知页面。
- Electron 集成测试：窗口生命周期、受控 IPC、视图显隐和资料目录持久化。
- FastAPI 集成测试：批次保存、多图原子导入、关系创建、中断恢复和错误状态。
- 本地端到端测试：使用模拟 ChatGPT 页面验证全链路，不操作真实账号。

### 人工验收

1. 首次启动并在内嵌真实 ChatGPT 页面登录。
2. 输入“一朵花”并点击生成。
3. Prompt 自动发送到普通 Chat。
4. ChatGPT 返回的全部图片自动下载。
5. Canvas 创建同一批次的全部图片节点。
6. 重启应用后登录状态和已保存图片仍存在。
7. 退出登录后，生成任务进入 `needs_login`，不泄露身份数据。

## 非目标

- 不调用 OpenAI API。
- 不调用 Codex app-server 或消耗 Codex额度。
- 不绕过验证码、安全检查、内容政策或使用限额。
- 不存储或导出用户密码、Cookie 和认证令牌。
- 不保证 ChatGPT 网页结构永久不变；适配器必须可版本化和替换。
