const navigationStateKey = "__careerPilotNavigation";

function getNavigationIndex(state) {
  const index = state?.[navigationStateKey]?.index;
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function withNavigationIndex(state, index) {
  return {
    ...(state && typeof state === "object" ? state : {}),
    [navigationStateKey]: { index }
  };
}

function getViewName(location, views) {
  const requestedView = location.hash.slice(1);
  return Object.hasOwn(views, requestedView) ? requestedView : "dashboard";
}

export function createNavigationController({
  window,
  dialogManager,
  views,
  navigateTo,
  isNavigationBlocked = () => false
} = {}) {
  if (
    !window
    || !window.history
    || typeof window.addEventListener !== "function"
    || typeof window.history.pushState !== "function"
    || typeof window.history.replaceState !== "function"
    || typeof window.history.go !== "function"
  ) {
    throw new TypeError("A browser window with the History API is required.");
  }
  if (!dialogManager || typeof dialogManager.isOpen !== "function") {
    throw new TypeError("A dialog manager is required.");
  }
  if (!views || typeof views !== "object" || typeof navigateTo !== "function") {
    throw new TypeError("Navigation views and a navigateTo function are required.");
  }

  const { history } = window;
  let currentIndex;
  let currentHref;
  let dialogEntryIndex = null;
  let pendingNavigation = null;
  let restoringNavigation = null;
  let started = false;

  function writeCurrentIndex(index) {
    history.replaceState(
      withNavigationIndex(history.state, index),
      "",
      window.location.href
    );
  }

  function applyNavigation(index, href) {
    const originIndex = currentIndex;
    const originHref = currentHref;
    currentIndex = index;
    currentHref = href;

    if (restoringNavigation) {
      if (index === restoringNavigation.targetIndex) {
        restoringNavigation = null;
        pendingNavigation = null;
        dialogEntryIndex = index;
        return;
      }
      restoringNavigation = null;
    }

    if (isNavigationBlocked()) {
      if (index === originIndex) {
        history.replaceState(withNavigationIndex(history.state, originIndex), "", originHref);
        currentHref = originHref;
        pendingNavigation = null;
        return;
      }
      pendingNavigation = {
        originIndex,
        destinationIndex: index,
        destinationHref: href,
        viewName: getViewName(window.location, views)
      };
      continueEditing();
      return;
    }

    if (dialogManager.isOpen()) {
      if (pendingNavigation) {
        pendingNavigation.destinationIndex = index;
        pendingNavigation.destinationHref = href;
        pendingNavigation.viewName = getViewName(window.location, views);
        return;
      }

      pendingNavigation = {
        originIndex: dialogEntryIndex ?? index,
        destinationIndex: index,
        destinationHref: href,
        viewName: getViewName(window.location, views)
      };
      dialogManager.requestClose();

      if (dialogManager.isOpen()) {
        return;
      }

      const destination = pendingNavigation;
      pendingNavigation = null;
      dialogEntryIndex = null;
      navigateTo(destination.viewName, { focusDestination: true });
      return;
    }

    dialogEntryIndex = null;
    navigateTo(getViewName(window.location, views), { focusDestination: true });
  }

  function handlePopState(event) {
    const index = getNavigationIndex(event.state)
      ?? getNavigationIndex(history.state)
      ?? currentIndex;
    applyNavigation(index, window.location.href);
  }

  function handleHashChange() {
    if (window.location.href === currentHref) {
      return;
    }

    const index = currentIndex + 1;
    writeCurrentIndex(index);
    applyNavigation(index, window.location.href);
  }

  function start() {
    if (started) {
      return;
    }

    currentIndex = getNavigationIndex(history.state) ?? 0;
    if (getNavigationIndex(history.state) === null) {
      writeCurrentIndex(currentIndex);
    }
    currentHref = window.location.href;
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handleHashChange);
    started = true;
  }

  function navigate(viewName) {
    if (isNavigationBlocked() || !Object.hasOwn(views, viewName)) {
      return false;
    }

    const targetHash = `#${viewName}`;
    if (window.location.hash !== targetHash) {
      currentIndex += 1;
      history.pushState(
        withNavigationIndex(history.state, currentIndex),
        "",
        targetHash
      );
      currentHref = window.location.href;
    }

    navigateTo(viewName);
    return true;
  }

  function continueEditing() {
    if (!pendingNavigation) {
      return;
    }

    const { originIndex, destinationIndex } = pendingNavigation;
    const distance = originIndex - destinationIndex;
    if (distance === 0) {
      pendingNavigation = null;
      dialogEntryIndex = currentIndex;
      return;
    }

    restoringNavigation = { targetIndex: originIndex };
    history.go(distance);
  }

  return {
    start,
    navigate,
    dialogOpened() {
      dialogEntryIndex = currentIndex;
      pendingNavigation = null;
    },
    continueEditing,
    discardAndNavigate() {
      if (!pendingNavigation) {
        return;
      }

      const destination = pendingNavigation;
      pendingNavigation = null;
      dialogEntryIndex = null;
      queueMicrotask(() => {
        navigateTo(destination.viewName, { focusDestination: true });
      });
    }
  };
}
