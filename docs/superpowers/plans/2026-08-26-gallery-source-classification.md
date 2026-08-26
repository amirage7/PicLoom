# Gallery Source Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct historical ChatGPT image provenance and simplify gallery categories.

**Architecture:** Keep `source_type` as the single provenance field. Correct historical data through an idempotent SQLite migration based on generation-task foreign references, while the React gallery renders only provenance filters and labels.

**Tech Stack:** Python, SQLAlchemy, SQLite, pytest, React, TypeScript, Vitest, Testing Library.

---

### Task 1: Backfill historical generated images

**Files:**
- Modify: `backend/tests/test_database_migrations.py`
- Modify: `backend/app/services/database_migrations.py`

- [ ] **Step 1: Write a failing migration test** that creates uploaded-default image rows and completed generation tasks whose `image_id` or `image_ids_json` refer to generated rows; assert those rows become `generated` and an unrelated row stays `uploaded`.
- [ ] **Step 2: Run** `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_database_migrations.py -q` and verify the new assertion fails.
- [ ] **Step 3: Add an idempotent source backfill** using task references, guarded by table and column existence.
- [ ] **Step 4: Re-run the migration test** and verify it passes.

### Task 2: Simplify gallery classifications

**Files:**
- Create: `frontend/src/features/gallery/GalleryView.test.tsx`
- Modify: `frontend/src/features/gallery/GalleryView.tsx`

- [ ] **Step 1: Write a failing component test** asserting the filters are `全部/收藏/生成/上传`, exclude `画布中/未使用`, and cards render `ChatGPT 生成` without Canvas-state metadata.
- [ ] **Step 2: Run** `npm.cmd run test:run -- src/features/gallery/GalleryView.test.tsx` in `frontend` and verify failure.
- [ ] **Step 3: Remove Canvas filters and membership metadata** while retaining Canvas membership actions.
- [ ] **Step 4: Re-run the component test** and verify it passes.

### Task 3: Select gallery assets in the image inspector

**Files:**
- Modify: `frontend/src/app/store.ts`
- Modify: `frontend/src/features/gallery/GalleryView.tsx`
- Modify: `frontend/src/components/panels/RightPanel.tsx`
- Modify: `frontend/src/features/inspector/ImageInspector.tsx`
- Modify: `frontend/src/features/canvas/store/canvasStore.ts`
- Test: `frontend/src/features/gallery/GalleryView.test.tsx`
- Test: `frontend/src/features/inspector/ImageInspector.test.tsx`

- [ ] **Step 1: Write failing tests** showing that clicking a gallery thumbnail stores the selected asset and that the inspector renders it without requiring Canvas membership.
- [ ] **Step 2: Run the focused tests** and verify the new assertions fail.
- [ ] **Step 3: Add gallery-asset selection state** and reuse the existing DTO-to-node mapping in the inspector.
- [ ] **Step 4: Make the right panel switch to details** when a gallery asset is selected, and preserve direct metadata updates for that asset.
- [ ] **Step 5: Re-run both focused tests** and verify they pass.

### Task 4: Verify and package

**Files:**
- Rebuild generated release artifacts under `desktop/release-new/`.

- [ ] **Step 1: Run all backend and frontend tests.**
- [ ] **Step 2: Run frontend and desktop builds.**
- [ ] **Step 3: Build the Windows installer and record its SHA-256.**
