# AI Image Canvas Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally runnable React and FastAPI foundation with a polished three-column AI image workspace shell.

**Architecture:** Use a frontend/backend monorepo with feature-oriented React modules and a versioned FastAPI route layer. Keep Phase 1 state in Zustand demo fixtures while exposing a real backend health endpoint through Vite's `/api` proxy.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, Vitest, Testing Library, FastAPI, pytest

---

### Task 1: Repository foundation

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `scripts/start-dev.ps1`
- Create: `data/images/.gitkeep`

- [ ] **Step 1: Add repository ignores and persistent directory placeholders**

Ignore `node_modules`, `dist`, Python caches, virtual environments, `.env`, SQLite runtime files, and uploaded image files while retaining `data/images/.gitkeep`.

- [ ] **Step 2: Add the development launcher**

Create `scripts/start-dev.ps1` that validates `frontend/node_modules` and `backend/.venv`, starts `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` in `backend`, starts `npm run dev -- --host 127.0.0.1 --port 3000` in `frontend`, and stops both child processes when the script exits.

- [ ] **Step 3: Document setup and startup**

Document Node 20+, Python 3.11+, frontend installation, backend virtual environment setup, individual commands, unified PowerShell startup, and URLs `http://127.0.0.1:3000` and `http://127.0.0.1:8000/api/health`.

- [ ] **Step 4: Verify paths**

Run: `Get-ChildItem -Recurse -Depth 2 | Select-Object FullName`
Expected: root documentation, script, data, frontend, and backend paths are present.

### Task 2: FastAPI health service

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/router.py`
- Create: `backend/app/api/routes/__init__.py`
- Create: `backend/app/api/routes/health.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/services/__init__.py`
- Create: `backend/tests/test_health.py`

- [ ] **Step 1: Write the failing health test**

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "app": "AI Image Canvas"}
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `python -m pytest tests/test_health.py -v`
Expected: FAIL because `app.main` does not exist.

- [ ] **Step 3: Implement configuration, route, and app factory**

Define immutable settings with app name `AI Image Canvas` and local CORS origins. Define `GET /health` on a child router, include it under `/api`, and create the FastAPI application through `create_app()` so tests and future services share the same construction path.

- [ ] **Step 4: Run backend tests**

Run: `python -m pytest tests/test_health.py -v`
Expected: `1 passed`.

### Task 3: Frontend test and build foundation

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/vite-env.d.ts`
- Create: `frontend/src/test/setup.ts`

- [ ] **Step 1: Configure scripts and dependencies**

Add `dev`, `build`, `test`, and `test:run` scripts. Include React, Zustand, Lucide React, Tailwind Vite, TypeScript, Vitest, jsdom, and Testing Library dependencies.

- [ ] **Step 2: Configure Vite**

Enable React and Tailwind plugins, jsdom tests with `src/test/setup.ts`, and proxy `/api` to `http://127.0.0.1:8000`.

- [ ] **Step 3: Add the application entry and theme tokens**

Mount `<App />` under `StrictMode`. Define a dark-only theme with neutral canvas, panel, border, muted text, primary text, and cyan accent tokens. Add a reusable point-grid background and accessible focus rings.

- [ ] **Step 4: Install and type-check the foundation**

Run: `npm install`
Expected: dependencies install without audit-blocking errors.

### Task 4: Domain state and project switching

**Files:**
- Create: `frontend/src/types/domain.ts`
- Create: `frontend/src/app/store.ts`
- Create: `frontend/src/app/store.test.ts`

- [ ] **Step 1: Write the failing store test**

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from './store'

describe('app store', () => {
  beforeEach(() => useAppStore.setState({ activeProjectId: 'future-city' }))

  it('switches the active project', () => {
    useAppStore.getState().selectProject('product-concepts')
    expect(useAppStore.getState().activeProjectId).toBe('product-concepts')
  })
})
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `npm run test:run -- src/app/store.test.ts`
Expected: FAIL because `store.ts` does not exist.

- [ ] **Step 3: Implement domain types and Zustand state**

Define `Project`, `PromptCategory`, and `Prompt` types. Provide three projects, six prompts, active project selection, left/right panel visibility, and toggle actions. Keep fixture IDs stable for tests.

- [ ] **Step 4: Run the store test**

Run: `npm run test:run -- src/app/store.test.ts`
Expected: PASS.

### Task 5: Three-column workspace UI

**Files:**
- Create: `frontend/src/app/App.tsx`
- Create: `frontend/src/app/App.test.tsx`
- Create: `frontend/src/components/IconButton.tsx`
- Create: `frontend/src/features/projects/ProjectList.tsx`
- Create: `frontend/src/features/prompts/PromptLibrary.tsx`
- Create: `frontend/src/features/canvas/CanvasWorkspace.tsx`
- Create: `frontend/src/features/inspector/InspectorPanel.tsx`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/useBackendHealth.ts`

- [ ] **Step 1: Write the failing workspace test**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

describe('AI Image Canvas shell', () => {
  it('renders all workspace landmarks and switches projects', async () => {
    render(<App />)
    expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Image details' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /产品概念图/ }))
    expect(screen.getByRole('heading', { name: '产品概念图' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `npm run test:run -- src/app/App.test.tsx`
Expected: FAIL because `App.tsx` and feature components do not exist.

- [ ] **Step 3: Implement the reusable control and feature panels**

Use Lucide icons with text tooltips and accessible labels. Render projects and Prompt categories from Zustand, a canvas toolbar and empty drop target, a zoom control cluster, backend status, and the inspector empty state.

- [ ] **Step 4: Implement responsive shell composition**

Use CSS grid with `280px minmax(0, 1fr) 320px`. At widths below 1100px, hide the right panel by default; at widths below 760px, hide the left panel behind its toolbar toggle. Preserve a usable center canvas and avoid horizontal document overflow.

- [ ] **Step 5: Run UI tests**

Run: `npm run test:run -- src/app/App.test.tsx`
Expected: PASS.

### Task 6: Final verification and documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run all frontend tests**

Run: `npm run test:run`
Expected: all tests pass.

- [ ] **Step 2: Build the frontend**

Run: `npm run build`
Expected: TypeScript and Vite complete with exit code 0 and create `frontend/dist`.

- [ ] **Step 3: Run all backend tests**

Run: `python -m pytest -v`
Expected: all tests pass.

- [ ] **Step 4: Smoke-test both services**

Start FastAPI on port 8000 and Vite on port 3000. Verify `GET /api/health` returns `{ "status": "ok", "app": "AI Image Canvas" }` and the browser root renders the three-column workspace.

- [ ] **Step 5: Record Phase 1 handoff**

Ensure README commands match verified commands and report completed content, modified files, startup method, and Phase 2 plan.
