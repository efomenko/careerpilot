
const appStatus = document.querySelector("#app-status");
const sidebar = document.querySelector("#sidebar");
const menuToggle = document.querySelector("#menu-toggle");
const currentSection = document.querySelector("#current-section");
const pageTitle = document.querySelector("#page-title");
const navigationLinks = document.querySelectorAll("[data-view]");
const pageViews = document.querySelectorAll("[data-page-view]");

// Each view supplies the label and status shown when its hash is selected.
const views = {
  dashboard: {
    label: "Dashboard",
    title: "Good to have you here.",
    status: "Your CareerPilot workspace is ready."
  },
  profile: {
    label: "Career Profile",
    title: "Your career story starts here.",
    status: "Career Profile is planned for a future development task."
  },
  achievements: {
    label: "Achievements",
    title: "Make your achievements count.",
    status: "Achievement management is planned for a future development task."
  },
  jobs: {
    label: "Job Opportunities",
    title: "Explore your next opportunity.",
    status: "Job management is planned for a future development task."
  },
  drafts: {
    label: "Application Drafts",
    title: "Prepare your next application.",
    status: "Application drafting is planned for a future development task."
  },
  applications: {
    label: "Application Tracker",
    title: "Keep your job search organized.",
    status: "Application tracking is planned for a future development task."
  }
};

function closeMobileMenu(restoreFocus = false) {
  const wasOpen = sidebar.classList.contains("is-open");

  sidebar.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");

  if (restoreFocus && wasOpen) {
    menuToggle.focus();
  }
}

function focusFirstMobileNavigationLink() {
  if (
    !sidebar.classList.contains("is-open")
    || window.innerWidth > 760
  ) {
    return;
  }

  const firstNavigationLink = sidebar.querySelector(".nav-link");

  if (!firstNavigationLink) {
    return;
  }

  if (getComputedStyle(firstNavigationLink).visibility === "hidden") {
    return;
  }

  firstNavigationLink.focus();
}

function navigateTo(viewName) {
  const view = views[viewName];

  if (!view) {
    return;
  }

  if (!appStatus) {
    console.error("CareerPilot could not find the application status element.");
    return;
  }

  const menuWasOpen = sidebar.classList.contains("is-open");

  navigationLinks.forEach((link) => {
    const isActive = link.dataset.view === viewName;

    if (link.classList.contains("nav-link")) {
      link.classList.toggle("active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  });

  pageViews.forEach((page) => {
    page.hidden = page.dataset.pageView !== viewName;
  });

  currentSection.textContent = view.label;
  pageTitle.textContent = view.title;
  appStatus.textContent = view.status;

  closeMobileMenu();

  if (menuWasOpen) {
    document.querySelector("#main-content").focus();
  }
}

navigationLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();

    const viewName = link.dataset.view;

    if (!views[viewName]) {
      return;
    }

    navigateTo(viewName);

    if (window.location.hash !== `#${viewName}`) {
      window.location.hash = viewName;
    }
  });
});

// Keep the visible page in sync when the URL hash changes, including Back/Forward.
window.addEventListener("hashchange", () => {
  const requestedView = window.location.hash.slice(1);
  const viewName = views[requestedView] ? requestedView : "dashboard";

  navigateTo(viewName);
});

menuToggle.addEventListener("click", () => {
  const isOpen = sidebar.classList.contains("is-open");

  if (isOpen) {
    closeMobileMenu(true);
    return;
  }

  sidebar.classList.add("is-open");
  menuToggle.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(focusFirstMobileNavigationLink);
});

sidebar.addEventListener("transitionend", (event) => {
  if (
    (event.target === sidebar && event.propertyName === "transform")
    || (sidebar.contains(event.target) && event.propertyName === "visibility")
  ) {
    focusFirstMobileNavigationLink();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sidebar.classList.contains("is-open")) {
    closeMobileMenu(true);
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 760) {
    closeMobileMenu();
  }
});

function initializeApp() {
  const requestedView = window.location.hash.slice(1);
  const initialView = views[requestedView] ? requestedView : "dashboard";

  navigateTo(initialView);
}

initializeApp();
