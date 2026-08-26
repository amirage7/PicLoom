# AI Image Canvas 项目优先导航设计

## 目标

在不改变现有深色主题、React Flow 核心和 ChatGPT 登录/自动化链路的前提下，把工作区重构为“快速创作 / 正式项目 / 项目内画布与图库”。

## 当前实现与复用边界

- `ProjectListPersisted` 已具备项目创建、选择、重命名和删除，可保留 API 与表单逻辑，重排为工作区导航。
- `PromptLibraryPersisted` 是全局资源，改为可折叠次级入口，不改变 CRUD。
- `CanvasBoard` 和 `canvasStore` 保留 React Flow、节点位置、关系线和生成完成自动刷新。
- `Image` 继续作为唯一图片资产模型；新增 `is_on_canvas`、`is_favorite`、`source_type`，并允许 `project_id` 为空。
- `project_id = null` 表示系统级未归档空间，不创建伪项目。

## 信息架构

- 左侧：品牌、新建项目、快速创作（未归档数量）、项目列表、折叠 Prompt Library、设置与本地服务状态。
- 正式项目：顶部在“画布 / 图库”之间切换，项目不变化。
- 快速创作：只显示轻量图库和生图入口。
- 图库：全部、画布中、未使用、收藏、生成、上传；支持搜索、收藏、加入/移出画布、移动项目、基于图片新建项目和真实删除。

## 数据与交互边界

- 图片资产与 Canvas 节点解耦：Canvas 只展示 `is_on_canvas=true` 的资产。
- 从 Canvas 删除仅设置 `is_on_canvas=false`；图库中的“从项目删除”才删除文件与数据库记录。
- 正式项目中新生成/上传的图片默认加入 Canvas；快速创作生成图片保持未归档且不进入 Canvas。
- 移动图片只更新归属并迁移存储文件；关系只保留在相同归属范围内。
- 旧数据库采用兼容迁移：原有图片全部视为在 Canvas 中，来源默认为上传，不丢失现有数据。

## 非目标

不重写 ChatGPT 页面、登录、浏览器自动化、React Flow 手势、右侧详情栏、存储根目录和视觉令牌。
