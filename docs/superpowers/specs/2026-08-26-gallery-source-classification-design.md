# Gallery Source Classification Design

## Goal

Make the project gallery describe image provenance accurately and remove Canvas membership from the gallery's classification UI.

## Product behavior

- Gallery filters are `全部`, `收藏`, `生成`, and `上传`.
- Cards show only the provenance label: `ChatGPT 生成` or `本地上传`.
- Canvas membership remains an action (`加入画布` / `移出画布`) and is not presented as an image category.
- Images imported by a completed ChatGPT generation task are `generated`, including edits, background removal, and reference-image generations.
- Only images explicitly imported through the upload endpoint are `uploaded`.
- Clicking a gallery thumbnail selects that asset and switches the right panel to `图片详情`; opening the original remains an explicit action inside the detail panel.

## Data correction

New generation paths already write `source_type="generated"`. The incorrect values are historical rows created before the column existed: the additive migration introduced the column with the safe database default `uploaded`. On startup, an idempotent migration will set an image to `generated` when its ID is recorded in either `generation_tasks.image_id` or `generation_tasks.image_ids_json`. It will not infer provenance from filenames or prompts, so genuine uploads remain unchanged.

## Verification

- A migration regression test covers single-image and batch task references while preserving a genuine upload.
- A gallery UI regression test verifies the visible filter labels and provenance-only card metadata.
- A gallery-to-inspector regression test verifies selection works for assets even when they are not on the Canvas.
- Full backend/frontend suites and release builds are run before packaging.
