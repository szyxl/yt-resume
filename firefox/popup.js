(() => {
  "use strict";

  const { DEFAULT_SETTINGS, formatTime, normalizeSettings } = globalThis.YTResume;
  const { sendRuntimeMessage, sendTabMessage } = globalThis.YTResumeBrowser;

  const elements = {
    counterLabel: document.querySelector("#counter-label"),
    feedback: document.querySelector("#popup-feedback"),
    savedTime: document.querySelector("#saved-time"),
    settingsButton: document.querySelector("#settings-button"),
    videoTitle: document.querySelector("#video-title"),
  };

  function setFeedback(message, isError = false) {
    elements.feedback.textContent = message;
    elements.feedback.style.color = isError ? "var(--color-danger)" : "";
  }

  function getCounterLabel(state) {
    if (!state.enabled) {
      return "Resume paused";
    }

    if (state.supported) {
      return "Local checkpoint";
    }

    return state.reasonCode === "radio-mix" ? "Not saved" : "Not available";
  }

  function render(state) {
    elements.counterLabel.textContent = getCounterLabel(state);
    elements.savedTime.textContent = state.record ? formatTime(state.record.position) : "–:––";
    elements.videoTitle.textContent = state.supported
      ? state.title || state.reason || "No checkpoint saved yet."
      : state.reason || "Open a standard YouTube video to begin.";
  }

  async function getActivePageState(settings) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== "number") {
      return {
        enabled: settings.enabled,
        reason: "Open a standard YouTube video to begin.",
        record: null,
        supported: false,
        title: "",
      };
    }

    try {
      const pageState = await sendTabMessage(tab.id, { type: "page:get-state" });
      return { ...pageState, enabled: settings.enabled };
    } catch {
      return {
        enabled: settings.enabled,
        reason: "Open a standard YouTube video to begin.",
        record: null,
        supported: false,
        title: "",
      };
    }
  }

  async function load() {
    try {
      const settings = normalizeSettings(await sendRuntimeMessage({ type: "settings:get" }));
      render(await getActivePageState(settings));
    } catch {
      render({
        enabled: DEFAULT_SETTINGS.enabled,
        reason: "YT Resume couldn't read this tab. Reload YouTube and try again.",
        record: null,
        supported: false,
        title: "",
      });
      setFeedback("Couldn't read extension data.", true);
    }
  }

  elements.settingsButton.addEventListener("click", async () => {
    await browser.runtime.openOptionsPage();
    window.close();
  });

  void load();
})();
