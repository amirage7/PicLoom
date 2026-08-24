# ChatGPT Web Image Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let AI Image Canvas submit one image prompt at a time through a user-authenticated, visible ChatGPT Chat tab and persist the returned image as a local Canvas node without storing ChatGPT credentials or cookies.

**Architecture:** React calls a replaceable `ImageProvider` that creates and polls FastAPI generation tasks. A paired Manifest V3 Chrome extension claims one queued task, drives semantic controls on `chatgpt.com`, uploads the final image bytes, and reports typed progress/errors; FastAPI owns authentication, state transitions, SQLite records, and atomic image persistence.

**Tech Stack:** React 19, TypeScript, Zustand, Vite, Vitest, React Testing Library, FastAPI, SQLAlchemy, SQLite, Pytest, Chrome Manifest V3, esbuild.

---

## File map

### Backend

- Modify `backend/app/models/entities.py`: generation, pairing, and extension connection tables.
- Create `backend/app/schemas/generation.py`: API request/response contracts and status literals.
- Create `backend/app/services/generation_tasks.py`: queue, transition validation, cancellation, and completion.
- Create `backend/app/services/extension_bridge.py`: pairing codes, token hashing, heartbeat, and extension authentication.
- Create `backend/app/api/routes/providers.py`: WebUI provider status and pairing endpoints.
- Create `backend/app/api/routes/generation_tasks.py`: WebUI task create/read/cancel endpoints.
- Create `backend/app/api/routes/extension.py`: authenticated extension claim, progress, heartbeat, and upload endpoints.
- Modify `backend/app/api/router.py`: register the three new routers.
- Modify `backend/app/services/image_resources.py`: expose a transaction-friendly generated-image record helper.
- Create `backend/tests/test_generation_tasks.py`: task state machine and WebUI API coverage.
- Create `backend/tests/test_extension_bridge.py`: pairing, auth, queue claim, heartbeat, and image completion coverage.

### Chrome extension

- Create `extension/package.json`, `extension/tsconfig.json`, and `extension/scripts/build.mjs`: isolated test/build toolchain.
- Create `extension/src/manifest.json`: least-privilege Manifest V3 declaration.
- Create `extension/src/shared/protocol.ts`: bridge DTOs and typed error codes.
- Create `extension/src/chatPageAdapter.ts`: semantic DOM adapter with no bridge/network knowledge.
- Create `extension/src/chatPageAdapter.test.ts` and `extension/test/fixtures/*.html`: DOM contract tests.
- Create `extension/src/content.ts`: execute one task in the visible ChatGPT tab.
- Create `extension/src/background.ts`: pairing, polling, tab focus, task routing, and image upload.
- Create `extension/src/popup.html`, `extension/src/popup.ts`, and `extension/src/popup.css`: connection diagnostics and pairing UI.

### Frontend

- Create `frontend/src/features/generation/types.ts`: provider/task domain types.
- Create `frontend/src/features/generation/chatGptProvider.ts`: FastAPI-backed `ImageProvider` implementation.
- Create `frontend/src/features/generation/generationStore.ts`: Zustand provider availability and active task state.
- Create `frontend/src/features/generation/GenerationPanel.tsx`: prompt, connection guide, progress, cancel, retry, and chat link.
- Create matching `*.test.ts` / `*.test.tsx` files for provider, store, and panel.
- Modify `frontend/src/lib/resourcesApi.ts`: generation/provider DTO requests.
- Modify `frontend/src/features/canvas/store/canvasStore.ts`: insert and select a completed persisted image.
- Modify `frontend/src/features/canvas/CanvasBoard.tsx`: generation trigger and panel placement.
- Modify `frontend/src/index.css`: restrained generation panel and status styling.
- Modify `README.md`: extension build/load/pair/run instructions and limitations.

### Task 1: Persist generation tasks and enforce the state machine

**Files:**
- Modify: `backend/app/models/entities.py`
- Create: `backend/app/schemas/generation.py`
- Create: `backend/app/services/generation_tasks.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_generation_tasks.py`

- [ ] **Step 1: Write failing model and transition tests**

```python
# Add to backend/tests/conftest.py
@pytest.fixture
def session(data_root):
    settings = Settings(data_dir=data_root)
    engine = build_engine(settings.database_url)
    init_database(engine)
    factory = build_session_factory(engine)
    with factory() as database_session:
        yield database_session
    engine.dispose()

@pytest.fixture
def project(session):
    value = Project(id="project-1", name="Test project", created_time=datetime.now(timezone.utc))
    session.add(value)
    session.commit()
    return value

# Add to backend/tests/test_generation_tasks.py
def test_generation_task_starts_queued(session, project):
    task = generation_tasks.create_task(session, project.id, "draw a quiet observatory", None)
    assert task.status == "queued"
    assert task.provider == "chatgpt-web"

def test_generation_task_rejects_invalid_transition(session, project):
    task = generation_tasks.create_task(session, project.id, "draw a quiet observatory", None)
    with pytest.raises(generation_tasks.InvalidTaskTransition):
        generation_tasks.transition(session, task.id, "completed", "done")
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_generation_tasks.py -q`

Expected: FAIL because `app.services.generation_tasks` does not exist.

- [ ] **Step 3: Add the database entity, schemas, and transition service**

```python
GENERATION_STATUSES = {"queued", "connecting", "sending", "generating", "downloading", "completed", "failed", "cancelled"}
ALLOWED_TRANSITIONS = {
    "queued": {"connecting", "cancelled"},
    "connecting": {"sending", "failed", "cancelled"},
    "sending": {"generating", "failed", "cancelled"},
    "generating": {"downloading", "failed", "cancelled"},
    "downloading": {"completed", "failed", "cancelled"},
    "completed": set(), "failed": set(), "cancelled": set(),
}

class GenerationTask(Base):
    __tablename__ = "generation_tasks"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False, default="chatgpt-web")
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    parent_image_id: Mapped[str | None] = mapped_column(ForeignKey("images.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    progress_message: Mapped[str] = mapped_column(String(255), nullable=False)
    chat_url: Mapped[str | None] = mapped_column(String(1024))
    image_id: Mapped[str | None] = mapped_column(ForeignKey("images.id", ondelete="SET NULL"))
    error_code: Mapped[str | None] = mapped_column(String(64))
    created_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
```

Implement `create_task`, `get_task`, `claim_next_task`, `transition`, and `cancel_task`. `claim_next_task` must return an existing non-terminal task before claiming another queued row, ensuring only one active task.

- [ ] **Step 4: Run focused tests**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_generation_tasks.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/entities.py backend/app/schemas/generation.py backend/app/services/generation_tasks.py backend/tests/conftest.py backend/tests/test_generation_tasks.py
git commit -m "feat: add generation task state machine"
```

### Task 2: Add secure extension pairing and provider status

**Files:**
- Modify: `backend/app/models/entities.py`
- Create: `backend/app/services/extension_bridge.py`
- Create: `backend/app/api/routes/providers.py`
- Create: `backend/app/api/routes/extension.py`
- Modify: `backend/app/api/router.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_extension_bridge.py`

- [ ] **Step 1: Write failing pairing tests**

```python
# Add to backend/tests/conftest.py
@pytest.fixture
def project_id(client):
    return client.post("/api/projects", json={"name": "Generation project"}).json()["id"]

@pytest.fixture
def paired_headers(client):
    code = client.post("/api/providers/chatgpt/pairing").json()["code"]
    token = client.post("/api/extension/pair", json={"code": code, "extension_version": "0.1.0"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}

# Add to backend/tests/test_extension_bridge.py
def test_pairing_code_is_single_use(client):
    code = client.post("/api/providers/chatgpt/pairing").json()["code"]
    paired = client.post("/api/extension/pair", json={"code": code, "extension_version": "0.1.0"})
    assert paired.status_code == 200
    assert paired.json()["token"]
    assert client.post("/api/extension/pair", json={"code": code, "extension_version": "0.1.0"}).status_code == 401

def test_provider_reports_recent_heartbeat(client, paired_headers):
    client.post("/api/extension/heartbeat", headers=paired_headers, json={"state": "ready", "chat_url": "https://chatgpt.com/"})
    body = client.get("/api/providers/chatgpt/status").json()
    assert body == {"paired": True, "online": True, "state": "ready", "chat_url": "https://chatgpt.com/"}
```

- [ ] **Step 2: Verify failure**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_extension_bridge.py -q`

Expected: FAIL with 404 responses.

- [ ] **Step 3: Implement hashed pairing records and authentication**

```python
def digest(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()

def issue_pairing_code(session: Session) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    session.add(PairingCode(code_hash=digest(code), expires_at=utcnow() + timedelta(minutes=5)))
    session.commit()
    return code

def exchange_pairing_code(session: Session, code: str, extension_version: str) -> str:
    pairing = session.scalar(select(PairingCode).where(PairingCode.code_hash == digest(code)))
    if pairing is None or pairing.used_at is not None or pairing.expires_at < utcnow():
        raise ExtensionAuthenticationError("配对码无效或已过期")
    token = secrets.token_urlsafe(32)
    pairing.used_at = utcnow()
    session.add(ExtensionConnection(id="chatgpt-web", token_hash=digest(token), extension_version=extension_version, state="paired"))
    session.commit()
    return token
```

Implement `POST /extension/pair`, `POST /extension/heartbeat`, and `require_extension` using `Authorization: Bearer <token>`. Use a 30-second online window and register both `providers_router` and `extension_router` in this task.

- [ ] **Step 4: Run tests**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_extension_bridge.py -q`

Expected: pairing and status tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/entities.py backend/app/services/extension_bridge.py backend/app/api/routes/providers.py backend/app/api/routes/extension.py backend/app/api/router.py backend/tests/conftest.py backend/tests/test_extension_bridge.py
git commit -m "feat: secure local extension pairing"
```

### Task 3: Expose WebUI and extension task APIs

**Files:**
- Create: `backend/app/api/routes/generation_tasks.py`
- Modify: `backend/app/api/routes/extension.py`
- Modify: `backend/app/api/router.py`
- Modify: `backend/tests/test_generation_tasks.py`
- Modify: `backend/tests/test_extension_bridge.py`

- [ ] **Step 1: Add failing API tests**

```python
def test_webui_creates_reads_and_cancels_task(client, project_id):
    created = client.post("/api/generation-tasks", json={"project_id": project_id, "prompt": "glass pavilion"})
    assert created.status_code == 201
    task_id = created.json()["id"]
    assert client.get(f"/api/generation-tasks/{task_id}").json()["status"] == "queued"
    assert client.post(f"/api/generation-tasks/{task_id}/cancel").json()["status"] == "cancelled"

def test_extension_claims_only_one_task(client, paired_headers, project_id):
    first = client.post("/api/generation-tasks", json={"project_id": project_id, "prompt": "first"}).json()
    client.post("/api/generation-tasks", json={"project_id": project_id, "prompt": "second"})
    claimed = client.get("/api/extension/tasks/next", headers=paired_headers).json()
    assert claimed["id"] == first["id"]
    assert claimed["status"] == "connecting"
```

- [ ] **Step 2: Verify 404 failures**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_generation_tasks.py tests/test_extension_bridge.py -q`

Expected: FAIL on missing routes.

- [ ] **Step 3: Implement route contracts**

```python
@router.post("/generation-tasks", response_model=GenerationTaskResponse, status_code=201)
def create_generation_task(payload: GenerationTaskCreate, session: Session = Depends(get_session)):
    return generation_tasks.create_task(session, payload.project_id, payload.prompt, payload.parent_image_id)

@extension_router.get("/extension/tasks/next", response_model=GenerationTaskResponse | None)
def next_extension_task(_: ExtensionConnection = Depends(require_extension), session: Session = Depends(get_session)):
    return generation_tasks.claim_next_task(session)

@extension_router.patch("/extension/tasks/{task_id}", response_model=GenerationTaskResponse)
def update_extension_task(task_id: str, payload: ExtensionTaskUpdate, _: ExtensionConnection = Depends(require_extension), session: Session = Depends(get_session)):
    return generation_tasks.transition(session, task_id, payload.status, payload.progress_message, payload.error_code, payload.chat_url)
```

Map not-found to 404, invalid transitions to 409, invalid/expired extension tokens to 401, and queue-busy creation to 409 only if a configured queue cap is reached.

- [ ] **Step 4: Run API tests**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_generation_tasks.py tests/test_extension_bridge.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/generation_tasks.py backend/app/api/routes/extension.py backend/app/api/router.py backend/tests/test_generation_tasks.py backend/tests/test_extension_bridge.py
git commit -m "feat: expose generation bridge APIs"
```

### Task 4: Complete tasks with validated local images

**Files:**
- Modify: `backend/app/services/image_resources.py`
- Modify: `backend/app/services/generation_tasks.py`
- Modify: `backend/app/api/routes/extension.py`
- Modify: `backend/tests/test_extension_bridge.py`

- [ ] **Step 1: Write failing image completion tests**

```python
def test_extension_upload_completes_task_and_creates_image(client, paired_headers, project_id, image_bytes):
    task = client.post("/api/generation-tasks", json={"project_id": project_id, "prompt": "quiet tower"}).json()
    client.get("/api/extension/tasks/next", headers=paired_headers)
    for state in ("sending", "generating", "downloading"):
        client.patch(f"/api/extension/tasks/{task['id']}", headers=paired_headers, json={"status": state, "progress_message": state})
    response = client.post(
        f"/api/extension/tasks/{task['id']}/image",
        headers=paired_headers,
        files={"file": ("result.png", image_bytes(), "image/png")},
        data={"chat_url": "https://chatgpt.com/c/example"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert len(client.get(f"/api/projects/{project_id}/images").json()) == 1
```

- [ ] **Step 2: Verify missing upload route**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_extension_bridge.py::test_extension_upload_completes_task_and_creates_image -q`

Expected: FAIL with 404.

- [ ] **Step 3: Add transaction-friendly generated image completion**

```python
def complete_with_image(session: Session, data_dir: Path, task_id: str, content: bytes, chat_url: str) -> GenerationTask:
    task = require_task(session, task_id)
    require_transition(task.status, "completed")
    stored = store_image(data_dir / "images", task.project_id, content)
    image = build_image_record(task.project_id, stored, task.prompt, task.parent_image_id, position_x=0, position_y=0)
    try:
        session.add(image)
        task.status = "completed"
        task.image_id = image.id
        task.chat_url = chat_url
        task.progress_message = "图片已保存"
        session.commit()
    except Exception:
        session.rollback()
        stored.unlink(missing_ok=True)
        raise
    return task
```

Refactor existing upload creation to reuse `build_image_record` without changing its public behavior. Read at most `MAX_IMAGE_BYTES + 1`; keep Pillow signature verification and server-generated paths.

- [ ] **Step 4: Run all backend tests**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -q`

Expected: all existing and new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/image_resources.py backend/app/services/generation_tasks.py backend/app/api/routes/extension.py backend/tests/test_extension_bridge.py
git commit -m "feat: persist generated images atomically"
```

### Task 5: Scaffold and secure the Chrome extension

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/scripts/build.mjs`
- Create: `extension/src/manifest.json`
- Create: `extension/src/shared/protocol.ts`
- Create: `extension/src/background.ts`
- Create: `extension/src/popup.html`
- Create: `extension/src/popup.ts`
- Create: `extension/src/popup.css`
- Test: `extension/src/background.test.ts`

- [ ] **Step 1: Write failing bridge client tests**

```ts
it('persists the token returned by a successful pairing', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ token: 'local-token' }), { status: 200 }))
  await pairExtension('123456')
  expect(chrome.storage.local.set).toHaveBeenCalledWith({ bridgeToken: 'local-token' })
})

it('never sends a task request without a token', async () => {
  chrome.storage.local.get.mockResolvedValue({})
  await expect(fetchNextTask()).rejects.toThrow('扩展尚未配对')
  expect(fetchMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Install extension tooling and verify failure**

Run: `cd extension && npm install && npm test -- --run`

Expected: FAIL because the extension modules are missing.

- [ ] **Step 3: Implement build, manifest, typed protocol, and pairing client**

```json
{
  "manifest_version": 3,
  "name": "AI Image Canvas Bridge",
  "version": "0.1.0",
  "permissions": ["storage", "tabs", "activeTab"],
  "host_permissions": ["http://127.0.0.1:8000/*", "https://chatgpt.com/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [{ "matches": ["https://chatgpt.com/*"], "js": ["content.js"] }],
  "action": { "default_popup": "popup.html" }
}
```

`package.json` uses `esbuild`, `typescript`, `vitest`, `jsdom`, and `@types/chrome`; `npm run build` must empty and recreate `dist/`, bundle `background.ts`, `content.ts`, and `popup.ts`, then copy the manifest, popup HTML, and CSS. The bridge base URL is the constant `http://127.0.0.1:8000/api`.

- [ ] **Step 4: Run extension tests and build**

Run: `cd extension && npm test -- --run && npm run build`

Expected: tests PASS and `extension/dist/manifest.json` exists.

- [ ] **Step 5: Commit**

```bash
git add extension
git commit -m "feat: scaffold secure ChatGPT bridge extension"
```

### Task 6: Build the semantic ChatGPT page adapter

**Files:**
- Create: `extension/src/chatPageAdapter.ts`
- Create: `extension/src/chatPageAdapter.test.ts`
- Create: `extension/test/fixtures/logged-out.html`
- Create: `extension/test/fixtures/chat-ready.html`
- Create: `extension/test/fixtures/generating.html`
- Create: `extension/test/fixtures/image-result.html`
- Create: `extension/test/fixtures/rejected.html`

- [ ] **Step 1: Write failing DOM contract tests**

```ts
it('detects login and submits exactly once through the composer', () => {
  document.body.innerHTML = fixture('chat-ready.html')
  const adapter = new ChatPageAdapter(document)
  expect(adapter.getState()).toBe('ready')
  adapter.submitPrompt('quiet observatory')
  expect((document.querySelector('[data-testid="prompt-textarea"]') as HTMLElement).textContent).toBe('quiet observatory')
  expect(submitSpy).toHaveBeenCalledTimes(1)
})

it('returns only a stable completed image', () => {
  document.body.innerHTML = fixture('image-result.html')
  expect(new ChatPageAdapter(document).findCompletedImage()?.src).toBe('blob:https://chatgpt.com/result')
})
```

- [ ] **Step 2: Verify missing adapter failure**

Run: `cd extension && npm test -- --run src/chatPageAdapter.test.ts`

Expected: FAIL because `ChatPageAdapter` is missing.

- [ ] **Step 3: Implement semantic selectors and typed page states**

```ts
export type ChatPageState = 'login-required' | 'ready' | 'generating' | 'rejected' | 'unsupported'

export class ChatPageAdapter {
  constructor(private readonly root: Document) {}

  getState(): ChatPageState {
    if (this.root.querySelector('form[action*="login"], [data-testid="login-button"]')) return 'login-required'
    if (this.root.querySelector('[data-testid="stop-button"], button[aria-label*="Stop"]')) return 'generating'
    if (this.root.querySelector('[data-message-author-role="assistant"] [data-block-type="refusal"]')) return 'rejected'
    if (this.getComposer() && this.getSubmitButton()) return 'ready'
    return 'unsupported'
  }

  submitPrompt(prompt: string): void {
    const composer = this.getComposer()
    const submit = this.getSubmitButton()
    if (!composer || !submit) throw new PageAdapterError('PAGE_UNSUPPORTED')
    composer.focus()
    composer.textContent = prompt
    composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }))
    submit.click()
  }
}
```

Keep all selectors inside private adapter methods. Do not inspect account names, conversation history, cookies, or unrelated tabs.

- [ ] **Step 4: Run adapter tests**

Run: `cd extension && npm test -- --run src/chatPageAdapter.test.ts`

Expected: login, ready, generating, result, rejected, and unsupported fixtures PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/chatPageAdapter.ts extension/src/chatPageAdapter.test.ts extension/test/fixtures
git commit -m "feat: add semantic ChatGPT page adapter"
```

### Task 7: Execute visible ChatGPT generation tasks

**Files:**
- Create: `extension/src/content.ts`
- Modify: `extension/src/background.ts`
- Modify: `extension/src/shared/protocol.ts`
- Test: `extension/src/content.test.ts`
- Modify: `extension/src/background.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

```ts
it('stops and reports LOGIN_REQUIRED without clicking', async () => {
  adapter.getState.mockReturnValue('login-required')
  await expect(executeTask(task)).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' })
  expect(adapter.submitPrompt).not.toHaveBeenCalled()
})

it('reports stages and returns image bytes once', async () => {
  adapter.getState.mockReturnValueOnce('ready').mockReturnValueOnce('generating').mockReturnValue('ready')
  adapter.findCompletedImage.mockReturnValue({ src: 'blob:https://chatgpt.com/result' })
  const result = await executeTask(task)
  expect(result.mimeType).toBe('image/png')
  expect(adapter.submitPrompt).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Verify tests fail**

Run: `cd extension && npm test -- --run src/content.test.ts src/background.test.ts`

Expected: FAIL on missing orchestration.

- [ ] **Step 3: Implement tab focus, visible execution, progress, and upload**

```ts
async function ensureChatTab(): Promise<chrome.tabs.Tab> {
  const [existing] = await chrome.tabs.query({ url: 'https://chatgpt.com/*' })
  const tab = existing ?? await chrome.tabs.create({ url: 'https://chatgpt.com/', active: true })
  if (tab.id === undefined) throw new BridgeError('PAGE_UNSUPPORTED')
  await chrome.tabs.update(tab.id, { active: true })
  if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true })
  return tab
}
```

The background worker polls only while paired, claims one task, focuses the official tab, sends `execute-task` to the content script, patches `sending/generating/downloading`, and uploads a `Blob` in `FormData`. Content execution has a 10-minute deadline, uses `MutationObserver` plus a 2-second health check, and never retries submission automatically. Map adapter failures to the exact design error codes.

- [ ] **Step 4: Run extension tests and build**

Run: `cd extension && npm test -- --run && npm run build`

Expected: all extension tests PASS and build succeeds.

- [ ] **Step 5: Commit**

```bash
git add extension/src
git commit -m "feat: automate visible ChatGPT image tasks"
```

### Task 8: Add the frontend ImageProvider and task store

**Files:**
- Create: `frontend/src/features/generation/types.ts`
- Create: `frontend/src/features/generation/chatGptProvider.ts`
- Create: `frontend/src/features/generation/chatGptProvider.test.ts`
- Create: `frontend/src/features/generation/generationStore.ts`
- Create: `frontend/src/features/generation/generationStore.test.ts`
- Modify: `frontend/src/lib/resourcesApi.ts`

- [ ] **Step 1: Write failing provider/store tests**

```ts
it('creates a task and reads its later state', async () => {
  api.createGenerationTask.mockResolvedValue({ id: 'task-1', status: 'queued' })
  api.getGenerationTask.mockResolvedValue({ id: 'task-1', status: 'completed', image_id: 'image-1' })
  const created = await provider.generate({ projectId: 'project-1', prompt: 'quiet observatory' })
  const completed = await provider.getTask(created.id)
  expect(completed.imageId).toBe('image-1')
})

it('keeps the failed prompt and requires explicit retry', async () => {
  provider.generate.mockRejectedValue(new ProviderError('LOGIN_REQUIRED', '请登录'))
  await useGenerationStore.getState().generate('project-1', 'quiet observatory')
  expect(useGenerationStore.getState().prompt).toBe('quiet observatory')
  expect(useGenerationStore.getState().errorCode).toBe('LOGIN_REQUIRED')
})
```

- [ ] **Step 2: Verify failure**

Run: `cd frontend && npm test -- --run src/features/generation`

Expected: FAIL because the generation modules are missing.

- [ ] **Step 3: Implement API DTOs, provider registry, and Zustand state**

```ts
export interface ImageProvider {
  readonly id: string
  getAvailability(): Promise<ProviderAvailability>
  generate(input: GenerateImageInput): Promise<ImageGenerationTask>
  getTask(taskId: string): Promise<ImageGenerationTask>
  cancel(taskId: string): Promise<void>
}

export const providerRegistry = new Map<string, ImageProvider>([
  ['chatgpt-web', new ChatGptImageProvider()],
])
```

The Zustand store polls `provider.getTask()` at 1.5 seconds only while status is non-terminal and aborts polling on cancellation. Convert snake_case DTOs at the API boundary. The store owns `prompt`, `availability`, `task`, `errorCode`, and `isPanelOpen`; only explicit `retry()` creates a new task.

- [ ] **Step 4: Run generation module tests**

Run: `cd frontend && npm test -- --run src/features/generation`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/generation frontend/src/lib/resourcesApi.ts
git commit -m "feat: add ChatGPT image provider client"
```

### Task 9: Add generation UI and Canvas result insertion

**Files:**
- Create: `frontend/src/features/generation/GenerationPanel.tsx`
- Create: `frontend/src/features/generation/GenerationPanel.test.tsx`
- Modify: `frontend/src/features/canvas/store/canvasStore.ts`
- Modify: `frontend/src/features/canvas/store/canvasStore.test.ts`
- Modify: `frontend/src/features/canvas/CanvasBoard.tsx`
- Modify: `frontend/src/app/App.test.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Write failing user-flow tests**

```tsx
it('shows pairing guidance while the extension is offline', async () => {
  render(<GenerationPanel projectId="project-1" />)
  expect(await screen.findByText('连接 ChatGPT')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '生成配对码' })).toBeEnabled()
})

it('inserts and selects the completed persisted image', async () => {
  await useCanvasStore.getState().insertPersistedImage('project-1', imageDto)
  const canvas = useCanvasStore.getState().canvases['project-1']
  expect(canvas.selectedNodeId).toBe(imageDto.id)
  expect(canvas.nodes.at(-1)?.data.image.imageSource).toBe('stored')
})
```

- [ ] **Step 2: Verify missing UI/action failures**

Run: `cd frontend && npm test -- --run src/features/generation/GenerationPanel.test.tsx src/features/canvas/store/canvasStore.test.ts`

Expected: FAIL because the panel and insertion action are missing.

- [ ] **Step 3: Implement accessible generation panel and Canvas integration**

```tsx
<form onSubmit={submit} className="generation-form">
  <label htmlFor="generation-prompt">Prompt</label>
  <textarea id="generation-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
  <button type="submit" disabled={!availability.online || isRunning || !prompt.trim()}>
    {isRunning ? '正在生成…' : '使用 ChatGPT 生成'}
  </button>
</form>
```

Add a toolbar button that opens the panel. Show ordered stages with `role="status"`; errors use `role="alert"` and an action tailored to the code. `LOGIN_REQUIRED` opens ChatGPT, `EXTENSION_OFFLINE` shows install/pair instructions, and retry calls the store only after a user click. On completion, fetch the image DTO by refreshing the project Canvas, insert/select it, close progress only after the node exists, and preserve the prompt.

- [ ] **Step 4: Run all frontend tests and build**

Run: `cd frontend && npm test -- --run && npm run build`

Expected: all tests PASS and Vite production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/generation frontend/src/features/canvas frontend/src/app/App.test.tsx frontend/src/index.css
git commit -m "feat: generate ChatGPT images from the canvas"
```

### Task 10: Document setup and perform complete verification

**Files:**
- Modify: `README.md`
- Create: `docs/chatgpt-extension-troubleshooting.md`
- Modify: `docs/superpowers/plans/2026-08-25-chatgpt-web-image-provider.md` (check completed boxes during execution)

- [ ] **Step 1: Write the exact local setup documentation**

Document these commands and actions:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 3000

cd extension
npm install
npm run build
```

Then document `chrome://extensions` → developer mode → load `extension/dist` → generate pairing code in AI Image Canvas → enter it in the extension → manually sign in at `https://chatgpt.com/`. State clearly that the app never requests passwords/cookies, does not bypass challenges or limits, and may need adapter updates when ChatGPT changes.

- [ ] **Step 2: Run backend verification**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -q`

Expected: all backend tests PASS.

- [ ] **Step 3: Run frontend verification**

Run: `cd frontend && npm test -- --run && npm run build && npm audit --audit-level=high`

Expected: tests PASS, build succeeds, and audit reports zero high/critical vulnerabilities.

- [ ] **Step 4: Run extension verification**

Run: `cd extension && npm test -- --run && npm run build && npm audit --audit-level=high`

Expected: tests PASS, build succeeds, and audit reports zero high/critical vulnerabilities.

- [ ] **Step 5: Perform the real-account manual acceptance flow**

Start backend and frontend, load `extension/dist`, pair once, manually log in to the official ChatGPT site, submit one harmless image prompt, and verify:

```text
queued → connecting → sending → generating → downloading → completed
```

Confirm one Chat message was submitted, one image file exists under `data/images/<project_id>/`, one Images row references it, refresh preserves it, and logging out yields `LOGIN_REQUIRED` without repeat clicking. This step requires the user to complete any official login or security challenge personally.

- [ ] **Step 6: Review the final diff**

Run: `git status --short && git diff --check && git diff --stat master...HEAD`

Expected: no unintended files, no whitespace errors, and changes limited to the planned backend, frontend, extension, tests, and docs.

- [ ] **Step 7: Commit documentation and verification notes**

```bash
git add README.md docs/chatgpt-extension-troubleshooting.md docs/superpowers/plans/2026-08-25-chatgpt-web-image-provider.md
git commit -m "docs: explain ChatGPT bridge setup"
```

