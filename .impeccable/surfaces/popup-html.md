---
version: 1
slug: "popup-html"
primary_target: "popup.html"
related_targets: ["options.html"]
---

## Scope and mode

- Surface: Firefox toolbar popup and extension settings.
- Mode: Operate.

## Audience and task

Firefox users need to verify that local resume is active, inspect the current video's saved time, forget that position, or change retention without interrupting viewing.

## Information and states

- Current video: saved position, no saved position, unsupported page, unavailable tab.
- Extension: enabled or paused.
- Actions: forget current video, open settings, choose retention, clear all data with confirmation.
- Feedback: success, disabled, and destructive-confirmation states must be explicit and announced accessibly.

## Direction

“The Memory Counter”: a compact dedicated-video-deck control surface with a dominant tabular timecode, matte graphite chassis, inset display, literal controls, and one gold memory lamp. The memorable moment is seeing the local checkpoint as a physical-feeling time counter rather than an abstract settings row.

## Constraints

- Popup must remain legible at typical Firefox extension-panel width.
- Keyboard, screen reader, high contrast, light/dark browser context, and reduced motion support are required.
- No icon-only actions, rounded card grid, faux-VHS noise, or continuous decorative time animation.
- The popup performs frequent tasks; Settings contains retention and destructive bulk clearing.

## Unresolved

- Final product/store name and icon artwork.
