"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");

test("content script has no permanent interval wakeups", () => {
  const source = fs.readFileSync(path.join(projectRoot, "content.js"), "utf8");
  assert.doesNotMatch(source, /\bsetInterval\s*\(/);
  assert.match(source, /MutationObserver/);
});

test("extension requests only local storage and the YouTube host", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://www.youtube.com/*"]);
});

test("runtime ships without production dependencies", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.equal(packageJson.dependencies, undefined);
});
