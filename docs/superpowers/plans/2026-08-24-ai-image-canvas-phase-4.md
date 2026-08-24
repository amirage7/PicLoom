# AI Image Canvas Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the persisted image workspace responsive, keyboard-operable, accessible, and visually consistent across desktop, laptop, and narrow browser widths.

**Architecture:** Keep Zustand as the panel source of truth and add a focused responsive-panel hook that derives compact layout from `matchMedia`, enforces one open overlay, handles Escape, and restores trigger focus. Keep canvas shortcuts in a separate hook so panel behavior and React Flow behavior remain independently testable. CSS uses the existing OKLCH token system and breakpoint attributes rather than JavaScript measurements.

**Tech Stack:** React 19, TypeScript 5.7, Zustand 5, React Flow 12, Tailwind CSS 4, Testing Library, Vitest

---

## File map

- `frontend/src/app/useResponsivePanels.ts`: compact-layout media query, mutual exclusion, Escape dismissal, and trigger focus restoration.
- `frontend/src/app/useResponsivePanels.test.tsx`: hook behavior through a small semantic harness.
- `frontend/src/app/App.tsx`: accessible drawer IDs, close controls, backdrop, and panel state attributes.
- `frontend/src/app/App.test.tsx`: accessible panel toggles, compact overlay behavior, and Escape restoration.
- `frontend/src/features/canvas/useCanvasShortcuts.ts`: global non-editable keyboard routing for tools, selection, and fit view.
- `frontend/src/features/canvas/useCanvasShortcuts.test.tsx`: shortcut routing and editable-target suppression.
- `frontend/src/features/canvas/CanvasBoard.tsx`: bind shortcut hook and expose fit-view callback.
- `frontend/src/features/projects/ProjectListPersisted.tsx`: keyboard-safe menu state and clearer form actions.
- `frontend/src/features/prompts/PromptLibraryPersisted.tsx`: compact action group and empty state.
- `frontend/src/index.css`: responsive shell, overlay drawers, backdrop, focus, status, and management styles.
- `frontend/src/management.css`: removed after its rules are consolidated.

### Task 1: Responsive panel controller

**Files:**
- Create: `frontend/src/app/useResponsivePanels.ts`
- Create: `frontend/src/app/useResponsivePanels.test.tsx`
- Modify: `frontend/src/app/store.ts`

- [ ] **Step 1: Write the failing hook tests**

Create a harness that sets a mocked `(max-width: 1179px)` media query, opens navigation, then opens inspector and asserts navigation closes. Press Escape and assert inspector closes and focus returns to the inspector trigger. Add a wide-screen case that allows both panels to remain open.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- --run src/app/useResponsivePanels.test.tsx`

Expected: import fails because `useResponsivePanels` does not exist.

- [ ] **Step 3: Implement explicit panel actions and the hook**

Add `setLeftPanelOpen(value)` and `setRightPanelOpen(value)` to the app store. The hook listens to `matchMedia('(max-width: 1179px)')`, exposes `isCompact`, `openLeft(trigger)`, `openRight(trigger)`, `closePanels()`, and stores the last trigger in a ref. Compact open actions close the opposite panel; Escape closes and restores focus on the next animation frame.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- --run src/app/useResponsivePanels.test.tsx src/app/store.test.ts`

Expected: all selected tests pass without React act warnings.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app
git commit -m "feat: add responsive panel controller"
```

### Task 2: Accessible overlay shell

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/App.test.tsx`
- Modify: `frontend/src/features/canvas/CanvasBoard.tsx`

- [ ] **Step 1: Write failing shell tests**

Mock compact media. Assert panel toggle buttons expose `aria-expanded`, navigation and inspector use stable IDs, opening inspector closes navigation, clicking the backdrop closes the open drawer, and Escape returns focus to the initiating toggle.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- --run src/app/App.test.tsx`

Expected: assertions fail because IDs, expanded state, backdrop, and focus restoration are absent.

- [ ] **Step 3: Wire the controller into the shell**

Give navigation `id="workspace-navigation"` and inspector `id="image-inspector"`. Add internal close icon buttons visible only in compact layout. Render one semantic backdrop button while a compact panel is open. Pass controlled toggle callbacks and expanded state into `CanvasBoard`; do not unmount the canvas.

- [ ] **Step 4: Run GREEN and regressions**

Run: `npm.cmd test -- --run src/app/App.test.tsx src/features/inspector src/features/projects src/features/prompts`

Expected: all selected suites pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app frontend/src/features/canvas/CanvasBoard.tsx
git commit -m "feat: add accessible responsive drawers"
```

### Task 3: Global canvas shortcuts

**Files:**
- Create: `frontend/src/features/canvas/useCanvasShortcuts.ts`
- Create: `frontend/src/features/canvas/useCanvasShortcuts.test.tsx`
- Modify: `frontend/src/features/canvas/CanvasBoard.tsx`

- [ ] **Step 1: Write failing shortcut tests**

Render a hook harness and dispatch keys to `window`. Assert `v` selects, `h` pans, `0` fits content, Escape clears selection, and shortcuts do nothing when the target is an input, textarea, select, button, or contenteditable element. Assert modifier-key combinations are ignored.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- --run src/features/canvas/useCanvasShortcuts.test.tsx`

Expected: import fails because the hook does not exist.

- [ ] **Step 3: Implement and bind shortcuts**

The hook receives callbacks rather than importing stores. Register one `keydown` listener, normalize single-character keys, ignore `ctrlKey`, `metaKey`, and `altKey`, and call `preventDefault()` only for handled shortcuts. `CanvasBoard` supplies store callbacks and React Flow `fitView`.

- [ ] **Step 4: Run GREEN**

Run: `npm.cmd test -- --run src/features/canvas/useCanvasShortcuts.test.tsx src/features/canvas`

Expected: all canvas tests pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/features/canvas
git commit -m "feat: add canvas keyboard shortcuts"
```

### Task 4: Product UI refinement and release verification

**Files:**
- Modify: `frontend/src/features/projects/ProjectListPersisted.tsx`
- Modify: `frontend/src/features/projects/ProjectList.test.tsx`
- Modify: `frontend/src/features/prompts/PromptLibraryPersisted.tsx`
- Modify: `frontend/src/features/prompts/PromptLibrary.test.tsx`
- Modify: `frontend/src/components/SaveStatus.tsx`
- Modify: `frontend/src/index.css`
- Delete: `frontend/src/management.css`
- Delete: `frontend/src/features/projects/ProjectList.tsx`
- Delete: `frontend/src/features/prompts/PromptLibrary.tsx`
- Delete: `frontend/src/features/canvas/CanvasWorkspace.tsx`
- Delete: `frontend/src/features/inspector/InspectorPanel.tsx`
- Modify: `README.md`

- [ ] **Step 1: Write failing management and status tests**

Add tests that empty projects/prompts render an instructive action, project menus close on Escape, form cancel restores focus, and SaveStatus uses a polite atomic live region. Verify every icon-only action retains an accessible name.

- [ ] **Step 2: Run RED**

Run: `npm.cmd test -- --run src/features/projects src/features/prompts src/components/SaveStatus.test.tsx`

Expected: empty-state, focus, and live-region assertions fail.

- [ ] **Step 3: Implement focused behavior**

Use inline empty states, explicit primary/secondary form button classes, `aria-live="polite"`, and Escape handlers scoped to open menus/forms. Keep destructive confirmation inline. Remove obsolete placeholders after `rg` confirms no imports.

- [ ] **Step 4: Consolidate and refine CSS**

Move management rules into `index.css`. Add drawer/backdrop rules at 1179 px and 759 px, consistent form states, visible disabled styles, prompt action containment, `:focus-visible`, overflow-safe header rules, and reduced-motion overrides. Do not add gradients, blur, wide card shadows, or radii above 12 px.

- [ ] **Step 5: Update README and run verification**

Document responsive drawers and shortcuts. Run:

```powershell
npm.cmd test -- --run
npm.cmd run build
npm.cmd audit --omit=dev
```

Expected: all tests pass, build exits 0, and audit reports zero vulnerabilities.

- [ ] **Step 6: Browser-width smoke**

Start the app and verify 1440, 1024, and 390 px widths. At each width, confirm the canvas remains visible, panels are reachable and dismissible, focus is visible, and `document.documentElement.scrollWidth === window.innerWidth`.

- [ ] **Step 7: Commit**

```powershell
git add README.md frontend/src
git commit -m "feat: polish responsive image workspace"
```

## Completion checklist

- [ ] Compact panel controls remain functional rather than hiding unreachable content.
- [ ] Overlay drawers are mutually exclusive and restore focus after dismissal.
- [ ] Canvas shortcuts work globally and never fire while editing text.
- [ ] Empty, loading, saving, offline, error, and destructive states remain understandable without color alone.
- [ ] No obsolete Phase 1 component is imported or retained.
- [ ] Tests, production build, dependency audit, and three-width smoke verification pass.
