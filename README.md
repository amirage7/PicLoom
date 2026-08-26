# PicLoom（仓库名：PicLoom）

> 本地优先的 AI 图片创作管理工作台。
> 把分散的 AI 生图、整理、迭代过程，集中到一个可追溯的本地画布中。

PicLoom 面向需要管理大量 Prompt、参考素材和图片版本的创作者与设计师。它不运行生成模型，而是把**项目、Prompt、图片素材、版本关系和创作上下文**组织在一个连续空间中，让你无需在文件夹、聊天记录和笔记之间来回寻找，就能恢复并继续一次创作。

完整的使用说明、登录、生图、数据备份与故障排查见 [PicLoom 软件说明书](docs/PicLoom-软件说明书.md)。

---

## 快速开始（Windows 用户）

1. **下载安装包**：
   - 推荐从 [GitHub Releases](../../releases) 下载最新 `PicLoom-Setup-0.2.0.exe`（约 119 MB）。
   - 如果你已经克隆了本仓库，也可以在 `desktop/release-new/PicLoom-Setup-0.2.0.exe` 找到当前版本安装包。
2. **双击安装**，按向导完成。
3. **启动应用**：安装结束后会自动运行；之后可在开始菜单找到 **PicLoom**。
4. **登录 ChatGPT**：打开右侧「ChatGPT」标签 → 点击「登录 / 查看 ChatGPT」→ 在官方页面登录自己的账号。
5. **开始创作**：选择或创建一个项目，在 Prompt 区输入需求，点击「使用 ChatGPT 生成」；需要参考图时输入 `@` 选择项目内图片。

> 应用使用官方 ChatGPT 网页的登录状态，**不调用 OpenAI API**，也**不会保存你的密码**。

---

## 核心功能

- **无限画布**：平移、滚轮缩放、适应内容、节点拖动、版本连线。
- **图片管理**：上传/拖入 PNG、JPG、WEBP（单张 ≤ 20 MB，单次 ≤ 20 张）；图片命名、标签、Prompt 编辑。
- **版本关系**：多图 `@` 合成时自动建立来源关系，可追溯每张图的生成路径。
- **ChatGPT 桌面集成**：内嵌官方 ChatGPT 普通 Chat 页面，直接复用网页登录状态。
- **一键移除背景**：基于当前图片自动生成透明背景版本。
- **透明背景生成**：Prompt 区开关直接要求生成无背景新图。
- **本地优先**：项目、Prompt、节点位置、图片信息和版本关系保存在本地 SQLite；图片原文件保存在 `data/images/<project-id>/`。
- **响应式布局**：桌面、笔记本和窄屏共用同一套数据与操作。

---

## Windows 安装包

当前版本：**v0.2.0**

| 项目 | 说明 |
|------|------|
| 安装包文件 | `PicLoom-Setup-0.2.0.exe` |
| 体积 | 约 119 MB |
| 运行环境 | Windows 10/11 64 位 |
| 包含内容 | Electron 桌面端 + 内嵌 FastAPI 本地后端 |
| 后端端口 | 安装版启动后自动监听 `127.0.0.1:8001` |

### 安装流程

1. 下载 `PicLoom-Setup-0.2.0.exe`。
2. 双击运行安装向导，选择安装位置。
3. 安装完成后应用自动启动；后续可从开始菜单打开。
4. 首次启动会创建本地数据库、图片目录和示例项目。

### 卸载

卸载应用默认不会删除用户数据。如确认不再需要项目和登录会话，可手动删除 `%APPDATA%\ai-image-canvas-desktop\data`。

---

## 使用 ChatGPT 生图

桌面版直接显示真实的官方 ChatGPT 普通 Chat 页面。它使用用户自己的 ChatGPT 网页登录状态，不调用 OpenAI API，也不使用 Work 或 Codex。

1. 打开右侧「ChatGPT」标签。
2. 点击「登录 / 查看 ChatGPT」。
3. 在官方页面中手动登录自己的账号。
4. 回到生图面板输入 Prompt；需要参考项目图片时输入 `@` 并选择图片名称，可按文本顺序引用多张图。
5. 需要直接生成无背景图片时开启「透明背景」；该选项不要求已有参考图。
6. 点击「使用 ChatGPT 生成」。应用按 `@` 出现顺序上传参考图，在同一条消息中加入可选透明约束和命名要求，等待回复完成，并把图片导入当前项目。

ChatGPT 套餐、图片生成限额和内容政策仍然适用。官方页面结构改变、账号验证、限流或拒绝生成时，应用会显示可恢复的错误。

每张图片限制 20 MB，每次回复的图片总量限制 80 MB；支持 PNG、JPEG 和 WEBP。登录失效时重新打开官方页面登录；页面结构变化时打开页面检查并使用「重试收集」；拒绝或限流时应在原对话中按提示稍后重试，应用不会自动重复发送 Prompt。

---

## 数据边界

- 开发版数据位于项目根目录的 `data/`。
- 安装版数据位于 Electron 用户数据目录下的 `data/`，实测为 `%APPDATA%\ai-image-canvas-desktop\data`。
- 图片和 SQLite 数据库只保存在本机；备份时先退出应用，再复制完整 `data/`。
- ChatGPT 登录 Cookie 由 Electron 的持久浏览器会话管理。应用不会接收用户密码，也不会把 Cookie 写入项目数据库。
- 卸载应用默认不会主动删除用户数据；确认不再需要项目和登录会话后，可由用户手动删除上述应用数据目录。

---

## Chrome 扩展兼容模式

纯浏览器运行时仍可使用 Chrome 扩展（普通用户通常不需要）：

```powershell
cd extension
npm install
npm run build
```

在 Chrome 的 `chrome://extensions` 开启开发者模式并加载 `extension/dist`。启动前后端后，在 Canvas 工具栏打开 ChatGPT 生图面板，生成一次性配对码并输入扩展；ChatGPT 登录必须由用户本人在官方页面完成。

详细步骤和错误说明见 `docs/chatgpt-extension-troubleshooting.md`。

---

## 开发环境

> 普通用户直接使用上方的 Windows 安装包即可，**无需阅读本段**。以下内容供希望从源码运行的开发者参考。

### 环境要求

- Node.js 20+
- Python 3.11+

### 安装依赖

```powershell
cd frontend
npm install

cd ..\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

cd ..\desktop
npm install
```

### 启动

#### 桌面开发版

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 3000

cd ..
$env:VITE_DEV_SERVER_URL='http://127.0.0.1:3000'
npm run desktop:dev
```

桌面应用会自动启动 FastAPI 后端。

- WebUI: <http://127.0.0.1:3000>
- Backend health: <http://127.0.0.1:8001/api/health>
- API docs: <http://127.0.0.1:8001/docs>

#### 浏览器开发版

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

### 测试

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

### 构建 Windows 安装包

```powershell
npm run build:desktop
```

首次构建会安装 PyInstaller，并可能由 electron-builder 下载 Windows 打包工具。输出到 `desktop/release-new/PicLoom-Setup-0.2.0.exe`。
