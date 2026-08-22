# YT Resume

A Firefox and Chromium extension that privately saves and restores playback positions for standard YouTube videos. Progress remains in the current browser profile—there is no account, server, analytics, or remote code.

## Behavior

- Restores one local checkpoint per YouTube video.
- Shows an in-player resume message by default, with a setting to hide it.
- Saves every five seconds and on pause, seek, navigation, and page exit.
- For timestamp links, restores the local checkpoint unless the URL time is more than one minute ahead.
- Ignores positions below five seconds and clears completed or nearly completed videos.
- Supports 7, 30, 90, 180, 365-day, or unlimited retention; the default is 7 days.
- Supports regular `youtube.com/watch` videos, including playlist links.
- Skips YouTube Mix and Radio playback (`start_radio=1`) so tracks from those sessions do not resume partway through.
- Does not run in Private Browsing or Incognito and currently excludes Shorts, live streams, premieres, embeds, and YouTube Music.

## Resource use

The content script is event-driven while idle: it has no permanent polling interval and no periodic save timer on paused videos or non-watch YouTube pages. During playback, one five-second timer preserves the agreed crash-recovery accuracy. Repeated writes are skipped when buffering prevents the playhead from advancing, and stale duplicate tabs stop saving until the user interacts with them again.

The extension has no runtime dependencies, network requests, analytics, or background work outside YouTube.

## Develop

Requires Firefox 140+ or Chromium 99+, plus Node.js.

```bash
npm ci
npm test
npm run lint
npm run start:firefox
npm run start:chromium
```

`npm start` is an alias for `npm run start:firefox`. Shared runtime files live in `src/shared/`; browser-specific manifests and entry points live in `src/firefox/` and `src/chromium/`. Development, test, lint, and build commands assemble loadable extensions under `dist/`. The start commands keep those generated files synchronized while they run.

To refresh both generated extensions without starting a browser:

```bash
npm run prepare:dist
```

To load the extension manually after running `npm ci` or `npm run prepare:dist`:

- **Firefox:** open `about:debugging`, choose **This Firefox**, select **Load Temporary Add-on**, and choose `dist/firefox/manifest.json`.
- **Chromium:** open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose the `dist/chromium/` directory.

## Build

```bash
npm run build
```

Browser-specific ZIPs are written to `web-ext-artifacts/firefox/` and `web-ext-artifacts/chromium/`. 
## Stored data

Each record contains only a YouTube video ID, playback position, duration, and local timestamps used for conflict resolution and expiry. Video titles are shown transiently in the popup but are not stored.

## License

YT Resume is free and open-source software licensed under the [GNU General Public License v3.0](LICENSE).
