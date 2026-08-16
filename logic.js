(function attachYTResumeLogic(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.YTResume = Object.freeze(api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createYTResumeLogic() {
  "use strict";

  const MINIMUM_POSITION_SECONDS = 5;
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    retentionDays: 90,
  });
  const RETENTION_OPTIONS = Object.freeze([30, 90, 180, 365, 0]);
  const PROGRESS_KEY_PREFIX = "progress:";
  const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

  function normalizeSettings(input) {
    const source = input && typeof input === "object" ? input : {};
    const retentionDays = RETENTION_OPTIONS.includes(Number(source.retentionDays))
      ? Number(source.retentionDays)
      : DEFAULT_SETTINGS.retentionDays;

    return {
      enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_SETTINGS.enabled,
      retentionDays,
    };
  }

  function parseVideoContext(value) {
    let url;

    try {
      url = new URL(value);
    } catch {
      return null;
    }

    if (url.protocol !== "https:" || url.hostname !== "www.youtube.com" || url.pathname !== "/watch") {
      return null;
    }

    const videoId = url.searchParams.get("v") || "";
    if (!VIDEO_ID_PATTERN.test(videoId)) {
      return null;
    }

    const hash = url.hash.replace(/^#/, "");
    const hasHashTimestamp = new URLSearchParams(hash.replace(/^\?/, "")).has("t")
      || /(?:^|[&#])t=/.test(hash);

    return {
      videoId,
      hasExplicitTimestamp:
        url.searchParams.has("t")
        || url.searchParams.has("start")
        || url.searchParams.has("time_continue")
        || hasHashTimestamp,
    };
  }

  function formatTime(value) {
    const seconds = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
    }

    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function isNearCompletion(position, duration) {
    if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position < 0) {
      return false;
    }

    const completionWindow = Math.min(duration * 0.05, 20);
    return position >= duration - completionWindow;
  }

  function isRestorable(position, duration) {
    return Number.isFinite(position)
      && position >= MINIMUM_POSITION_SECONDS
      && Number.isFinite(duration)
      && duration > 0
      && !isNearCompletion(position, duration);
  }

  function isExpired(record, retentionDays, now = Date.now()) {
    if (retentionDays === 0) {
      return false;
    }

    const updatedAt = Number(record && record.updatedAt);
    if (!Number.isFinite(updatedAt)) {
      return true;
    }

    return now - updatedAt > retentionDays * 24 * 60 * 60 * 1000;
  }

  function shouldAcceptWrite(existing, incoming) {
    if (!existing) {
      return true;
    }

    const existingActivity = Number(existing.activityAt) || 0;
    const incomingActivity = Number(incoming && incoming.activityAt) || 0;

    if (incomingActivity > existingActivity) {
      return true;
    }

    return incomingActivity === existingActivity
      && Boolean(incoming && incoming.writerId)
      && incoming.writerId === existing.writerId;
  }

  function progressKey(videoId) {
    if (!VIDEO_ID_PATTERN.test(videoId || "")) {
      throw new TypeError("Invalid YouTube video ID");
    }

    return `${PROGRESS_KEY_PREFIX}${videoId}`;
  }

  function isProgressKey(key) {
    return typeof key === "string" && key.startsWith(PROGRESS_KEY_PREFIX);
  }

  return {
    DEFAULT_SETTINGS,
    MINIMUM_POSITION_SECONDS,
    PROGRESS_KEY_PREFIX,
    RETENTION_OPTIONS,
    formatTime,
    isExpired,
    isNearCompletion,
    isProgressKey,
    isRestorable,
    normalizeSettings,
    parseVideoContext,
    progressKey,
    shouldAcceptWrite,
  };
});
