# YT Resume

A Firefox extension that privately saves and restores playback positions for standard YouTube videos. Progress remains in the current Firefox profile—there is no account, server, analytics, or remote code.

## Behavior

- Restores one local checkpoint per YouTube video.
- Saves every five seconds and on pause, seek, navigation, and page exit.
- Lets explicit timestamp links override the saved checkpoint.
- Ignores positions below five seconds and clears completed or nearly completed videos.
- Supports 30, 90, 180, 365-day, or unlimited retention; the default is 90 days.
- Supports regular `youtube.com/watch` videos, including playlist links.
- Does not run in Private Browsing and currently excludes Shorts, live streams, premieres, embeds, and YouTube Music.

## Resource use

The content script is event-driven while idle: it has no permanent polling interval and no periodic save timer on paused videos or non-watch YouTube pages. During playback, one five-second timer preserves the agreed crash-recovery accuracy. Repeated writes are skipped when buffering prevents the playhead from advancing, and stale duplicate tabs stop saving until the user interacts with them again.

The extension has no runtime dependencies, network requests, analytics, or background work outside YouTube.

## Develop

Requires Firefox 140+ and Node.js.

```bash
npm install
npm test
npm run lint
npm start
```

`npm start` launches a temporary Firefox profile with the extension installed. To load it manually, open `about:debugging`, choose **This Firefox**, select **Load Temporary Add-on**, and choose `manifest.json`.

## Build

```bash
npm run build
```

The signed-ready ZIP is written to `web-ext-artifacts/`. Publishing through Mozilla Add-ons is still required for normal permanent installation.

## Stored data

Each record contains only a YouTube video ID, playback position, duration, and local timestamps used for conflict resolution and expiry. Video titles are shown transiently in the popup but are not stored.
