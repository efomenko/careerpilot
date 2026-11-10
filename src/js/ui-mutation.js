export function createUiMutationRunner({ document, onUnexpectedError }) {
  let pending = false;
  const blockedEvents = [
    "pointerdown", "mousedown", "touchstart", "click", "submit", "keydown",
    "beforeinput", "cut", "paste", "drop", "change", "contextmenu", "cancel"
  ];

  function blockInteraction(event) {
    if (event.type === "keydown" && event.key === "Tab") return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  async function run(action) {
    if (pending) return;
    pending = true;
    const previousBusy = document.body.getAttribute("aria-busy");
    document.body.setAttribute("aria-busy", "true");
    blockedEvents.forEach((type) => document.addEventListener(type, blockInteraction, {
      capture: true, passive: false
    }));
    try {
      await action();
    } catch (error) {
      try {
        onUnexpectedError(error);
      } catch (reportingError) {
        console.error("Could not report UI mutation failure.", reportingError, error);
      }
    } finally {
      blockedEvents.forEach((type) => document.removeEventListener(type, blockInteraction, { capture: true }));
      if (previousBusy === null) document.body.removeAttribute("aria-busy");
      else document.body.setAttribute("aria-busy", previousBusy);
      pending = false;
    }
  }

  function mutationHandler(action) {
    return (event) => {
      if (event.type === "submit") event.preventDefault();
      void run(() => action(event));
    };
  }
  mutationHandler.isPending = () => pending;
  return mutationHandler;
}
