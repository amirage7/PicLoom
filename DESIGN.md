# Design System

## Direction

Mood: a precision imaging desk after dark, with matte instrument panels and a calm verdigris signal light.

The interface uses a restrained dark product system. Neutral surfaces carry structure; teal appears only for selection, focus, healthy status, and primary actions. Images introduced in later phases provide the dominant color.

## Color

All authored colors use OKLCH.

```css
:root {
  --color-bg: oklch(0.115 0 0);
  --color-canvas: oklch(0.135 0.006 188);
  --color-panel: oklch(0.155 0.006 188);
  --color-panel-raised: oklch(0.19 0.008 188);
  --color-border: oklch(0.27 0.008 188);
  --color-border-strong: oklch(0.36 0.012 188);
  --color-ink: oklch(0.94 0.006 188);
  --color-muted: oklch(0.68 0.012 188);
  --color-subtle: oklch(0.53 0.012 188);
  --color-primary: oklch(0.72 0.10 188);
  --color-primary-strong: oklch(0.62 0.12 188);
  --color-danger: oklch(0.66 0.16 24);
}
```

## Typography

Use a single system sans stack: `Inter`, `ui-sans-serif`, `system-ui`, `sans-serif`. Product headings use 18–20px semibold; panel headings use 12–13px semibold; body and controls use 12–14px. Metadata uses tabular numerals where useful. No display typography or uppercase tracking labels.

## Shape and Elevation

Controls use 6px radius; compact containers use 8px; large empty-state surfaces use 12px. Full pills are reserved for tags and statuses. Structure is expressed by surface and 1px borders rather than wide shadows.

## Layout

Desktop shell: 280px navigation, flexible canvas, 320px inspector. At narrower widths the inspector collapses first, then navigation. The canvas remains the only flexible region and never forces document-level horizontal scrolling.

## Components

- Icon buttons are 32–36px with visible hover, active, focus, and disabled states.
- Selected list rows use a quiet teal-tinted background and a leading icon, not a colored side stripe.
- Empty states explain the next action and show relevant shortcuts.
- Status uses icon, text, and color together.
- Motion is limited to 160–220ms state transitions and is disabled under reduced-motion preferences.
