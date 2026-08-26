# Generated Image Relations and Background Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import only the final ChatGPT-generated image, persist every referenced source as a deletable relation, and add a one-click background-removal workflow for the selected image.

**Architecture:** Replace the single-parent-only canvas graph with an additive `image_relations` table while retaining `images.parent_id` as a legacy compatibility field. Generation tasks persist all reference IDs, batch completion creates source-to-result relations, and the desktop collector accepts only the final image from the newest assistant response. The inspector writes a shared ChatGPT prompt draft for the selected image, so background removal reuses the existing authenticated generation pipeline.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, React, TypeScript, Zustand, React Flow, Electron, Vitest, Pytest.

---

### Task 1: Persist multiple source relations

**Files:**
- Modify: `backend/app/models/entities.py`
- Modify: `backend/app/models/generation.py`
- Modify: `backend/app/services/database_migrations.py`
- Modify: `backend/app/schemas/images.py`
- Modify: `backend/app/schemas/generation.py`
- Modify: `backend/app/services/generation_tasks.py`
- Create: `backend/app/services/image_relations.py`
- Modify: `backend/app/api/routes/images.py`
- Test: `backend/tests/test_database_migrations.py`
- Test: `backend/tests/test_images.py`
- Test: `backend/tests/test_generation_api.py`

- [x] Add failing tests proving legacy `parent_id` rows migrate into `image_relations`, generation tasks retain every ordered reference ID, duplicate relations are rejected, and relation deletion leaves both images intact.
- [x] Run the focused Pytest cases and confirm failures are caused by missing relation models and endpoints.
- [x] Add `ImageRelation(source_id, target_id, relation_type, created_time)` with a unique source/target constraint, additive SQLite migration, `reference_image_ids_json` task metadata, and relation create/delete APIs.
- [x] Return `source_ids` on image DTOs while keeping `parent_id` for backward compatibility; synchronize the legacy field to the first remaining source.
- [x] Run focused tests until green and commit the backend relation model.

### Task 2: Import one final output and connect all references

**Files:**
- Modify: `desktop/src/chatgpt/adapter.ts`
- Modify: `desktop/src/generationOrchestrator.ts`
- Modify: `backend/app/services/image_batches.py`
- Test: `desktop/tests/chatgptAdapter.test.ts`
- Test: `desktop/tests/generationOrchestrator.test.ts`
- Test: `backend/tests/test_generation_batch.py`

- [x] Add a fixture/test where two user attachment previews and one new assistant image exist; assert only the assistant image is returned.
- [x] Add a failing orchestrator test asserting collection/import receives only the last assistant image when a response exposes multiple candidates.
- [x] Add a failing backend batch test asserting the sole output receives relations from every task reference ID.
- [x] Scope unmarked-image fallback to new assistant responses, select the final candidate defensively before download/import, and create ordered source relations during batch completion.
- [x] Run focused desktop/backend tests until green and commit the collection fix.

### Task 3: Render and delete persisted edges

**Files:**
- Modify: `frontend/src/lib/resourcesApi.ts`
- Modify: `frontend/src/types/domain.ts`
- Modify: `frontend/src/features/canvas/store/canvasStore.ts`
- Modify: `frontend/src/features/canvas/CanvasBoard.tsx`
- Modify: `frontend/src/features/inspector/ImageInspector.tsx`
- Test: `frontend/src/features/canvas/store/canvasStore.test.ts`
- Test: `frontend/src/features/inspector/ImageInspector.test.tsx`

- [x] Add failing store tests proving multiple incoming edges load from `source_ids`, one edge can be deleted through the API, and deleting an edge does not remove either node.
- [x] Add failing interaction coverage for selecting an edge and deleting it with Delete/Backspace.
- [x] Replace single-parent edge derivation with `source_ids`; add relation POST/DELETE client functions and store actions.
- [x] Give edges a clear selected state and larger interaction width; persist edge removal from React Flow removal changes and keyboard deletion.
- [x] Update inspector relationship copy to show all source names rather than one parent.
- [x] Run focused frontend tests until green and commit deletable graph relations.

### Task 4: Add one-click background removal

**Files:**
- Modify: `frontend/src/features/generation/generationStore.ts`
- Modify: `frontend/src/features/generation/ChatGptGenerationPanel.tsx`
- Modify: `frontend/src/features/inspector/ImageInspector.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/features/generation/ChatGptGenerationPanel.test.tsx`
- Test: `frontend/src/features/inspector/ImageInspector.test.tsx`

- [x] Add failing tests proving the inspector button creates the exact draft `@图片名 移除此图像的背景。保持所有前景主体不变且完整无损，边缘干净平滑。将背景设为透明。` and opens the ChatGPT tab.
- [x] Add a failing panel test proving an externally prepared draft appears in the Prompt editor with the selected image resolved as a reference.
- [x] Move the desktop Prompt draft into the shared generation store and add a compact “移除背景” action beside “保存原图” in the selected-image inspector.
- [x] Keep the action editable and user-confirmed: it prepares the prompt and switches tabs but does not submit until the user clicks “使用 ChatGPT 生成”.
- [x] Run focused frontend tests until green and commit the background-removal workflow.

### Task 5: Full verification and packaging

**Files:**
- Modify: `docs/PicLoom-软件说明书.md`

- [ ] Document line meaning, multi-source relations, relation deletion, final-output-only import, and background removal.
- [ ] Run all backend, desktop, frontend, and extension tests and confirm zero failures.
- [ ] Build frontend and desktop TypeScript bundles, then package the Windows installer.
- [ ] Launch the unpacked desktop app, verify backend health, and perform a visual smoke check of the selected-edge and inspector quick-action states.
- [ ] Commit documentation/package metadata and report exact test counts and installer path.
