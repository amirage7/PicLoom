# AI Image Canvas

本地优先的 AI 图片创作管理工作台。Phase 1 提供 React + FastAPI 基础工程、三栏工作区和本地开发入口，不调用任何图片生成 API。

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

Phase 1 仅包含工程基础和工作台外壳。无限画布、图片节点、关系连线、SQLite 持久化与 provider 接口将在后续阶段实现。
