const API_URL = "https://backend-ai.tarekzerroug2.workers.dev";
const API_TIMEOUT_MS = 45000;

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
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

function extractAnswer(result) {
  if (typeof result === "string") return result.trim();

  return String(
    result?.answer ||
      result?.response ||
      result?.text ||
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
