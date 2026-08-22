(() => {
  "use strict";

  const { createPlaybackSessionController } = globalThis.YTResumePlaybackSession;
  const controller = createPlaybackSessionController({
    browserApi: globalThis.YTResumeBrowser,
    environment: globalThis,
    logic: globalThis.YTResume,
  });
  controller.start();
})();
