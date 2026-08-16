"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

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

  setAttribute() {}
}

class FakeVideo extends FakeEventTarget {
  constructor(player) {
    super();
    this.player = player;
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
    this._currentTime = value;
    queueMicrotask(() => this.dispatchEvent({ type: "seeked" }));
  }

  closest(selector) {
    return selector === ".html5-video-player" ? this.player : null;
  }
}

test("a YouTube Home resume link does not override the newer local checkpoint", async () => {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const player = new FakeElement();
  const video = new FakeVideo(player);
  const document = new FakeEventTarget();
  document.head = {};
  document.referrer = "";
  document.title = "Test video - YouTube";
  document.visibilityState = "visible";
  document.querySelector = (selector) => {
    if (selector === "video.html5-main-video") {
      return video;
    }
    if (selector === ".html5-video-player") {
      return player;
    }
    return null;
  };
  document.createElement = () => new FakeElement();

  globalThis.setTimeout = (callback, milliseconds, ...args) =>
    realSetTimeout(callback, Math.min(milliseconds, 2), ...args);
  globalThis.clearTimeout = realClearTimeout;
  globalThis.YTResume = require("../firefox/logic.js");
  globalThis.YTResumeBrowser = {
    addMessageListener() {},
    sendRuntimeMessage(message) {
      if (message.type === "settings:get") {
        return Promise.resolve({ enabled: true, retentionDays: 90 });
      }
      if (message.type === "progress:get") {
        return Promise.resolve({
          videoId: "dQw4w9WgXcQ",
          writerId: "saved",
          activityAt: 1,
          position: 431,
          duration: 900,
          updatedAt: 1,
        });
      }
      return Promise.resolve(null);
    },
  };
  globalThis.browser = {
    storage: {
      onChanged: {
        addListener() {},
      },
    },
  };
  globalThis.location = {
    href: "https://www.youtube.com/",
  };
  globalThis.document = document;
  globalThis.window = new FakeEventTarget();
  globalThis.HTMLMediaElement = { HAVE_METADATA: 1 };
  globalThis.MutationObserver = class {
    observe() {}
  };
  globalThis.matchMedia = () => ({ matches: true });

  try {
    require("../firefox/content.js");
    await new Promise((resolve) => realSetTimeout(resolve, 10));

    document.dispatchEvent({ type: "yt-navigate-start" });
    globalThis.location.href = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=303s";
    document.dispatchEvent({ type: "yt-navigate-finish" });

    await new Promise((resolve) => realSetTimeout(resolve, 30));
    assert.equal(video.currentTime, 431);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
});
