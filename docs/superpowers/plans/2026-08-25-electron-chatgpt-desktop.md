# PicLoom Electron ChatGPT Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Windows-first Electron desktop edition of PicLoom that embeds the real ChatGPT website in a persistent, user-controlled browser profile, automates ordinary Chat image generation through a versioned page adapter, and imports every image returned by one response into the current local Canvas project without using the OpenAI API or Codex.

**Architecture:** Electron owns the application lifecycle, a hardened renderer window, and a persistent `WebContentsView` for `chatgpt.com`. The React renderer talks only to a narrow preload IPC contract. A desktop generation orchestrator drives a versioned ChatGPT DOM adapter, downloads the images from the signed-in web session, and sends a multipart batch to the existing FastAPI service. FastAPI remains the source of truth for projects, tasks, image files, relationships, and Canvas positions. The existing browser-extension provider remains available as a fallback, but desktop ChatGPT becomes the primary provider when the preload bridge is present.

**Tech Stack:** Electron, TypeScript, React 19, Vite, Zustand, Vitest, Playwright Electron, Python 3.12, FastAPI, SQLAlchemy, SQLite, pytest, PyInstaller, electron-builder.

---

## File responsibilities

### New desktop runtime

- `desktop/package.json` — Electron development, test, packaging, and typecheck commands.
- `desktop/tsconfig.json` — strict TypeScript configuration for Electron main/preload code.
- `desktop/vitest.config.ts` — unit-test configuration.
- `desktop/src/contracts.ts` — the complete, serializable IPC contract shared by main and preload.
- `desktop/src/main.ts` — Electron lifecycle and composition root only.
- `desktop/src/backendSupervisor.ts` — start, probe, and stop FastAPI; resolve development and packaged executables.
- `desktop/src/security.ts` — navigation, popup, permission, and download policy.
- `desktop/src/chatgptView.ts` — persistent ChatGPT `WebContentsView`, bounds, visibility, and session lifecycle.
- `desktop/src/chatgpt/adapter.ts` — versioned DOM scripts and state parsing.
- `desktop/src/chatgpt/fixtures.ts` — deterministic HTML fixtures for adapter tests.
- `desktop/src/chatgpt/download.ts` — authenticated image-byte collection and MIME validation.
- `desktop/src/generationOrchestrator.ts` — one active generation, cancellation, recovery, state emission, and FastAPI batch ingestion.
- `desktop/src/preload.ts` — narrow `window.aiImageCanvasDesktop` API; no raw Electron exposure.
- `desktop/tests/*.test.ts` — unit tests for supervisor, security, adapter, downloader, and orchestrator.
- `desktop/e2e/chatgpt-generation.spec.ts` — fixture-backed Electron end-to-end flow.
- `desktop/electron-builder.yml` — Windows package definition and bundled resources.

### Backend additions and changes

- `backend/app/models/generation.py` — generation batch metadata and multiple imported result references.
- `backend/app/schemas/generation.py` — desktop task states and batch-ingestion request/response contracts.
- `backend/app/services/database_migrations.py` — idempotent additive SQLite migration for existing local databases.
- `backend/app/services/generation_tasks.py` — legal transition checks and multi-image completion.
- `backend/app/services/image_batches.py` — validate, hash, deduplicate, write, rollback, and position a response image batch.
- `backend/app/api/routes/generation_tasks.py` — desktop state update and batch completion endpoints.
- `backend/tests/test_database_migrations.py` — upgrade an old schema without data loss.
- `backend/tests/test_generation_batch.py` — multi-image ingestion, rollback, dedupe, and parent relationships.
- `backend/ai_image_canvas_backend.spec` — PyInstaller entry and resource paths.
- `scripts/build-backend.ps1` — reproducible backend executable build.

### Frontend additions and changes

- `frontend/src/features/desktop/types.ts` — browser-safe mirror of the preload contract.
- `frontend/src/features/desktop/desktopBridge.ts` — runtime bridge detection and typed subscriptions.
- `frontend/src/features/generation/providers/ChatGptDesktopProvider.ts` — desktop `ImageProvider` implementation.
- `frontend/src/features/generation/generationStore.ts` — provider selection, all imported IDs, recovery, and UI state.
- `frontend/src/features/generation/types.ts` — richer task states and batch results.
- `frontend/src/components/panels/RightPanel.tsx` — “图片详情 / ChatGPT” tabs and hybrid mode.
- `frontend/src/features/generation/ChatGptGenerationPanel.tsx` — normal compact generation UI and recovery actions.
- `frontend/src/features/canvas/CanvasBoard.tsx` — refresh and select every image imported by one response.
- `frontend/src/vite-env.d.ts` — optional desktop bridge global.
- `frontend/src/**/*.test.tsx` — desktop-provider, panel, and Canvas integration tests.

### Documentation and root commands

- `package.json` — workspace-level desktop development/build commands.
- `README.md` — browser mode versus desktop mode, login, limitations, and recovery steps.
- `docs/chatgpt-adapter-maintenance.md` — selector/version maintenance and fixture update procedure.

---

## Task 1: Scaffold the Electron runtime and shared contract

**Files:**

- Create: `desktop/package.json`
- Create: `desktop/tsconfig.json`
- Create: `desktop/vitest.config.ts`
- Create: `desktop/src/contracts.ts`
- Create: `desktop/src/preload.ts`
- Create: `desktop/tests/contracts.test.ts`
- Modify: `package.json`

- [ ] Write the failing contract serialization test in `desktop/tests/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DesktopGenerationEvent, DesktopGenerationRequest } from "../src/contracts";

describe("desktop IPC contracts", () => {
  it("round-trips generation request and event as JSON", () => {
    const request: DesktopGenerationRequest = {
      taskId: "task-1",
      projectId: "project-1",
      prompt: "一朵白色山茶花",
      parentImageId: null,
    };
    const event: DesktopGenerationEvent = {
      taskId: "task-1",
      state: "completed",
      message: "已导入 2 张图片",
      imageIds: ["image-1", "image-2"],
      recoverable: false,
    };
    expect(JSON.parse(JSON.stringify({ request, event }))).toEqual({ request, event });
  });
});
```

- [ ] Run `npm.cmd test -- --run` from `desktop`; verify it fails because the package and contract do not exist.

- [ ] Create `desktop/package.json` with pinned scripts and dependencies:

```json
{
  "name": "ai-image-canvas-desktop",
  "private": true,
  "version": "0.2.0",
  "main": "dist/main.js",
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest",
    "dev": "npm run build && electron dist/main.js",
    "package": "npm run build && electron-builder --config electron-builder.yml"
  },
  "dependencies": {
    "electron": "^37.2.6"
  },
  "devDependencies": {
    "@playwright/test": "^1.55.0",
    "@types/node": "^22.17.2",
    "electron-builder": "^26.0.12",
    "typescript": "~5.7.3",
    "vitest": "^3.2.4"
  }
}
```

- [ ] Define these exact IPC types in `desktop/src/contracts.ts`:

```ts
export type DesktopGenerationState =
  | "queued" | "opening_chatgpt" | "login_required" | "ready"
  | "sending" | "generating" | "collecting" | "importing"
  | "completed" | "refused" | "rate_limited" | "page_changed"
  | "failed" | "cancelled";

export interface DesktopGenerationRequest {
  taskId: string;
  projectId: string;
  prompt: string;
  parentImageId: string | null;
}

export interface DesktopGenerationEvent {
  taskId: string;
  state: DesktopGenerationState;
  message: string;
  imageIds: string[];
  recoverable: boolean;
}

export interface ChatGptViewBounds { x: number; y: number; width: number; height: number }

export interface DesktopBridgeApi {
  getRuntimeStatus(): Promise<{ backendOnline: boolean; chatgptVisible: boolean }>;
  setChatGptView(input: { visible: boolean; bounds?: ChatGptViewBounds }): Promise<void>;
  startGeneration(request: DesktopGenerationRequest): Promise<void>;
  cancelGeneration(taskId: string): Promise<void>;
  retryCollection(taskId: string): Promise<void>;
  onGenerationEvent(listener: (event: DesktopGenerationEvent) => void): () => void;
}
```

- [ ] Implement `desktop/src/preload.ts` with `contextBridge.exposeInMainWorld`; expose only the four commands and one filtered event subscription from `DesktopBridgeApi`. Validate event payloads before invoking renderer listeners and return an unsubscribe function.

- [ ] Add root scripts `desktop:dev`, `desktop:test`, `desktop:typecheck`, and `desktop:package` that use `npm.cmd --prefix desktop ...`.

- [ ] Install desktop dependencies with `npm.cmd install` from `desktop`.

- [ ] Run `npm.cmd test -- --run` and `npm.cmd run typecheck` from `desktop`; verify both pass.

- [ ] Commit: `git add package.json desktop && git commit -m "chore: scaffold electron desktop runtime"`

## Task 2: Supervise FastAPI in development and packaged builds

**Files:**

- Create: `desktop/src/backendSupervisor.ts`
- Create: `desktop/tests/backendSupervisor.test.ts`
- Create: `backend/app/desktop_entry.py`
- Create: `backend/tests/test_desktop_entry.py`

- [ ] Write failing unit tests using injected `spawn`, `fetch`, and path resolvers. Cover: development command, packaged executable path containing spaces, health timeout, clean shutdown, and a child that exits before health becomes ready.

- [ ] Run `npm.cmd test -- --run tests/backendSupervisor.test.ts`; verify missing module failure.

- [ ] Implement `BackendSupervisor` with this public surface:

```ts
export interface BackendProcess { kill(signal?: NodeJS.Signals): boolean; once(name: "exit", cb: (code: number | null) => void): void }
export interface BackendSupervisorOptions {
  packaged: boolean;
  resourcesPath: string;
  repoRoot: string;
  port: number;
  spawnProcess(command: string, args: string[], cwd: string): BackendProcess;
  probe(url: string): Promise<boolean>;
}
export class BackendSupervisor {
  constructor(options: BackendSupervisorOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  get baseUrl(): string;
}
```

Use `backend/.venv/Scripts/python.exe -m app.desktop_entry --port 8000` in development and `resources/backend/ai-image-canvas-backend.exe --port 8000` when packaged. Poll `/api/health` every 250 ms for at most 20 seconds; include the early exit code in the thrown error. Stop with `SIGTERM`, wait up to 5 seconds, then kill the specific child process.

- [ ] Add `backend/app/desktop_entry.py` with an argparse `--host` defaulting to `127.0.0.1`, a `--port` integer defaulting to `8000`, and `uvicorn.run("app.main:app", ...)`. Do not bind to public interfaces.

- [ ] Add a pytest that monkeypatches `uvicorn.run`, invokes `main(["--port", "8123"])`, and asserts host `127.0.0.1` and port `8123`.

- [ ] Run `npm.cmd test -- --run tests/backendSupervisor.test.ts` and `..\backend\.venv\Scripts\python.exe -m pytest backend/tests/test_desktop_entry.py -q`; verify pass.

- [ ] Commit: `git add desktop/src/backendSupervisor.ts desktop/tests/backendSupervisor.test.ts backend/app/desktop_entry.py backend/tests/test_desktop_entry.py && git commit -m "feat: supervise local backend from desktop"`

## Task 3: Create the hardened main window and persistent ChatGPT view

**Files:**

- Create: `desktop/src/security.ts`
- Create: `desktop/src/chatgptView.ts`
- Create: `desktop/src/main.ts`
- Create: `desktop/tests/security.test.ts`
- Create: `desktop/tests/chatgptView.test.ts`

- [ ] Write failing tests for URL policy. Allow only:

```text
https://chatgpt.com/*
https://auth.openai.com/*
https://*.openai.com/* only while it is part of login/navigation
http://127.0.0.1:3000/* renderer development
http://127.0.0.1:8000/* backend requests
file://* packaged renderer
```

Reject `javascript:`, `data:`, non-loopback HTTP, file navigation inside the ChatGPT view, permission requests, unexpected popups, and downloads not initiated by the orchestrator.

- [ ] Run the focused security test and verify failure.

- [ ] Implement pure functions in `security.ts`: `isAllowedRendererUrl`, `isAllowedChatGptUrl`, `isAllowedLoginUrl`, and `installSessionSecurity`. Set `setPermissionRequestHandler` to deny by default and `setPermissionCheckHandler` consistently. Open ordinary external links in the system browser only after verifying `https:`.

- [ ] Write a failing `ChatGptViewController` test with Electron-shaped fakes. Assert partition `persist:ai-image-canvas-chatgpt`, hidden initial state, clamped integer bounds, `chatgpt.com` initial load, and no view destruction when hidden.

- [ ] Implement `ChatGptViewController` around `WebContentsView` with:

```ts
export interface ChatGptViewControllerApi {
  show(bounds: ChatGptViewBounds): void;
  hide(): void;
  setBounds(bounds: ChatGptViewBounds): void;
  isVisible(): boolean;
  loadHome(): Promise<void>;
  destroy(): void;
}
```

Use `partition: "persist:ai-image-canvas-chatgpt"`, `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, and no preload script in the remote page.

- [ ] Compose `main.ts`: acquire single-instance lock, start backend, create `BrowserWindow`, load Vite URL in development or `frontend/dist/index.html` when packaged, attach the ChatGPT controller, install security, stop child/backend on quit, and focus the existing window on second launch.

- [ ] Run all desktop tests and typecheck; verify pass.

- [ ] Commit: `git add desktop/src desktop/tests && git commit -m "feat: embed hardened persistent chatgpt view"`

## Task 4: Wire narrow IPC and frontend desktop detection

**Files:**

- Modify: `desktop/src/main.ts`
- Modify: `desktop/src/preload.ts`
- Create: `desktop/src/ipc.ts`
- Create: `desktop/tests/ipc.test.ts`
- Create: `frontend/src/features/desktop/types.ts`
- Create: `frontend/src/features/desktop/desktopBridge.ts`
- Create: `frontend/src/features/desktop/desktopBridge.test.ts`
- Modify: `frontend/src/vite-env.d.ts`

- [ ] Add failing IPC tests for malformed view bounds, unknown task IDs, duplicate event subscriptions, and cleanup after renderer destruction.

- [ ] Implement schema-free explicit validation helpers in `desktop/src/ipc.ts`: strings must be non-empty and at most 10,000 characters; bounds must be finite non-negative integers; prompt must be at most 20,000 Unicode characters. Register named IPC channels, never a generic `invoke(channel, payload)` bridge.

- [ ] Add failing frontend tests proving that browser mode returns `null`, desktop mode returns the typed bridge, and an event unsubscribe calls the preload cleanup exactly once.

- [ ] Mirror the serializable interfaces in `frontend/src/features/desktop/types.ts`, declare optional `window.aiImageCanvasDesktop` in `vite-env.d.ts`, and implement `getDesktopBridge()` without importing Electron packages into the renderer.

- [ ] Connect `setChatGptView` IPC to the view controller and `getRuntimeStatus` to supervisor/view state. Leave generation methods routed to a temporary explicit `DESKTOP_GENERATION_NOT_READY` error until Task 11.

- [ ] Run desktop and frontend focused tests and typechecks; verify pass.

- [ ] Commit: `git add desktop/src desktop/tests frontend/src && git commit -m "feat: expose secure desktop bridge"`

## Task 5: Build the hybrid right-panel ChatGPT workspace

**Files:**

- Create: `frontend/src/components/panels/RightPanel.tsx`
- Create: `frontend/src/components/panels/RightPanel.test.tsx`
- Create: `frontend/src/features/generation/ChatGptGenerationPanel.tsx`
- Create: `frontend/src/features/generation/ChatGptGenerationPanel.test.tsx`
- Modify: the current application shell component that directly renders the image detail panel
- Modify: the current CSS/Tailwind module used by the right panel

- [ ] Before editing, locate the current right-panel owner with `rg "图片详情|ImageDetail" frontend/src` and record its exact path in the task notes. Replace only that render site; do not duplicate the panel.

- [ ] Write failing component tests asserting:

  - browser mode shows only the existing image-detail behavior and the extension-provider generation panel;
  - desktop mode shows tabs `图片详情` and `ChatGPT`;
  - the ChatGPT tab defaults to the compact custom generation panel;
  - `登录 / 查看 ChatGPT` reveals the real view and reports its DOM bounds through the bridge;
  - switching tabs, closing the panel, and unmounting hides the real view;
  - `ResizeObserver`, window resize, and scroll update the view bounds.

- [ ] Implement `RightPanel` with a single right-column layout owner. Reserve a plain opaque rectangle for the native `WebContentsView`; do not place React controls over it because Electron native views render above web content.

- [ ] Implement `ChatGptGenerationPanel` with prompt input, start/cancel buttons, status copy, `登录 / 查看 ChatGPT`, `隐藏 ChatGPT`, `重新加载页面`, and `重试收集图片`. Keep the embedded page visible automatically only for login, page-change recovery, or explicit user request.

- [ ] Use `ResizeObserver` and `getBoundingClientRect()` to send bounds in device-independent CSS pixels. Clamp at zero and hide the view while the placeholder has no area.

- [ ] Run `npm.cmd test -- --run RightPanel ChatGptGenerationPanel` and the full frontend suite; verify pass.

- [ ] Commit: `git add frontend/src && git commit -m "feat: add hybrid chatgpt right panel"`

## Task 6: Add idempotent SQLite migration and batch metadata

**Files:**

- Modify: `backend/app/models/generation.py`
- Modify: `backend/app/schemas/generation.py`
- Create: `backend/app/services/database_migrations.py`
- Create: `backend/tests/test_database_migrations.py`
- Modify: backend startup/database initialization module

- [ ] Write a failing migration test that creates the pre-desktop `generation_tasks` table, inserts one row, runs the migration twice, and proves the row remains while these columns exist:

```text
provider_mode TEXT NOT NULL DEFAULT 'extension'
batch_id TEXT NULL
image_ids_json TEXT NOT NULL DEFAULT '[]'
attempt INTEGER NOT NULL DEFAULT 1
last_page_url TEXT NULL
```

- [ ] Write failing schema tests for the new states: `opening_chatgpt`, `login_required`, `ready`, `collecting`, `importing`, `refused`, `rate_limited`, and `page_changed`.

- [ ] Implement `run_additive_migrations(engine)` using SQLAlchemy inspection plus individually quoted `ALTER TABLE ... ADD COLUMN` statements. Run in one transaction, inspect before each addition, and never rebuild or delete an existing table.

- [ ] Extend `GenerationTask` with the five fields above. Keep the existing `image_id` for backward compatibility; on desktop completion set it to the first imported ID and set `image_ids_json` to the complete ordered list.

- [ ] Add Pydantic contracts:

```py
class DesktopTaskStateUpdate(BaseModel):
    state: DesktopGenerationState
    message: str = Field(min_length=1, max_length=500)
    last_page_url: str | None = Field(default=None, max_length=2048)

class GenerationBatchResult(BaseModel):
    task_id: str
    batch_id: str
    image_ids: list[str]
    deduplicated_count: int
```

- [ ] Call migration immediately after existing metadata creation and before serving requests.

- [ ] Run the focused migration/schema tests, then all backend tests; verify pass.

- [ ] Commit: `git add backend/app backend/tests && git commit -m "feat: migrate generation tasks for desktop batches"`

## Task 7: Implement atomic multi-image ingestion

**Files:**

- Create: `backend/app/services/image_batches.py`
- Create: `backend/tests/test_generation_batch.py`
- Modify: `backend/app/services/generation_tasks.py`
- Modify: `backend/app/api/routes/generation_tasks.py`

- [ ] Write failing API/service tests covering:

  - two valid returned images produce two `Images` rows in response order;
  - PNG, JPEG, and WEBP are accepted by decoded signature, not filename alone;
  - duplicate bytes inside one response and bytes already stored in the project are reused by SHA-256;
  - all images inherit `parent_image_id` and prompt;
  - positions form a centered row beneath the parent, or a centered grid at the current viewport anchor when there is no parent;
  - one invalid file rolls back database rows and removes every newly written file;
  - completing the same task/batch twice is idempotent;
  - a task from another project cannot be completed.

- [ ] Run `python -m pytest backend/tests/test_generation_batch.py -q`; verify failure.

- [ ] Implement `ImageBatchService.complete_task(...)` with a staging directory under the target project, Pillow `verify()` plus format allowlist, 20 MB per-image and 80 MB per-batch limits, SHA-256, stable ordered IDs, and `os.replace` only after all files validate. Track new paths and remove them on any transaction failure.

- [ ] Add endpoint:

```text
POST /api/generation-tasks/{task_id}/complete-batch
multipart fields:
  batch_id: string
  source_url: string
  files: repeated UploadFile
response: GenerationBatchResult
```

Require loopback callers through the existing local app configuration, verify task is not cancelled, and reject zero files.

- [ ] Add endpoint `PATCH /api/generation-tasks/{task_id}/desktop-state` using `DesktopTaskStateUpdate`. Define an explicit transition table; reject illegal backward transitions except recovery from `login_required`, `page_changed`, `failed`, or `rate_limited` into `ready`/`collecting`.

- [ ] Keep existing single-image completion routes intact for extension mode.

- [ ] Run the focused tests and full backend suite; verify pass.

- [ ] Commit: `git add backend/app backend/tests && git commit -m "feat: import chatgpt response image batches"`

## Task 8: Build and lock the versioned ChatGPT page adapter

**Files:**

- Create: `desktop/src/chatgpt/adapter.ts`
- Create: `desktop/src/chatgpt/fixtures.ts`
- Create: `desktop/tests/chatgptAdapter.test.ts`
- Create: `desktop/tests/fixtures/chatgpt/*.html`
- Create: `docs/chatgpt-adapter-maintenance.md`

- [ ] Save sanitized fixture HTML for `logged-out`, `ready-empty-chat`, `generating`, `completed-two-images`, `refusal`, `rate-limit`, and `unknown-layout`. Fixtures contain no cookies, account names, conversation text, or real image URLs.

- [ ] Write failing tests for this adapter result:

```ts
export type PageState =
  | { kind: "login_required"; reason: string }
  | { kind: "ready" }
  | { kind: "generating" }
  | { kind: "completed"; images: Array<{ src: string; alt: string }> }
  | { kind: "refused"; reason: string }
  | { kind: "rate_limited"; reason: string }
  | { kind: "page_changed"; diagnostics: string };
```

Tests must prove images are collected only from the assistant response created after submission, not from avatars, prior turns, prompt uploads, or page chrome.

- [ ] Implement `CHATGPT_ADAPTER_VERSION = "2026-08-25.1"`, selector arrays ordered from semantic attributes to structural fallback, and pure fixture parsing helpers. Runtime scripts must return JSON-serializable data and never expose cookies, local storage, or page tokens.

- [ ] Detection rules: login controls imply `login_required`; visible stop/generating control implies `generating`; response-scoped image containers imply `completed`; explicit policy text implies `refused`; explicit usage-limit text implies `rate_limited`; missing composer after DOM settled implies `page_changed`.

- [ ] Document how to capture a sanitized fixture, update selectors, increment adapter version, run tests, and manually confirm with a disposable conversation. State explicitly that ChatGPT DOM automation is unofficial and can break after site updates.

- [ ] Run the focused adapter suite and typecheck; verify pass.

- [ ] Commit: `git add desktop/src/chatgpt desktop/tests docs/chatgpt-adapter-maintenance.md && git commit -m "feat: add versioned chatgpt page adapter"`

## Task 9: Submit prompts and identify the new response boundary

**Files:**

- Modify: `desktop/src/chatgpt/adapter.ts`
- Create: `desktop/src/chatgpt/promptSubmission.ts`
- Create: `desktop/tests/promptSubmission.test.ts`

- [ ] Write failing tests with a fake `webContents.executeJavaScript` for: composer missing, login required, prompt inserted through the native value setter, input event dispatched, send button click, Enter fallback, and response baseline captured before submission.

- [ ] Implement:

```ts
export interface SubmissionReceipt {
  conversationUrlBefore: string;
  assistantResponseIdsBefore: string[];
  submittedAt: number;
}
export async function submitPrompt(
  webContents: Pick<Electron.WebContents, "executeJavaScript" | "getURL">,
  prompt: string,
): Promise<SubmissionReceipt>;
```

Reject blank prompts and prompts above 20,000 characters. Focus the composer, set its value via the element prototype setter, dispatch `input` and `change`, then click an enabled semantic send button. Use Enter only when the adapter confirms the composer is not multiline-with-Shift semantics.

- [ ] Capture existing assistant response identifiers before input. If stable response IDs are absent, capture count plus a hash of each existing response's normalized text/image sources. All later collection must be strictly after this boundary.

- [ ] Do not automatically create repeated submissions after timeout. A retry may only resume observation/collection unless the user explicitly starts a new task.

- [ ] Run the focused tests and desktop suite; verify pass.

- [ ] Commit: `git add desktop/src/chatgpt desktop/tests && git commit -m "feat: automate chatgpt prompt submission"`

## Task 10: Download all returned images from the authenticated session

**Files:**

- Create: `desktop/src/chatgpt/download.ts`
- Create: `desktop/tests/chatgptDownload.test.ts`

- [ ] Write failing tests for `blob:`, `data:`, and HTTPS image sources; MIME sniffing; 20 MB limit; timeout; 401/403; duplicate content hash; stable page order; and cancellation through `AbortSignal`.

- [ ] Implement page-context byte extraction for `blob:` and protected HTTPS sources using `fetch(src, { credentials: "include" })`, `arrayBuffer()`, and base64 transport back through `executeJavaScript`. For ordinary HTTPS where Electron `session.fetch` succeeds, prefer streaming bytes in main process. Never copy cookies into application logs or FastAPI requests.

- [ ] Return:

```ts
export interface CollectedImage {
  order: number;
  sourceUrl: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sha256: string;
  bytes: Uint8Array;
}
```

Sniff magic bytes, reject SVG/HTML/error pages, limit each image to 20 MB and the response to 80 MB, deduplicate by SHA-256 while preserving the first occurrence, and clear byte buffers after the multipart request completes.

- [ ] Ensure logs contain only task ID, adapter version, response count, MIME, byte length, and truncated hash—not prompt text, account data, cookies, image URLs with query strings, or image bytes.

- [ ] Run the focused downloader tests and typecheck; verify pass.

- [ ] Commit: `git add desktop/src/chatgpt/download.ts desktop/tests/chatgptDownload.test.ts && git commit -m "feat: collect authenticated chatgpt images"`

## Task 11: Implement the desktop generation orchestrator

**Files:**

- Create: `desktop/src/generationOrchestrator.ts`
- Create: `desktop/tests/generationOrchestrator.test.ts`
- Modify: `desktop/src/ipc.ts`
- Modify: `desktop/src/main.ts`

- [ ] Write failing state-machine tests covering the full success path:

```text
queued → opening_chatgpt → ready → sending → generating
→ collecting → importing → completed(imageIds[])
```

Also cover login pause/resume, refusal, rate limit, adapter page change, cancel before send, cancel while waiting, backend import failure, renderer reload resubscription, retry collection without prompt resubmission, 8-minute generation timeout, and rejection of a second simultaneous task.

- [ ] Implement one `GenerationOrchestrator` instance in the Electron main process. Dependencies must be injected for tests: view, adapter, submitter, collector, backend client, clock, and event sink.

- [ ] At every transition call `PATCH /desktop-state`, then emit `generation:event`. If backend update temporarily fails, emit a recoverable local failure and retain the in-memory task for retry; never report completion until batch import succeeds.

- [ ] Observation loop: poll initially every 750 ms, back off to 2 seconds after 30 seconds, stop at 8 minutes, and abort immediately on cancellation or app shutdown. Keep the real ChatGPT view visible for `login_required` and `page_changed`; otherwise respect the user's explicit visibility choice.

- [ ] Generate one UUID `batch_id` before collection. Post all ordered files in one `complete-batch` multipart request. Emit every returned `image_id`; preserve the first ID as the compatibility primary selection.

- [ ] Store only recoverable task metadata—not account/session secrets—in an Electron user-data JSON file: task ID, project ID, receipt boundary, batch ID, state, and adapter version. On restart offer observation/collection recovery only; never auto-submit a saved prompt.

- [ ] Replace Task 4's temporary IPC error with `startGeneration`, `cancelGeneration`, and `retryCollection` calls. Send the last known event immediately to a newly subscribed renderer.

- [ ] Run the focused orchestrator tests, all desktop tests, and typecheck; verify pass.

- [ ] Commit: `git add desktop/src desktop/tests && git commit -m "feat: orchestrate chatgpt desktop generation"`

## Task 12: Make desktop ChatGPT the primary frontend provider

**Files:**

- Modify: `frontend/src/features/generation/types.ts`
- Modify: `frontend/src/features/generation/generationStore.ts`
- Create: `frontend/src/features/generation/providers/ChatGptDesktopProvider.ts`
- Create: `frontend/src/features/generation/providers/ChatGptDesktopProvider.test.ts`
- Modify: `frontend/src/features/generation/ChatGptGenerationPanel.tsx`
- Modify: `frontend/src/features/canvas/CanvasBoard.tsx`
- Add or modify: relevant store and Canvas tests

- [ ] Write failing provider tests proving: desktop bridge is selected when present; browser extension remains fallback when absent; events map to current UI states; completion returns ordered `imageIds`; listener cleanup occurs; and cancel/retry delegate to the bridge.

- [ ] Implement `ChatGptDesktopProvider` against the existing `ImageProvider` abstraction. Do not import Electron. Give it provider ID `chatgpt-desktop` and capability flags `{ embeddedLogin: true, multipleImages: true, resumableCollection: true }`.

- [ ] Extend generation store state with `imageIds: string[]`, `recoverable: boolean`, `providerMode`, and the richer desktop state union. Retain existing fields and extension provider behavior for browser mode.

- [ ] Update the panel copy by state:

  - `login_required`: “请在右侧 ChatGPT 页面登录；登录完成后会自动继续。”
  - `generating`: “ChatGPT 正在生成图片，可以隐藏页面继续等待。”
  - `collecting`: “正在收集本次回复中的全部图片。”
  - `page_changed`: “ChatGPT 页面结构已变化，请打开页面检查后重试收集。”
  - `rate_limited`: “ChatGPT 当前额度或频率受限，请稍后在原对话中重试。”

- [ ] Add a failing Canvas/store integration test: after a two-image completion, refetch the current project's images once, add both nodes if absent, fit the imported nodes into view, and select the first imported node while visually highlighting the whole imported batch.

- [ ] Implement the batch refresh without optimistic fake image URLs. FastAPI is the only source of persisted node data and positions.

- [ ] Run focused tests, the complete frontend suite, and frontend build; verify pass.

- [ ] Commit: `git add frontend/src && git commit -m "feat: use embedded chatgpt desktop provider"`

## Task 13: Add fixture-backed Electron end-to-end coverage

**Files:**

- Create: `desktop/e2e/fixtureServer.ts`
- Create: `desktop/e2e/chatgpt-generation.spec.ts`
- Create: `desktop/playwright.config.ts`
- Modify: `desktop/package.json`
- Modify: `desktop/src/main.ts`

- [ ] Add `AI_CANVAS_CHATGPT_ORIGIN` support in development/test only. Production and packaged builds must ignore it and always use `https://chatgpt.com`.

- [ ] Build a local fixture server that simulates login, composer, generation progress, and a two-image assistant response with deterministic PNG/WEBP bytes. It must not imitate or capture real credentials.

- [ ] Write an Electron Playwright test that launches the app with isolated temporary user data, opens the ChatGPT tab, submits `一朵花`, advances the fixture to completion, and asserts:

  - the two images appear on Canvas;
  - the two local image files exist through the backend API;
  - both nodes share the task prompt and batch relationship;
  - reload retains the nodes;
  - no extension bridge is required.

- [ ] Add an error-path E2E test where the fixture changes its composer markup and assert the page becomes visible with the `page_changed` recovery message instead of submitting to an unknown element.

- [ ] Add `test:e2e` script. Run it with a fresh fixture database and verify both tests pass.

- [ ] Run the complete backend, frontend, extension, desktop unit, and desktop E2E suites.

- [ ] Commit: `git add desktop && git commit -m "test: cover embedded chatgpt generation end to end"`

## Task 14: Package the Windows desktop application

**Files:**

- Create: `backend/ai_image_canvas_backend.spec`
- Create: `scripts/build-backend.ps1`
- Create: `desktop/electron-builder.yml`
- Modify: `desktop/package.json`
- Modify: root `package.json`
- Modify: `README.md`
- Add: application icon assets only if an existing project icon can be reused legally

- [ ] Write a backend smoke script/test that starts the PyInstaller executable on an available loopback port, waits for `/api/health`, requests `/api/projects`, and shuts it down cleanly.

- [ ] Configure PyInstaller to bundle `backend/app`, SQLAlchemy/FastAPI runtime modules, and no mutable database. On first launch FastAPI must create data under Electron's `app.getPath("userData")/data`; never write into `Program Files` or `resources`.

- [ ] Implement `scripts/build-backend.ps1` with `$ErrorActionPreference = "Stop"`, the repository root derived from `$PSScriptRoot`, explicit resolved paths, venv PyInstaller invocation, and a final executable existence check.

- [ ] Configure `electron-builder.yml` for NSIS x64 with:

```yaml
appId: com.aiimagecanvas.desktop
productName: PicLoom
files:
  - dist/**
  - package.json
extraResources:
  - from: ../frontend/dist
    to: frontend/dist
  - from: ../backend/dist/ai-image-canvas-backend.exe
    to: backend/ai-image-canvas-backend.exe
win:
  target: nsis
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

- [ ] Add root `build:desktop` that builds frontend, backend executable, desktop TypeScript, then installer in that order. Do not rebuild or distribute the legacy extension as a desktop requirement.

- [ ] Update README with:

  - desktop startup and browser-only startup;
  - “普通 ChatGPT 网页账号，不使用 OpenAI API，也不使用 Codex”;
  - the first-run login flow and persistent local profile;
  - how to show/hide the real ChatGPT page;
  - unofficial DOM automation warning;
  - supported PNG/JPEG/WEBP and 20 MB/80 MB limits;
  - recovery for login expiry, page change, refusal, and rate limit;
  - local data paths and uninstall/data-retention behavior.

- [ ] Run the backend executable smoke test and `npm.cmd run build:desktop`; verify an NSIS installer is produced.

- [ ] Install into a temporary Windows test directory, launch, log into ChatGPT manually, generate a harmless two-image prompt, verify both images import, quit/relaunch, and verify the ChatGPT session and Canvas project persist. Record the date, ChatGPT adapter version, Electron version, and pass/fail in `docs/manual-verification.md`; do not record account identifiers or screenshots containing private chat history.

- [ ] Commit: `git add backend/ai_image_canvas_backend.spec scripts desktop package.json README.md docs/manual-verification.md && git commit -m "build: package PicLoom desktop for Windows"`

## Task 15: Final regression, security audit, and handoff

**Files:**

- Modify only files required by failures found during this task

- [ ] Run backend verification:

```powershell
backend\.venv\Scripts\python.exe -m pytest -q
```

- [ ] Run frontend verification:

```powershell
npm.cmd --prefix frontend test -- --run
npm.cmd --prefix frontend run build
```

- [ ] Run extension fallback verification:

```powershell
npm.cmd --prefix extension test -- --run
npm.cmd --prefix extension run build
```

- [ ] Run desktop verification:

```powershell
npm.cmd --prefix desktop test -- --run
npm.cmd --prefix desktop run typecheck
npm.cmd --prefix desktop run test:e2e
npm.cmd run build:desktop
```

- [ ] Inspect the packaged app with DevTools closed. Confirm renderer and ChatGPT view have `nodeIntegration=false`, `contextIsolation=true`, `sandbox=true`; CSP blocks unexpected renderer origins; permissions are denied; unexpected popups do not create privileged windows; IPC rejects malformed input; logs contain no prompts, cookies, account details, signed URLs, or image bytes.

- [ ] Confirm browser-only `http://127.0.0.1:3000` still works with the extension fallback and does not reference `window.aiImageCanvasDesktop` without a guard.

- [ ] Confirm migration against a copy of an existing user database; compare project/image/prompt counts before and after. Never test migration on the sole user copy.

- [ ] Review the complete diff against `docs/superpowers/specs/2026-08-25-electron-chatgpt-desktop-design.md`. Fix every missing requirement and rerun the affected suites.

- [ ] Commit any regression fixes as focused commits; do not squash away the task-level history until review is complete.

---

## Completion criteria

- The user logs into the real ChatGPT website inside the PicLoom desktop application; credentials remain owned by the embedded browser session.
- Starting a prompt uses ordinary ChatGPT Chat, not OpenAI API, Work, or Codex.
- Every image in the newly created assistant response is downloaded through the signed-in session and atomically imported into the selected local project.
- Parent relationship, prompt, project, batch, file paths, and Canvas positions survive restart.
- Login expiry, refusal, rate limit, cancellation, timeout, and ChatGPT DOM changes produce distinct, actionable states without silently resubmitting prompts.
- Browser-only mode and the existing extension fallback continue to pass their tests.
- The Windows installer contains the frontend and FastAPI executable and stores mutable data only in the user's application-data directory.
- No password, cookie, access token, signed image URL, prompt, or image bytes are written to logs or SQLite outside the intended local image/prompt records.
