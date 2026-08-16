"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const storage = new Map();
let messageListener;
let installedListener;
let startupListener;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

globalThis.YTResume = require("../logic.js");
globalThis.browser = {
  runtime: {
    onMessage: {
      addListener(listener) {
        messageListener = listener;
      },
    },
    onInstalled: {
      addListener(listener) {
        installedListener = listener;
      },
    },
    onStartup: {
      addListener(listener) {
        startupListener = listener;
      },
    },
  },
  storage: {
    local: {
      async get(query) {
        if (query === null || typeof query === "undefined") {
          return Object.fromEntries([...storage].map(([key, value]) => [key, clone(value)]));
        }

        const keys = Array.isArray(query) ? query : [query];
        const result = {};
        for (const key of keys) {
          if (storage.has(key)) {
            result[key] = clone(storage.get(key));
          }
        }
        return result;
      },
      async set(values) {
        for (const [key, value] of Object.entries(values)) {
          storage.set(key, clone(value));
        }
      },
      async remove(query) {
        const keys = Array.isArray(query) ? query : [query];
        for (const key of keys) {
          storage.delete(key);
        }
      },
      async clear() {
        storage.clear();
      },
    },
  },
};

require("../background.js");

function dispatch(type, payload = {}) {
  return messageListener({ type, ...payload });
}

test("background registers lifecycle and message listeners", () => {
  assert.equal(typeof messageListener, "function");
  assert.equal(typeof installedListener, "function");
  assert.equal(typeof startupListener, "function");
});

test("settings default to enabled with 90-day retention", async () => {
  await dispatch("data:clear");
  assert.deepEqual(await dispatch("settings:get"), {
    enabled: true,
    retentionDays: 90,
  });
});

test("newer playback activity wins across tabs", async () => {
  await dispatch("data:clear");
  const videoId = "dQw4w9WgXcQ";

  const first = await dispatch("progress:save", {
    payload: {
      videoId,
      writerId: "tab-a",
      activityAt: 200,
      position: 100,
      duration: 600,
    },
  });
  assert.equal(first.saved, true);

  const stale = await dispatch("progress:save", {
    payload: {
      videoId,
      writerId: "tab-b",
      activityAt: 199,
      position: 240,
      duration: 600,
    },
  });
  assert.equal(stale.saved, false);
  assert.equal((await dispatch("progress:get", { videoId })).position, 100);

  const newer = await dispatch("progress:save", {
    payload: {
      videoId,
      writerId: "tab-b",
      activityAt: 201,
      position: 240,
      duration: 600,
    },
  });
  assert.equal(newer.saved, true);
  assert.equal((await dispatch("progress:get", { videoId })).position, 240);

  const staleClose = await dispatch("progress:delete", {
    payload: {
      videoId,
      writerId: "tab-a",
      activityAt: 200,
      reason: "forgotten",
    },
  });
  assert.equal(staleClose.saved, false);
  assert.equal((await dispatch("progress:get", { videoId })).position, 240);
});

test("early and nearly complete positions become non-restoring tombstones", async () => {
  await dispatch("data:clear");
  const videoId = "dQw4w9WgXcQ";

  await dispatch("progress:save", {
    payload: {
      videoId,
      writerId: "tab-a",
      activityAt: 300,
      position: 120,
      duration: 600,
    },
  });
  assert.equal((await dispatch("progress:get", { videoId })).position, 120);

  await dispatch("progress:save", {
    payload: {
      videoId,
      writerId: "tab-a",
      activityAt: 301,
      position: 2,
      duration: 600,
    },
  });
  assert.equal(await dispatch("progress:get", { videoId }), null);

  await dispatch("progress:save", {
    payload: {
      videoId,
      writerId: "tab-a",
      activityAt: 302,
      position: 580,
      duration: 600,
    },
  });
  assert.equal(await dispatch("progress:get", { videoId }), null);
});

test("clear all resets settings and progress", async () => {
  await dispatch("settings:update", { patch: { enabled: false, retentionDays: 365 } });
  const cleared = await dispatch("data:clear");

  assert.deepEqual(cleared, {
    settings: { enabled: true, retentionDays: 90 },
    count: 0,
  });
  assert.deepEqual(await dispatch("progress:stats"), { count: 0 });
  assert.deepEqual(await dispatch("settings:get"), { enabled: true, retentionDays: 90 });
});
