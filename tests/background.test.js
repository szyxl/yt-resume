"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const storage = new Map();
let messageListener;
let installedListener;
let startupListener;
let storageSetGate = null;
let storageGetCount = 0;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

globalThis.YTResume = require("../src/shared/logic.js");
const { MAX_PENDING_MESSAGE_OPERATIONS, MAX_PROGRESS_RECORDS, progressKey } = globalThis.YTResume;
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
        storageGetCount += 1;
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
        if (storageSetGate) {
          await storageSetGate;
        }
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

require("../src/shared/browser-api.js");
require("../src/shared/background.js");

function dispatch(type, payload = {}) {
  return messageListener({ type, ...payload });
}

test("background registers lifecycle and message listeners", () => {
  assert.equal(typeof messageListener, "function");
  assert.equal(typeof installedListener, "function");
  assert.equal(typeof startupListener, "function");
});

test("settings default to enabled with 7-day retention and resume messages visible", async () => {
  await dispatch("data:clear");
  assert.deepEqual(await dispatch("settings:get"), {
    enabled: true,
    retentionDays: 7,
    showResumeMessage: true,
  });
});

test("session state reads settings and progress in one storage operation", async () => {
  await dispatch("data:clear");
  const videoId = "dQw4w9WgXcQ";
  const record = {
    videoId,
    writerId: "tab-a",
    activityAt: 100,
    position: 120,
    duration: 600,
    updatedAt: Date.now(),
  };
  storage.set("settings", { enabled: false, retentionDays: 90, showResumeMessage: false });
  storage.set(progressKey(videoId), record);

  storageGetCount = 0;
  assert.deepEqual(await dispatch("session:get", { videoId }), {
    settings: { enabled: false, retentionDays: 90, showResumeMessage: false },
    record,
  });
  assert.equal(storageGetCount, 1);
});

test("progress stats inspect storage once", async () => {
  await dispatch("data:clear");
  const videoId = "dQw4w9WgXcQ";
  storage.set("settings", { enabled: true, retentionDays: 90, showResumeMessage: true });
  storage.set(progressKey(videoId), {
    videoId,
    writerId: "tab-a",
    activityAt: 100,
    position: 120,
    duration: 600,
    updatedAt: Date.now(),
  });

  storageGetCount = 0;
  assert.deepEqual(await dispatch("progress:stats"), { count: 1 });
  assert.equal(storageGetCount, 1);
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
  await dispatch("settings:update", {
    patch: { enabled: false, retentionDays: 365, showResumeMessage: false },
  });
  const cleared = await dispatch("data:clear");

  assert.deepEqual(cleared, {
    settings: { enabled: true, retentionDays: 7, showResumeMessage: true },
    count: 0,
  });
  assert.deepEqual(await dispatch("progress:stats"), { count: 0 });
  assert.deepEqual(await dispatch("settings:get"), {
    enabled: true,
    retentionDays: 7,
    showResumeMessage: true,
  });
});

test("background rejects messages beyond its pending-operation bound", async () => {
  await dispatch("data:clear");
  let releaseStorage;
  storageSetGate = new Promise((resolve) => {
    releaseStorage = resolve;
  });

  const pending = Array.from({ length: MAX_PENDING_MESSAGE_OPERATIONS }, (_, index) => dispatch("progress:save", {
    payload: {
      videoId: "dQw4w9WgXcQ",
      writerId: "tab-a",
      activityAt: 1000 + index,
      position: 10 + index,
      duration: 600,
    },
  }));
  const overflow = dispatch("progress:save", {
    payload: {
      videoId: "dQw4w9WgXcQ",
      writerId: "tab-a",
      activityAt: 2000,
      position: 200,
      duration: 600,
    },
  });

  await assert.rejects(overflow, /Too many pending extension operations/);
  releaseStorage();
  await Promise.all(pending);
  storageSetGate = null;
});

test("new progress records evict tombstones before live checkpoints at the storage cap", async () => {
  await dispatch("data:clear");
  storage.set("settings", { enabled: true, retentionDays: 90 });
  const tombstoneVideoId = String(MAX_PROGRESS_RECORDS - 1).padStart(11, "0");
  for (let index = 0; index < MAX_PROGRESS_RECORDS; index += 1) {
    const videoId = String(index).padStart(11, "0");
    const record = {
      videoId,
      writerId: "seed",
      activityAt: index + 1,
      position: 30,
      duration: 600,
      updatedAt: index + 1,
    };
    if (videoId === tombstoneVideoId) {
      record.deleted = true;
      record.reason = "completed";
    }
    storage.set(progressKey(videoId), record);
  }

  await dispatch("progress:save", {
    payload: {
      videoId: "newvideo001",
      writerId: "tab-a",
      activityAt: 5000,
      position: 45,
      duration: 600,
    },
  });

  const progressKeys = [...storage.keys()].filter((key) => key.startsWith("progress:"));
  assert.equal(progressKeys.length, MAX_PROGRESS_RECORDS);
  assert.equal(storage.has(progressKey("00000000000")), true);
  assert.equal(storage.has(progressKey(tombstoneVideoId)), false);
  assert.equal(storage.has(progressKey("newvideo001")), true);
  assert.equal(storage.has("settings"), true);
});
