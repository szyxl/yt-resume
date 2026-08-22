"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  distRoot,
  platforms,
  prepareDist,
  projectRoot,
  sharedSource,
  sourceRoot,
} = require("./prepare-dist.js");

const [platform, ...extraArguments] = process.argv.slice(2);
if (!platforms.includes(platform)) {
  console.error(`Choose an extension platform: ${platforms.join(" or ")}.`);
  process.exit(1);
}

prepareDist([platform]);

let rebuildTimer = null;
const watchers = [
  sharedSource,
  path.join(sourceRoot, platform),
  path.join(projectRoot, "LICENSE"),
].map((sourcePath) => {
  const watcher = fs.watch(
    sourcePath,
    { recursive: fs.statSync(sourcePath).isDirectory() },
    () => {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => {
        try {
          prepareDist([platform]);
          console.log(`Rebuilt ${platform} extension files.`);
        } catch (error) {
          console.error(`Unable to rebuild ${platform} extension files:`, error);
        }
      }, 75);
    },
  );
  watcher.on("error", (error) => {
    console.error(`Unable to watch ${sourcePath}:`, error);
  });
  return watcher;
});

const webExtExecutable = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "web-ext.cmd" : "web-ext",
);
const webExtTarget = platform === "firefox" ? "firefox-desktop" : "chromium";
const child = spawn(webExtExecutable, [
  "run",
  "--source-dir",
  path.join(distRoot, platform),
  "--target",
  webExtTarget,
  ...extraArguments,
], { stdio: "inherit" });

let isWatching = true;
function stopWatching() {
  if (!isWatching) {
    return;
  }

  isWatching = false;
  clearTimeout(rebuildTimer);
  for (const watcher of watchers) {
    watcher.close();
  }
}

child.on("error", (error) => {
  stopWatching();
  console.error("Unable to start web-ext:", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  stopWatching();
  process.exitCode = code ?? 0;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopWatching();
    child.kill(signal);
  });
}
