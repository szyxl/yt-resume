---
name: YT Resume
description: A local playback memory with the clarity of a dedicated video-deck counter.
colors:
  display-black: "#090b0e"
  deck-graphite: "#171a1f"
  chassis-graphite: "#1d2228"
  control-grey: "#272d35"
  seam-grey: "#424b56"
  seam-strong: "#5f6a76"
  counter-white: "#f5f7f8"
  label-grey: "#b8c0c8"
  dim-grey: "#8f99a4"
  memory-gold: "#f5c451"
  memory-gold-soft: "#ffe0a3"
  danger-coral: "#ff9a90"
  danger-surface: "#3a2223"
typography:
  display:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "clamp(3rem, 17vw, 3.65rem)"
    fontWeight: 520
    lineHeight: 0.95
    letterSpacing: "-0.035em"
  page-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 5vw, 2.65rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  section-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 680
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  feedback:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.69rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0.1em"
rounded:
  control: "5px"
  display: "7px"
  toggle: "13px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "24px"
components:
  button-memory:
    backgroundColor: "{colors.control-grey}"
    textColor: "{colors.counter-white}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
    height: "42px"
  button-memory-hover:
    backgroundColor: "{colors.memory-gold}"
    textColor: "{colors.display-black}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
    height: "42px"
  button-danger:
    backgroundColor: "{colors.danger-coral}"
    textColor: "{colors.display-black}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
    height: "42px"
  counter-display:
    backgroundColor: "{colors.display-black}"
    textColor: "{colors.counter-white}"
    typography: "{typography.display}"
    rounded: "{rounded.display}"
    padding: "15px 16px 14px"
---

# Design System: YT Resume

## Overview

**Creative North Star: "The Memory Counter"**

YT Resume borrows the useful grammar of a dedicated video deck: one unmistakable time counter, a small illuminated memory state, compact transport controls, and labels that say exactly what they do. It feels like dependable hardware living in the browser—not a miniature dashboard and not nostalgic decoration.

The world is restrained, dark, and precise. Matte chassis surfaces frame inset display windows; tabular time is the visual anchor; a single warm status light makes saved state visible. Motion is limited to state changes that communicate recording, restoration, or deletion.

**Key Characteristics:**
- A large tabular timecode is the primary status signal.
- Matte graphite planes and inset black displays create hierarchy without card grids.
- One gold memory light marks active or saved state.
- Compact literal labels keep controls understandable at toolbar scale.
- Decorative video nostalgia is excluded; every deck reference must serve a task.

## Colors

The palette is restrained: cool graphite neutrals carry the interface while one clear gold accent identifies memory state and focus. Danger coral is isolated to irreversible data clearing and error recovery.

### Primary
- **Memory Gold:** Marks a saved checkpoint, enabled state, active memory controls, and keyboard focus.
- **Memory Gold Soft:** Carries gold text where the stronger fill would be visually heavy.

### Secondary
- **Danger Coral:** Reserved for destructive confirmation and error feedback.
- **Danger Surface:** Grounds the isolated clear-data zone without introducing a generic alert card elsewhere.

### Neutral
- **Display Black:** The recessed counter field and deepest surface.
- **Deck Graphite:** The page and toolbar-panel ground.
- **Chassis Graphite:** The instrument body.
- **Control Grey:** Buttons, selects, and inactive machine controls.
- **Seam Grey / Seam Strong:** Structural joins and interactive boundaries.
- **Counter White:** Primary text and time digits.
- **Label Grey / Dim Grey:** Secondary copy and inactive status.

**The One Lamp Rule.** Gold denotes memory or immediate attention. If several unrelated elements glow at once, the system has lost its hierarchy.

## Typography

**Display Font:** Native tabular monospace stack.
**Body Font:** Firefox-native system UI stack.
**Label Font:** The system UI stack in compact uppercase.

**Character:** Time values feel fixed, measured, and easy to compare; surrounding copy feels native to Firefox and disappears into the task.

### Hierarchy
- **Display** (520, responsive 48–58.4px, 0.95): Saved position only, with tabular and slashed-zero features.
- **Title** (680, 14px in the popup): Extension and compact section titles.
- **Headline** (bold, responsive 28.8–42.4px): Settings page title only.
- **Body** (400, 14px, 1.45): Explanations, states, and recovery copy with a maximum measure near 60 characters.
- **Label** (650, 9.66px, 0.1em): Brief machine-state captions only.

**The Counter Owns the Mono Rule.** Monospaced type belongs to time and compact status values; prose and actions use the native UI face.

## Layout

The popup is a single 342px vertical control deck, not a collection of cards. It reflows without horizontal scrolling at 320px. The display window comes first, followed by the current-video action, then a compact footer rail for enablement and Settings.

Settings use the same vertical instrument logic at a wider 760px reading measure: section rails, aligned controls, and one clearly isolated danger zone. At 540px and below, settings rows become single-column, selects and buttons become full width, and confirmation actions stack.

Spacing uses a compact 4/8/14/24px rhythm with visibly larger gaps between functional zones than within them. Nothing depends on hover.

## Elevation & Depth

Depth comes from tonal insets, one-pixel edge highlights, and a restrained inner shadow in the timecode display. The in-player restoration message receives the only ambient drop shadow because it floats above moving video.

**The Chassis Rule.** Every surface is either chassis, inset display, or control; avoid stacking generic containers merely to group content.

## Shapes

The form language is rectilinear with subtly eased 5px control corners and 7px display corners. Status badges reuse the 5px control radius. The familiar binary toggle alone keeps a 13px rounded track, but no content container or action becomes a pill. Borders read as machined seams, not decorative outlines.

## Components

### Buttons
- **Shape:** Compact eased corners (5px), at least 42px tall.
- **Memory action:** Neutral at rest; gold fill with display-black text on hover or activation.
- **Danger action:** Coral fill with dark text, visible only after explicit confirmation.
- **Focus:** A two-pixel soft-gold outline with a two-pixel offset.

### Cards / Containers
- **Counter display:** Recessed black field with a structural grey seam, small corner easing, and inner depth.
- **Settings sections:** Open rails separated by one-pixel seams; they are never enclosed cards.
- **Danger zone:** The only enclosed settings container, justified by destructive scope.

### Inputs / Fields
- **Select:** Control-grey field, strong seam, 44px minimum height, and native menu behavior.
- **Toggle:** Familiar checkbox semantics beneath a custom 44×26px track; gold means enabled, and forced-colors mode restores the native checkbox.

### Navigation
- **Settings action:** A literal text button rather than a gear icon. It stays neutral until hover, then gains a control-grey field and seam.

### Memory Counter
- The counter combines a machine label, redundant lamp-plus-text status, oversized saved time, and the transient current video title. An em dash pattern marks absence instead of inventing `0:00` progress.

## Do's and Don'ts

### Do:
- **Do** make saved time and extension state legible in a glance.
- **Do** use tabular numerals for every duration and timestamp.
- **Do** give keyboard focus a high-contrast gold treatment and preserve system colors in forced-colors mode.
- **Do** preserve familiar checkbox, select, and button behavior beneath the visual language.
- **Do** make reduced-motion mode fully still.

### Don't:
- **Don't** turn every row into a rounded card.
- **Don't** use glowing neon, scanlines, tape noise, or faux-VHS distortion.
- **Don't** use YouTube red as a general-purpose brand shortcut.
- **Don't** hide actions behind icon-only controls.
- **Don't** animate the timecode continuously when a static value communicates the state.
