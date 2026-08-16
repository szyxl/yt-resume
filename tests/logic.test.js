"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SETTINGS,
  formatTime,
  isExpired,
  isNearCompletion,
  isRestorable,
  normalizeSettings,
  parseVideoContext,
  progressKey,
  shouldAcceptWrite,
} = require("../logic.js");

test("parses standard YouTube watch URLs by video ID", () => {
  assert.deepEqual(parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123"), {
    videoId: "dQw4w9WgXcQ",
    hasExplicitTimestamp: false,
  });
});

test("detects explicit timestamp variants", () => {
  assert.equal(parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s").hasExplicitTimestamp, true);
  assert.equal(parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=42").hasExplicitTimestamp, true);
  assert.equal(parseVideoContext("https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=42").hasExplicitTimestamp, true);
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
  assert.deepEqual(normalizeSettings({ enabled: false, retentionDays: 365 }), {
    enabled: false,
    retentionDays: 365,
  });
  assert.deepEqual(normalizeSettings({ enabled: "no", retentionDays: 17 }), DEFAULT_SETTINGS);
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
