# PicLoom Phase 1 Design

## 目标

搭建可在本地运行的 AI 图片创作管理工作台基础工程。Phase 1 交付 React 前端、FastAPI 后端、模块化目录与高质量深色三栏界面，不接入图片生成、画布引擎、数据库或图片上传。

## 技术方案

采用前后端分离的单仓库结构：

- `frontend/`：React、TypeScript、Vite、Tailwind CSS、Zustand。
- `backend/`：Python、FastAPI、Pydantic Settings。
- `data/`：为 SQLite 数据库与项目图片保留目录，但 Phase 1 不创建业务数据。
- 根目录：开发说明、环境示例与 Windows PowerShell 启动脚本。

开发期由 Vite 监听 `127.0.0.1:3000`，FastAPI 监听 `127.0.0.1:8000`。前端通过 `/api` 代理访问后端，避免业务代码绑定后端地址，并为将来统一托管构建产物保留空间。

## 前端架构

前端按产品功能而不是纯技术类型划分：

- `app/`：应用入口、全局状态与顶层组合。
- `components/`：可复用的基础界面组件。
- `features/projects/`：项目列表和项目切换。
- `features/prompts/`：Prompt Library 与分类展示。
- `features/canvas/`：画布外壳、工具栏、空状态和缩放占位控制。
- `features/inspector/`：图片详情面板空状态。
- `lib/`：API 客户端与无界面工具。
- `types/`：共享领域类型。

Zustand 在 Phase 1 管理当前项目、示例项目、示例 Prompt 以及侧栏状态。画布节点状态暂不模拟，Phase 2 使用独立 slice 接入 React Flow，避免顶层组件承担画布业务。

## 界面设计

桌面端采用固定三栏工作区：左栏 280px，中间区域弹性伸缩，右栏 320px。整体使用冷中性色深色主题，以青绿色作为唯一强调色。边界、层级和选中状态依赖低对比度描边及明度变化，不使用复杂渐变和装饰动画。

左栏分为品牌区、项目管理、Prompt Library。示例数据让界面在数据库接入前仍可评估密度与操作路径；项目切换可用，新建、编辑、删除和复制按钮在 Phase 1 作为明确的禁用或占位操作呈现。

中间区域包含项目标题、画布工具栏、点阵背景、引导空状态和缩放控件。它只定义 React Flow 将来挂载的稳定容器，不自行实现伪画布交互。

右栏包含详情标题与未选择图片的引导状态，为 Phase 2 的节点选择和 Phase 3 的元数据编辑保留稳定区域。

窄屏下保持工作台优先：左栏与右栏可收起，中间画布至少保留可用宽度；Phase 1 不面向手机端重构完整操作流程。

## 后端架构

FastAPI 应用采用应用工厂和版本化 API 路由。Phase 1 仅提供：

- `GET /api/health`：返回服务状态与应用名称。
- CORS 配置：仅允许本地 Vite 开发地址。
- 配置模块：集中管理应用名称、主机、端口和未来数据目录。

目录预留 `api/`、`core/`、`models/`、`schemas/`、`services/`。SQLite、ORM、文件上传与 CRUD 不在 Phase 1 中提前实现。

## 数据与未来扩展边界

Phase 1 定义 `Project`、`Prompt` 和界面状态的 TypeScript 类型，但不建立持久化模型。Phase 3 再以 SQLite 为事实来源，并通过 API DTO 与前端领域类型对接。

未来 provider 接口不会在 Phase 1 中放入空实现；Phase 5 将引入 `ImageProvider` 和 `PromptProvider` 契约、能力检测及本地占位 provider，避免当前阶段出现不可调用的抽象。

## 错误处理

前端启动时探测 `/api/health`，后端不可达时在状态栏显示“Backend offline”，不阻塞界面。后端使用 FastAPI 默认结构化错误响应；业务错误规范留到首个 CRUD 阶段落地。

## 测试与验收

Phase 1 验收标准：

1. `npm run build` 完成，无 TypeScript 或 Vite 构建错误。
2. 前端组件测试确认三栏地标、示例项目切换与后端离线状态可用。
3. 后端测试确认 `/api/health` 返回 HTTP 200 和稳定响应结构。
4. FastAPI 可在 `127.0.0.1:8000` 启动，Vite 可在 `127.0.0.1:3000` 启动。
5. 桌面宽度下三栏无水平溢出；中等宽度下辅助栏可收起。

## 非目标

- React Flow 或 Konva 画布交互。
- 图片节点、连线、上传和本地文件存储。
- SQLite 表、迁移和 CRUD API。
- ChatGPT 网页自动化、Chrome 扩展或任何模型/API 调用。
- 完整移动端创作体验。

## 后续阶段

- Phase 2：引入 React Flow，完成无限画布、图片节点、拖动、缩放与关系连线。
- Phase 3：接入 SQLite 与本地图片目录，完成项目、图片和 Prompt 持久化。
- Phase 4：完善快捷操作、响应式、无障碍和视觉细节。
- Phase 5：定义并实现可替换的 ImageProvider 与 PromptProvider 接口层。
