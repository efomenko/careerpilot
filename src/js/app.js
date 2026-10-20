function initializeApp() {
  const statusElement = document.querySelector("#app-status");

  if (!statusElement) {
    console.error("CareerPilot could not find the application status element.");
    return;
  }

  statusElement.textContent = "CareerPilot is ready to build.";
}

initializeApp();
