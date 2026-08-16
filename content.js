(() => {
  "use strict";

  const {
    DEFAULT_SETTINGS,
    formatTime,
    isNearCompletion,
    isRestorable,
    normalizeSettings,
    parseVideoContext,
  } = globalThis.YTResume;

  const SAVE_INTERVAL_MS = 5000;
  const INITIAL_PLAYER_CHECK_INTERVAL_MS = 100;
  const MAX_PLAYER_CHECK_INTERVAL_MS = 1000;
  const RESTORE_SETTLE_MS = 300;
  const TOAST_LIFETIME_MS = 5000;

  let currentSession = null;
  let settings = { ...DEFAULT_SETTINGS };
  let navigationTimer = null;
  let lastObservedUrl = location.href;
  let activeToast = null;
  let publicState = createPublicState();

  function createPublicState(overrides = {}) {
    return {
      supported: false,
      reason: "Open a standard YouTube video to begin.",
      enabled: settings.enabled,
      videoId: null,
      title: "",
      record: null,
      ...overrides,
    };
  }

  function makeWriterId() {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function sendMessage(type, payload = {}) {
    return browser.runtime.sendMessage({ type, ...payload });
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function getVideoTitle() {
    const heading = document.querySelector("h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string");
    const headingText = heading && heading.textContent ? heading.textContent.trim() : "";
    if (headingText) {
      return headingText;
    }

    return document.title.replace(/\s*-\s*YouTube\s*$/, "").trim();
  }

  function getPlayer(video) {
    return video.closest(".html5-video-player") || document.querySelector(".html5-video-player");
  }

  function isAdPlaying(video) {
    return Boolean(getPlayer(video)?.classList.contains("ad-showing"));
  }

  function getExcludedReason(video) {
    const player = getPlayer(video);
    const watchPage = document.querySelector("ytd-watch-flexy");

    if (!Number.isFinite(video.duration) || player?.classList.contains("ytp-live")) {
      return "Live videos aren't supported yet.";
    }

    if (watchPage?.hasAttribute("is-premiere") || watchPage?.hasAttribute("is-upcoming")) {
      return "Premieres aren't supported yet.";
    }

    return null;
  }

  function waitForPlayableVideo(session) {
    return new Promise((resolve) => {
      function check() {
        if (session.destroyed || currentSession !== session) {
          resolve(null);
          return;
        }

        const video = document.querySelector("video.html5-main-video");
        const hasMetadata = video
          && video.readyState >= HTMLMediaElement.HAVE_METADATA
          && (Number.isFinite(video.duration) ? video.duration > 0 : video.duration === Infinity);

        if (hasMetadata && !isAdPlaying(video)) {
          resolve(video);
          return;
        }

        session.playerCheckTimer = setTimeout(check, session.playerCheckDelay);
        session.playerCheckDelay = Math.min(session.playerCheckDelay * 2, MAX_PLAYER_CHECK_INTERVAL_MS);
      }

      check();
    });
  }

  function addListener(session, target, type, listener, options) {
    target.addEventListener(type, listener, options);
    session.cleanups.push(() => target.removeEventListener(type, listener, options));
  }

  function markActivity(session) {
    session.hasActivity = true;
    session.isStaleWriter = false;
    session.activityAt = Date.now();
  }

  async function saveSession(session, { force = false } = {}) {
    if (!session || !session.video || !session.settings.enabled || !session.hasActivity) {
      return null;
    }

    const position = Number(session.video.currentTime);
    const duration = Number(session.video.duration);
    if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) {
      return null;
    }

    const positionDidNotAdvance = Number.isFinite(session.lastPersistedPosition)
      && Math.abs(position - session.lastPersistedPosition) < 1;
    const samePositionIsPending = Number.isFinite(session.pendingPosition)
      && Math.abs(position - session.pendingPosition) < 1;
    if (!force && (positionDidNotAdvance || samePositionIsPending)) {
      return null;
    }

    const payload = {
      videoId: session.context.videoId,
      writerId: session.writerId,
      activityAt: session.activityAt,
      position,
      duration,
    };
    session.pendingPosition = position;

    if (currentSession === session) {
      publicState.record = isRestorable(position, duration)
        ? {
            ...payload,
            updatedAt: Date.now(),
          }
        : null;
    }

    try {
      const result = await sendMessage("progress:save", { payload });
      session.lastPersistedPosition = position;
      session.isStaleWriter = result?.saved === false && result.reason === "stale";
      if (session.isStaleWriter) {
        stopPeriodicSave(session);
      }
      if (currentSession === session && result) {
        publicState.record = result.record || null;
      }
      return result;
    } catch {
      return null;
    } finally {
      if (session.pendingPosition === position) {
        session.pendingPosition = null;
      }
    }
  }

  async function deleteSessionProgress(session, reason = "forgotten") {
    if (!session) {
      return null;
    }

    session.hasActivity = false;
    session.activityAt = Date.now();
    session.record = null;
    if (currentSession === session) {
      publicState.record = null;
    }

    try {
      return await sendMessage("progress:delete", {
        payload: {
          videoId: session.context.videoId,
          writerId: session.writerId,
          activityAt: session.activityAt,
          reason,
        },
      });
    } catch {
      return null;
    }
  }

  function stopPeriodicSave(session) {
    clearTimeout(session.saveTimer);
    session.saveTimer = null;
  }

  function schedulePeriodicSave(session) {
    stopPeriodicSave(session);
    if (
      session.destroyed
      || session.isStaleWriter
      || !session.video
      || session.video.paused
      || session.video.ended
    ) {
      return;
    }

    session.saveTimer = setTimeout(async () => {
      session.saveTimer = null;
      if (!session.destroyed && !session.video.paused && !session.video.ended) {
        if (!isAdPlaying(session.video)) {
          await saveSession(session);
        }
        schedulePeriodicSave(session);
      }
    }, SAVE_INTERVAL_MS);
  }

  function attachPlaybackListeners(session) {
    const { video } = session;

    addListener(session, video, "play", () => {
      markActivity(session);
      void saveSession(session, { force: true });
      schedulePeriodicSave(session);
    });

    addListener(session, video, "seeked", () => {
      if (session.restoring) {
        return;
      }
      markActivity(session);
      void saveSession(session, { force: true });
      schedulePeriodicSave(session);
    });

    addListener(session, video, "pause", () => {
      stopPeriodicSave(session);
      void saveSession(session, { force: true });
    });

    addListener(session, video, "ended", () => {
      stopPeriodicSave(session);
      markActivity(session);
      void deleteSessionProgress(session, "completed");
    });

    addListener(session, document, "visibilitychange", () => {
      if (document.visibilityState === "visible" && !video.paused && !video.ended) {
        markActivity(session);
        schedulePeriodicSave(session);
      }
      void saveSession(session, { force: true });
    });

    if (!video.paused && !video.ended) {
      markActivity(session);
      void saveSession(session, { force: true });
      schedulePeriodicSave(session);
    }
  }

  function removeToast(immediate = false) {
    if (!activeToast) {
      return;
    }

    const toast = activeToast;
    activeToast = null;
    toast.stopTimer();

    if (immediate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      toast.element.remove();
      return;
    }

    toast.element.classList.add("yt-resume-toast--leaving");
    setTimeout(() => toast.element.remove(), 160);
  }

  function showRestoreToast(session, position) {
    const player = getPlayer(session.video);
    if (!player) {
      return;
    }

    removeToast(true);

    const element = document.createElement("div");
    element.className = "yt-resume-toast";

    const liveRegion = document.createElement("span");
    liveRegion.className = "yt-resume-sr-only";
    liveRegion.setAttribute("aria-live", "polite");

    const message = document.createElement("span");
    message.className = "yt-resume-toast__message";
    message.textContent = `Resumed locally at ${formatTime(position)}`;

    const startOverButton = document.createElement("button");
    startOverButton.type = "button";
    startOverButton.className = "yt-resume-toast__action";
    startOverButton.textContent = "Start over";

    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.className = "yt-resume-toast__dismiss";
    dismissButton.textContent = "Dismiss";

    element.append(liveRegion, message, startOverButton, dismissButton);
    player.append(element);

    let remaining = TOAST_LIFETIME_MS;
    let startedAt = Date.now();
    let timer = null;

    function stopTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function pauseTimer() {
      if (!timer) {
        return;
      }
      remaining = Math.max(0, remaining - (Date.now() - startedAt));
      stopTimer();
    }

    function startTimer() {
      if (timer || remaining <= 0) {
        return;
      }
      startedAt = Date.now();
      timer = setTimeout(() => removeToast(), remaining);
    }

    startOverButton.addEventListener("click", () => {
      if (currentSession !== session || session.destroyed) {
        removeToast();
        return;
      }

      markActivity(session);
      session.video.currentTime = 0;
      void saveSession(session, { force: true });
      removeToast();
    });

    dismissButton.addEventListener("click", () => removeToast());
    element.addEventListener("pointerenter", pauseTimer);
    element.addEventListener("pointerleave", startTimer);
    element.addEventListener("focusin", pauseTimer);
    element.addEventListener("focusout", (event) => {
      if (!element.contains(event.relatedTarget)) {
        startTimer();
      }
    });

    activeToast = { element, stopTimer };
    startTimer();
    setTimeout(() => {
      liveRegion.textContent = `Video resumed locally at ${formatTime(position)}. Start over is available.`;
    }, 0);
  }

  function waitForSeekOrTimeout(video, timeoutMs) {
    return new Promise((resolve) => {
      let timeout;

      function finish() {
        clearTimeout(timeout);
        video.removeEventListener("seeked", finish);
        resolve();
      }

      video.addEventListener("seeked", finish, { once: true });
      timeout = setTimeout(finish, timeoutMs);
    });
  }

  async function restorePosition(session, record) {
    await delay(RESTORE_SETTLE_MS);
    if (session.destroyed || currentSession !== session || isAdPlaying(session.video)) {
      return;
    }

    const target = Math.min(record.position, Math.max(0, session.video.duration - 0.25));
    let userInteracted = false;
    let restoredPositionIsCurrent = true;
    const noteUserInteraction = () => {
      userInteracted = true;
    };

    document.addEventListener("pointerdown", noteUserInteraction, true);
    document.addEventListener("keydown", noteUserInteraction, true);
    session.restoring = true;

    try {
      session.video.currentTime = target;
      await waitForSeekOrTimeout(session.video, 800);

      const settledAt = performance.now();
      await delay(450);
      const elapsedPlayback = session.video.paused
        ? 0
        : ((performance.now() - settledAt) / 1000) * session.video.playbackRate;
      const expectedPosition = target + elapsedPlayback;
      const playerMovedElsewhere = Math.abs(session.video.currentTime - expectedPosition) > 2.25;
      restoredPositionIsCurrent = !(playerMovedElsewhere && userInteracted);

      if (
        playerMovedElsewhere
        && !userInteracted
        && !session.destroyed
        && currentSession === session
        && !isAdPlaying(session.video)
      ) {
        session.video.currentTime = target;
        await waitForSeekOrTimeout(session.video, 600);
      }
    } finally {
      document.removeEventListener("pointerdown", noteUserInteraction, true);
      document.removeEventListener("keydown", noteUserInteraction, true);
      session.restoring = false;
    }

    if (!session.destroyed && currentSession === session && restoredPositionIsCurrent) {
      showRestoreToast(session, target);
    }
  }

  function stopCurrentSession(save = true) {
    const session = currentSession;
    if (!session) {
      return;
    }

    if (save) {
      void saveSession(session, { force: true });
    }

    currentSession = null;
    session.destroyed = true;
    clearTimeout(session.playerCheckTimer);
    stopPeriodicSave(session);
    for (const cleanup of session.cleanups) {
      cleanup();
    }
    removeToast(true);
  }

  async function startForCurrentUrl(force = false) {
    lastObservedUrl = location.href;
    const context = parseVideoContext(location.href);

    if (!context) {
      stopCurrentSession(true);
      publicState = createPublicState();
      return;
    }

    if (!force && currentSession && currentSession.context.videoId === context.videoId) {
      publicState.title = getVideoTitle();
      return;
    }

    stopCurrentSession(true);

    const session = {
      activityAt: 0,
      cleanups: [],
      context,
      destroyed: false,
      hasActivity: false,
      isStaleWriter: false,
      lastPersistedPosition: null,
      pendingPosition: null,
      playerCheckDelay: INITIAL_PLAYER_CHECK_INTERVAL_MS,
      playerCheckTimer: null,
      record: null,
      restoring: false,
      saveTimer: null,
      settings: { ...settings },
      video: null,
      writerId: makeWriterId(),
    };
    currentSession = session;

    publicState = createPublicState({
      supported: true,
      reason: "Loading video…",
      videoId: context.videoId,
      title: getVideoTitle(),
    });

    let record;
    try {
      [settings, record] = await Promise.all([
        sendMessage("settings:get").then(normalizeSettings),
        sendMessage("progress:get", { videoId: context.videoId }),
      ]);
    } catch {
      settings = { ...DEFAULT_SETTINGS };
      record = null;
    }

    if (session.destroyed || currentSession !== session) {
      return;
    }

    session.settings = { ...settings };
    session.record = record;
    session.lastPersistedPosition = Number(record?.position);
    publicState.enabled = settings.enabled;
    publicState.record = record;
    publicState.title = getVideoTitle();

    if (!settings.enabled) {
      publicState.reason = "Resume is paused.";
      return;
    }

    const video = await waitForPlayableVideo(session);
    if (!video || session.destroyed || currentSession !== session) {
      return;
    }

    session.video = video;
    const excludedReason = getExcludedReason(video);
    if (excludedReason) {
      publicState.supported = false;
      publicState.reason = excludedReason;
      return;
    }

    publicState.reason = record ? "Checkpoint ready." : "No checkpoint saved yet.";
    publicState.title = getVideoTitle();

    if (record && !context.hasExplicitTimestamp) {
      if (isRestorable(record.position, video.duration)) {
        await restorePosition(session, record);
      } else if (isNearCompletion(record.position, video.duration)) {
        await deleteSessionProgress(session, "completed");
      }
    }

    if (session.destroyed || currentSession !== session) {
      return;
    }

    attachPlaybackListeners(session);
  }

  function scheduleStart(force = false) {
    clearTimeout(navigationTimer);
    navigationTimer = setTimeout(() => {
      void startForCurrentUrl(force);
    }, 60);
  }

  async function getPageState() {
    const context = parseVideoContext(location.href);
    if (!context) {
      return createPublicState();
    }

    let record = publicState.videoId === context.videoId ? publicState.record : null;
    try {
      record = await sendMessage("progress:get", { videoId: context.videoId });
    } catch {
      // Keep the last known local state when the background page is restarting.
    }

    return {
      ...publicState,
      enabled: settings.enabled,
      record,
      supported: publicState.videoId === context.videoId ? publicState.supported : true,
      videoId: context.videoId,
      title: getVideoTitle(),
    };
  }

  async function forgetCurrentVideo() {
    const context = parseVideoContext(location.href);
    if (!context) {
      return getPageState();
    }

    let session = currentSession;
    if (!session || session.context.videoId !== context.videoId) {
      session = {
        activityAt: Date.now(),
        context,
        destroyed: false,
        hasActivity: false,
        record: null,
        settings: { ...settings },
        video: null,
        writerId: makeWriterId(),
      };
    }

    await deleteSessionProgress(session, "forgotten");
    removeToast();
    return getPageState();
  }

  browser.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== "string") {
      return undefined;
    }

    if (message.type === "page:get-state") {
      return getPageState();
    }

    if (message.type === "page:forget") {
      return forgetCurrentVideo();
    }

    return undefined;
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.settings) {
      return;
    }

    const previousSettings = settings;
    const settingsWereCleared = typeof changes.settings.newValue === "undefined";
    const nextSettings = normalizeSettings(changes.settings.newValue);

    if (previousSettings.enabled && !nextSettings.enabled && currentSession) {
      void saveSession(currentSession, { force: true });
    }

    if (settingsWereCleared && currentSession) {
      currentSession.hasActivity = false;
      currentSession.record = null;
      publicState.record = null;
    }

    settings = nextSettings;
    if (currentSession) {
      currentSession.settings = { ...nextSettings };
    }

    if (previousSettings.enabled !== nextSettings.enabled) {
      scheduleStart(true);
    }
  });

  function checkForLocationChange() {
    if (location.href !== lastObservedUrl) {
      lastObservedUrl = location.href;
      scheduleStart();
    }
  }

  const navigationObserver = new MutationObserver(checkForLocationChange);
  navigationObserver.observe(document.head, {
    characterData: true,
    childList: true,
    subtree: true,
  });

  document.addEventListener("yt-navigate-start", () => stopCurrentSession(true));
  document.addEventListener("yt-navigate-finish", () => scheduleStart());
  window.addEventListener("hashchange", checkForLocationChange);
  window.addEventListener("popstate", checkForLocationChange);
  window.addEventListener("pageshow", checkForLocationChange);
  window.addEventListener("pagehide", () => {
    if (currentSession) {
      void saveSession(currentSession, { force: true });
    }
  });

  scheduleStart(true);
})();
