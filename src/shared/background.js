"use strict";

const {
  DEFAULT_SETTINGS,
  MAX_PENDING_MESSAGE_OPERATIONS,
  MINIMUM_POSITION_SECONDS,
  isExpired,
  isNearCompletion,
  isProgressKey,
  normalizeSettings,
  progressKey,
  selectProgressKeysForEviction,
  shouldAcceptWrite,
} = YTResume;
const { addMessageListener } = YTResumeBrowser;

const SETTINGS_KEY = "settings";
const TOMBSTONE_LIFETIME_MS = 24 * 60 * 60 * 1000;
let operationQueue = Promise.resolve();
let pendingMessageOperations = 0;

function enqueue(operation) {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.catch(() => undefined);
  return result;
}

function enqueueMessage(operation) {
  if (pendingMessageOperations >= MAX_PENDING_MESSAGE_OPERATIONS) {
    return Promise.reject(new Error("Too many pending extension operations"));
  }

  pendingMessageOperations += 1;
  return enqueue(operation).finally(() => {
    pendingMessageOperations -= 1;
  });
}

async function getSettings() {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

async function updateSettings(patch) {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await browser.storage.local.set({ [SETTINGS_KEY]: next });

  if (next.retentionDays !== current.retentionDays) {
    await cleanupExpiredProgress(next);
  }

  return next;
}

async function getStoredRecord(videoId) {
  const key = progressKey(videoId);
  const stored = await browser.storage.local.get(key);
  return stored[key] || null;
}

function shouldRemoveStoredRecord(record, settings, now = Date.now()) {
  const tombstoneExpired = record.deleted
    && now - Number(record.updatedAt || 0) > TOMBSTONE_LIFETIME_MS;
  const progressExpired = !record.deleted && isExpired(record, settings.retentionDays, now);
  return tombstoneExpired || progressExpired;
}

async function getSessionState(videoId) {
  const key = progressKey(videoId);
  const stored = await browser.storage.local.get([SETTINGS_KEY, key]);
  const settings = normalizeSettings(stored[SETTINGS_KEY]);
  let record = stored[key] || null;

  if (record && shouldRemoveStoredRecord(record, settings)) {
    await browser.storage.local.remove(key);
    record = null;
  }

  return {
    settings,
    record: record && !record.deleted ? record : null,
  };
}

async function getProgress(videoId) {
  return (await getSessionState(videoId)).record;
}

async function enforceProgressCapacity(incomingKey = null) {
  const all = await browser.storage.local.get(null);
  const existingProgressKey = Object.keys(all).find((key) => isProgressKey(key));
  const capacityKey = incomingKey || existingProgressKey;
  if (!capacityKey) {
    return 0;
  }

  const keysToRemove = selectProgressKeysForEviction(all, capacityKey);
  if (keysToRemove.length > 0) {
    await browser.storage.local.remove(keysToRemove);
  }
  return keysToRemove.length;
}

async function writeTombstone({ videoId, writerId, activityAt, reason }) {
  const key = progressKey(videoId);
  const existing = await getStoredRecord(videoId);
  const incoming = {
    videoId,
    writerId,
    activityAt: Number(activityAt) || Date.now(),
  };

  if (!shouldAcceptWrite(existing, incoming)) {
    return { saved: false, reason: "stale", record: existing && !existing.deleted ? existing : null };
  }

  if (!existing) {
    await enforceProgressCapacity(key);
  }
  await browser.storage.local.set({
    [key]: {
      ...incoming,
      deleted: true,
      reason: reason || "forgotten",
      updatedAt: Date.now(),
    },
  });

  return { saved: true, record: null };
}

async function saveProgress(payload) {
  const videoId = payload.videoId;
  const writerId = typeof payload.writerId === "string" ? payload.writerId : "";
  const position = Number(payload.position);
  const duration = Number(payload.duration);
  const activityAt = Number(payload.activityAt);

  if (!writerId || !Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(activityAt)) {
    throw new TypeError("Invalid progress payload");
  }

  if (position < MINIMUM_POSITION_SECONDS || isNearCompletion(position, duration)) {
    return writeTombstone({
      videoId,
      writerId,
      activityAt,
      reason: position < MINIMUM_POSITION_SECONDS ? "restarted" : "completed",
    });
  }

  const key = progressKey(videoId);
  const existing = await getStoredRecord(videoId);
  const incoming = {
    videoId,
    writerId,
    activityAt,
    position,
    duration,
  };

  if (!shouldAcceptWrite(existing, incoming)) {
    return { saved: false, reason: "stale", record: existing && !existing.deleted ? existing : null };
  }

  const record = {
    ...incoming,
    updatedAt: Date.now(),
  };
  if (!existing) {
    await enforceProgressCapacity(key);
  }
  await browser.storage.local.set({ [key]: record });
  return { saved: true, record };
}

function inspectProgressStorage(stored, settings, now = Date.now()) {
  let count = 0;
  const keysToRemove = [];

  for (const [key, record] of Object.entries(stored)) {
    if (!isProgressKey(key) || !record) {
      continue;
    }

    if (shouldRemoveStoredRecord(record, settings, now)) {
      keysToRemove.push(key);
    } else if (!record.deleted) {
      count += 1;
    }
  }

  return { count, keysToRemove };
}

async function cleanupExpiredProgress(settings = null) {
  const all = await browser.storage.local.get(null);
  const effectiveSettings = settings || normalizeSettings(all[SETTINGS_KEY]);
  const { keysToRemove } = inspectProgressStorage(all, effectiveSettings);

  if (keysToRemove.length > 0) {
    await browser.storage.local.remove(keysToRemove);
  }

  return keysToRemove.length;
}

async function getStats() {
  const all = await browser.storage.local.get(null);
  const settings = normalizeSettings(all[SETTINGS_KEY]);
  const { count, keysToRemove } = inspectProgressStorage(all, settings);

  if (keysToRemove.length > 0) {
    await browser.storage.local.remove(keysToRemove);
  }

  return { count };
}

async function clearAllData() {
  await browser.storage.local.clear();
  return { settings: { ...DEFAULT_SETTINGS }, count: 0 };
}

async function handleMessage(message) {
  switch (message.type) {
    case "settings:get":
      return getSettings();
    case "settings:update":
      return updateSettings(message.patch || {});
    case "session:get":
      return getSessionState(message.videoId);
    case "progress:get":
      return getProgress(message.videoId);
    case "progress:save":
      return saveProgress(message.payload || {});
    case "progress:delete":
      return writeTombstone(message.payload || {});
    case "progress:stats":
      return getStats();
    case "data:clear":
      return clearAllData();
    default:
      return undefined;
  }
}

addMessageListener((message) => {
  if (!message || typeof message.type !== "string") {
    return undefined;
  }

  return enqueueMessage(() => handleMessage(message));
});

browser.runtime.onInstalled.addListener(() => {
  enqueue(async () => {
    const stored = await browser.storage.local.get(SETTINGS_KEY);
    if (!stored[SETTINGS_KEY]) {
      await browser.storage.local.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS } });
    }
    await cleanupExpiredProgress();
    await enforceProgressCapacity();
  });
});

browser.runtime.onStartup.addListener(() => {
  enqueue(async () => {
    await cleanupExpiredProgress();
    await enforceProgressCapacity();
  });
});
