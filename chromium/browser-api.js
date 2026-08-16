(function attachBrowserApi(root) {
  "use strict";

  const nativeBrowser = root.browser;
  const api = nativeBrowser || root.chrome;

  if (!api) {
    throw new Error("A WebExtensions browser API is required");
  }

  const usesChromiumMessaging = !nativeBrowser && Boolean(root.chrome);
  const ERROR_RESPONSE_KEY = "__ytResumeExtensionError__";

  function errorResponse(error) {
    return {
      [ERROR_RESPONSE_KEY]: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  function unwrapResponse(response) {
    if (response && response[ERROR_RESPONSE_KEY] === true) {
      throw new Error(response.message || "Extension message failed");
    }

    return response;
  }

  async function sendRuntimeMessage(message) {
    return unwrapResponse(await api.runtime.sendMessage(message));
  }

  async function sendTabMessage(tabId, message) {
    return unwrapResponse(await api.tabs.sendMessage(tabId, message));
  }

  function addMessageListener(listener) {
    api.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!usesChromiumMessaging) {
        return listener(message, sender);
      }

      let response;
      try {
        response = listener(message, sender);
      } catch (error) {
        sendResponse(errorResponse(error));
        return false;
      }

      if (typeof response === "undefined") {
        return false;
      }

      Promise.resolve(response).then(
        (value) => sendResponse(value),
        (error) => sendResponse(errorResponse(error)),
      );
      return true;
    });
  }

  if (!nativeBrowser) {
    root.browser = api;
  }

  root.YTResumeBrowser = Object.freeze({
    addMessageListener,
    sendRuntimeMessage,
    sendTabMessage,
  });
})(globalThis);
