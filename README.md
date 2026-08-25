# AI Image Canvas

本地优先的 AI 图片创作管理工作台。已接入 React Flow 无限画布、SQLite、本地图片存储，以及桌面版内嵌的官方 ChatGPT 普通 Chat 页面；项目不调用 OpenAI API。

完整安装、登录、生图、数据备份与故障排查说明见 [AI Image Canvas 软件说明书](docs/AI-Image-Canvas-软件说明书.md)。

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

cd ..\desktop
npm install
```

## 启动

### 桌面版（推荐）

先启动前端开发服务器，然后从另一个终端启动桌面应用：

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 3000

cd ..
$env:VITE_DEV_SERVER_URL='http://127.0.0.1:3000'
npm run desktop:dev
```

桌面应用会自动启动 FastAPI 后端。打开右侧的“ChatGPT”标签，点击“登录 / 查看 ChatGPT”，在内嵌的官方页面中由用户本人登录。登录状态由 Electron 持久会话保存；应用代码不会读取或保存密码。

### 浏览器开发版


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
- Backend health: <http://127.0.0.1:8001/api/health>
- API docs: <http://127.0.0.1:8001/docs>

## 测试

```powershell
cd frontend
npm run test:run
npm run build

cd ..\backend
.\.venv\Scripts\python.exe -m pytest -v

cd ..
npm run desktop:test
npm run desktop:typecheck
```

测试会使用临时数据库和临时图片目录，不会改动 `data/` 中的工作区内容。

## 当前范围

Phase 4 当前支持：

- 画布平移、滚轮缩放、适应内容和节点拖动
- 上传或拖入 PNG、JPG、WEBP（单张上限 20 MB，一次最多 20 张）
- 图片节点选择、复制、删除与父子版本关系持久化
- 右侧面板查看图片、编辑 Prompt 和标签、复制 Prompt
- 项目创建、重命名、删除和切换
- Prompt 新建、编辑、复制、删除与分类管理
- SQLite 保存项目、Prompt、节点位置、图片信息和版本关系
- 图片原文件保存到 `data/images/<project-id>/`
- 顶栏显示加载、保存、失败或离线状态，并支持重试
- 1179px 以下使用覆盖式项目导航和图片详情抽屉，画布保持挂载
- 抽屉互斥、遮罩关闭、Escape 关闭和触发按钮焦点恢复
- 项目与 Prompt 空状态、表单焦点管理和保存状态实时播报
- 桌面、笔记本和窄屏共用同一套本地数据与画布操作

首次启动会自动创建 `data/database.sqlite`、图片目录和示例项目。刷新页面或重启服务后，画布内容会从本地数据库恢复。

快捷键：`V` 选择工具、`H` 抓手工具、`0` 适应全部内容、`[` 切换项目导航、`]` 切换图片详情、`Escape` 关闭抽屉或清除选择、`Delete` / `Backspace` 删除选中节点。输入 Prompt、标签或项目名称时不会触发画布快捷键。

## ChatGPT 网页生图

桌面版直接显示真实的官方 ChatGPT 普通 Chat 页面。它使用用户自己的 ChatGPT 网页登录状态，不调用 OpenAI API，也不使用 Work 或 Codex。

1. 打开右侧“ChatGPT”标签。
2. 点击“登录 / 查看 ChatGPT”。
3. 在官方页面中手动登录自己的账号。
4. 回到生图面板输入 Prompt，点击“使用 ChatGPT 生成”。
5. 应用等待本次回复完成，下载回复中的图片并导入当前项目。

ChatGPT 套餐、图片生成限额和内容政策仍然适用。官方页面结构改变、账号验证、限流或拒绝生成时，应用会显示可恢复的错误。

每张图片限制 20 MB，每次回复的图片总量限制 80 MB；支持 PNG、JPEG 和 WEBP。登录失效时重新打开官方页面登录；页面结构变化时打开页面检查并使用“重试收集”；拒绝或限流时应在原对话中按提示稍后重试，应用不会自动重复发送 Prompt。

### Chrome 扩展兼容模式

纯浏览器运行时仍可使用 Chrome 扩展：

```powershell
cd extension
npm install
npm run build
```

在 Chrome 的 `chrome://extensions` 开启开发者模式并加载 `extension/dist`。启动前后端后，在 Canvas 工具栏打开 ChatGPT 生图面板，生成一次性配对码并输入扩展；ChatGPT 登录必须由用户本人在官方页面完成。

详细步骤和错误说明见 `docs/chatgpt-extension-troubleshooting.md`。

## Windows 安装包

首次构建会安装 PyInstaller，并可能由 electron-builder 下载 Windows 打包工具：

```powershell
npm run build:desktop
```

安装包输出到 `desktop/release/AI Image Canvas-Setup-0.2.0.exe`。安装版会自动启动仅监听 `127.0.0.1:8001` 的本地后端。

## 数据边界

- 开发版数据位于项目根目录的 `data/`。
- 安装版数据位于 Electron 用户数据目录下的 `data/`，实测为 `%APPDATA%\ai-image-canvas-desktop\data`。
- 图片和 SQLite 数据库只保存在本机；备份时先退出应用，再复制完整 `data/`。
- ChatGPT 登录 Cookie 由 Electron 的持久浏览器会话管理。应用不会接收用户密码，也不会把 Cookie 写入项目数据库。
- 卸载应用默认不会主动删除用户数据；确认不再需要项目和登录会话后，可由用户手动删除上述应用数据目录。
