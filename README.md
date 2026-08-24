# AI Image Canvas

本地优先的 AI 图片创作管理工作台。Phase 2 已提供 React Flow 无限画布、图片节点、版本连线、本地图片导入与详情编辑；项目不调用任何图片生成 API。

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

## 测试

```powershell
cd frontend
npm run test:run
npm run build

cd ..\backend
.\.venv\Scripts\python.exe -m pytest -v
```

## 当前范围

Phase 2 当前支持：

- 画布平移、滚轮缩放、适应内容和节点拖动
- 上传或拖入 PNG、JPG、WEBP（单张上限 20 MB，一次最多 20 张）
- 图片节点选择、复制、删除与父子版本连线
- 右侧面板查看图片、编辑 Prompt 和标签、复制 Prompt
- 不同项目拥有独立的会话画布；“未来城市设计”内置 3 张离线演示素材

当前上传图片与画布改动只保存在浏览器会话内，刷新页面会恢复演示状态。Phase 3 将接入 SQLite 与本地文件系统持久化。

快捷键：`V` 选择工具、`H` 抓手工具、`Delete` / `Backspace` 删除选中节点。
