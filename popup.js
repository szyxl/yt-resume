(() => {
  "use strict";

  const { DEFAULT_SETTINGS, formatTime, normalizeSettings } = globalThis.YTResume;

  const elements = {
    counterLabel: document.querySelector("#counter-label"),
    enabledToggle: document.querySelector("#enabled-toggle"),
    feedback: document.querySelector("#popup-feedback"),
    forgetButton: document.querySelector("#forget-button"),
    memoryState: document.querySelector("#memory-state"),
    memoryStateLabel: document.querySelector("#memory-state-label"),
    savedTime: document.querySelector("#saved-time"),
    settingsButton: document.querySelector("#settings-button"),
    stateBadge: document.querySelector("#state-badge"),
    videoTitle: document.querySelector("#video-title"),
  };

  let currentState = {
    enabled: DEFAULT_SETTINGS.enabled,
    reason: "Reading this tab…",
    record: null,
    supported: false,
    title: "",
  };

  function setFeedback(message, isError = false) {
    elements.feedback.textContent = message;
    elements.feedback.style.color = isError ? "var(--color-danger)" : "";
  }

  function render(state) {
    currentState = state;
    elements.enabledToggle.checked = state.enabled;
    elements.stateBadge.dataset.state = state.enabled ? "on" : "paused";
    elements.stateBadge.textContent = state.enabled ? "On" : "Paused";

    if (!state.enabled) {
      elements.counterLabel.textContent = "Resume paused";
      elements.memoryState.dataset.state = "paused";
      elements.memoryStateLabel.textContent = "Paused";
    } else if (state.supported && state.record) {
      elements.counterLabel.textContent = "Local checkpoint";
      elements.memoryState.dataset.state = "saved";
      elements.memoryStateLabel.textContent = "Saved";
    } else {
      elements.counterLabel.textContent = state.supported ? "Local checkpoint" : "Not available";
      elements.memoryState.dataset.state = "empty";
      elements.memoryStateLabel.textContent = state.supported ? "Empty" : "Idle";
    }

    elements.savedTime.textContent = state.record ? formatTime(state.record.position) : "–:––";
    elements.videoTitle.textContent = state.supported
      ? state.title || state.reason || "No checkpoint saved yet."
      : state.reason || "Open a standard YouTube video to begin.";
    elements.forgetButton.disabled = !state.supported || !state.record;
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
      const pageState = await browser.tabs.sendMessage(tab.id, { type: "page:get-state" });
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
      const settings = normalizeSettings(await browser.runtime.sendMessage({ type: "settings:get" }));
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

  elements.enabledToggle.addEventListener("change", async () => {
    const enabled = elements.enabledToggle.checked;
    elements.enabledToggle.disabled = true;
    setFeedback("");

    try {
      const settings = normalizeSettings(await browser.runtime.sendMessage({
        type: "settings:update",
        patch: { enabled },
      }));
      render({ ...currentState, enabled: settings.enabled });
      setFeedback(settings.enabled ? "Automatic resume is on." : "Automatic resume is paused.");
    } catch {
      elements.enabledToggle.checked = !enabled;
      setFeedback("Couldn't change this setting. Try again.", true);
    } finally {
      elements.enabledToggle.disabled = false;
    }
  });

  elements.forgetButton.addEventListener("click", async () => {
    elements.forgetButton.disabled = true;
    setFeedback("");

    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab || typeof tab.id !== "number") {
        throw new Error("No active tab");
      }
      const pageState = await browser.tabs.sendMessage(tab.id, { type: "page:forget" });
      render({ ...pageState, enabled: currentState.enabled });
      setFeedback("Checkpoint forgotten.");
    } catch {
      render(currentState);
      setFeedback("Couldn't forget this checkpoint. Try again.", true);
    }
  });

  elements.settingsButton.addEventListener("click", async () => {
    await browser.runtime.openOptionsPage();
    window.close();
  });

  void load();
})();
