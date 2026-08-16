# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Firefox and Chromium users who watch standard YouTube videos and want unfinished videos to reopen at the exact local position, including when they are signed out or YouTube history is disabled.

## Product Purpose

YT Resume reliably records unfinished viewing progress in the current browser profile and automatically restores it on a later visit. Success means returning to a video requires no searching, account, or cloud service, while the behavior stays understandable and reversible.

## Positioning

The extension makes the browser profile—not a YouTube account—the predictable source of truth for playback progress. All progress data remains local.

## Operating Context

The extension runs on regular `youtube.com/watch` pages. It supports standard on-demand videos, including videos opened through playlists and shortened links after they redirect to YouTube. One position belongs to each YouTube video ID regardless of playlist or URL parameters.

## Capabilities and Constraints

- Restore automatically unless the URL contains an explicit YouTube timestamp.
- The local saved position wins over YouTube's built-in resume position.
- Show a temporary in-player “Resumed at … · Start over” message after restoration.
- Ignore saved positions below five seconds.
- Treat an ended video, or a position within the final 5% capped at 20 seconds, as complete and remove its progress.
- Save every five seconds and on pause, seek, YouTube navigation, and page exit.
- When duplicate tabs exist, the tab most recently played or seeked wins; closing a stale tab must not overwrite newer progress.
- Keep entries for a configurable 30, 90, 180, 365 days, or indefinitely; default to 90 days.
- Provide a toolbar popup with current-video status and Settings.
- Keep the extension on/off switch and “Clear all data” in Settings; clearing data requires confirmation.
- Do not operate in Firefox Private Browsing or Chromium Incognito windows.
- First release excludes Shorts, live streams, premieres, embeds, and YouTube Music.
- No account, server, analytics, remote code, broad host access, runtime dependencies, or permanent polling intervals.
- Remain event-driven while idle; schedule periodic persistence only during active playback and skip duplicate writes while stalled.

The working name is “YT Resume”; final naming and store branding remain open.

## Product Principles

- Local by design: viewing progress never leaves the browser profile.
- Automatic but reversible: restoration requires no work and always explains itself.
- Respect explicit intent: timestamp links, manual seeking, and replaying override automation.
- Ask for the narrowest permissions possible.
- Prefer dependable standard-video behavior over broad but inconsistent coverage.
- Stay dormant when there is no active playback work.

## Accessibility & Inclusion

Popup, settings, confirmation, and in-player feedback must be keyboard accessible, screen-reader legible, high-contrast in light and dark browser themes, and usable with reduced motion.
