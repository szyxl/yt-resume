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

test("popup and settings reuse the shared logo artwork", () => {
  for (const file of ["popup.html", "options.html"]) {
    const source = fs.readFileSync(path.join(projectRoot, file), "utf8");
    assert.match(source, /<img class="brand-mark[^"]*" src="icons\/icon\.svg" alt="">/);
    assert.doesNotMatch(source, /brand-mark__(?:play|track)/);
  }
});

test("runtime visual palette remains monochrome", () => {
  for (const file of ["ui.css", "content.css", "icons/icon.svg"]) {
    const source = fs.readFileSync(path.join(projectRoot, file), "utf8");
    const colors = source.match(/#[0-9a-f]{6}/gi) || [];

    for (const color of colors) {
      const channels = [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)];
      assert.equal(new Set(channels).size, 1, `${file} contains non-monochrome color ${color}`);
    }
  }
});
