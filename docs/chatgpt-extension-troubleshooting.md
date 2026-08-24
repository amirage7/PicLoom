# ChatGPT 扩展桥接安装与排障

## 安装

1. 在 `extension` 目录运行 `npm install` 和 `npm run build`。
2. Chrome 打开 `chrome://extensions`，启用“开发者模式”。
3. 选择“加载已解压的扩展程序”，指向 `extension/dist`。
4. 同时启动 FastAPI `127.0.0.1:8000` 和 WebUI `127.0.0.1:3000`。
5. 在 Canvas 工具栏打开“使用 ChatGPT 生成图片”，生成六位配对码。
6. 打开扩展 popup，输入配对码。
7. 在 `https://chatgpt.com/` 官方页面手动登录。

## 安全边界

- AI Image Canvas 不请求或保存 ChatGPT 账号、密码、两步验证码和 Cookie。
- 扩展只访问 `chatgpt.com` 和本机 `127.0.0.1:8000`。
- 遇到登录、验证码、安全检查、内容拒绝或限额时立即停止，不会绕过。
- 失败任务不自动重发；只有用户再次点击才会创建新任务。

## 常见问题

- `EXTENSION_OFFLINE`：确认后端在 8000 端口运行，重新加载扩展并再次配对。
- `LOGIN_REQUIRED`：切换到官方 ChatGPT 标签页完成登录，不要在本地 WebUI 输入账号密码。
- `PAGE_UNSUPPORTED`：ChatGPT 页面可能已改版，检查扩展更新并升级 `ChatPageAdapter` 选择器。
- `GENERATION_TIMEOUT`：在 ChatGPT 页面查看生成状态，确认账号限额和网络情况，然后手动重试。
- 扩展更新后未生效：重新运行 `npm run build`，再在 `chrome://extensions` 点击“重新加载”。
