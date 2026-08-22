"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const logic = require("../src/shared/logic.js");
const {
  createPlaybackSessionController,
} = require("../src/shared/playback-session.js");

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ listener, once: Boolean(options && options.once) });
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((entry) => entry.listener !== listener));
  }

  dispatchEvent(event) {
    const listeners = [...(this.listeners.get(event.type) || [])];
    for (const entry of listeners) {
      entry.listener.call(this, event);
      if (entry.once) {
        this.removeEventListener(event.type, entry.listener);
      }
    }
  }
}

class FakeElement extends FakeEventTarget {
  constructor() {
    super();
    this.attributes = new Map();
    this.children = [];
    this.classList = {
      add() {},
      contains() {
        return false;
      },
    };
    this.textContent = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  contains(element) {
    return this.children.includes(element);
  }

  remove() {}

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

class FakeVideo extends FakeEventTarget {
  constructor(player) {
    super();
    this.player = player;
    this.assignedTimes = [];
    this._currentTime = 303;
    this.duration = 900;
    this.ended = false;
    this.paused = true;
    this.playbackRate = 1;
    this.readyState = 1;
  }

  get currentTime() {
    return this._currentTime;
  }

  set currentTime(value) {
    this.assignedTimes.push(value);
    this._currentTime = value;
    queueMicrotask(() => this.dispatchEvent({ type: "seeked" }));
  }

  closest(selector) {
    return selector === ".html5-video-player" ? this.player : null;
  }
}

test("playback session controller restores checkpoints and cleans up its lifecycle", async () => {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const player = new FakeElement();
  const video = new FakeVideo(player);
  let videoAvailable = true;
  let videoQueryCount = 0;
  const titleElement = new FakeElement();
  const watchPage = new FakeElement();
  watchPage.setAttribute("video-id", "dQw4w9WgXcQ");
  const document = new FakeEventTarget();
  document.head = {};
  document.referrer = "";
  document.title = "Test video - YouTube";
  document.visibilityState = "visible";
  document.querySelector = (selector) => {
    if (selector === "video.html5-main-video") {
      videoQueryCount += 1;
      return videoAvailable ? video : null;
    }
    if (selector === ".html5-video-player") {
      return player;
    }
    if (selector === "title") {
      return titleElement;
    }
    if (selector === "ytd-watch-flexy") {
      return watchPage;
    }
    return null;
  };
  document.createElement = () => new FakeElement();

  const clock = { now: () => Date.now() };
  const sentMessages = [];
  let messageListener = null;
  let storageChangeListener = null;
  let showResumeMessage = false;
  let holdNextProgressSave = false;
  let releaseHeldProgressSave = null;

  function getRecord(videoId) {
    if (videoId === "dQw4w9WgXcQ") {
      return {
        videoId,
        writerId: "saved",
        activityAt: 1,
        position: 431,
        duration: 900,
        updatedAt: 1,
      };
    }

    if (videoId === "otherVideo1") {
      return {
        videoId,
        writerId: "saved",
        activityAt: 2,
        position: 1200,
        duration: 3600,
        updatedAt: 2,
      };
    }

    return null;
  }

  const browserApi = {
    addMessageListener(listener) {
      messageListener = listener;
      return () => {
        if (messageListener === listener) {
          messageListener = null;
        }
      };
    },
    sendRuntimeMessage(message) {
      sentMessages.push(message);
      if (message.type === "session:get") {
        return Promise.resolve({
          settings: { enabled: true, retentionDays: 90, showResumeMessage },
          record: getRecord(message.videoId),
        });
      }
      if (message.type === "progress:get") {
        return Promise.resolve(getRecord(message.videoId));
      }
      if (message.type === "progress:save") {
        const result = {
          saved: true,
          record: { ...message.payload, updatedAt: clock.now() },
        };
        if (holdNextProgressSave) {
          holdNextProgressSave = false;
          return new Promise((resolve) => {
            releaseHeldProgressSave = () => resolve(result);
          });
        }
        return Promise.resolve(result);
      }
      return Promise.resolve(null);
    },
  };
  const browser = {
    storage: {
      onChanged: {
        addListener(listener) {
          storageChangeListener = listener;
        },
        removeListener(listener) {
          if (storageChangeListener === listener) {
            storageChangeListener = null;
          }
        },
      },
    },
  };
  const location = { href: "https://www.youtube.com/" };
  const window = new FakeEventTarget();
  let navigationObservation = null;
  let navigationObserverDisconnected = false;
  class FakeMutationObserver {
    observe(target, options) {
      navigationObservation = { target, options };
    }

    disconnect() {
      navigationObserverDisconnected = true;
    }
  }
  const environment = {
    browser,
    clearTimeout: realClearTimeout,
    crypto: { randomUUID: () => "test-writer-id" },
    Date: clock,
    document,
    HTMLMediaElement: { HAVE_METADATA: 1 },
    location,
    matchMedia: () => ({ matches: true }),
    Math,
    MutationObserver: FakeMutationObserver,
    performance,
    setTimeout: (callback, milliseconds, ...args) =>
      realSetTimeout(callback, Math.min(milliseconds, 2), ...args),
    window,
  };

  let controller = null;
  try {
    controller = createPlaybackSessionController({ browserApi, environment, logic });
    controller.start();
    await new Promise((resolve) => realSetTimeout(resolve, 10));
    assert.deepEqual(navigationObservation, {
      target: titleElement,
      options: { characterData: true, childList: true, subtree: true },
    });

    document.dispatchEvent({ type: "yt-navigate-start" });
    location.href = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&start_radio=1";
    document.dispatchEvent({ type: "yt-navigate-finish" });

    await new Promise((resolve) => realSetTimeout(resolve, 10));
    assert.deepEqual(sentMessages, []);
    const radioState = await messageListener({ type: "page:get-state" });
    assert.equal(radioState.reasonCode, "radio-mix");
    assert.equal(radioState.reason, "YouTube Mix and Radio playback isn't saved.");

    document.dispatchEvent({ type: "yt-navigate-start" });
    location.href = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=303s";
    document.dispatchEvent({ type: "yt-navigate-finish" });

    await new Promise((resolve) => realSetTimeout(resolve, 30));
    assert.equal(video.currentTime, 431);
    assert.equal(player.children.length, 0);

    showResumeMessage = true;
    document.dispatchEvent({ type: "yt-navigate-start" });
    location.href = "https://www.youtube.com/watch?v=otherVideo1&t=157s";
    document.dispatchEvent({ type: "yt-navigate-finish" });

    realSetTimeout(() => {
      watchPage.setAttribute("video-id", "otherVideo1");
      video.duration = 3600;
      video.currentTime = 157;
      video.dispatchEvent({ type: "loadedmetadata" });
    }, 12);

    await new Promise((resolve) => realSetTimeout(resolve, 40));
    assert.equal(video.currentTime, 1200, `Player assignments: ${video.assignedTimes.join(", ")}`);
    assert.equal(player.children.length, 1);
    assert.equal(sentMessages.some((message) => message.type === "settings:get"), false);

    holdNextProgressSave = true;
    video._currentTime = 1205;
    video.paused = false;
    video.dispatchEvent({ type: "play" });
    video.paused = true;
    assert.equal(typeof releaseHeldProgressSave, "function");

    video._currentTime = 1234;
    location.href = "https://www.youtube.com/";
    document.dispatchEvent({ type: "yt-navigate-start" });
    releaseHeldProgressSave();

    await new Promise((resolve) => realSetTimeout(resolve, 10));
    const savedPositions = sentMessages
      .filter((message) => message.type === "progress:save")
      .map((message) => message.payload.position);
    assert.equal(savedPositions.at(-1), 1234);

    videoAvailable = false;
    const realNow = clock.now;
    let fakeNow = realNow();
    clock.now = () => {
      fakeNow += 10_000;
      return fakeNow;
    };

    try {
      location.href = "https://www.youtube.com/watch?v=thirdVideo1";
      document.dispatchEvent({ type: "yt-navigate-finish" });
      await new Promise((resolve) => realSetTimeout(resolve, 20));

      const queriesAfterTimeout = videoQueryCount;
      await new Promise((resolve) => realSetTimeout(resolve, 10));
      assert.equal(videoQueryCount, queriesAfterTimeout);
      const unavailableState = await messageListener({ type: "page:get-state" });
      assert.equal(unavailableState.reason, "Video player unavailable. Reload YouTube to try again.");
    } finally {
      clock.now = realNow;
    }

    controller.dispose();
    controller = null;
    assert.equal(messageListener, null);
    assert.equal(storageChangeListener, null);
    assert.equal(navigationObserverDisconnected, true);
    assert.equal((document.listeners.get("yt-navigate-start") || []).length, 0);
    assert.equal((window.listeners.get("pagehide") || []).length, 0);
  } finally {
    controller?.dispose();
  }
});
