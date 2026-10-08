importScripts("config.js");

const DEFAULT_API_BACKEND = "remote";
const API_TIMEOUT_MS = 45000;
const API_SETTINGS_DEFAULTS = {
  hovergptApiBackend: DEFAULT_API_BACKEND,
  hovergptApiUrl: "",
  hovergptApiToken: "",
};

const CHOICE_EMOJIS = {
  A: "🌲",
  B: "🍌",
  C: "🍒",
  D: "🐬",
  E: "🐌",
  F: "🍓",
};

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || tab.windowId == null) return;

  await Promise.all([
    setIcon(tab.id, "R"),
    chrome.action.setBadgeText({ tabId: tab.id, text: "" }),
  ]);

  try {
    const answer = await analyzeVisibleTab(tab.windowId, "choice");
    const badge = getAnswerBadge(answer);

    await Promise.all([
      setIcon(tab.id, badge.icon),
      chrome.action.setBadgeText({ tabId: tab.id, text: "" }),
    ]);
    await chrome.action.setTitle({
      tabId: tab.id,
      title: badge.title,
    });
  } catch (error) {
    console.error("HoverGPT choice error:", error);
    await setBadge(tab.id, "!", "#dc2626");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "ASK_LONG_SCREENSHOT") return false;

  const windowId = sender.tab?.windowId;
  if (windowId == null) {
    sendResponse({ ok: false, answer: "Onglet introuvable." });
    return false;
  }

  analyzeVisibleTab(windowId, "long")
    .then((answer) => sendResponse({ ok: true, answer }))
    .catch((error) => {
      console.error("HoverGPT long answer error:", error);
      sendResponse({
        ok: false,
        answer: error.message || "Erreur pendant l'analyse du screenshot.",
      });
    });

  return true;
});

async function analyzeVisibleTab(windowId, mode) {
  const image = await captureVisibleTab(windowId, mode);
  return requestAnalysis(mode, image);
}

async function captureVisibleTab(windowId, mode) {
  return chrome.tabs.captureVisibleTab(windowId, {
    format: "jpeg",
    quality: mode === "choice" ? 55 : 70,
  });
}

async function requestAnalysis(mode, image) {
  const apiConfig = await getApiConfig();

  if (!apiConfig.url) {
    throw new Error(
      "URL backend manquante. Configure HOVERGPT_REMOTE_API_URL dans extension.env ou renseigne l'URL dans les options."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiConfig.token) {
    headers["x-hovergpt-token"] = apiConfig.token;
  }

  try {
    const response = await fetch(apiConfig.url, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        mode,
        image,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(extractAnswer(result) || `HTTP ${response.status}`);
    }

    return extractAnswer(result);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Timeout API apres ${API_TIMEOUT_MS / 1000} secondes.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getApiConfig() {
  const apiBackends = await HoverGptConfig.getApiBackends();
  const settings = await chrome.storage.local.get(API_SETTINGS_DEFAULTS);
  const backend = Object.prototype.hasOwnProperty.call(
    apiBackends,
    settings.hovergptApiBackend
  )
    ? settings.hovergptApiBackend
    : DEFAULT_API_BACKEND;
  const configuredUrl =
    typeof settings.hovergptApiUrl === "string"
      ? settings.hovergptApiUrl.trim()
      : "";

  return {
    backend,
    url: normalizeApiUrl(configuredUrl || apiBackends[backend], apiBackends),
    token:
      typeof settings.hovergptApiToken === "string"
        ? settings.hovergptApiToken.trim()
        : "",
  };
}

function normalizeApiUrl(url, apiBackends) {
  return HoverGptConfig.normalizeUrl(url || apiBackends[DEFAULT_API_BACKEND]);
}

function extractAnswer(result) {
  if (typeof result === "string") return result.trim();

  return String(
    result?.answer ||
      result?.response ||
      result?.text ||
      result?.detail ||
      result?.message ||
      ""
  ).trim();
}

function getAnswerBadge(answer) {
  const text = String(answer || "");
  const choiceMatch = text.match(/\bCHOIX\s*=\s*([A-Z?])\b/i);
  const choice = choiceMatch?.[1]?.toUpperCase() || "";

  if (choice && choice !== "?") {
    const icon = CHOICE_EMOJIS[choice] || choice;

    return {
      ok: true,
      icon,
      title: `Choix ${choice}`,
    };
  }

  return {
    ok: false,
    icon: "?",
    title: "Aucun QCM a choix unique detecte",
  };
}

async function setIcon(tabId, text) {
  await chrome.action.setIcon({
    tabId,
    imageData: Object.fromEntries(
      [16, 32, 48, 128].map((size) => [size, drawIcon(text, size)])
    ),
  });
}

function drawIcon(text, size) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  const symbol = String(text || "?");
  const isLetter = /^[A-Z?]$/.test(symbol);

  context.clearRect(0, 0, size, size);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.globalAlpha = 0.6;
  context.fillStyle = "#8a8a92";
  context.font = isLetter
    ? `600 ${Math.floor(size * 0.54)}px Arial, sans-serif`
    : `${Math.floor(size * 0.56)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  context.fillText(symbol, size / 2, size / 2 + size * 0.03);

  return context.getImageData(0, 0, size, size);
}

async function setBadge(tabId, text, color) {
  await Promise.all([
    chrome.action.setBadgeText({ tabId, text }),
    chrome.action.setBadgeBackgroundColor({ tabId, color }),
  ]);
}
