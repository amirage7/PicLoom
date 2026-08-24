# AI Image Canvas Phase 3 持久化设计

## 目标

Phase 3 将 Phase 2 的会话内画布升级为本地持久化工作台。项目、Prompt、图片文件、节点位置、标签和版本关系写入 FastAPI、SQLite 与本地文件系统；浏览器刷新或重新启动服务后能够恢复工作状态。

本阶段仍不调用图片生成 API，不实现生成模型，不接入 ChatGPT 网页自动化。

## 设计原则

- SQLite 是结构化数据的唯一事实来源，本地文件系统是图片二进制的唯一事实来源。
- 前端采用乐观更新；操作立即反馈，随后写入后端，并显示保存状态。
- 节点拖动只在拖动结束后保存，避免高频数据库写入。
- API 围绕 Project、Image、Prompt 资源设计，方便未来 Chrome Extension、自动下载和 provider 接口复用。
- 不引入迁移框架；当前数据库版本由应用启动时执行幂等建表和轻量种子初始化。正式迁移体系留到表结构需要第二次演进时加入。

## 技术方案选择

采用资源化 REST API、SQLAlchemy 2.0 和 Zustand 乐观更新。

未采用整画布 JSON 快照，因为图片和 Prompt 无法被独立查询、更新和复用。未采用 LocalStorage 双向同步，因为它会引入不必要的数据冲突与恢复规则。React Flow 的 Edge 不单独建表：每张图片最多有一个父版本，`images.parent_id` 足以表达当前版本树；前端根据 `parent_id` 重建边。

## 目录结构

```text
AI-Image-Canvas/
├── data/
│   ├── database.sqlite
│   └── images/
│       └── {project_id}/
├── backend/
│   ├── app/
│   │   ├── api/routes/
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/
│   └── tests/
└── frontend/
    └── src/
        ├── features/projects/
        ├── features/prompts/
        ├── features/canvas/
        └── lib/
```

## 数据模型

### Projects

- `id`: 不透明字符串主键；内置项目保留 Phase 2 稳定 ID，新建项目使用 UUID
- `name`: 非空字符串，最长 120 字符
- `created_time`: UTC ISO 时间

SQLite 每次连接启用 `PRAGMA foreign_keys=ON`。删除项目时级联删除其 Images，并删除 `data/images/{project_id}`。至少保留一个项目：前端不允许删除最后一个项目，后端同样返回 409 防止绕过。

### Images

- `id`: UUID 字符串，主键
- `project_id`: Projects 外键
- `image_path`: 相对 `data/` 的 POSIX 风格路径
- `file_name`: 用户原始文件名，仅用于展示
- `prompt`: 文本
- `tags_json`: JSON 字符串数组
- `parent_id`: 可空的 Images 自引用外键
- `position_x`, `position_y`: React Flow 坐标
- `created_time`: UTC ISO 时间

同一图片最多有一个父节点。设置父节点时必须确认父子图片属于同一项目、父节点存在、不能指向自己，且新增关系不会形成环。删除父图片时，其直接子图片的 `parent_id` 置空，子图片和文件保留。

### Prompts

- `id`: 不透明字符串主键；内置 Prompt 保留 Phase 2 稳定 ID，新建 Prompt 使用 UUID
- `title`: 非空字符串，最长 120 字符
- `content`: 非空文本
- `category`: 非空字符串，最长 60 字符
- `created_time`: UTC ISO 时间

Prompt Library 是全局资源，不绑定项目。复制 Prompt 创建新的 UUID 与创建时间，并在标题后追加“副本”。

## 图片存储与安全

- 上传接口使用 multipart/form-data。
- 请求体在进入持久化前限制为 20 MB；一次前端操作最多提交 20 张，但后端每个请求只接收一张图片。
- Pillow 解码并验证真实格式，只接受 PNG、JPEG、WEBP。
- 服务端忽略用户文件路径，使用 UUID 和由解码格式推导出的扩展名生成文件名。
- 文件先写入项目目录内的临时文件，验证和数据库写入成功后再原子替换为最终文件。
- 数据库失败时清理临时文件；文件复制失败时不创建数据库记录。
- 媒体访问通过挂载的 `/media` 静态路径提供；数据库和 API 只暴露受控的相对 URL。
- 删除图片或项目后清理对应文件。文件已缺失时删除数据库记录仍可成功，并记录可诊断信息。

## API 设计

所有业务接口使用 `/api` 前缀，错误响应统一包含 `detail`。

### Projects

- `GET /api/projects`: 列表，包含实时 `image_count`
- `POST /api/projects`: 创建项目
- `PATCH /api/projects/{project_id}`: 重命名
- `DELETE /api/projects/{project_id}`: 删除项目；最后一个项目返回 409

### Prompts

- `GET /api/prompts`: 列表
- `POST /api/prompts`: 创建
- `PATCH /api/prompts/{prompt_id}`: 编辑
- `POST /api/prompts/{prompt_id}/duplicate`: 复制
- `DELETE /api/prompts/{prompt_id}`: 删除

### Images

- `GET /api/projects/{project_id}/images`: 返回项目图片、位置与父关系
- `POST /api/projects/{project_id}/images`: 上传单张图片，并接收 prompt、parent_id、position_x、position_y
- `PATCH /api/images/{image_id}`: 更新 prompt、tags、parent_id、position_x、position_y
- `POST /api/images/{image_id}/duplicate`: 复制文件和记录，位置偏移 60 像素，父关系为空
- `DELETE /api/images/{image_id}`: 删除记录和图片文件

返回 Image 时提供 `image_url=/media/images/{project_id}/{stored_name}`，前端不拼接磁盘路径。

## 初始数据与离线行为

首次启动空数据库时创建“未来城市设计”“产品概念图”“建筑渲染”三个项目，并创建 Phase 2 的六条 Prompt Library 示例。数据库在线时画布以 API 数据为准，不自动把前端演示图片写入数据库。

如果健康检查或初始化加载失败，前端显示 Phase 2 离线演示画布，同时将保存状态标为“后端离线”。离线回退中的演示节点不可被误认为已持久化；用户上传或修改时给出“无法保存到本地服务”的明确错误。后端恢复后提供重新加载动作，以数据库内容替换离线回退状态。

## 前端状态与数据流

### 初始化

1. App 启动并检查后端。
2. 并行请求 Projects 与 Prompts。
3. 选择首个或当前有效项目。
4. 请求该项目 Images，将每条 Image DTO 转换为 React Flow Node，并依据 `parent_id` 生成 Edge。
5. 项目切换时按需加载并缓存该项目画布。

### 保存状态

全局状态使用 `idle | loading | saving | saved | error | offline`。顶部状态组件显示：

- 正在加载
- 正在保存
- 已保存
- 保存失败，可重试
- 后端离线

并发保存采用每个资源独立请求，不实现复杂的离线队列。后发的同一字段更新覆盖先发值；失败时保留当前乐观界面，并记录可重试操作。重新加载会重新以数据库为准。

### 操作映射

- 上传图片：先调用上传 API，成功后把返回节点加入 Zustand，不创建临时 Object URL 节点。
- 拖动节点：拖动期间只更新内存；`onNodeDragStop` PATCH 最终坐标。
- 连接节点：前端先校验自连接，PATCH 目标节点 `parent_id`；后端执行同项目与防环校验。
- 编辑 Prompt/标签：输入失焦时 PATCH。
- 复制：调用 duplicate API，成功后添加返回节点并选中。
- 删除：API 成功后从 Zustand 移除；失败则保留节点并提示。
- 项目和 Prompt CRUD：成功响应替换或更新 Zustand 中对应资源。

## UI 交互

- 项目标题右侧菜单启用重命名和删除；项目区新增按钮打开轻量内联表单。
- Prompt Library 新增按钮打开编辑表单；每条 Prompt 支持复制、编辑、删除和复制内容。
- 所有删除操作需要二次确认。
- 保存失败提示不遮挡画布操作，并提供重试或重新加载。
- 不增加复杂动画或渐变，沿用现有深色工具界面和紧凑控件。

## 错误处理

- 400：字段格式、图片格式、父关系无效或形成环。
- 404：Project、Image 或 Prompt 不存在。
- 409：删除最后一个项目，或资源状态冲突。
- 413：上传图片超过 20 MB。
- 500：未预期的文件系统或数据库错误，客户端显示通用保存失败信息。
- 前端不得用失败响应覆盖当前编辑内容；用户可重试或重新加载服务器状态。

## 测试策略

### 后端

- 每个测试使用临时 SQLite 文件和临时 images 目录。
- 覆盖项目与 Prompt CRUD、最后一个项目保护、image_count。
- 使用真实小型 PNG/JPEG/WEBP 测试上传和媒体访问。
- 覆盖伪装扩展名、超限、非法父关系、跨项目关系和环检测。
- 覆盖图片复制、删除文件、项目级联文件清理和缺失文件容错。

### 前端

- API 客户端测试请求方法、路径和错误转换。
- Zustand 测试 hydrate、乐观更新、失败状态、重试和项目画布缓存。
- 组件测试项目与 Prompt CRUD、保存状态、拖动结束保存和离线提示。
- 运行全量 Vitest、TypeScript/Vite build 与 Pytest。

## 非目标

- Alembic 数据库迁移
- 用户账号、权限和多用户并发
- 云端存储或同步
- 撤销/重做历史
- 离线编辑队列与冲突合并
- ChatGPT 自动化、Chrome Extension、图片生成和 Prompt AI 优化

## 验收标准

- 通过 `scripts/start-dev.ps1` 启动后访问 `http://127.0.0.1:3000`。
- 创建项目和 Prompt 后刷新页面仍存在。
- 上传图片、拖动节点、编辑 Prompt/标签、建立父子关系后刷新页面能够恢复。
- 复制和删除图片会同步影响 SQLite 与本地文件。
- 非法图片或非法版本关系不会产生残留文件或数据库记录。
- 后端离线时界面保持可理解的回退状态，并明确告知无法持久化。
- 前后端全量自动化测试和生产构建通过。
