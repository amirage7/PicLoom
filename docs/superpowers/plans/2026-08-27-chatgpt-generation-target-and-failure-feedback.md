# ChatGPT 目标项目与失败反馈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every desktop ChatGPT generation task show and preserve its destination workspace, while reporting a concrete terminal failure or refusal reason instead of remaining in a generating state.

**Architecture:** `ChatGptGenerationPanel` owns an editable destination while idle and seeds it from the open workspace. At submission, it writes the selected `projectId` into the backend request and persists it with the desktop task in `generationStore`. The desktop adapter returns a visible refusal explanation; the panel maps every terminal event into a stable status title plus a detail alert.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Testing Library, Electron.

---

## File map

- `frontend/src/features/generation/generationStore.ts` — persist the desktop task destination.
- `frontend/src/features/generation/ChatGptGenerationPanel.tsx` — target selector and terminal UI mapping.
- `frontend/src/features/generation/generation.css` — selector and terminal-state styles.
- `frontend/src/features/generation/ChatGptGenerationPanel.test.tsx` — UI behavior tests.
- `desktop/src/chatgpt/adapter.ts` — identify and explain refusal responses.
- `desktop/tests/chatgptAdapter.test.ts`, `desktop/tests/generationOrchestrator.test.ts` — adapter and event propagation tests.

### Task 1: Persist the task destination

**Files:**
- Modify: `frontend/src/features/generation/generationStore.ts`
- Test: `frontend/src/features/generation/generationStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('keeps the bound destination after the desktop task becomes terminal', () => {
  const store = createGenerationStore(provider)
  store.getState().acquireDesktopGeneration()
  store.getState().bindDesktopTask('task-1', 'project-a')
  store.getState().handleDesktopGenerationEvent({
    taskId: 'task-1', state: 'completed', message: '已导入', imageIds: ['image-1'], recoverable: false,
  })
  expect(store.getState().desktopTaskProjectId).toBe('project-a')
})
```

- [ ] **Step 2: Verify RED**

Run: `npm run test:run -- --run frontend/src/features/generation/generationStore.test.ts`

Expected: FAIL because `desktopTaskProjectId` and the second `bindDesktopTask` argument do not exist.

- [ ] **Step 3: Implement the minimal state**

```ts
// GenerationState
desktopTaskProjectId: string | null
bindDesktopTask(taskId: string, projectId: string | null): void

desktopTaskProjectId: null,
bindDesktopTask: (desktopTaskId, desktopTaskProjectId) => set({
  desktopBusy: true, desktopTaskId, desktopRecoverableTaskId: null, desktopTaskProjectId,
}),
```

Keep the destination after terminal events so the just-finished task remains attributable. Clear it only when a new attempt begins or startup itself is released.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:run -- --run frontend/src/features/generation/generationStore.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/generation/generationStore.ts frontend/src/features/generation/generationStore.test.ts
git commit -m "feat: retain desktop generation destination"
```

### Task 2: Select and snapshot the destination at submission

**Files:**
- Modify: `frontend/src/features/generation/ChatGptGenerationPanel.tsx`
- Modify: `frontend/src/features/generation/generation.css`
- Test: `frontend/src/features/generation/ChatGptGenerationPanel.test.tsx`

- [ ] **Step 1: Write failing UI tests**

```tsx
it('submits the selected destination rather than the active workspace', async () => {
  const user = userEvent.setup()
  const bridge = installBridge()
  useAppStore.setState({
    projects: [
      { id: 'a', name: '角色创作', createdTime: '', imageCount: 0 },
      { id: 'b', name: '项目 logo', createdTime: '', imageCount: 0 },
    ],
    activeProjectId: 'a', workspaceMode: 'project',
  })
  render(<ChatGptGenerationPanel projectId="a" />)
  await user.selectOptions(screen.getByRole('combobox', { name: '保存到项目' }), 'b')
  await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '一朵花')
  await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))
  await waitFor(() => expect(api.createGenerationTask).toHaveBeenCalledWith('b', '一朵花', undefined))
  expect(bridge.startGeneration).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'b' }))
})
```

Add a test for the empty-value `快速创作（未归档图片）` option expecting both calls to receive `null`. Add a test that starts for project `a`, rerenders with `projectId="b"`, and sees a disabled selector still displaying `角色创作`.

- [ ] **Step 2: Verify RED**

Run: `npm run test:run -- --run frontend/src/features/generation/ChatGptGenerationPanel.test.tsx`

Expected: FAIL because the combobox does not exist and submission uses the current panel prop.

- [ ] **Step 3: Implement the native selector**

```tsx
const projects = useAppStore((state) => state.projects)
const desktopTaskProjectId = useGenerationStore((state) => state.desktopTaskProjectId)
const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectId)
const taskDestinationLocked = pending && taskId !== null
const taskProjectId = taskDestinationLocked ? desktopTaskProjectId : selectedProjectId

<label className="desktop-generation-destination">
  <span>保存到项目</span>
  <select aria-label="保存到项目" value={taskProjectId ?? ''} disabled={taskDestinationLocked}
    onChange={(event) => setSelectedProjectId(event.target.value || null)}>
    <option value="">快速创作（未归档图片）</option>
    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
  </select>
</label>
```

Seed the selection only on component mount. Use `taskProjectId` for image scope, `createGenerationTask`, `bindDesktopTask(nextTaskId, taskProjectId)`, and `bridge.startGeneration`. Show `结果将保存到：{name}` while locked. Add compact token-based CSS with native focus and disabled states—do not use a custom absolute dropdown.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:run -- --run frontend/src/features/generation/ChatGptGenerationPanel.test.tsx`

Expected: PASS including existing mention, retry, and one-click tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/generation/ChatGptGenerationPanel.tsx frontend/src/features/generation/generation.css frontend/src/features/generation/ChatGptGenerationPanel.test.tsx
git commit -m "feat: choose ChatGPT generation destination"
```

### Task 3: Return the visible refusal explanation

**Files:**
- Modify: `desktop/src/chatgpt/adapter.ts`
- Test: `desktop/tests/chatgptAdapter.test.ts`
- Test: `desktop/tests/generationOrchestrator.test.ts`

- [ ] **Step 1: Write failing adapter and orchestration tests**

```ts
it('returns visible assistant refusal text for a new rejected response', () => {
  expect(inspectFixtureHtml(rejectedHtml, ['old-response'])).toEqual({
    kind: 'refused', reason: '抱歉，我无法根据这个请求生成图片。',
  })
})

it('emits the specific refusal reason', async () => {
  const test = harness([{ kind: 'ready' }, {
    kind: 'refused', reason: '抱歉，我无法根据这个请求生成图片。',
  }])
  await test.orchestrator.start(REQUEST)
  expect(test.events.at(-1)).toMatchObject({
    state: 'refused', message: '抱歉，我无法根据这个请求生成图片。',
  })
})
```

- [ ] **Step 2: Verify RED**

Run: `npm run test -- --run tests/chatgptAdapter.test.ts tests/generationOrchestrator.test.ts`

Working directory: `desktop`

Expected: FAIL because the adapter returns the generic refusal text.

- [ ] **Step 3: Normalize the visible refusal reason**

```ts
function refusalReason(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.slice(0, 240) || 'ChatGPT 未生成图片，可能因内容限制或请求未完成。'
}
```

For metadata or known refusal phrases, use this helper with `fixtureText(latestArticle.body)` and `latestResponse.innerText`. The existing orchestrator already sends its `PageState.reason` in the refused transition.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test -- --run tests/chatgptAdapter.test.ts tests/generationOrchestrator.test.ts`

Working directory: `desktop`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/chatgpt/adapter.ts desktop/tests/chatgptAdapter.test.ts desktop/tests/generationOrchestrator.test.ts
git commit -m "fix: surface ChatGPT generation refusals"
```

### Task 4: Render every terminal event as terminal feedback

**Files:**
- Modify: `frontend/src/features/generation/ChatGptGenerationPanel.tsx`
- Modify: `frontend/src/features/generation/generation.css`
- Test: `frontend/src/features/generation/ChatGptGenerationPanel.test.tsx`

- [ ] **Step 1: Write failing terminal-feedback tests**

```tsx
it.each([
  ['refused', '生成被 ChatGPT 拒绝', '抱歉，我无法根据这个请求生成图片。'],
  ['failed', '生成失败', '下载图片失败'],
  ['rate_limited', '生成受限', '当前额度不足'],
  ['cancelled', '生成已取消', '任务已取消'],
] as const)('shows %s as terminal feedback', (state, title, message) => {
  // Emit the event through the installed bridge listener.
  // Assert role=status has title, not “正在生成”, and role=alert has message.
})
```

Also add `page_changed` with a recoverable retry assertion.

- [ ] **Step 2: Verify RED**

Run: `npm run test:run -- --run frontend/src/features/generation/ChatGptGenerationPanel.test.tsx`

Expected: FAIL because the panel uses raw event messages and has no cancellation alert/status mapping.

- [ ] **Step 3: Implement the terminal mapping**

```ts
const terminalPresentation = (event: DesktopGenerationEvent) => {
  if (event.state === 'refused') return { title: '生成被 ChatGPT 拒绝', detail: event.message, tone: 'error' }
  if (event.state === 'rate_limited') return { title: '生成受限', detail: event.message, tone: 'error' }
  if (event.state === 'failed') return { title: '生成失败', detail: event.message, tone: 'error' }
  if (event.state === 'page_changed') return { title: '需要重新连接', detail: event.message, tone: 'error' }
  if (event.state === 'cancelled') return { title: '生成已取消', detail: event.message, tone: 'neutral' }
  return null
}
```

Render the title in `role="status"`. Error tones render their detail in `role="alert"` with existing danger tokens; cancellation is neutral terminal copy with no in-progress dot. Preserve recoverable retry controls.

- [ ] **Step 4: Verify GREEN and build**

Run: `npm run test:run -- --run frontend/src/features/generation/ChatGptGenerationPanel.test.tsx && npm run build`

Working directory: `frontend`

Expected: PASS and build exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/generation/ChatGptGenerationPanel.tsx frontend/src/features/generation/generation.css frontend/src/features/generation/ChatGptGenerationPanel.test.tsx
git commit -m "fix: show terminal generation failures"
```

### Task 5: Verify the quick-creation contract

**Files:**
- Test: `desktop/tests/generationOrchestrator.test.ts`
- Test: `frontend/src/features/generation/ChatGptGenerationPanel.test.tsx`

- [ ] **Step 1: Add the null-destination regression**

```ts
it('imports a quick-creation request without assigning a project', async () => {
  const test = harness([{ kind: 'ready' }, {
    kind: 'completed', images: [{ src: 'blob:first', alt: '' }],
  }])
  await test.orchestrator.start({ ...REQUEST, projectId: null })
  expect(test.completeBatch).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }))
})
```

- [ ] **Step 2: Run full affected verification**

Run: `npm run test:run && npm run build`

Working directory: `frontend`

Run: `npm run test -- --run && npm run typecheck`

Working directory: `desktop`

Expected: all suites pass with no TypeScript errors.

- [ ] **Step 3: Commit regression coverage**

```bash
git add frontend/src/features/generation/ChatGptGenerationPanel.test.tsx desktop/tests/generationOrchestrator.test.ts
git commit -m "test: cover ChatGPT generation destinations"
```

## Self-review

- Spec coverage: Tasks 1–2 cover projects, quick creation, locked target display, and matching import input; Task 3 provides specific refusal reason; Task 4 covers every terminal state; Task 5 verifies the null target over the desktop boundary.
- Placeholder scan: no TODO, TBD, or unspecified error handling remains.
- Type consistency: `desktopTaskProjectId` is introduced before use and all callers use `bindDesktopTask(taskId, projectId)`.
