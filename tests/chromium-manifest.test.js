"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");

function readManifest(platform) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, platform, "manifest.json"), "utf8"));
}

test("Chromium manifest uses only a Manifest V3 service worker", () => {
  const manifest = readManifest("chromium");

  assert.deepEqual(manifest.background, {
    service_worker: "background-worker.js",
  });
  assert.equal(manifest.browser_specific_settings, undefined);
  assert.equal(manifest.minimum_chrome_version, "99.0");
});

test("Firefox manifest uses only Manifest V3 background scripts", () => {
  const manifest = readManifest("firefox");

  assert.deepEqual(manifest.background, {
    scripts: ["browser-api.js", "logic.js", "background.js"],
  });
  assert.equal(manifest.background.service_worker, undefined);
  assert.ok(manifest.browser_specific_settings.gecko.id);
});
