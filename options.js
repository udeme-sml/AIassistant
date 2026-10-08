const DEFAULT_SETTINGS = {
  hovergptApiBackend: "remote",
  hovergptApiUrl: "",
  hovergptApiToken: "",
};

let apiBackends = HoverGptConfig.defaultApiBackends;

const form = document.querySelector("#settings-form");
const apiUrlInput = document.querySelector("#api-url");
const apiTokenInput = document.querySelector("#api-token");
const statusOutput = document.querySelector("#status");
const testButton = document.querySelector("#test-backend");

restoreSettings();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  await chrome.storage.local.set(readFormSettings());
  setStatus("Saved.");
});

testButton.addEventListener("click", async () => {
  const settings = readFormSettings();
  const headers = settings.hovergptApiToken
    ? { "x-hovergpt-token": settings.hovergptApiToken }
    : {};

  setStatus("Testing...");

  try {
    const response = await fetch(settings.hovergptApiUrl, {
      method: "GET",
      headers,
    });
    const result = await response.json().catch(() => "");

    if (!response.ok) {
      throw new Error(extractMessage(result) || `HTTP ${response.status}`);
    }

    setStatus(extractMessage(result) || "Backend is running.");
  } catch (error) {
    setStatus(error.message || "Backend test failed.", true);
  }
});

document.querySelectorAll("input[name='backend']").forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) {
      apiUrlInput.value = apiBackends[input.value];
      setStatus("");
    }
  });
});

async function restoreSettings() {
  apiBackends = await HoverGptConfig.getApiBackends();
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const backend = Object.prototype.hasOwnProperty.call(
    apiBackends,
    settings.hovergptApiBackend
  )
    ? settings.hovergptApiBackend
    : DEFAULT_SETTINGS.hovergptApiBackend;
  const backendInput = document.querySelector(`input[name='backend'][value='${backend}']`);

  if (backendInput) {
    backendInput.checked = true;
  }

  apiUrlInput.value = settings.hovergptApiUrl || apiBackends[backend];
  apiTokenInput.value = settings.hovergptApiToken || "";
}

function readFormSettings() {
  const checkedBackend = document.querySelector("input[name='backend']:checked");
  const backend = checkedBackend?.value || DEFAULT_SETTINGS.hovergptApiBackend;

  return {
    hovergptApiBackend: backend,
    hovergptApiUrl: normalizeApiUrl(apiUrlInput.value || apiBackends[backend]),
    hovergptApiToken: apiTokenInput.value.trim(),
  };
}

function normalizeApiUrl(url) {
  return HoverGptConfig.normalizeUrl(url || apiBackends.remote);
}

function extractMessage(result) {
  if (typeof result === "string") return result.trim();

  return String(result?.detail || result?.message || "").trim();
}

function setStatus(message, isError = false) {
  statusOutput.textContent = message;
  statusOutput.style.color = isError ? "#dc2626" : "";
}
