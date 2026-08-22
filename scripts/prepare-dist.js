"use strict";

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "src");
const sharedSource = path.join(sourceRoot, "shared");
const distRoot = path.join(projectRoot, "dist");
const platforms = Object.freeze(["firefox", "chromium"]);

function copyDirectoryContents(source, destination) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    fs.cpSync(
      path.join(source, entry.name),
      path.join(destination, entry.name),
      { recursive: entry.isDirectory() },
    );
  }
}

function preparePlatform(platform) {
  if (!platforms.includes(platform)) {
    throw new TypeError(`Unsupported extension platform: ${platform}`);
  }

  fs.mkdirSync(distRoot, { recursive: true });
  const target = path.join(distRoot, platform);
  const temporaryTarget = path.join(distRoot, `.${platform}-${process.pid}-${Date.now()}`);
  fs.rmSync(temporaryTarget, { recursive: true, force: true });
  fs.mkdirSync(temporaryTarget, { recursive: true });

  try {
    copyDirectoryContents(sharedSource, temporaryTarget);
    copyDirectoryContents(path.join(sourceRoot, platform), temporaryTarget);
    fs.copyFileSync(path.join(projectRoot, "LICENSE"), path.join(temporaryTarget, "LICENSE"));
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(temporaryTarget, target);
  } catch (error) {
    fs.rmSync(temporaryTarget, { recursive: true, force: true });
    throw error;
  }
}

function prepareDist(selectedPlatforms = platforms) {
  for (const platform of selectedPlatforms) {
    preparePlatform(platform);
  }
}

if (require.main === module) {
  const selectedPlatforms = process.argv.slice(2);
  prepareDist(selectedPlatforms.length > 0 ? selectedPlatforms : platforms);
  console.log(`Prepared extension files for ${(selectedPlatforms.length > 0 ? selectedPlatforms : platforms).join(", ")}.`);
}

module.exports = Object.freeze({
  distRoot,
  platforms,
  prepareDist,
  projectRoot,
  sharedSource,
  sourceRoot,
});
