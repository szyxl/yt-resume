"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../chromium/browser-api.js"), "utf8");

function loadChromiumAdapter() {
  let messageListener;
  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        },
      },
      async sendMessage() {
        return undefined;
      },
    },
    tabs: {
      async sendMessage() {
        return undefined;
      },
    },
  };
  const context = vm.createContext({ chrome });
  vm.runInContext(source, context);

  return {
    api: context.YTResumeBrowser,
    chrome,
    context,
    getMessageListener: () => messageListener,
  };
}

test("Chromium adapter aliases chrome and keeps async message responses open", async () => {
  const { api, chrome, context, getMessageListener } = loadChromiumAdapter();
  assert.equal(context.browser, chrome);

  api.addMessageListener(async (message) => ({ echoed: message.value }));
  const response = new Promise((resolve) => {
    const keepChannelOpen = getMessageListener()({ value: 42 }, {}, resolve);
    assert.equal(keepChannelOpen, true);
  });

  assert.equal((await response).echoed, 42);
});

test("Chromium adapter sends listener failures back as rejected messages", async () => {
  const { api, chrome, getMessageListener } = loadChromiumAdapter();

  api.addMessageListener(async () => {
    throw new Error("message failed");
  });
  const errorResponse = await new Promise((resolve) => {
    getMessageListener()({}, {}, resolve);
  });
  chrome.runtime.sendMessage = async () => errorResponse;

  await assert.rejects(api.sendRuntimeMessage({ type: "test" }), /message failed/);
});
