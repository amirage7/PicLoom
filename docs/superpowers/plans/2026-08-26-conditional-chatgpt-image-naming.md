# Conditional ChatGPT Image Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably name generated images by asking the current ChatGPT conversation only when the image-generation reply omits a name, with a safe local fallback.

**Architecture:** Add a focused desktop naming adapter that submits one text-only naming prompt and polls only Assistant replies created after that submission boundary. Inject it into the existing generation orchestrator after image bytes are collected; failure returns `undefined` and never blocks import. Tighten the backend fallback so numeric and operation-only prompts cannot become image names.

**Tech Stack:** Electron, TypeScript, Vitest, Python, FastAPI service layer, unittest

---

### Task 1: ChatGPT naming reply adapter

**Files:**
- Create: `desktop/src/chatgpt/imageNaming.ts`
- Create: `desktop/tests/imageNaming.test.ts`

- [ ] **Step 1: Write failing tests for conditional naming reply extraction**

Test that `requestChatGptImageName` submits exactly one prompt, ignores Assistant IDs from the receipt boundary, accepts only `图片名称：...`, returns `undefined` on timeout, and aborts when the task signal is cancelled. Use fake `executeJavaScript`, `submit`, `wait`, and `now` dependencies so no real ChatGPT page is required.

```ts
expect(submit).toHaveBeenCalledOnce()
expect(result).toBe('透明机甲')
expect(submit.mock.calls[0]?.[1]).toContain('不得生成或修改图片')
```

- [ ] **Step 2: Run the naming tests and verify RED**

Run: `npm.cmd test -- --run tests/imageNaming.test.ts`

Expected: FAIL because `chatgpt/imageNaming.ts` does not exist.

- [ ] **Step 3: Implement the focused naming adapter**

Export:

```ts
export const IMAGE_NAMING_PROMPT =
  '请只为你刚刚生成的最终图片拟定一个 2–12 个字符的简短中文名称。严格只回复“图片名称：名称”，不得生成或修改图片。'

export async function requestChatGptImageName(
  webContents: NamingWebContents,
  signal: AbortSignal,
  dependencies: NamingDependencies = defaultDependencies,
): Promise<string | undefined>
```

The adapter must call existing `submitPrompt`, inspect only new Assistant replies, poll for at most 30 seconds, return the single-line value following `图片名称：`, and return `undefined` for page changes, refusals, submission errors, or timeout. Abort errors must propagate.

- [ ] **Step 4: Run the naming tests and verify GREEN**

Run: `npm.cmd test -- --run tests/imageNaming.test.ts`

Expected: all tests PASS.

### Task 2: Conditional orchestration after image collection

**Files:**
- Modify: `desktop/src/generationOrchestrator.ts`
- Modify: `desktop/src/main.ts`
- Modify: `desktop/tests/generationOrchestrator.test.ts`

- [ ] **Step 1: Write failing orchestrator tests**

Add an injectable dependency:

```ts
requestSuggestedName?(webContents: AutomationWebContents, signal: AbortSignal): Promise<string | undefined>
```

Tests must prove:

```ts
// Main reply already named: no follow-up.
expect(requestSuggestedName).not.toHaveBeenCalled()

// Main reply unnamed: exactly one follow-up and forwarded result.
expect(requestSuggestedName).toHaveBeenCalledOnce()
expect(completeBatch).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: '透明机甲' }))

// Follow-up failure: import still completes without suggestedName.
expect(events.at(-1)?.state).toBe('completed')
```

- [ ] **Step 2: Run orchestrator tests and verify RED**

Run: `npm.cmd test -- --run tests/generationOrchestrator.test.ts`

Expected: FAIL because the orchestrator does not call `requestSuggestedName`.

- [ ] **Step 3: Implement conditional naming in `collectAndImport`**

After collecting the final image bytes and before `completeBatch`:

```ts
let resolvedName = suggestedName
if (!resolvedName && this.options.requestSuggestedName) {
  await this.transition(task, 'collecting', {
    message: '图片已生成，正在请 ChatGPT 命名。',
  })
  resolvedName = await this.options.requestSuggestedName(
    this.options.view.getWebContents(),
    signal,
  ).catch((error) => {
    if (signal.aborted) throw error
    return undefined
  })
}
```

Pass `resolvedName` to `completeBatch` only when non-empty. In `desktop/src/main.ts`, inject `requestChatGptImageName` using the existing ChatGPT WebContents.

- [ ] **Step 4: Run orchestrator and naming tests and verify GREEN**

Run: `npm.cmd test -- --run tests/generationOrchestrator.test.ts tests/imageNaming.test.ts`

Expected: all tests PASS.

### Task 3: Safe backend fallback names

**Files:**
- Modify: `backend/app/services/image_names.py`
- Modify: `backend/tests/test_image_names.py`

- [ ] **Step 1: Write failing fallback tests**

```py
def test_numeric_mention_does_not_become_the_image_name():
    assert preferred_image_name('@1', 'chatgpt-1.png') == '未命名图片'

def test_background_removal_template_does_not_become_the_image_name():
    prompt = '@1 移除此图像的背景。保持所有前景主体不变且完整无损。'
    assert preferred_image_name(prompt, 'chatgpt-1.png') == '未命名图片'
```

- [ ] **Step 2: Run tests and verify RED**

Run: `.venv\Scripts\python.exe -m unittest tests.test_image_names -v`

Expected: FAIL with the old numeric/template-derived names.

- [ ] **Step 3: Implement minimal fallback filtering**

Normalize and strip `@`, then reject candidates that are only digits or begin with known editing templates (`移除背景`, `移除此图像的背景`, `去除背景`, `将背景设为透明`). Return `未命名图片` for those cases; preserve meaningful generation prompts and the existing 80-character limit.

- [ ] **Step 4: Run backend naming tests and verify GREEN**

Run: `.venv\Scripts\python.exe -m unittest tests.test_image_names -v`

Expected: all tests PASS.

### Task 4: Full verification and refreshed package

**Files:**
- Modify generated package under: `desktop/release-new/`

- [ ] **Step 1: Run complete desktop verification**

Run:

```powershell
cd desktop
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build
```

Expected: zero failed tests and exit code 0 for typecheck/build.

- [ ] **Step 2: Run backend verification**

Run: `.venv\Scripts\python.exe -m unittest discover -s tests -v`

Expected: zero failed tests.

- [ ] **Step 3: Rebuild the Windows installer**

Run: `npm.cmd run package` from `desktop/` after ensuring the current frontend and backend production artifacts exist.

Expected installer: `desktop/release-new/AI Image Canvas-Setup-0.2.0.exe`.

- [ ] **Step 4: Verify packaged adapter and compute checksum**

Confirm `resources/app.asar` contains the new naming prompt/module marker, then run `Get-FileHash -Algorithm SHA256` on the installer and report the new checksum.
