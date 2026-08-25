# Image Names, Mention References, and Fit Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent unique image names, natural `@图片名` multi-image references for ChatGPT generation, and a fit-to-window default for the original-image viewer.

**Architecture:** The backend owns normalized project-scoped image-name uniqueness and backfills existing rows through an additive SQLite migration. The frontend shares a pure mention parser between autocomplete and submission, while Electron validates the reference array, resolves every local image, attaches all files together, and submits a prompt prefixed with an attachment/name map. The existing single `parent_id` relationship remains the first mentioned image.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, SQLite, pytest; React 19, TypeScript, Zustand, Vitest/Testing Library; Electron, TypeScript, Vitest.

---

### Task 1: Persist unique image names and migrate existing databases

**Files:**
- Modify: `backend/app/models/entities.py`
- Modify: `backend/app/services/database_migrations.py`
- Create: `backend/app/services/image_names.py`
- Modify: `backend/app/schemas/images.py`
- Modify: `backend/app/services/image_resources.py`
- Modify: `backend/app/services/image_batches.py`
- Modify: `backend/app/api/routes/images.py`
- Modify: `backend/tests/test_database_migrations.py`
- Modify: `backend/tests/test_images.py`
- Modify: `backend/tests/test_generation_batch.py`

- [ ] **Step 1: Write failing backend tests**

Add tests proving upload responses contain `name`, renames persist, normalized duplicates return 409, different projects may reuse names, copies receive a numbered “副本” name, generated batches receive unique prompt-derived names, and an old `images` table is backfilled idempotently.

```python
def test_image_names_are_unique_with_normalized_comparison(client, image_bytes):
    first = upload_image(client, image_bytes)
    assert first["name"] == "source"
    assert client.patch(f"/api/images/{first['id']}", json={"name": "假面骑士Build"}).status_code == 200
    second = upload_image(client, image_bytes)
    conflict = client.patch(f"/api/images/{second['id']}", json={"name": " 假面骑士build "})
    assert conflict.status_code == 409
    assert "同名" in conflict.json()["detail"]
```

```python
def test_image_name_migration_backfills_unique_rows(tmp_path: Path):
    # Create the pre-name images schema and insert two rows with the same prompt.
    run_additive_migrations(engine)
    rows = connection.execute(text("SELECT name, name_key FROM images ORDER BY created_time")).all()
    assert rows == [("喜羊羊", "喜羊羊"), ("喜羊羊 (2)", "喜羊羊 (2)")]
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
.venv\Scripts\python.exe -m pytest backend/tests/test_database_migrations.py backend/tests/test_images.py backend/tests/test_generation_batch.py -q
```

Expected: failures because `ImageResponse` has no `name`, PATCH ignores `name`, and the `images` table has no `name`/`name_key` columns.

- [ ] **Step 3: Implement name normalization and allocation**

Create `image_names.py` with focused helpers:

```python
MAX_IMAGE_NAME_LENGTH = 80

class ImageNameConflictError(Exception):
    pass

def normalize_name(value: str) -> tuple[str, str]:
    display = unicodedata.normalize("NFKC", value).strip()
    if not display:
        raise ValueError("图片名称不能为空")
    if len(display) > MAX_IMAGE_NAME_LENGTH:
        raise ValueError("图片名称不能超过 80 个字符")
    return display, display.casefold()

def prompt_name(prompt: str, fallback: str = "未命名图片") -> str:
    value = re.sub(r"^\s*(?:请|帮我)?(?:生成|创建|制作)(?:一张|一个)?\s*", "", prompt).strip()
    return (value or Path(fallback).stem or "未命名图片")[:MAX_IMAGE_NAME_LENGTH]

def allocate_name(session: Session, project_id: str, preferred: str, *, exclude_id: str | None = None) -> tuple[str, str]:
    # Query existing name_key values and append " (2)", " (3)" until free.
```

Add non-null `name` and `name_key` model columns plus `UniqueConstraint("project_id", "name_key")`. Extend the SQLite migration to add both columns, backfill in `(created_time, id)` order, and create a unique index only after all rows are valid. Keep the migration idempotent when run twice.

- [ ] **Step 4: Wire names through image creation, update, copy, and batch import**

`serialize_image()` must include `name`. Uploads allocate from the file stem, copies allocate from `f"{source.name} 副本"`, and generated batch files allocate from `task.prompt`. `ImageUpdate` accepts `name: str | None`; `update_image()` applies `normalize_name`, checks project scope, and stores both fields. Translate `ImageNameConflictError` and name validation errors to HTTP 409/422 respectively.

- [ ] **Step 5: Run backend tests and verify GREEN**

Run the command from Step 2. Expected: all selected backend tests pass.

- [ ] **Step 6: Commit backend naming**

```powershell
git add backend
git commit -m "feat: add persistent unique image names"
```

### Task 2: Surface editable names on the canvas and inspector

**Files:**
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/lib/resourcesApi.ts`
- Modify: `frontend/src/features/canvas/store/canvasStore.ts`
- Modify: `frontend/src/features/canvas/store/fixtures.ts`
- Modify: `frontend/src/features/canvas/components/ImageNode.tsx`
- Modify: `frontend/src/features/canvas/components/ImageNode.test.tsx`
- Modify: `frontend/src/features/inspector/ImageInspector.tsx`
- Modify: `frontend/src/features/inspector/ImageInspector.test.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Write failing UI/store tests**

Add `name` to test DTO fixtures and assert the node renders its name separately from its Prompt. Add an inspector test that edits “图片名称”, blurs, and verifies `persistMetadata(projectId, imageId, { name })`; add a rejection test that keeps the typed value and renders the backend conflict message.

```tsx
expect(screen.getByText('滨海未来城市')).toBeInTheDocument()
expect(screen.getByText('Near-future coastal city')).toBeInTheDocument()
```

```tsx
const name = screen.getByRole('textbox', { name: '图片名称' })
await user.clear(name)
await user.type(name, '假面骑士build')
await user.tab()
await waitFor(() => expect(persistMetadata).toHaveBeenCalledWith(
  'future-city', 'city-overview', { name: '假面骑士build' },
))
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd --prefix frontend test -- --run src/features/canvas/components/ImageNode.test.tsx src/features/inspector/ImageInspector.test.tsx src/features/canvas/store/persistedCanvasStore.test.ts
```

Expected: type/test failures because `CanvasImage`, `ImageDto`, and the inspector have no `name`.

- [ ] **Step 3: Implement frontend name mapping and editing**

Add `name` to `CanvasImage`, `ImageDto`, and `ImagePatch`; map it in `nodeFromDto`; include it in `updateImage` metadata types and all in-memory fixtures. Render:

```tsx
<strong className="image-node-name" title={image.name}>{image.name}</strong>
<p className="image-node-prompt">{image.prompt}</p>
```

In the inspector, use independent `name`, `nameError`, and `savingName` state. Save name on Enter/blur, restore it on Escape, and do not use the combined Prompt/tag `save()` callback so a failed name update cannot overwrite unrelated fields.

- [ ] **Step 4: Run tests and verify GREEN**

Run the command from Step 2. Expected: all selected frontend tests pass.

- [ ] **Step 5: Commit UI naming**

```powershell
git add frontend
git commit -m "feat: add editable canvas image names"
```

### Task 3: Parse natural mentions and replace the reference dropdown

**Files:**
- Create: `frontend/src/features/generation/imageMentions.ts`
- Create: `frontend/src/features/generation/imageMentions.test.ts`
- Create: `frontend/src/features/generation/ImageMentionMenu.tsx`
- Modify: `frontend/src/features/generation/ChatGptGenerationPanel.tsx`
- Modify: `frontend/src/features/generation/ChatGptGenerationPanel.test.tsx`
- Modify: `frontend/src/features/desktop/types.ts`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Write failing parser and panel tests**

Test long-name-first matching, Prompt order, deduplication, the active query at the caret, insertion, keyboard selection, removal of the old combobox, and the bridge payload.

```ts
expect(resolveImageMentions(
  '将@假面骑士build的身体和@喜羊羊的头部合成，最后参考@假面骑士build',
  images,
)).toEqual([
  { imageId: 'build', name: '假面骑士build' },
  { imageId: 'sheep', name: '喜羊羊' },
])
```

```tsx
await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '@喜')
expect(screen.getByRole('listbox', { name: '选择引用图片' })).toBeInTheDocument()
await user.keyboard('{ArrowDown}{Enter}')
expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveValue('@喜羊羊')
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd --prefix frontend test -- --run src/features/generation/imageMentions.test.ts src/features/generation/ChatGptGenerationPanel.test.tsx
```

Expected: module-not-found and old reference-combobox assertions fail.

- [ ] **Step 3: Implement the pure mention functions**

Expose these APIs:

```ts
export interface MentionImage { imageId: string; name: string; imageUrl: string }
export interface ActiveMention { start: number; end: number; query: string }

export function findActiveMention(prompt: string, caret: number): ActiveMention | null
export function insertMention(prompt: string, active: ActiveMention, name: string): { prompt: string; caret: number }
export function resolveImageMentions(prompt: string, images: MentionImage[]): Array<{ imageId: string; name: string }>
export function findInvalidMentions(prompt: string, images: MentionImage[]): string[]
```

Known names are matched longest-first and results are returned by first text position, deduplicated by ID. A standalone `@` opens the full list but is not an invalid reference.

- [ ] **Step 4: Implement the autocomplete and submission flow**

Create a small `ImageMentionMenu` listbox with thumbnail/name options and roving keyboard selection. In `ChatGptGenerationPanel`, delete `referenceImageId`, the select, and preview. Track textarea ref/caret, derive candidates from the active mention, and show selected reference names under the field. On submit, block invalid mentions; otherwise use the first resolved ID as `parentImageId` and send:

```ts
await bridge.startGeneration({
  taskId: nextTaskId,
  projectId,
  prompt: prompt.trim(),
  parentImageId: references[0]?.imageId ?? null,
  referenceImages: references,
})
```

- [ ] **Step 5: Run tests and verify GREEN**

Run the command from Step 2. Expected: all selected mention and panel tests pass.

- [ ] **Step 6: Commit mention UI**

```powershell
git add frontend
git commit -m "feat: add image mentions to generation prompts"
```

### Task 4: Validate, attach, and describe multiple reference images in Electron

**Files:**
- Modify: `desktop/src/contracts.ts`
- Modify: `desktop/src/ipc.ts`
- Modify: `desktop/src/chatgpt/referenceAttachment.ts`
- Modify: `desktop/src/generationOrchestrator.ts`
- Modify: `desktop/src/main.ts`
- Modify: `desktop/tests/contracts.test.ts`
- Modify: `desktop/tests/ipc.test.ts`
- Modify: `desktop/tests/referenceAttachment.test.ts`
- Modify: `desktop/tests/generationOrchestrator.test.ts`
- Modify: `frontend/src/features/desktop/desktopBridge.test.ts`

- [ ] **Step 1: Write failing Electron tests**

Add IPC tests rejecting non-arrays, more than 12 references, blank IDs/names, duplicate IDs, and a `parentImageId` that differs from the first reference. Add attachment tests expecting one `uploadFile(path1, path2)` call. Add orchestrator tests proving attachment precedes submission, the mapped Prompt order equals upload order, and cleanup runs on success/failure.

```ts
expect(submit).toHaveBeenCalledWith(expect.anything(),
  '参考图片顺序：第1张“假面骑士build”；第2张“喜羊羊”。\n' +
  '请严格按照用户文本中的 @名称 对应这些附件。\n\n' +
  '将@假面骑士build的身体和@喜羊羊的头部合成一个新的角色',
)
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd --prefix desktop test -- --run tests/ipc.test.ts tests/referenceAttachment.test.ts tests/generationOrchestrator.test.ts
```

Expected: request types reject `referenceImages`; attachment accepts only one path; orchestrator submits the unmapped Prompt.

- [ ] **Step 3: Extend and validate the desktop contract**

Add:

```ts
export interface DesktopReferenceImage {
  imageId: string
  name: string
}

export interface DesktopGenerationRequest {
  taskId: string
  projectId: string
  prompt: string
  parentImageId: string | null
  referenceImages: DesktopReferenceImage[]
}
```

`validateGenerationRequest` trims fields, caps references at 12, rejects duplicate IDs, and requires `parentImageId === referenceImages[0]?.imageId` (or null when empty).

- [ ] **Step 4: Attach all files atomically and build the mapped Prompt**

Change `attachReferenceFile` to `attachReferenceFiles(webContents, filePaths)` and call Electron's file input with all paths in one operation. Change the orchestrator dependency to `attachReferences(webContents, imageIds)` and submit `buildReferencePrompt(request.prompt, request.referenceImages)`. In `main.ts`, resolve all image IDs before attachment, create all temporary files, attach them together, and remove the temporary directory in one cleanup callback.

- [ ] **Step 5: Run desktop tests and verify GREEN**

Run the command from Step 2. Expected: all selected desktop tests pass.

- [ ] **Step 6: Commit desktop multi-reference support**

```powershell
git add desktop frontend/src/features/desktop
git commit -m "feat: attach multiple named ChatGPT references"
```

### Task 5: Make the original-image viewer open in fit mode

**Files:**
- Modify: `frontend/src/features/inspector/ImageInspector.tsx`
- Modify: `frontend/src/features/inspector/ImageInspector.test.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Write the failing viewer regression test**

Open the viewer and assert the stage is in fit mode and the toolbar reads “适应”. Zoom once, close, reopen, and assert it returns to fit mode.

```tsx
await user.click(screen.getByRole('button', { name: '查看原图' }))
expect(screen.getByTestId('original-image')).toHaveAttribute('data-fit', 'true')
await user.click(screen.getByRole('button', { name: '放大' }))
expect(screen.getByText('125%')).toBeInTheDocument()
await user.click(screen.getByRole('button', { name: '关闭原图' }))
await user.click(screen.getByRole('button', { name: '查看原图' }))
expect(screen.getByText('适应')).toBeInTheDocument()
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
npm.cmd --prefix frontend test -- --run src/features/inspector/ImageInspector.test.tsx
```

Expected: viewer starts at `100%` and lacks fit state.

- [ ] **Step 3: Implement fit/zoom state**

Use `const [viewerScale, setViewerScale] = useState<'fit' | number>('fit')`. Opening and selection changes reset to `fit`. Fit styling uses a class instead of an inline percentage width; numeric zoom uses a percentage width. “适应窗口” sets `fit`, wheel/plus converts fit to 125 before continuing, and minus from fit is a no-op.

```tsx
<img
  data-testid="original-image"
  data-fit={viewerScale === 'fit'}
  className={viewerScale === 'fit' ? 'is-fit' : undefined}
  style={viewerScale === 'fit' ? undefined : { width: `${viewerScale}%` }}
/>
```

CSS for `.is-fit` must use `max-width: 100%; max-height: 100%; width: auto; height: auto;` and center the stage both horizontally and vertically.

- [ ] **Step 4: Run test and verify GREEN**

Run the command from Step 2. Expected: all inspector tests pass.

- [ ] **Step 5: Commit fit viewer**

```powershell
git add frontend/src/features/inspector frontend/src/index.css
git commit -m "fix: open original images fitted to the window"
```

### Task 6: Update documentation, run the full suite, package, and launch

**Files:**
- Modify: `docs/AI-Image-Canvas-软件说明书.md`
- Modify: `docs/manual-verification.md`
- Modify: `docs/superpowers/plans/2026-08-25-image-names-mentions-fit-viewer.md`

- [ ] **Step 1: Update user documentation**

Document image renaming, project-scoped uniqueness, `@` autocomplete/multi-reference behavior, first-reference parent lineage, fit viewer controls, and recovery messages. Add the five-step manual acceptance scenario from the design spec.

- [ ] **Step 2: Run all automated verification**

Run:

```powershell
.venv\Scripts\python.exe -m pytest backend/tests -q
npm.cmd --prefix frontend test -- --run
npm.cmd --prefix desktop test -- --run
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix desktop run typecheck
npm.cmd --prefix frontend run build
```

Expected: zero failures and zero TypeScript/build errors.

- [ ] **Step 3: Build the Windows installer**

First identify and stop only processes whose executable path is the current project's `desktop\release\win-unpacked\AI Image Canvas.exe`, then run:

```powershell
npm.cmd run build:desktop
```

Expected: `desktop/release/AI Image Canvas-Setup-0.2.0.exe` and a refreshed `win-unpacked` app.

- [ ] **Step 4: Launch and verify health**

Launch the exact unpacked executable, wait for `http://127.0.0.1:8000/api/health`, and require HTTP 200 with `{ "status": "ok", "app": "AI Image Canvas" }`. Confirm the process path belongs to this workspace.

- [ ] **Step 5: Review requirements and working tree**

Compare implementation to every design-spec section, run `git diff --check`, inspect `git status --short`, and ensure no unrelated files or generated release binaries are staged.

- [ ] **Step 6: Commit documentation and plan completion**

```powershell
git add docs/AI-Image-Canvas-软件说明书.md docs/manual-verification.md docs/superpowers/plans/2026-08-25-image-names-mentions-fit-viewer.md
git commit -m "docs: explain named image reference workflow"
```
