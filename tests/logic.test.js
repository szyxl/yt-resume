"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SETTINGS,
  MAX_PROGRESS_RECORDS,
  createLatestTaskQueue,
  formatTime,
  isExpired,
  isNearCompletion,
  isRadioMixUrl,
  isRestorable,
  isVerifiedCompletion,
  matchesVideoContext,
  normalizeSettings,
  parseVideoContext,
  progressKey,
  selectProgressKeysForEviction,
  shouldAcceptWrite,
  shouldRestoreCheckpoint,
} = require("../firefox/logic.js");

test("parses standard YouTube watch URLs by video ID", () => {
  assert.deepEqual(parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123"), {
    videoId: "dQw4w9WgXcQ",
    hasExplicitTimestamp: false,
    timestampSeconds: null,
  });
});

test("rejects YouTube Mix and Radio URLs", () => {
  const radioUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1";

  assert.equal(isRadioMixUrl(radioUrl), true);
  assert.equal(parseVideoContext(radioUrl), null);
  assert.equal(isRadioMixUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&start_radio=0"), false);
});

test("detects and parses explicit timestamp variants", () => {
  assert.equal(parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s").timestampSeconds, 42);
  assert.equal(parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=42").timestampSeconds, 42);
  assert.equal(parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=42").timestampSeconds, 42);
  assert.equal(parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s").timestampSeconds, 3723);
  assert.equal(parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=invalid").hasExplicitTimestamp, true);
  assert.equal(parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=invalid").timestampSeconds, null);
});

test("a direct timestamp older than local progress does not rewind playback", () => {
  const timestampContext = parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60s");

  assert.equal(shouldRestoreCheckpoint(timestampContext, 120), true);
});

test("timestamp links use the local checkpoint unless the URL is over a minute ahead", () => {
  const plainContext = parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  const timestampContext = parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=157s");
  const invalidTimestampContext = parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=invalid");

  assert.equal(shouldRestoreCheckpoint(plainContext, 80), true);
  assert.equal(shouldRestoreCheckpoint(timestampContext, 80), false);
  assert.equal(shouldRestoreCheckpoint(timestampContext, 97), true);
  assert.equal(shouldRestoreCheckpoint(timestampContext, 120), true);
  assert.equal(shouldRestoreCheckpoint(timestampContext, 431), true);
  assert.equal(shouldRestoreCheckpoint(invalidTimestampContext, 80), true);
});

test("rejects Shorts, Music, malformed IDs, and non-YouTube URLs", () => {
  assert.equal(parseVideoContext("https://www.youtube.com/shorts/dQw4w9WgXcQ"), null);
  assert.equal(parseVideoContext("https://music.youtube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseVideoContext("https://www.youtube.com/watch?v=short"), null);
  assert.equal(parseVideoContext("https://example.com/watch?v=dQw4w9WgXcQ"), null);
});

test("formats minute and hour timestamps", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(754.9), "12:34");
  assert.equal(formatTime(3723), "1:02:03");
  assert.equal(formatTime(Number.NaN), "0:00");
});

test("uses the final five percent capped at twenty seconds as completion", () => {
  assert.equal(isNearCompletion(579, 600), false);
  assert.equal(isNearCompletion(580, 600), true);
  assert.equal(isNearCompletion(29, 30), true);
  assert.equal(isNearCompletion(28.49, 30), false);
  assert.equal(isNearCompletion(3580, 3600), true);
  assert.equal(isNearCompletion(3579, 3600), false);
});

test("restores only meaningful unfinished positions", () => {
  assert.equal(isRestorable(4.99, 600), false);
  assert.equal(isRestorable(5, 600), true);
  assert.equal(isRestorable(579, 600), true);
  assert.equal(isRestorable(580, 600), false);
});

test("expires records using the configured retention period", () => {
  const now = Date.UTC(2026, 0, 31);
  const day = 24 * 60 * 60 * 1000;
  const record = { updatedAt: now - 91 * day };

  assert.equal(isExpired(record, 90, now), true);
  assert.equal(isExpired(record, 180, now), false);
  assert.equal(isExpired(record, 0, now), false);
});

test("normalizes settings to supported values", () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    enabled: true,
    retentionDays: 7,
    showResumeMessage: true,
  });
  assert.deepEqual(
    normalizeSettings({ enabled: true, retentionDays: 7, showResumeMessage: true }),
    DEFAULT_SETTINGS,
  );
  assert.deepEqual(normalizeSettings({ enabled: false, retentionDays: 365 }), {
    enabled: false,
    retentionDays: 365,
    showResumeMessage: true,
  });
  assert.deepEqual(normalizeSettings({
    enabled: false,
    retentionDays: 365,
    showResumeMessage: false,
  }), {
    enabled: false,
    retentionDays: 365,
    showResumeMessage: false,
  });
  assert.deepEqual(
    normalizeSettings({ enabled: "no", retentionDays: 17, showResumeMessage: "no" }),
    DEFAULT_SETTINGS,
  );
});

test("accepts only the most recent writer activity", () => {
  const existing = { writerId: "tab-a", activityAt: 200 };

  assert.equal(shouldAcceptWrite(existing, { writerId: "tab-b", activityAt: 201 }), true);
  assert.equal(shouldAcceptWrite(existing, { writerId: "tab-b", activityAt: 199 }), false);
  assert.equal(shouldAcceptWrite(existing, { writerId: "tab-b", activityAt: 200 }), false);
  assert.equal(shouldAcceptWrite(existing, { writerId: "tab-a", activityAt: 200 }), true);
});

test("builds namespaced progress keys and rejects invalid IDs", () => {
  assert.equal(progressKey("dQw4w9WgXcQ"), "progress:dQw4w9WgXcQ");
  assert.throws(() => progressKey("invalid"), /Invalid YouTube video ID/);
});

test("matches only the expected current video context", () => {
  assert.equal(matchesVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"), true);
  assert.equal(matchesVideoContext("https://www.youtube.com/watch?v=aqz-KE-bpKQ", "dQw4w9WgXcQ"), false);
  assert.equal(matchesVideoContext("https://example.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"), false);
});

test("accepts completion only from a trusted event and genuinely ended video", () => {
  const completedVideo = { currentTime: 600, duration: 600, ended: true };

  assert.equal(isVerifiedCompletion({ isTrusted: true }, completedVideo), true);
  assert.equal(isVerifiedCompletion({ isTrusted: false }, completedVideo), false);
  assert.equal(isVerifiedCompletion({ isTrusted: true }, { ...completedVideo, ended: false }), false);
  assert.equal(isVerifiedCompletion({ isTrusted: true }, { ...completedVideo, currentTime: 300 }), false);
});

test("latest-task queue keeps only the newest waiting value", async () => {
  const releases = [];
  const started = [];
  const queue = createLatestTaskQueue(async (value) => {
    started.push(value);
    await new Promise((resolve) => releases.push(resolve));
    return value;
  });

  const first = queue.enqueue(1);
  const second = queue.enqueue(2);
  const third = queue.enqueue(3);
  assert.deepEqual(started, [1]);
  assert.equal(queue.isIdle(), false);

  releases.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [1, 3]);

  releases.shift()();
  assert.equal(await first, 3);
  assert.equal(await second, 3);
  assert.equal(await third, 3);
  assert.equal(queue.isIdle(), true);
});

test("storage eviction keeps the newest bounded set", () => {
  const incomingKey = progressKey("newvideo001");
  const stored = {};
  for (let index = 0; index < MAX_PROGRESS_RECORDS; index += 1) {
    const videoId = String(index).padStart(11, "0");
    stored[progressKey(videoId)] = { updatedAt: index + 1 };
  }
  stored.settings = { enabled: true, retentionDays: 90 };

  assert.deepEqual(selectProgressKeysForEviction(stored, incomingKey), [progressKey("00000000000")]);
  assert.deepEqual(selectProgressKeysForEviction(stored, progressKey("00000000500")), []);
});
