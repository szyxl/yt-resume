(() => {
  "use strict";

  const { DEFAULT_SETTINGS, normalizeSettings } = globalThis.YTResume;

  const elements = {
    clearCancel: document.querySelector("#clear-cancel"),
    clearConfirm: document.querySelector("#clear-confirm"),
    clearConfirmation: document.querySelector("#clear-confirmation"),
    clearTrigger: document.querySelector("#clear-trigger"),
    enabled: document.querySelector("#settings-enabled"),
    feedback: document.querySelector("#settings-feedback"),
    retention: document.querySelector("#retention-select"),
    savedCount: document.querySelector("#saved-count"),
    savedCountLabel: document.querySelector("#saved-count-label"),
  };

  function announce(message, isError = false) {
    elements.feedback.textContent = message;
    elements.feedback.style.color = isError ? "var(--color-danger)" : "";
  }

  function renderSettings(settings) {
    elements.enabled.checked = settings.enabled;
    elements.retention.value = String(settings.retentionDays);
  }

  function renderCount(count) {
    elements.savedCount.textContent = String(count);
    elements.savedCountLabel.textContent = count === 1 ? "saved video position" : "saved video positions";
  }

  function closeConfirmation({ returnFocus = true } = {}) {
    elements.clearConfirmation.hidden = true;
    elements.clearTrigger.setAttribute("aria-expanded", "false");
    if (returnFocus) {
      elements.clearTrigger.focus();
    }
  }

  async function load() {
    try {
      const [settings, stats] = await Promise.all([
        browser.runtime.sendMessage({ type: "settings:get" }),
        browser.runtime.sendMessage({ type: "progress:stats" }),
      ]);
      renderSettings(normalizeSettings(settings));
      renderCount(Number(stats.count) || 0);
    } catch {
      renderSettings(DEFAULT_SETTINGS);
      elements.savedCount.textContent = "—";
      elements.savedCountLabel.textContent = "Saved positions couldn't be read";
      announce("Reload the page to try again.", true);
    }
  }

  elements.enabled.addEventListener("change", async () => {
    const enabled = elements.enabled.checked;
    elements.enabled.disabled = true;
    announce("");

    try {
      const settings = await browser.runtime.sendMessage({
        type: "settings:update",
        patch: { enabled },
      });
      renderSettings(normalizeSettings(settings));
      announce(enabled ? "Automatic resume is on." : "Automatic resume is paused.");
    } catch {
      elements.enabled.checked = !enabled;
      announce("Couldn't update automatic resume. Try again.", true);
    } finally {
      elements.enabled.disabled = false;
    }
  });

  elements.retention.addEventListener("change", async () => {
    const previousValue = elements.retention.dataset.savedValue || String(DEFAULT_SETTINGS.retentionDays);
    const retentionDays = Number(elements.retention.value);
    elements.retention.disabled = true;
    announce("");

    try {
      const settings = normalizeSettings(await browser.runtime.sendMessage({
        type: "settings:update",
        patch: { retentionDays },
      }));
      elements.retention.value = String(settings.retentionDays);
      elements.retention.dataset.savedValue = elements.retention.value;
      const stats = await browser.runtime.sendMessage({ type: "progress:stats" });
      renderCount(Number(stats.count) || 0);
      announce(settings.retentionDays === 0
        ? "Positions will not expire."
        : `Positions will be kept for ${settings.retentionDays} days.`);
    } catch {
      elements.retention.value = previousValue;
      announce("Couldn't update retention. Try again.", true);
    } finally {
      elements.retention.disabled = false;
    }
  });

  elements.clearTrigger.setAttribute("aria-expanded", "false");
  elements.clearTrigger.setAttribute("aria-controls", "clear-confirmation");
  elements.clearTrigger.addEventListener("click", () => {
    elements.clearConfirmation.hidden = false;
    elements.clearTrigger.setAttribute("aria-expanded", "true");
    elements.clearConfirm.focus();
  });

  elements.clearCancel.addEventListener("click", () => closeConfirmation());

  elements.clearConfirmation.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeConfirmation();
    }
  });

  elements.clearConfirm.addEventListener("click", async () => {
    elements.clearConfirm.disabled = true;
    elements.clearCancel.disabled = true;
    announce("");

    try {
      await browser.runtime.sendMessage({ type: "data:clear" });
      renderSettings(DEFAULT_SETTINGS);
      elements.retention.dataset.savedValue = String(DEFAULT_SETTINGS.retentionDays);
      renderCount(0);
      closeConfirmation();
      announce("All local YT Resume data was cleared.");
    } catch {
      announce("Couldn't clear local data. Try again.", true);
    } finally {
      elements.clearConfirm.disabled = false;
      elements.clearCancel.disabled = false;
    }
  });

  void load().then(() => {
    elements.retention.dataset.savedValue = elements.retention.value;
  });
})();
