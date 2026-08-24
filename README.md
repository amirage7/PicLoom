# AI Image Canvas

本地优先的 AI 图片创作管理工作台。当前已接入 React Flow 无限画布、SQLite 数据库与本地图片文件存储；项目不调用任何图片生成 API。

## 环境要求

- Node.js 20+
- Python 3.11+

## 安装

```powershell
cd frontend
npm install

cd ..\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 启动

在项目根目录运行：

```powershell
.\scripts\start-dev.ps1
```

也可以分别启动：

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

cd frontend
npm run dev -- --host 127.0.0.1 --port 3000
```

- WebUI: <http://127.0.0.1:3000>
- Backend health: <http://127.0.0.1:8000/api/health>
- API docs: <http://127.0.0.1:8000/docs>

## 测试

```powershell
cd frontend
npm run test:run
npm run build

cd ..\backend
.\.venv\Scripts\python.exe -m pytest -v
```

测试会使用临时数据库和临时图片目录，不会改动 `data/` 中的工作区内容。

## 当前范围

Phase 3 当前支持：

- 画布平移、滚轮缩放、适应内容和节点拖动
- 上传或拖入 PNG、JPG、WEBP（单张上限 20 MB，一次最多 20 张）
- 图片节点选择、复制、删除与父子版本关系持久化
- 右侧面板查看图片、编辑 Prompt 和标签、复制 Prompt
- 项目创建、重命名、删除和切换
- Prompt 新建、编辑、复制、删除与分类管理
- SQLite 保存项目、Prompt、节点位置、图片信息和版本关系
- 图片原文件保存到 `data/images/<project-id>/`
- 顶栏显示加载、保存、失败或离线状态，并支持重试

首次启动会自动创建 `data/database.sqlite`、图片目录和示例项目。刷新页面或重启服务后，画布内容会从本地数据库恢复。

快捷键：`V` 选择工具、`H` 抓手工具、`Delete` / `Backspace` 删除选中节点。

## 数据边界

所有数据只写入本机 `data/` 目录。Phase 4 将继续完善响应式布局、可访问性、空状态和高密度操作体验；未来生成能力通过可替换 Provider 接口接入，不会绑定 OpenAI API。
