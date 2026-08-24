# AI Image Canvas Phase 2 Design

## 目标

把 Phase 1 的静态画布外壳升级为可操作的图片关系画布。Phase 2 使用 React Flow 提供平移、缩放、节点拖动、选择和连线，并支持浏览器会话内的真实图片上传。所有数据在刷新后清空；持久化留给 Phase 3。

## 范围

Phase 2 包含：

- 无限画布的平移、缩放、适应视图和视口反馈。
- 图片节点的展示、选择、拖动、复制和删除。
- 节点间的有向版本关系连线。
- 点击选择文件和拖放文件创建节点。
- 右侧详情面板与当前节点选择同步。
- 项目之间相互隔离的会话级画布状态。
- 三个随前端打包的 WebP 示例图片节点与两条示例关系。

Phase 2 不包含 SQLite、后端上传、刷新恢复、Prompt CRUD、图片元数据持久化或 provider 接口。

## 技术选择

采用 `@xyflow/react`。它负责视口、节点坐标、拖动、选择、连线和边渲染；业务数据仍由 Zustand 管理。Konva 不采用，因为它需要自行实现节点、连线、选择语义和大量交互基础设施，而 Phase 2 的核心模型与 React Flow 高度匹配。

## 领域模型

前端新增：

```ts
interface CanvasImage {
  id: string
  projectId: string
  imageUrl: string
  imageSource: 'fixture' | 'upload'
  fileName: string
  prompt: string
  tags: string[]
  parentId: string | null
  createdTime: string
}

interface CanvasNodeData extends Record<string, unknown> {
  image: CanvasImage
}

interface ProjectCanvasState {
  nodes: Node<CanvasNodeData>[]
  edges: Edge[]
}
```

`parentId` 是 Phase 3 数据模型的兼容字段。每个子节点最多只有一个父节点；创建新的 incoming 关系时，旧 incoming 边被替换。连线方向为父节点到子节点。自连接、重复连接和指向不存在节点的连接被拒绝。

## 状态架构

现有应用状态保留项目、Prompt 和面板显示。画布逻辑拆到 `features/canvas/store/canvasStore.ts`，按 `projectId` 保存 `ProjectCanvasState`，并提供以下动作：

- `applyNodeChanges(projectId, changes)`
- `applyEdgeChanges(projectId, changes)`
- `addUploadedImages(projectId, files, position)`
- `connectNodes(projectId, connection)`
- `selectNode(projectId, nodeId)`
- `duplicateNode(projectId, nodeId)`
- `deleteNode(projectId, nodeId)`
- `clearError()`

选择状态随项目隔离。切换项目后右侧详情读取该项目的选择，不沿用其他项目节点。

React Flow 组件订阅当前项目的节点和边，并把 React Flow changes 传回 store。节点组件只负责展示和触发明确动作，不直接修改数组。

## 上传与对象 URL 生命周期

支持 MIME 类型：`image/png`、`image/jpeg`、`image/webp`。单个文件上限 20MB，一次最多 20 张。无效文件不创建节点，并显示包含文件名的画布内错误提示。

上传文件通过 `URL.createObjectURL()` 转为会话 URL。删除上传节点时立即调用 `URL.revokeObjectURL()`。应用卸载时释放仍存在的全部上传 URL。复制上传节点复用同一个 URL，并通过引用计数确保仅在最后一个引用删除时释放。

拖放坐标通过 React Flow 的 `screenToFlowPosition` 转换。批量图片以两列错位排列，避免完全重叠。点击上传时默认放在当前视口中心附近。

## 示例内容

三个 WebP 示例资源存放于 `frontend/src/assets/demo/`，随应用离线打包。它们用于“未来城市设计”项目：

1. 城市总体氛围图。
2. 由总体图发展出的街道尺度版本。
3. 由街道版本发展出的交通节点版本。

默认关系为 `1 → 2 → 3`。其他项目从空画布开始。示例 Prompt 使用明确、简短的英文生成描述，并标记固定创建时间，保证测试稳定。

## 图片节点

节点宽度 236px，包含 4:3 图片缩略图、Prompt 两行摘要和创建时间。选中态使用统一青绿色描边与轻量背景变化，不添加宽阴影。左右各有一个连接 Handle：左侧为 target，右侧为 source。

节点右上角操作按钮仅在 hover、键盘 focus-within 或选中时显示。操作包括复制、删除和打开详情。删除需要一次确认，避免误操作；确认界面使用节点内联操作而不是全局模态框。

## 画布交互

- 默认鼠标左键选择和拖动节点，空白区域拖动平移。
- 鼠标滚轮缩放，范围 20%–200%。
- 工具栏可切换选择与抓手模式。
- 上传按钮打开原生多文件选择器。
- 适应视图按钮将所有节点置于可见区域。
- 右下角缩放控件执行真实缩小、重置为 100%、放大。
- Backspace/Delete 删除当前选中节点，但输入控件聚焦时不响应。
- 连线可选中并使用 Delete 删除；删除边时同步清除子节点的 `parentId`。

## 详情面板

未选中时保留 Phase 1 引导状态。选中后显示：

- 大图预览。
- 完整 Prompt。
- 文件名与创建时间。
- 标签列表；Phase 2 只读。
- 父版本缩略信息；无父版本时显示“初始版本”。
- 复制 Prompt、复制节点和删除节点操作。

复制 Prompt 使用 Clipboard API；失败时显示内联反馈，不阻断画布。

## 错误处理

文件校验错误、对象 URL 创建错误和剪贴板错误显示在画布或详情面板的局部提示中。错误可手动关闭，也会在下一次成功操作后清除。React Flow 的无效连接直接忽略，不显示干扰性 toast。

如果示例资源加载失败，节点保留结构并显示文件图标与文件名，不让整个画布崩溃。

## 无障碍与响应式

工具栏、节点操作和详情操作均提供可读的 `aria-label`。颜色不是选中、错误或父子关系的唯一表达方式。画布节点可通过 Tab 聚焦；聚焦态与选中态一致清晰。

1100px 以下详情面板隐藏，节点双击详情仅保留选择行为；760px 以下左侧栏隐藏，画布仍可平移和缩放。Phase 2 不重新设计完整移动端节点编辑流程。

## 测试

单元测试覆盖：

- 文件类型、大小和数量校验。
- 项目画布状态隔离。
- 节点复制的位置、数据与图片 URL 引用。
- 节点删除及相关边清理。
- 创建连接时单父节点约束。
- 删除边时 `parentId` 同步。

组件测试覆盖：

- React Flow 画布与示例节点渲染。
- 项目切换显示独立画布。
- 选择节点后详情面板展示完整 Prompt。
- 上传控件接受 PNG、JPG 和 WEBP。
- 空项目显示可操作的上传引导。

验收时运行完整 Vitest、TypeScript/Vite 构建和后端回归测试，并通过本地页面确认缩放、拖动、选择、上传和连线。
