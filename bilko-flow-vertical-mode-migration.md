# bilko-flow Migration: Vertical Mobile Mode for FlowProgress

## Summary

Bilko now has a local `FlowProgressVertical` component that renders flow steps
in a vertical timeline on narrow screens (< 480px). This document describes how
to upstream it into the `bilko-flow` package so all consumers get the mobile
experience natively.

## What Exists Today (in Bilko)

| File | Role |
|------|------|
| `client/src/components/ui/flow-progress-vertical.tsx` | The vertical timeline component |
| `client/src/components/ui/flow-progress.tsx` | Wrapper that intercepts `mode="auto"` and renders vertical when narrow |

The wrapper measures container width via `ResizeObserver`. When `mode="auto"` and
width < `autoBreakpoint` (default 480px), it renders `FlowProgressVertical`
instead of the horizontal compact mode. Wide containers still get `ExpandedMode`.

## Migration Steps

### 1. Move `FlowProgressVertical` into bilko-flow

**Target location:** `src/react/flow-progress-vertical.tsx`

The component is self-contained. It mirrors these internals from `flow-progress.tsx`:
- `computeWindow()` — the sliding-window algorithm
- `resolveStepBg()` / `resolveConnectorColor()` — theme helpers
- `getTypeIcon()` — step type → lucide icon mapping

**To avoid duplication**, extract these shared helpers into a new internal module:

```
src/react/flow-progress-shared.ts   ← new file
├── computeWindow()
├── resolveStepBg()
├── resolveConnectorColor()
├── resolveStepTextColor()
├── getTypeIcon()
├── getLabelMode()
├── truncateLabel()
├── statusDotClass()
├── statusLabel()
├── needsWindow()
└── type WindowItem
```

Then both `flow-progress.tsx` (horizontal modes) and `flow-progress-vertical.tsx`
(vertical mode) import from `flow-progress-shared.ts`.

### 2. Integrate into FlowProgress auto mode

In `src/react/flow-progress.tsx`, update the auto-mode resolution:

```diff
- const effectiveMode = mode === 'auto' ? resolvedAutoMode : mode;
+ // Auto mode: narrow → vertical, wide → expanded
+ if (mode === 'auto' && resolvedAutoMode === 'compact') {
+   return (
+     <div ref={containerRef} className={...}>
+       <FlowProgressVertical
+         steps={steps}
+         label={label}
+         status={status}
+         activity={activity}
+         lastResult={lastResult}
+         onReset={onReset}
+         onStepClick={onStepClick}
+         theme={resolvedTheme}
+         radius={radius}
+       />
+     </div>
+   );
+ }
```

This means auto mode now has three visual outcomes:
- **Narrow (< breakpoint)** → `FlowProgressVertical` (vertical timeline)
- **Medium (≥ breakpoint)** → `ExpandedMode` (horizontal cards)
- **Wide (optional future)** → `FullMode` (large circles)

### 3. Export from the package

In `src/react/index.ts`, add:

```typescript
export { FlowProgressVertical } from './flow-progress-vertical';
export type { FlowProgressVerticalProps } from './flow-progress-vertical';
```

### 4. Update FlowProgressProps type

Add `"vertical"` as an explicit mode option so consumers can force it:

```diff
  mode: 'full' | 'compact' | 'expanded' | 'auto'
+ mode: 'full' | 'compact' | 'expanded' | 'auto' | 'vertical'
```

When `mode="vertical"`, render `FlowProgressVertical` directly (no
`ResizeObserver` needed).

### 5. Update the agent guidance in index.ts

Add vertical to the mode selection guide:

```
*   FlowProgress — Choose mode based on available width:
*     • "vertical"  → Mobile screens (< 480px width) or any narrow container
*                     where vertical space is abundant. Shows steps top-to-bottom
*                     with a vertical connector rail and expandable ellipsis.
*     • "compact"   → Tight spaces where horizontal is still preferred.
*     • "auto"      → Narrow → vertical, wide → expanded. Preferred default.
```

### 6. Add tests

Port the existing `computeWindow` tests (they already exist for horizontal)
and add vertical-specific tests:

```typescript
describe('FlowProgressVertical', () => {
  it('renders all steps vertically when count ≤ 2*radius+3', () => { ... });
  it('windows to First, X-1, X, X+1, Last when count > threshold', () => { ... });
  it('expands ellipsis on click', () => { ... });
  it('collapses expanded ellipsis on click', () => { ... });
  it('shows activity text only on the active step', () => { ... });
  it('renders type-colored connector lines for completed steps', () => { ... });
});
```

### 7. Remove the local copy from Bilko

Once bilko-flow ships the vertical mode, update Bilko:

1. Delete `client/src/components/ui/flow-progress-vertical.tsx`
2. Revert `client/src/components/ui/flow-progress.tsx` back to a simple re-export:
   ```typescript
   export { FlowProgress, adaptSteps } from "bilko-flow/react";
   export type { ... } from "bilko-flow/react";
   ```
3. Revert `flow-status-indicator.tsx` and `step-tracker.tsx` imports back to
   `"bilko-flow/react"` (or keep them pointing at the re-export — both work)

## Architecture Notes

### Vertical UX design

```
 ● Pipeline Name  3/7
 ▓▓▓▓░░░░░░

 ✓  Fetch RSS Feed              ← First (always shown)
 │
 ⋮  2 more steps                ← Tap to expand
 │
 ✓  Parse Episodes              ← X-1
 │
 ⟳  Fetch Transcripts           ← X (active, glow ring)
 │   Fetching episode data...   ← activity text
 │
 ○  Generate Summary            ← X+1
 │
 ⋮  1 more step                 ← Tap to expand
 │
 ○  Publish                     ← Last (always shown)
```

- **Rail**: 2px vertical connector between steps, colored by completion + theme
- **Icons**: Same lucide set as horizontal (CheckCircle2, Loader2, Brain, etc.)
- **Ellipsis**: `MoreVertical` icon + "N more steps" — expands inline, collapses back
- **Active step**: `bg-gray-800/80 ring-1 ring-green-500/20` + activity text below label
- **Type dot**: Small colored circle at right edge, from theme's `stepColors`
- **Progress bar**: Segmented mini bar at top, same as FullMode/ExpandedMode

### What NOT to change

- The `computeWindow()` algorithm is identical — same window, different orientation
- Theme system (`mergeTheme`, `FlowProgressTheme`) stays unchanged
- `ParallelThreads` support is not included in vertical mode yet — add it later
  if needed (stacked thread sections below the main timeline)

## Priority

Medium-high — the local Bilko wrapper works today but duplicates ~80 lines of
windowing/theme logic. Moving it upstream removes the duplication and makes the
vertical mobile mode available to any bilko-flow consumer.
