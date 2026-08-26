# Transparent Generation and Chat Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional transparent-background constraint to new ChatGPT image generation and save a clean ChatGPT-suggested image name without `@`, with a local fallback.

**Architecture:** The React generation store owns a `transparentBackground` flag and sends it with the existing desktop request. Electron assembles one ChatGPT message containing reference mapping, optional transparency constraints, and a fixed-format naming request; the adapter extracts the optional name from only the latest Assistant response. The existing batch import endpoint accepts the optional suggestion, while backend naming utilities sanitize it and remove mentions from fallback prompt names.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest/Testing Library, Electron, FastAPI, SQLAlchemy, pytest.

---

## File map

- `frontend/src/features/generation/generationStore.ts`: own the transparent-background UI state.
- `frontend/src/features/generation/ChatGptGenerationPanel.tsx`: render the toggle and include the flag in desktop requests.
- `frontend/src/features/generation/desktopGeneration.css`: style the compact active/inactive option.
- `desktop/src/contracts.ts`: carry `transparentBackground` across IPC.
- `desktop/src/ipc.ts`: validate the new boolean request field.
- `desktop/src/generationOrchestrator.ts`: build the single submitted prompt and forward a suggested name during import.
- `desktop/src/chatgpt/adapter.ts`: extract `图片名称：...` from the latest Assistant response.
- `desktop/src/generationBackendClient.ts`: add `suggested_name` to the existing multipart batch request.
- `backend/app/api/routes/generation_tasks.py`: accept the optional form field.
- `backend/app/services/image_batches.py`: select the suggested name before the prompt fallback.
- `backend/app/services/image_names.py`: sanitize ChatGPT suggestions and mention-heavy fallback prompts.
- Existing adjacent test files cover every behavior before production edits.

### Task 1: Frontend transparent-background option

**Files:**
- Modify: `frontend/src/features/generation/generationStore.test.ts`
- Modify: `frontend/src/features/generation/generationStore.ts`
- Modify: `frontend/src/features/generation/ChatGptGenerationPanel.test.tsx`
- Modify: `frontend/src/features/generation/ChatGptGenerationPanel.tsx`
- Modify: `frontend/src/features/generation/desktopGeneration.css`
- Modify: `frontend/src/features/inspector/ImageInspector.test.tsx`
- Modify: `frontend/src/features/inspector/ImageInspector.tsx`

- [ ] **Step 1: Write failing store and panel tests**

Add assertions that the store defaults to `transparentBackground: false`, exposes `setTransparentBackground`, and the panel button named `透明背景` toggles `aria-pressed`. Submit both an ordinary Prompt and a multi-reference Prompt and assert the bridge receives:

```ts
expect(startGeneration).toHaveBeenCalledWith(expect.objectContaining({
  prompt: '一个透明材质机器人',
  transparentBackground: true,
}))
```

Update the details-panel background-removal test to require `transparentBackground: false`, because that action already carries its exact edit Prompt.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd --prefix frontend test -- --run src/features/generation/generationStore.test.ts src/features/generation/ChatGptGenerationPanel.test.tsx src/features/inspector/ImageInspector.test.tsx
```

Expected: FAIL because the state, button, and request field do not exist.

- [ ] **Step 3: Implement the minimal UI and state**

Add to the Zustand slice:

```ts
transparentBackground: boolean
setTransparentBackground(value: boolean): void
```

Render a non-submit button below the Prompt editor:

```tsx
<button
  type="button"
  className="desktop-transparent-option"
  aria-pressed={transparentBackground}
  onClick={() => setTransparentBackground(!transparentBackground)}
>
  <Eraser size={14} />透明背景
</button>
```

Pass the boolean through every `startGeneration` call. Do not add or alter visible user Prompt text.

- [ ] **Step 4: Verify GREEN**

Run the Task 1 command and expect all selected tests to pass.

### Task 2: Single-message Prompt assembly and IPC contract

**Files:**
- Modify: `desktop/tests/generationOrchestrator.test.ts`
- Modify: `desktop/tests/ipc.test.ts`
- Modify: `desktop/src/contracts.ts`
- Modify: `desktop/src/ipc.ts`
- Modify: `desktop/src/generationOrchestrator.ts`

- [ ] **Step 1: Write failing contract and Prompt tests**

Require IPC validation to accept only a boolean `transparentBackground`. Add orchestrator assertions for all combinations:

```ts
expect(buildSubmissionPrompt('生成一个机器人', [], true)).toContain(
  '将最终图片背景设为透明，保持所有前景主体完整无损，边缘干净平滑。不要添加纯色、白色或棋盘格背景。'
)
expect(buildSubmissionPrompt('生成一个机器人', [], false)).not.toContain('背景设为透明')
expect(buildSubmissionPrompt('生成一个机器人', [], false)).toContain('图片名称：名称')
```

Also assert multi-reference mapping remains unchanged.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd --prefix desktop test -- --run tests/ipc.test.ts tests/generationOrchestrator.test.ts
```

Expected: FAIL because the field and `buildSubmissionPrompt` are absent.

- [ ] **Step 3: Implement the request field and builder**

Add `transparentBackground: boolean` to `DesktopGenerationRequest`, validate it in IPC, and replace the direct `buildReferencePrompt` submission with:

```ts
export function buildSubmissionPrompt(
  prompt: string,
  references: DesktopReferenceImage[],
  transparentBackground: boolean,
): string
```

The function preserves `prompt`, conditionally appends the transparent-background sentence, and always appends: `请为最终图片拟定一个 2–12 个字符的简短中文名称，并在回复中严格使用“图片名称：名称”的格式。` Keep `buildReferencePrompt` as the internal reference-mapping unit or compatibility export.

- [ ] **Step 4: Verify GREEN**

Run the Task 2 command and expect all selected tests to pass.

### Task 3: Extract and transport the ChatGPT suggestion

**Files:**
- Modify: `desktop/tests/chatgptAdapter.test.ts`
- Modify: `desktop/tests/generationOrchestrator.test.ts`
- Modify: `desktop/tests/generationBackendClient.test.ts`
- Modify: `desktop/src/chatgpt/adapter.ts`
- Modify: `desktop/src/generationOrchestrator.ts`
- Modify: `desktop/src/generationBackendClient.ts`

- [ ] **Step 1: Write failing extraction and transport tests**

Use fixture HTML with an old Assistant name, a user `@引用`, and a latest Assistant response containing a generated image plus `图片名称：云端机甲`. Assert:

```ts
expect(inspectFixtureHtml(html, [])).toEqual({
  kind: 'completed',
  images: [{ src: 'https://example.test/final.png', alt: 'Generated image' }],
  suggestedName: '云端机甲',
})
```

Assert no label returns `suggestedName: undefined`, orchestrator passes the suggestion to `completeBatch`, and the backend client appends `suggested_name` only when non-empty.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd --prefix desktop test -- --run tests/chatgptAdapter.test.ts tests/generationOrchestrator.test.ts tests/generationBackendClient.test.ts
```

Expected: FAIL because completed page state and batch input do not carry a suggestion.

- [ ] **Step 3: Implement latest-response-only extraction**

Extend completed `PageState` with `suggestedName?: string`. Add a small extractor matching `图片名称\s*[：:]\s*([^\n\r]{1,80})` against only the selected latest Assistant article/element text. Pass this value through `collectAndImport` into `completeBatch`, then append it as `suggested_name` in the multipart form when trimmed content exists.

- [ ] **Step 4: Verify GREEN**

Run the Task 3 command and expect all selected tests to pass.

### Task 4: Backend name sanitization and persisted import

**Files:**
- Modify: `backend/tests/test_generation_batch.py`
- Create or modify: `backend/tests/test_image_names.py`
- Modify: `backend/app/services/image_names.py`
- Modify: `backend/app/services/image_batches.py`
- Modify: `backend/app/api/routes/generation_tasks.py`

- [ ] **Step 1: Write failing service and API tests**

Cover these exact cases:

```py
assert suggested_image_name('图片名称：@云端机甲') == '云端机甲'
assert preferred_image_name('把@假面骑士的身体和@喜羊羊的头部组合', 'chatgpt-1.png') == '把假面骑士的身体和喜羊羊的头部组合'
```

Complete a generation batch with `suggested_name='图片名称：“@草原机甲”'` and assert the stored image name is `草原机甲`. Complete another batch without the field and assert the fallback contains no `@`. Keep the existing duplicate suffix assertion.

- [ ] **Step 2: Verify RED**

Run:

```powershell
backend\.venv\Scripts\python.exe -m pytest backend\tests\test_image_names.py backend\tests\test_generation_batch.py -q
```

Expected: FAIL because suggestion cleaning and form transport are absent and fallback retains `@`.

- [ ] **Step 3: Implement sanitization and import preference**

Add a pure helper:

```py
def suggested_image_name(value: str | None) -> str | None:
    # NFKC normalize, remove fixed label, @, surrounding quotes and line breaks,
    # return at most MAX_IMAGE_NAME_LENGTH or None.
```

Update `preferred_image_name` to remove only the `@` marker while retaining mentioned names. Accept optional `suggested_name: Form(None)` in the route and pass it to `complete_task`. Choose `suggested_image_name(suggested_name) or preferred_image_name(task.prompt, item.file_name)` before existing uniqueness allocation.

- [ ] **Step 4: Verify GREEN**

Run the Task 4 command and expect all selected tests to pass.

### Task 5: Documentation, full verification, and installer refresh

**Files:**
- Modify: `docs/AI-Image-Canvas-软件说明书.md`
- Modify: `README.md`

- [ ] **Step 1: Update user documentation**

Document the distinction between Prompt “透明背景” and details “移除背景”, same-request ChatGPT naming, no-`@` fallback, and the fact that transparency still depends on ChatGPT output capability.

- [ ] **Step 2: Run full verification**

Run:

```powershell
backend\.venv\Scripts\python.exe -m pytest backend\tests -q
npm.cmd --prefix frontend test -- --run
npm.cmd --prefix frontend run build
npm.cmd --prefix desktop test -- --run
npm.cmd --prefix desktop run typecheck
npm.cmd --prefix desktop run build
npm.cmd --prefix extension test -- --run
npm.cmd --prefix extension run build
git diff --check
```

Expected: every command exits 0 and `git diff --check` reports no whitespace errors.

- [ ] **Step 3: Rebuild and smoke-test the installer**

Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-desktop.ps1`, verify the installer exists in `desktop/release-new`, start `win-unpacked/AI Image Canvas.exe`, wait for `http://127.0.0.1:8001/api/health` to return `status: ok`, then stop only processes whose executable path is inside that exact `win-unpacked` directory.
