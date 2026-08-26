# PicLoom Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist projects, prompts, image files, canvas positions, metadata, and parent relationships in local SQLite and the local filesystem, with automatic frontend save status and offline fallback.

**Architecture:** FastAPI exposes resource-oriented REST endpoints backed by SQLAlchemy 2.0 repositories and a file-storage service. React/Zustand hydrates resources from the API, keeps interaction optimistic, and persists each completed user action while tracking `loading | saving | saved | error | offline`.

**Tech Stack:** Python 3.13, FastAPI 0.116.1, SQLAlchemy 2.0.52, Pillow 12.3.0, python-multipart 0.0.32, SQLite, React 19, TypeScript, Zustand 5, React Flow 12, Vitest, Pytest

---

## File map

- `backend/app/core/config.py`: resolve database and media directories from environment-safe settings.
- `backend/app/db/session.py`: SQLAlchemy engine/session factory and SQLite foreign-key hook.
- `backend/app/db/init_db.py`: create tables and seed stable Phase 2 projects/prompts.
- `backend/app/models/entities.py`: Project, Image, Prompt ORM entities.
- `backend/app/schemas/resources.py`: request/response DTOs and validation.
- `backend/app/services/image_storage.py`: verify, atomically store, copy, and delete local image files.
- `backend/app/services/resources.py`: CRUD rules, image counts, parent validation, and cycle detection.
- `backend/app/api/routes/projects.py`, `prompts.py`, `images.py`: thin HTTP route adapters.
- `backend/tests/conftest.py`: isolated temporary database and media fixtures.
- `backend/tests/test_projects.py`, `test_prompts.py`, `test_images.py`: API and filesystem behavior.
- `frontend/src/lib/resourcesApi.ts`: typed resource client and multipart upload.
- `frontend/src/app/store.ts`: persisted project/prompt state and save status.
- `frontend/src/features/canvas/store/canvasStore.ts`: hydrate canvases and async image mutations.
- `frontend/src/features/projects/ProjectList.tsx`: project create/rename/delete controls.
- `frontend/src/features/prompts/PromptLibrary.tsx`: Prompt create/edit/duplicate/delete controls.
- `frontend/src/features/canvas/CanvasBoard.tsx`: load project canvas and persist drag/connect/upload.
- `frontend/src/features/inspector/ImageInspector.tsx`: persist metadata, duplicate, and delete.
- `frontend/src/app/App.tsx`: bootstrap resources and offline fallback.

### Task 1: Database foundation and deterministic seed data

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/core/config.py`
- Create: `backend/app/db/__init__.py`
- Create: `backend/app/db/session.py`
- Create: `backend/app/db/init_db.py`
- Create: `backend/app/models/entities.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_database.py`

- [ ] **Step 1: Write failing database tests**

```python
def test_database_initialization_seeds_stable_resources(test_session):
    projects = test_session.scalars(select(Project).order_by(Project.created_time)).all()
    prompts = test_session.scalars(select(Prompt)).all()
    assert [item.id for item in projects] == ["future-city", "product-concepts", "architecture"]
    assert len(prompts) == 6

def test_sqlite_foreign_keys_are_enabled(test_session):
    assert test_session.scalar(text("PRAGMA foreign_keys")) == 1
```

- [ ] **Step 2: Run RED**

Run: `.venv\Scripts\python.exe -m pytest tests/test_database.py -v`
Expected: collection fails because `app.db.session` and ORM entities do not exist.

- [ ] **Step 3: Pin and install persistence dependencies**

Append exactly:

```text
SQLAlchemy==2.0.52
Pillow==12.3.0
python-multipart==0.0.32
```

Run: `.venv\Scripts\python.exe -m pip install -r requirements.txt`

- [ ] **Step 4: Implement engine, session, models, and seeds**

Use SQLAlchemy declarative mappings with `ondelete="CASCADE"` for `Image.project_id` and `ondelete="SET NULL"` for `Image.parent_id`. Store timestamps as timezone-aware `datetime`; store tags with SQLAlchemy `JSON` so SQLite serializes an array. Register this connection hook:

```python
@event.listens_for(engine, "connect")
def enable_foreign_keys(dbapi_connection, _):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()
```

`init_database()` calls `Base.metadata.create_all(engine)` and inserts stable projects/prompts only when their tables are empty.

- [ ] **Step 5: Run GREEN and regressions**

Run: `.venv\Scripts\python.exe -m pytest tests/test_database.py tests/test_health.py -v`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add backend
git commit -m "feat: add sqlite persistence foundation"
```

### Task 2: Project and Prompt resource APIs

**Files:**
- Create: `backend/app/schemas/resources.py`
- Create: `backend/app/services/resources.py`
- Create: `backend/app/api/dependencies.py`
- Create: `backend/app/api/routes/projects.py`
- Create: `backend/app/api/routes/prompts.py`
- Modify: `backend/app/api/router.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_projects.py`
- Create: `backend/tests/test_prompts.py`

- [ ] **Step 1: Write failing project API tests**

```python
def test_project_crud_and_last_project_guard(client):
    created = client.post("/api/projects", json={"name": "New Project"})
    assert created.status_code == 201
    project_id = created.json()["id"]
    assert client.patch(f"/api/projects/{project_id}", json={"name": "Renamed"}).json()["name"] == "Renamed"
    assert client.delete(f"/api/projects/{project_id}").status_code == 204

def test_project_list_reports_image_count(client):
    assert all("image_count" in item for item in client.get("/api/projects").json())
```

- [ ] **Step 2: Write failing Prompt API tests**

```python
def test_prompt_crud_and_duplicate(client):
    source = client.post("/api/prompts", json={"title": "Studio", "content": "Soft light", "category": "摄影"}).json()
    copy = client.post(f"/api/prompts/{source['id']}/duplicate").json()
    assert copy["id"] != source["id"]
    assert copy["title"] == "Studio 副本"
    assert client.delete(f"/api/prompts/{source['id']}").status_code == 204
```

- [ ] **Step 3: Run RED**

Run: `.venv\Scripts\python.exe -m pytest tests/test_projects.py tests/test_prompts.py -v`
Expected: 404 because routes are not registered.

- [ ] **Step 4: Implement schemas, services, and routes**

Define `ProjectCreate(name: str)` and `PromptCreate(title, content, category)` with `Field(min_length=1)` and maximum lengths from the design. Route functions receive a SQLAlchemy `Session` dependency, call focused service functions, and translate missing resources to 404 and last-project deletion to 409. Return 201 for create/duplicate and 204 for delete.

- [ ] **Step 5: Initialize database in app lifespan**

Use a FastAPI lifespan context that calls `init_database()` before yielding. Mount media only after settings create the directory.

- [ ] **Step 6: Run GREEN**

Run: `.venv\Scripts\python.exe -m pytest tests/test_projects.py tests/test_prompts.py tests/test_health.py -v`
Expected: all tests pass without warnings.

- [ ] **Step 7: Commit**

```powershell
git add backend
git commit -m "feat: add project and prompt APIs"
```

### Task 3: Secure image storage and image APIs

**Files:**
- Create: `backend/app/services/image_storage.py`
- Create: `backend/app/api/routes/images.py`
- Modify: `backend/app/services/resources.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_images.py`

- [ ] **Step 1: Write failing upload tests with real image bytes**

```python
def test_upload_persists_verified_png(client, image_bytes, media_root):
    response = client.post(
        "/api/projects/future-city/images",
        files={"file": ("source.png", image_bytes("PNG"), "image/png")},
        data={"prompt": "City", "position_x": "40", "position_y": "80"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["image_url"].startswith("/media/images/future-city/")
    assert (media_root / body["image_path"]).is_file()

def test_upload_rejects_disguised_file_without_residue(client, media_root):
    response = client.post("/api/projects/future-city/images", files={"file": ("fake.png", b"not-image", "image/png")})
    assert response.status_code == 400
    assert list(media_root.rglob("*.*")) == []
```

- [ ] **Step 2: Write failing relationship, copy, and deletion tests**

```python
def test_parent_cycle_is_rejected(client, uploaded_pair):
    parent, child = uploaded_pair
    assert client.patch(f"/api/images/{child['id']}", json={"parent_id": parent["id"]}).status_code == 200
    assert client.patch(f"/api/images/{parent['id']}", json={"parent_id": child["id"]}).status_code == 400

def test_duplicate_copies_file_and_delete_removes_only_source(client, uploaded_image, media_root):
    copy = client.post(f"/api/images/{uploaded_image['id']}/duplicate").json()
    assert copy["position_x"] == uploaded_image["position_x"] + 60
    assert client.delete(f"/api/images/{uploaded_image['id']}").status_code == 204
    assert (media_root / copy["image_path"]).exists()
```

- [ ] **Step 3: Run RED**

Run: `.venv\Scripts\python.exe -m pytest tests/test_images.py -v`
Expected: 404 because image routes do not exist.

- [ ] **Step 4: Implement file service**

Read at most `20 * 1024 * 1024 + 1` bytes, reject excess with a typed 413 service error, call `PIL.Image.open(BytesIO(data)).verify()`, map `PNG/JPEG/WEBP` to `.png/.jpg/.webp`, and write to a UUID `.tmp` file before `Path.replace(final_path)`. All resolved paths must remain under the configured media root.

- [ ] **Step 5: Implement image service and routes**

Implement list/upload/patch/duplicate/delete. `validate_parent()` checks existence, same project, self-reference, then walks parent IDs until null; encountering the target image raises a 400 cycle error. Delete first commits database changes, then removes the file idempotently; project deletion removes its validated project directory after database commit.

- [ ] **Step 6: Run GREEN and full backend suite**

Run: `.venv\Scripts\python.exe -m pytest -v`
Expected: all backend tests pass.

- [ ] **Step 7: Commit**

```powershell
git add backend
git commit -m "feat: persist and serve local images"
```

### Task 4: Typed frontend API client and persisted resource store

**Files:**
- Create: `frontend/src/lib/resourcesApi.ts`
- Create: `frontend/src/lib/resourcesApi.test.ts`
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/app/store.ts`
- Modify: `frontend/src/app/store.test.ts`

- [ ] **Step 1: Write failing API client tests**

```typescript
it('uploads an image as multipart data', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(imageDto), { status: 201 })))
  await uploadImage('future-city', file, { prompt: 'City', positionX: 10, positionY: 20 })
  expect(fetch).toHaveBeenCalledWith('/api/projects/future-city/images', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }))
})

it('surfaces the backend detail message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: '非法图片' }), { status: 400 })))
  await expect(listProjects()).rejects.toThrow('非法图片')
})
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd run test:run -- src/lib/resourcesApi.test.ts`
Expected: import fails because `resourcesApi.ts` does not exist.

- [ ] **Step 3: Implement resource DTOs and fetch wrapper**

Add `SaveStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'offline'`. Implement `request<T>()` that parses `detail`, does not set `Content-Type` for FormData, and exposes exact Project, Prompt, Image CRUD functions matching the design API.

- [ ] **Step 4: Write failing app-store hydrate and CRUD tests**

Test `hydrateResources()`, `createProject()`, `renameProject()`, `deleteProject()`, and all Prompt actions using mocked API boundaries. Assert resource state and `saveStatus` transitions, including rejected requests preserving editable state and setting `error`.

- [ ] **Step 5: Run RED, implement store, run GREEN**

Run: `npm.cmd run test:run -- src/app/store.test.ts`
Expected before implementation: missing actions. After implementation: all API and store tests pass.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/lib frontend/src/types frontend/src/app
git commit -m "feat: add persisted frontend resource client"
```

### Task 5: Hydrated canvas and automatic image persistence

**Files:**
- Modify: `frontend/src/features/canvas/store/canvasStore.ts`
- Modify: `frontend/src/features/canvas/store/canvasStore.test.ts`
- Modify: `frontend/src/features/canvas/CanvasBoard.tsx`
- Modify: `frontend/src/features/canvas/components/ImageNode.tsx`
- Modify: `frontend/src/features/inspector/ImageInspector.tsx`

- [ ] **Step 1: Write failing canvas hydration tests**

```typescript
it('hydrates nodes and derives edges from parent ids', async () => {
  await useCanvasStore.getState().loadCanvas('future-city')
  const canvas = useCanvasStore.getState().canvases['future-city']
  expect(canvas.nodes[1].position).toEqual({ x: 340, y: 190 })
  expect(canvas.edges).toContainEqual(expect.objectContaining({ source: 'parent', target: 'child' }))
})
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd run test:run -- src/features/canvas/store/canvasStore.test.ts`
Expected: `loadCanvas` is undefined.

- [ ] **Step 3: Implement async canvas actions**

Replace fixture-first online state with `loadCanvas`, `uploadImages`, `persistPosition`, `persistConnection`, `persistMetadata`, `duplicatePersistedNode`, and `deletePersistedNode`. Convert DTO `imageUrl` to browser URL and `parentId` to smooth-step edges. Each action sets the app save status through `saving → saved` or `error`; offline fallback remains `createInitialCanvases()`.

- [ ] **Step 4: Write failing component interaction tests**

Test file input upload, `onNodeDragStop` persistence, relationship persistence, inspector blur-save, duplicate, and delete. Mock only `resourcesApi`; assert visible UI state and store state rather than internal callback counts.

- [ ] **Step 5: Wire React Flow completion events**

Use `onNodeDragStop={(_, node) => persistPosition(projectId, node.id, node.position)}`. Upload awaits one backend request per validated file. Connection calls the backend before finalizing an edge; rejected cycles restore the previous relationship and show the backend message.

- [ ] **Step 6: Run GREEN**

Run: `npm.cmd run test:run -- src/features/canvas src/features/inspector`
Expected: canvas and inspector suites pass.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/canvas frontend/src/features/inspector
git commit -m "feat: persist canvas image operations"
```

### Task 6: Project and Prompt management UI plus save status

**Files:**
- Modify: `frontend/src/features/projects/ProjectList.tsx`
- Create: `frontend/src/features/projects/ProjectList.test.tsx`
- Modify: `frontend/src/features/prompts/PromptLibrary.tsx`
- Create: `frontend/src/features/prompts/PromptLibrary.test.tsx`
- Create: `frontend/src/components/SaveStatus.tsx`
- Create: `frontend/src/components/SaveStatus.test.tsx`
- Modify: `frontend/src/features/canvas/CanvasBoard.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Write failing management UI tests**

Test creating and renaming a project, guarded project deletion, Prompt create/edit/duplicate/delete, and destructive confirmations using `userEvent`. Verify accessible dialog/form labels and resulting Zustand state.

- [ ] **Step 2: Run RED**

Run: `npm.cmd run test:run -- src/features/projects src/features/prompts src/components/SaveStatus.test.tsx`
Expected: management controls and SaveStatus component are missing.

- [ ] **Step 3: Implement compact inline management controls**

Use the existing plus and overflow icon buttons. Render one inline form at a time, validate trimmed non-empty values, use explicit confirm/cancel buttons, and keep the last-project delete action disabled. Prompt copy-to-clipboard remains separate from persisted duplicate.

- [ ] **Step 4: Implement SaveStatus**

Map statuses to Chinese labels: `loading=正在加载`, `saving=正在保存`, `saved=已保存`, `error=保存失败`, `offline=后端离线`. Error mode exposes a “重新加载” button that calls the app bootstrap action.

- [ ] **Step 5: Run GREEN and accessibility-focused App tests**

Run: `npm.cmd run test:run -- src/features/projects src/features/prompts src/components src/app/App.test.tsx`
Expected: all selected suites pass.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src
git commit -m "feat: add persisted workspace management UI"
```

### Task 7: Bootstrap, documentation, and release verification

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/App.test.tsx`
- Modify: `README.md`
- Modify: `.gitignore`
- Verify: `scripts/start-dev.ps1`

- [ ] **Step 1: Write failing bootstrap tests**

Test that App hydrates resources when backend is online, selects a valid project, loads that canvas, and switches to fixtures with `offline` status when bootstrap rejects. Verify retry replaces fallback state with server state.

- [ ] **Step 2: Implement bootstrap and remove obsolete Phase 1 placeholders**

App runs a single idempotent bootstrap action. Delete unused `CanvasWorkspace.tsx` and `InspectorPanel.tsx`. Add `data/database.sqlite`, `data/images/*`, temporary upload files, backend caches, and local virtual environments to `.gitignore`, while retaining `.gitkeep` placeholders for runtime directories.

- [ ] **Step 3: Update README**

Document installation, `scripts/start-dev.ps1`, data locations, supported formats and limits, automatic save semantics, backup procedure (copy the stopped `data/` directory), offline behavior, and Phase 4 boundary.

- [ ] **Step 4: Run complete verification**

```powershell
cd backend
.venv\Scripts\python.exe -m pytest -v

cd ..\frontend
npm.cmd run test:run
npm.cmd run build
npm.cmd audit --omit=dev
```

Expected: all Pytest and Vitest tests pass, Vite production build exits 0, and npm reports zero vulnerabilities.

- [ ] **Step 5: Local smoke test**

Run `scripts\start-dev.ps1`, open `http://127.0.0.1:3000`, upload a PNG, move it, edit its Prompt, refresh, and confirm all values restore. Confirm the file exists under `data/images/{project_id}` and the health endpoint returns 200.

- [ ] **Step 6: Commit**

```powershell
git add .gitignore README.md backend frontend scripts data
git commit -m "docs: complete phase 3 local persistence"
```

## Completion checklist

- [ ] Every production behavior was preceded by a failing focused test.
- [ ] No absolute filesystem path or user-supplied path is exposed through the API.
- [ ] Database writes and file operations leave no temporary residue on validation failure.
- [ ] Online initialization uses SQLite; offline initialization clearly uses fixtures.
- [ ] Project, Prompt, image, metadata, position, and parent relation survive refresh.
- [ ] Full frontend/backend suites, build, dependency audit, and local smoke test pass.
