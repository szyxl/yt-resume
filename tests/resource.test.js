"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const platforms = ["firefox", "chromium"];
const sharedRuntimePaths = [
  "LICENSE",
  "background.js",
  "browser-api.js",
  "content.css",
  "content.js",
  "icons/icon-flat-16.png",
  "icons/icon-flat-32.png",
  "icons/icon-flat-48.png",
  "icons/icon-flat-96.png",
  "icons/icon.svg",
  "logic.js",
  "options.html",
  "options.js",
  "popup.html",
  "popup.js",
  "ui.css",
];

function readPlatformFile(platform, relativePath, encoding = "utf8") {
  return fs.readFileSync(path.join(projectRoot, platform, relativePath), encoding);
}

function readManifest(platform) {
  return JSON.parse(readPlatformFile(platform, "manifest.json"));
}

test("content script has no permanent interval wakeups", () => {
  const source = readPlatformFile("firefox", "content.js");
  assert.doesNotMatch(source, /\bsetInterval\s*\(/);
  assert.match(source, /MutationObserver/);
});

test("pausing marks activity and immediately saves the checkpoint", () => {
  const source = readPlatformFile("firefox", "content.js");
  assert.match(
    source,
    /addListener\(session, video, "pause", \(\) => \{\s*stopPeriodicSave\(session\);\s*markActivity\(session\);\s*void saveSession\(session, \{ force: true \}\);\s*\}\);/,
  );
});

test("content script coalesces saves and verifies destructive events", () => {
  const source = readPlatformFile("firefox", "content.js");
  assert.match(source, /createLatestTaskQueue/);
  assert.match(source, /isVerifiedCompletion\(event, video\)/);
  assert.match(source, /if \(!event\.isTrusted\)/);
});

test("both extensions request only local storage and required YouTube content access", () => {
  for (const platform of platforms) {
    const manifest = readManifest(platform);
    assert.deepEqual(manifest.permissions, ["storage"]);
    assert.equal(manifest.host_permissions, undefined);
    assert.deepEqual(manifest.content_scripts[0].matches, ["https://www.youtube.com/*"]);
    assert.equal(manifest.content_scripts[0].js[0], "browser-api.js");
  }
});

test("Firefox and Chromium runtime files stay in sync", () => {
  for (const relativePath of sharedRuntimePaths) {
    const firefoxFile = readPlatformFile("firefox", relativePath, null);
    const chromiumFile = readPlatformFile("chromium", relativePath, null);
    assert.deepEqual(chromiumFile, firefoxFile, `${relativePath} differs between platforms`);
  }
});

test("runtime ships without production dependencies and locks build tooling", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(projectRoot, "package-lock.json"), "utf8"));
  const lockedWebExt = packageLock.packages["node_modules/web-ext"];

  assert.equal(packageJson.dependencies, undefined);
  assert.equal(packageJson.devDependencies["web-ext"], "10.6.0");
  assert.equal(lockedWebExt.version, "10.6.0");
  assert.match(lockedWebExt.integrity, /^sha512-/);

  for (const script of Object.values(packageJson.scripts)) {
    assert.doesNotMatch(script, /npx\s+--yes/);
  }
});

test("popup and settings reuse the shared logo artwork", () => {
  for (const platform of platforms) {
    for (const file of ["popup.html", "options.html"]) {
      const source = readPlatformFile(platform, file);
      assert.match(source, /<img class="brand-mark[^"]*" src="icons\/icon\.svg" alt="">/);
      assert.match(source, /<script src="browser-api\.js" defer><\/script>/);
      assert.doesNotMatch(source, /brand-mark__(?:play|track)/);
    }
  }
});

test("settings offer seven-day checkpoint retention", () => {
  for (const platform of platforms) {
    const source = readPlatformFile(platform, "options.html");
    assert.match(source, /<option value="7">7 days<\/option>/);
  }
});

test("runtime visual palette remains monochrome", () => {
  for (const file of ["ui.css", "content.css", "icons/icon.svg"]) {
    const source = readPlatformFile("firefox", file);
    const colors = source.match(/#[0-9a-f]{6}/gi) || [];

    for (const color of colors) {
      const channels = [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)];
      assert.equal(new Set(channels).size, 1, `${file} contains non-monochrome color ${color}`);
    }
  }
});
