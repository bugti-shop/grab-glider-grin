---
name: Sketch Editor Tool Persistence
description: Shape tools stay active after drawing; double-tap switches to select for resize/move
type: feature
---
- Shape tools remain active after drawing a shape (no auto-switch to select tool).
- Newly drawn shapes are auto-selected (selection handles visible) while shape tool stays active.
- Selection is preserved while in shape tool mode (useEffect only clears for non-select AND non-shape tools).
- Double-tap (touch) or double-click (mouse) on an existing shape while in shape tool mode → switches to select tool for precise resize/move.
- Starting a new shape stroke clears previous selection (new shape gets selected after completion).
