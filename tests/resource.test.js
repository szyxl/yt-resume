"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "src");
const sharedSourceRoot = path.join(sourceRoot, "shared");
const distRoot = path.join(projectRoot, "dist");
const platforms = ["firefox", "chromium"];

function listRelativeFiles(root) {
  const files = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else {
        files.push(path.relative(root, absolutePath).split(path.sep).join("/"));
      }
    }
  }

  visit(root);
  return files.sort();
}

function readSharedFile(relativePath, encoding = "utf8") {
  return fs.readFileSync(path.join(sharedSourceRoot, relativePath), encoding);
}

function readPlatformFile(platform, relativePath, encoding = "utf8") {
  return fs.readFileSync(path.join(distRoot, platform, relativePath), encoding);
}

function readManifest(platform) {
  return JSON.parse(readPlatformFile(platform, "manifest.json"));
}

test("playback session has no permanent interval wakeups and observes only the page title", () => {
  const source = readSharedFile("playback-session.js");
  assert.doesNotMatch(source, /\bsetInterval\s*\(/);
  assert.match(source, /new MutationObserver/);
  assert.match(source, /document\.querySelector\("title"\) \|\| document\.head/);
});

test("pausing marks activity and immediately saves the checkpoint", () => {
  const source = readSharedFile("playback-session.js");
  assert.match(
    source,
    /addListener\(session, video, "pause", \(\) => \{\s*stopPeriodicSave\(session\);\s*markActivity\(session\);\s*void saveSession\(session, \{ force: true \}\);\s*\}\);/,
  );
});

test("playback session coalesces saves and verifies destructive events", () => {
  const source = readSharedFile("playback-session.js");
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
    assert.deepEqual(manifest.content_scripts[0].js, [
      "browser-api.js",
      "logic.js",
      "playback-session.js",
      "content.js",
    ]);
  }
});

test("content bootstrap starts the playback session controller", () => {
  const source = readSharedFile("content.js");
  assert.match(source, /createPlaybackSessionController/);
  assert.match(source, /controller\.start\(\)/);
});

test("generated distributions contain exactly the canonical source files", () => {
  const sharedFiles = listRelativeFiles(sharedSourceRoot);
  const license = fs.readFileSync(path.join(projectRoot, "LICENSE"));

  for (const platform of platforms) {
    const platformSourceRoot = path.join(sourceRoot, platform);
    const platformFiles = listRelativeFiles(platformSourceRoot);
    const expectedFiles = ["LICENSE", ...sharedFiles, ...platformFiles].sort();
    assert.deepEqual(listRelativeFiles(path.join(distRoot, platform)), expectedFiles);

    for (const relativePath of sharedFiles) {
      assert.deepEqual(
        readPlatformFile(platform, relativePath, null),
        readSharedFile(relativePath, null),
        `${platform}/${relativePath} was not assembled from shared source`,
      );
    }
    for (const relativePath of platformFiles) {
      assert.deepEqual(
        readPlatformFile(platform, relativePath, null),
        fs.readFileSync(path.join(platformSourceRoot, relativePath)),
        `${platform}/${relativePath} was not assembled from platform source`,
      );
    }
    assert.deepEqual(readPlatformFile(platform, "LICENSE", null), license);
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

test("settings tabs use the extension logo as their favicon", () => {
  for (const platform of platforms) {
    const source = readPlatformFile(platform, "options.html");

    assert.match(
      source,
      /<link rel="icon" href="icons\/icon-flat-32\.png" sizes="32x32" type="image\/png">/,
    );
  }
});

test("popup clearly identifies unavailable and deliberately unsaved playback", () => {
  const source = readSharedFile("popup.js");

  assert.match(source, /reasonCode === "radio-mix" \? "Not saved" : "Not available"/);
  assert.match(source, /if \(!state\.supported\) \{\s*return "N\/A";/);
});

test("settings offer seven-day checkpoint retention", () => {
  for (const platform of platforms) {
    const source = readPlatformFile(platform, "options.html");
    assert.match(source, /<option value="7">7 days<\/option>/);
  }
});

test("settings can hide the in-player resume message", () => {
  for (const platform of platforms) {
    const source = readPlatformFile(platform, "options.html");
    const script = readPlatformFile(platform, "options.js");

    assert.match(source, /id="resume-message-setting-label">Show resume message<\/span>/);
    assert.match(
      source,
      /id="settings-show-resume-message" type="checkbox" aria-labelledby="resume-message-setting-label">/,
    );
    assert.match(script, /showResumeMessage: document\.querySelector\("#settings-show-resume-message"\)/);
    assert.match(script, /patch: \{ showResumeMessage \}/);
  }
});

test("runtime visual palette remains monochrome", () => {
  for (const file of ["ui.css", "content.css", "icons/icon.svg"]) {
    const source = readSharedFile(file);
    const colors = source.match(/#[0-9a-f]{6}/gi) || [];

    for (const color of colors) {
      const channels = [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)];
      assert.equal(new Set(channels).size, 1, `${file} contains non-monochrome color ${color}`);
    }
  }
});
