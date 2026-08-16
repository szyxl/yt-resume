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

async function getProgress(videoId) {
  const key = progressKey(videoId);
  const [record, settings] = await Promise.all([getStoredRecord(videoId), getSettings()]);

  if (!record) {
    return null;
  }

  const tombstoneExpired = record.deleted && Date.now() - Number(record.updatedAt || 0) > TOMBSTONE_LIFETIME_MS;
  if (tombstoneExpired || (!record.deleted && isExpired(record, settings.retentionDays))) {
    await browser.storage.local.remove(key);
    return null;
  }

  return record.deleted ? null : record;
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

async function cleanupExpiredProgress(settings = null) {
  const effectiveSettings = settings || await getSettings();
  const all = await browser.storage.local.get(null);
  const now = Date.now();
  const keysToRemove = [];

  for (const [key, record] of Object.entries(all)) {
    if (!isProgressKey(key) || !record) {
      continue;
    }

    const tombstoneExpired = record.deleted && now - Number(record.updatedAt || 0) > TOMBSTONE_LIFETIME_MS;
    const progressExpired = !record.deleted && isExpired(record, effectiveSettings.retentionDays, now);

    if (tombstoneExpired || progressExpired) {
      keysToRemove.push(key);
    }
  }

  if (keysToRemove.length > 0) {
    await browser.storage.local.remove(keysToRemove);
  }

  return keysToRemove.length;
}

async function getStats() {
  await cleanupExpiredProgress();
  const all = await browser.storage.local.get(null);
  const count = Object.entries(all).filter(([key, record]) => isProgressKey(key) && record && !record.deleted).length;
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
