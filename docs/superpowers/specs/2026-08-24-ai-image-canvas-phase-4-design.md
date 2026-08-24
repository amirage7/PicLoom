# AI Image Canvas Phase 4 UI Design

## Objective

Turn the Phase 3 persistence UI into a dependable desktop creation tool at common laptop and tablet widths. Preserve the calm three-panel desktop layout while making navigation, inspection, loading, errors, and keyboard operation usable without relying on hidden controls.

## Chosen direction

Use responsive overlay panels below the full three-column breakpoint. A CSS-only approach that hides panels is too limiting because the existing toolbar buttons stop being meaningful. A full mobile-specific bottom-sheet system would add unnecessary interaction complexity. Overlay drawers reuse the same project, Prompt, and inspector components, keep the canvas mounted, and preserve desktop mental models.

## Layout behavior

- At 1180 px and above, retain the 280 px navigation, flexible canvas, and 320 px inspector.
- From 760–1179 px, render navigation and inspector as fixed overlay drawers above the canvas with a dimmed dismiss layer.
- Below 760 px, drawers use `min(88vw, 340px)` and the header collapses secondary status text while retaining save state and panel controls.
- Opening one overlay closes the other. Escape closes the active overlay and returns focus to its trigger.
- The canvas remains mounted and fills the available viewport at every breakpoint.

## Interaction and accessibility

- Add a reusable responsive panel backdrop and accessible close controls inside both panels.
- Expose global shortcuts outside editable fields: `V` select, `H` pan, `[` navigation, `]` inspector, `0` fit view, and Escape to close overlays or clear selection.
- Keep all icon buttons at least 32 px, visible focus outlines, semantic labels, `aria-expanded`, and `aria-controls` for panel toggles.
- Status uses icon, text, and color. Loading and saving remain announced through a polite live region.
- Destructive confirmations stay inline; focus moves to the confirmation action and cancellation restores the initiating control.

## Product UI refinements

- Consolidate management styles into the main token system and remove stale Phase 1 placeholder components.
- Improve project overflow placement, Prompt action density, form button hierarchy, disabled states, input focus, and error presentation.
- Replace non-informative empty-state skeleton decoration with concise shortcut guidance.
- Keep color restrained: neutral matte surfaces with teal reserved for selection, focus, healthy state, and primary actions.
- Avoid gradients, glass effects, large shadows, decorative motion, or new font dependencies.

## State and component boundaries

- `useResponsivePanels` owns media-query state, mutual exclusion, Escape handling, and focus restoration.
- `AppShell`/`App` provides panel IDs, drawer state attributes, backdrop, and close controls.
- `CanvasBoard` owns canvas-specific shortcuts and fit-view actions.
- Existing Zustand panel booleans remain the single source of truth; no viewport state is persisted.
- Styling stays in CSS tokens and component classes; no JavaScript layout measurements are introduced.

## Error and edge behavior

- Offline mode keeps panels usable and clearly labels data as local fallback.
- Drawer controls remain available if project or Prompt lists are empty.
- Long project names, Prompt titles, and localized status text truncate without pushing canvas controls off-screen.
- Reduced-motion preference disables drawer and spinner transitions.

## Verification

- Component tests cover drawer mutual exclusion, Escape dismissal, focus restoration, shortcut suppression in inputs, and accessible toggle state.
- Existing canvas, inspector, resource, API, and backend suites remain green.
- Production build and dependency audit pass.
- Browser-width smoke checks cover 1440, 1024, and 390 px layouts, with no document-level horizontal overflow.

## Phase boundary

Phase 4 does not add image generation, provider automation, asset search, resizable panels, touch gestures beyond existing React Flow behavior, or a new component library. Provider interfaces remain Phase 5.
