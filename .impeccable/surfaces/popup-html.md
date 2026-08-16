---
version: 1
slug: "popup-html"
primary_target: "popup.html"
related_targets: ["firefox/options.html", "chromium/options.html"]
---

## Scope and mode

- Surface: Firefox and Chromium toolbar popup and extension settings.
- Mode: Operate.

## Audience and task

Firefox and Chromium users need to inspect the current video's saved time or open Settings without interrupting viewing.

## Information and states

- Current video: saved position, no saved position, unsupported page, unavailable tab.
- Extension: enabled or paused.
- Actions: open Settings; toggle automatic resume, choose retention, or clear all data there.
- Feedback: success, disabled, and destructive-confirmation states must be explicit and announced accessibly.

## Direction

“The Memory Counter”: a compact monochrome video-deck control surface with a dominant tabular timecode, matte black chassis, inset display, and literal controls. The checkpoint label and time are the popup's only status readout; separate “On” and “Saved” badges are excluded. The memorable moment is seeing the local checkpoint as a physical-feeling time counter rather than an abstract settings row.

## Constraints

- Popup must remain legible at typical browser extension-panel width.
- Keyboard, screen reader, high contrast, light/dark browser context, and reduced motion support are required.
- No icon-only actions, rounded card grid, faux-VHS noise, or continuous decorative time animation.
- The popup stays focused on checkpoint status; Settings contains enablement, retention, and destructive bulk clearing.

## Unresolved

- Final product/store name and icon artwork.
