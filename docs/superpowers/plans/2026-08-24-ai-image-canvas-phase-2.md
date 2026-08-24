# AI Image Canvas Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static canvas shell with a real React Flow image canvas supporting session uploads, node relationships, selection, duplication, deletion, and inspector details.

**Architecture:** Keep React Flow as the viewport and interaction engine while a feature-scoped Zustand store owns project-isolated nodes, edges, selections, validation errors, and object URL lifetimes. Custom image nodes and the inspector consume stable `CanvasImage` domain data rather than React Flow internals.

**Tech Stack:** React 19, TypeScript, Zustand 5, `@xyflow/react` 12.11.3, Vitest, Testing Library, Tailwind CSS 4

---

### Task 1: React Flow dependency and canvas domain utilities

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/src/types/domain.ts`
- Create: `frontend/src/features/canvas/model/files.ts`
- Create: `frontend/src/features/canvas/model/files.test.ts`

- [ ] **Step 1: Install React Flow**

Run: `npm install @xyflow/react@12.11.3`
Expected: package and lockfile update, audit reports zero vulnerabilities.

- [ ] **Step 2: Write failing upload validation tests**

```ts
import { describe, expect, it } from 'vitest'
import { validateImageFiles } from './files'

describe('validateImageFiles', () => {
  it('accepts png, jpeg, and webp files', () => {
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
      new File(['c'], 'c.webp', { type: 'image/webp' }),
    ]
    expect(validateImageFiles(files)).toEqual({ valid: files, errors: [] })
  })

  it('rejects unsupported and oversized files', () => {
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' })
    const large = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })
    const result = validateImageFiles([text, large])
    expect(result.valid).toEqual([])
    expect(result.errors).toEqual([
      'notes.txt：仅支持 PNG、JPG 和 WEBP',
      'large.png：文件不能超过 20MB',
    ])
  })
})
```

- [ ] **Step 3: Run the tests and confirm RED**

Run: `npm run test:run -- src/features/canvas/model/files.test.ts`
Expected: FAIL because `files.ts` does not exist.

- [ ] **Step 4: Define canvas types and validation**

Add `CanvasImage`, `CanvasNodeData`, `ProjectCanvasState`, and `CanvasTool` to `domain.ts`. Implement `validateImageFiles(files)` with `ALLOWED_IMAGE_TYPES`, `MAX_IMAGE_BYTES = 20 * 1024 * 1024`, and `MAX_UPLOAD_FILES = 20`; preserve valid file order and return explicit filename-prefixed errors.

- [ ] **Step 5: Run the tests and confirm GREEN**

Run: `npm run test:run -- src/features/canvas/model/files.test.ts`
Expected: all file validation tests pass.

### Task 2: Project-isolated canvas store

**Files:**
- Create: `frontend/src/features/canvas/store/fixtures.ts`
- Create: `frontend/src/features/canvas/store/canvasStore.ts`
- Create: `frontend/src/features/canvas/store/canvasStore.test.ts`

- [ ] **Step 1: Write failing store behavior tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from './canvasStore'

describe('canvas store', () => {
  beforeEach(() => useCanvasStore.getState().reset())

  it('keeps project canvases isolated', () => {
    useCanvasStore.getState().duplicateNode('future-city', 'city-overview')
    expect(useCanvasStore.getState().canvases['future-city'].nodes).toHaveLength(4)
    expect(useCanvasStore.getState().canvases['product-concepts'].nodes).toHaveLength(0)
  })

  it('duplicates a node with an offset and no new relationship', () => {
    const id = useCanvasStore.getState().duplicateNode('future-city', 'city-overview')
    const node = useCanvasStore.getState().canvases['future-city'].nodes.find((item) => item.id === id)
    expect(node?.position).toEqual({ x: 100, y: 100 })
    expect(node?.data.image.parentId).toBeNull()
  })

  it('replaces a child incoming relationship', () => {
    useCanvasStore.getState().connectNodes('future-city', { source: 'city-overview', target: 'transit-hub' })
    const canvas = useCanvasStore.getState().canvases['future-city']
    expect(canvas.edges.filter((edge) => edge.target === 'transit-hub')).toHaveLength(1)
    expect(canvas.nodes.find((node) => node.id === 'transit-hub')?.data.image.parentId).toBe('city-overview')
  })

  it('deletes a node and all connected edges', () => {
    useCanvasStore.getState().deleteNode('future-city', 'street-level')
    const canvas = useCanvasStore.getState().canvases['future-city']
    expect(canvas.nodes.some((node) => node.id === 'street-level')).toBe(false)
    expect(canvas.edges.some((edge) => edge.source === 'street-level' || edge.target === 'street-level')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm run test:run -- src/features/canvas/store/canvasStore.test.ts`
Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement stable fixture factories**

Create fixture nodes `city-overview`, `street-level`, and `transit-hub` at `{40,40}`, `{340,190}`, and `{640,350}` with `1 → 2 → 3` edges. Other projects receive empty arrays. Use functions that return fresh arrays so reset never shares mutable references.

- [ ] **Step 4: Implement store actions**

Use `applyNodeChanges` and `applyEdgeChanges` from React Flow. Enforce one incoming edge, reject self/duplicate/missing-node connections, synchronize `parentId`, offset copies by `{60,60}`, preserve project isolation, and expose selection, error, tool, and reset actions. Generate IDs with `crypto.randomUUID()` and allow tests to stub it.

- [ ] **Step 5: Implement object URL reference tracking**

Maintain a module-level `Map<string, number>` for uploaded URLs. Adding or copying increments; deleting decrements and calls `URL.revokeObjectURL` only at zero. Export `releaseAllObjectUrls()` for App cleanup and `resetObjectUrlRegistry()` for tests.

- [ ] **Step 6: Run store tests and confirm GREEN**

Run: `npm run test:run -- src/features/canvas/store/canvasStore.test.ts`
Expected: project isolation, connection, duplicate, deletion, upload and URL release tests pass.

### Task 3: Offline demo image assets

**Files:**
- Create: `frontend/src/assets/demo/city-overview.webp`
- Create: `frontend/src/assets/demo/street-level.webp`
- Create: `frontend/src/assets/demo/transit-hub.webp`
- Modify: `frontend/src/features/canvas/store/fixtures.ts`

- [ ] **Step 1: Generate one coherent three-image concept set**

Use the image generation skill to create three 4:3 raster images with the shared direction: “restrained near-future coastal city concept art, architectural visualization, graphite concrete, diffuse overcast daylight, teal transit details, no text, no logos.” Views: aerial overview, pedestrian street scale, and compact transit interchange.

- [ ] **Step 2: Convert and place optimized assets**

Store each image as WebP, target 1200×900 and under 300KB when practical. Reference them through static ESM imports in `fixtures.ts`, never remote URLs.

- [ ] **Step 3: Verify asset metadata**

Run a local image inspection command and confirm all three files are WebP, 4:3, readable, and committed under `frontend/src/assets/demo/`.

### Task 4: Custom image node and React Flow workspace

**Files:**
- Create: `frontend/src/features/canvas/components/ImageNode.tsx`
- Create: `frontend/src/features/canvas/components/ImageNode.test.tsx`
- Create: `frontend/src/features/canvas/components/CanvasError.tsx`
- Create: `frontend/src/features/canvas/components/CanvasControls.tsx`
- Rewrite: `frontend/src/features/canvas/CanvasWorkspace.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Write the failing node component test**

Render `ImageNode` under `ReactFlowProvider` with fixture data and assert the image alt text, two-line prompt, formatted time, source/target handles, duplicate label, and delete label are present.

- [ ] **Step 2: Run the node test and confirm RED**

Run: `npm run test:run -- src/features/canvas/components/ImageNode.test.tsx`
Expected: FAIL because `ImageNode.tsx` does not exist.

- [ ] **Step 3: Implement the image node**

Build a 236px semantic node with 4:3 preview, image fallback, prompt summary, creation time, left target handle, right source handle, and focus-visible actions. Duplicate calls the store immediately. Delete toggles an inline confirmation row; confirm deletes, cancel restores actions.

- [ ] **Step 4: Implement the React Flow canvas**

Wrap with `ReactFlowProvider`; provide `nodeTypes={{ image: ImageNode }}`, project nodes/edges, `onNodesChange`, `onEdgesChange`, `onConnect`, selection synchronization, `minZoom={0.2}`, `maxZoom={2}`, `fitView`, and a styled dotted `<Background />`. Use `screenToFlowPosition` for drops.

- [ ] **Step 5: Implement real toolbar and viewport controls**

Wire select/pan tool state to `panOnDrag` and `nodesDraggable`. Upload uses a visually hidden multi-file input. Fit view, zoom in, zoom out, and 100% reset call the React Flow instance. Display zoom from `useViewport()` rounded to a percentage.

- [ ] **Step 6: Implement empty and error states**

Only render the upload empty state when current project nodes are empty. Render a dismissible canvas error for invalid files. Make the entire pane a drop target with a visible drag-over affordance.

- [ ] **Step 7: Run component and existing app tests**

Run: `npm run test:run -- src/features/canvas/components/ImageNode.test.tsx src/app/App.test.tsx`
Expected: all tests pass without React act warnings.

### Task 5: Selection-driven inspector

**Files:**
- Rewrite: `frontend/src/features/inspector/InspectorPanel.tsx`
- Create: `frontend/src/features/inspector/InspectorPanel.test.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/App.test.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Write failing inspector tests**

Render the inspector after selecting `street-level`; assert preview alt text, full Prompt, filename, created time, tags, and parent label appear. Assert clicking copy Prompt calls `navigator.clipboard.writeText` with the exact Prompt. Assert duplicate and delete call their store actions.

- [ ] **Step 2: Run inspector tests and confirm RED**

Run: `npm run test:run -- src/features/inspector/InspectorPanel.test.tsx`
Expected: FAIL because the current inspector has no selected-node state.

- [ ] **Step 3: Implement selected and empty inspector states**

Read `activeProjectId` from app state and selected node from canvas state. Render the existing empty state when none is selected. Render image, Prompt, filename, time, tags, parent title, clipboard feedback, duplicate, and inline-confirm delete when selected.

- [ ] **Step 4: Release uploaded URLs at application cleanup**

Call `releaseAllObjectUrls()` from an App-level effect cleanup. Do not reset canvas data during re-render or project switching.

- [ ] **Step 5: Run inspector and app tests**

Run: `npm run test:run -- src/features/inspector/InspectorPanel.test.tsx src/app/App.test.tsx`
Expected: all inspector and shell tests pass.

### Task 6: Integration verification and handoff

**Files:**
- Modify: `README.md`
- Modify: `DESIGN.md`

- [ ] **Step 1: Update documentation**

Document Phase 2 controls, supported upload formats, 20MB/20-file limits, session-only lifetime, and keyboard deletion. Extend DESIGN.md with React Flow node, edge, selection, drag-over, and inline confirmation states.

- [ ] **Step 2: Run full frontend tests**

Run: `npm run test:run`
Expected: every Vitest suite passes with zero failures.

- [ ] **Step 3: Build production frontend**

Run: `npm run build`
Expected: TypeScript and Vite exit 0 and bundle local WebP fixtures.

- [ ] **Step 4: Run dependency audit**

Run: `npm audit --audit-level=moderate`
Expected: zero vulnerabilities.

- [ ] **Step 5: Run backend regression tests**

Run from `backend`: `.\.venv\Scripts\python.exe -m pytest -v`
Expected: the health endpoint test passes unchanged.

- [ ] **Step 6: Run local interaction smoke test**

Start the frontend and backend, then verify project switching, node drag, pan, wheel zoom, controls, upload, connection replacement, selection details, duplicate, delete, and empty state in the browser. Confirm no console errors and no document-level horizontal overflow at 1440px, 1100px, and 760px widths.
