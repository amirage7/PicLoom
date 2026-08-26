# PicLoom — ChatGPT 网页生图 Provider 设计

## 1. 目标

在不调用 OpenAI API、不收集 ChatGPT 账号密码、不导出登录 Cookie 的前提下，让用户从 PicLoom 提交 Prompt，通过已登录的 ChatGPT 官方网页普通 Chat 生成图片，并自动保存到当前本地项目和 Canvas。

该集成不使用 Work 或 Codex 模式。它使用用户自己的 ChatGPT 网页会话，因此仍受账号套餐、图片生成限额、内容政策和官方页面可用性影响。

## 2. 范围

### 本阶段包含

- 可替换的 `ImageProvider` 前端契约。
- `ChatGPTImageProvider` 实现。
- FastAPI 本地生成任务队列和扩展桥接 API。
- SQLite `generation_tasks` 表和任务状态持久化。
- Chrome Manifest V3 扩展，用于控制已登录的 `chatgpt.com` 标签页。
- 首次配对、连接状态、手动重连和扩展安装指引。
- 从 Prompt 提交到图片入库、Canvas 节点创建的完整单任务流程。
- 登录失效、页面不兼容、超时、内容被拒绝、下载失败等可诊断错误。

### 本阶段不包含

- OpenAI API 或其他付费生图 API。
- 在本地 WebUI 中收集 ChatGPT 账号、密码、两步验证码或 Cookie。
- 绕过验证码、登录安全检查、内容拒绝或使用限额。
- 隐藏或无头浏览器自动化。
- 并发生成、批量任务、断点续传或自动重复提交失败 Prompt。
- 保证 ChatGPT 网页 DOM 长期稳定；页面更新后可能需要升级扩展适配器。

## 3. 总体架构

```text
React Canvas
    │ ImageProvider
    ▼
ChatGPTImageProvider
    │ HTTP + 任务轮询
    ▼
FastAPI Generation Bridge
    │ 配对令牌 + 长轮询
    ▼
Chrome Extension
    │ content script
    ▼
ChatGPT 官方普通 Chat 页面
    │ 图片二进制回传
    ▼
FastAPI → 本地图片文件 → SQLite Images → Canvas 节点
```

各模块只通过明确契约交互。页面 DOM 适配逻辑局限在 Chrome 扩展内，不渗透到 React 或 FastAPI，以便 ChatGPT 页面改版时独立修复。

## 4. 前端 Provider 契约

```ts
type GenerationStatus =
  | "queued"
  | "connecting"
  | "sending"
  | "generating"
  | "downloading"
  | "completed"
  | "failed"
  | "cancelled";

interface GenerateImageInput {
  projectId: string;
  prompt: string;
  parentImageId?: string;
}

interface ImageGenerationTask {
  id: string;
  status: GenerationStatus;
  progressMessage: string;
  imageId?: string;
  chatUrl?: string;
  errorCode?: string;
}

interface ImageProvider {
  readonly id: string;
  getAvailability(): Promise<ProviderAvailability>;
  generate(input: GenerateImageInput): Promise<ImageGenerationTask>;
  getTask(taskId: string): Promise<ImageGenerationTask>;
  cancel(taskId: string): Promise<void>;
}
```

`ChatGPTImageProvider` 只调用本地 FastAPI，不直接访问 ChatGPT。前端使用统一 provider registry，为未来 Chrome 扩展新版、手动导入 provider 或其他用户自有 provider 保留替换点。

## 5. FastAPI 桥接和 API

### WebUI 端点

- `GET /api/providers/chatgpt/status`：扩展连接、配对、忙闲和登录状态。
- `POST /api/generation-tasks`：创建生图任务。
- `GET /api/generation-tasks/{id}`：读取状态。
- `POST /api/generation-tasks/{id}/cancel`：取消未完成任务。
- `POST /api/providers/chatgpt/pairing`：创建短时效一次性配对码。

### 扩展端点

- `POST /api/extension/pair`：使用配对码换取本机连接令牌。
- `POST /api/extension/heartbeat`：报告扩展版本、空闲状态和 ChatGPT 页面状态。
- `GET /api/extension/tasks/next`：长轮询取得下一个任务。
- `PATCH /api/extension/tasks/{id}`：上报任务阶段或可诊断错误。
- `POST /api/extension/tasks/{id}/image`：上传最终图片。

所有 extension 端点要求 Bearer 连接令牌。后端仅监听 `127.0.0.1`，对 WebUI 和扩展使用精确 CORS allowlist，禁止通配来源。

## 6. Chrome 扩展

扩展使用 Manifest V3，由三个边界清晰的部分组成：

- Service worker：配对、心跳、任务长轮询、标签页定位和消息路由。
- Content script：登录检测、普通 Chat 确认、Prompt 输入、提交、结果观测和图片提取。
- Options/popup：显示配对状态、扩展版本、最近错误和“打开 ChatGPT”按钮。

必要权限限定为 `storage`、`tabs`、`activeTab`、对 `https://chatgpt.com/*` 的 host permission，以及本地 FastAPI 地址。不申请浏览历史、Cookie 或全站点访问权限。

DOM 交互经过版本化的 `ChatPageAdapter`。选择器优先使用可访问性角色、表单语义和稳定属性，不依赖压缩 CSS class。连续检测不到所需结构时，任务以 `PAGE_UNSUPPORTED` 终止，不盲目点击。

## 7. 任务数据和状态机

`generation_tasks` 表包含：

- `id`
- `project_id`
- `provider`
- `prompt`
- `parent_image_id`
- `status`
- `progress_message`
- `chat_url`
- `image_id`
- `error_code`
- `created_time`
- `updated_time`

状态迁移：

```text
queued → connecting → sending → generating → downloading → completed
   └──────────────────────────────────────────→ cancelled
connecting / sending / generating / downloading → failed
```

同一时刻只有一个非终态任务可以进入 `sending`。后续任务保持 `queued`。应用重启后，原处于执行阶段的任务标记为 `failed/BRIDGE_RESTARTED`，不自动重发。

## 8. 完整生图流程

1. 用户选择项目，输入 Prompt，点击“使用 ChatGPT 生成”。
2. 前端验证 Prompt 和 provider 可用性，创建任务。
3. 扩展取得任务，查找或打开 ChatGPT 官方标签页，必要时切换到前台。
4. 扩展检查用户已登录，且当前是普通 Chat 而非 Work/Codex。
5. 扩展新建普通 Chat，输入 Prompt 并触发一次提交。
6. `MutationObserver` 配合低频健康检查观测生成进度，等待结果稳定。
7. 扩展提取最终图片字节、MIME 类型和 Chat URL，回传 FastAPI。
8. 后端检查图片签名、MIME、大小和像素上限，安全生成文件名并写入 `data/images/<project_id>/`。
9. 后端在同一业务流程中创建 Images 记录并完成任务；上传中断时不保留半成品数据库记录。
10. 前端取得完成状态，刷新当前项目图片，创建并选中 Canvas 节点。

## 9. 配对与安全

- 配对码由后端使用密码安全随机数生成，一次使用，5 分钟后失效。
- 扩展用配对码换取高熵连接令牌，令牌仅保存在 Chrome extension storage 和本地数据库的单向哈希中。
- 任务绑定当前项目，上传绑定任务 ID，已终态任务拒绝二次上传。
- 图片文件名不接受扩展输入，防止路径穿越和覆盖现有文件。
- 只接受 PNG、JPEG 和 WEBP；使用文件签名而非扩展名判断类型。
- 日志不记录令牌、Cookie、完整页面 HTML 或账号信息。Prompt 只存入用户的本地 SQLite。
- 扩展遇到验证码、安全检查或重新登录时立即暂停，将控制权交回用户。

## 10. 前端交互

- Canvas 工具栏增加“ChatGPT 生图”入口。
- 第一次使用显示三步连接向导：加载扩展、输入配对码、在官方页面登录。
- 生成面板显示 Prompt、provider 连接状态、当前任务阶段、取消按钮和“打开 ChatGPT 对话”链接。
- 任务执行时禁止重复提交，但不锁定 Canvas 的缩放、平移和其他编辑操作。
- 失败后保留 Prompt，提供“重试”按钮；重试必须由用户显式点击，创建新任务。
- 完成后自动选中新图片节点，保留 Prompt、创建时间和可选的父图关系。

## 11. 错误语义

第一版至少支持：

- `EXTENSION_OFFLINE`：扩展未安装、未配对或心跳超时。
- `LOGIN_REQUIRED`：官方 ChatGPT 页面未登录。
- `CHAT_MODE_UNAVAILABLE`：无法确认普通 Chat 模式。
- `PAGE_UNSUPPORTED`：当前页面结构与适配器不兼容。
- `PROMPT_SUBMIT_FAILED`：找到输入器但无法完成提交。
- `GENERATION_REJECTED`：ChatGPT 显式拒绝请求。
- `GENERATION_TIMEOUT`：在配置时限内未取得稳定结果。
- `IMAGE_NOT_FOUND`：对话完成但未发现可下载图片。
- `IMAGE_DOWNLOAD_FAILED`：扩展无法读取图片字节。
- `IMAGE_INVALID`：后端拒绝了上传文件。
- `BRIDGE_RESTARTED`：执行中后端重启，任务未自动重发。

用户界面显示中文解释和明确下一步，详细代码保留在任务记录和诊断界面中。

## 12. 测试与验收

### 后端

- 任务创建、单任务出队、合法状态迁移和非法迁移拒绝。
- 配对码一次性、过期、令牌验证和错误 CORS 来源拒绝。
- 上传的 MIME、文件签名、大小、项目归属和重复完成防护。
- 成功上传后图片文件、Images 记录和任务记录一致。

### 前端

- provider 可用性、生成状态、失败恢复和完成后节点创建。
- 扩展离线、未登录、执行中和失败状态的可访问性文案与按钮状态。
- 用户必须显式点击才能重试，不会在页面刷新后自动重发。

### 扩展

- 使用本地 fixture HTML 对 `ChatPageAdapter` 进行 DOM 合同测试。
- 测试登录页、普通 Chat、生成中、生成成功、显式拒绝和未知页面结构。
- 使用模拟桥接测试心跳、长轮询、取消和图片上传。

### 端到端手动验收

1. 在 Chrome 开发者模式加载本地扩展。
2. 用一次性配对码连接 `127.0.0.1:8000`。
3. 在官方 ChatGPT 页面手动登录，WebUI 显示 provider 就绪。
4. 提交一个图片 Prompt，扩展切换到普通 Chat 并仅提交一次。
5. 生成结束后，图片自动出现在当前 Canvas，文件和 SQLite 记录存在。
6. 刷新页面或重启项目后，图片节点、Prompt 和任务结果仍可查看。
7. 退出 ChatGPT 后再提交，任务停在可恢复错误，页面要求用户重新登录，不会循环点击。

## 13. 实现顺序

1. Provider 契约、任务数据模型和后端状态机。
2. 配对、心跳、长轮询和安全图片上传。
3. Chrome 扩展骨架和可测试的 ChatGPT DOM 适配器。
4. 前端连接向导、生成面板和任务状态。
5. 生成结果入库和 Canvas 节点联动。
6. 集成测试、扩展 fixture 测试和真实账号手动验收。

