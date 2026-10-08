const HOVERGPT_EXTENSION_ENV_FILE = "extension.env";
const HOVERGPT_DEFAULT_API_BACKENDS = Object.freeze({
  remote: "",
  local: "http://127.0.0.1:8000",
});

let hoverGptCachedApiBackends = null;

async function getHoverGptApiBackends() {
  if (hoverGptCachedApiBackends) {
    return hoverGptCachedApiBackends;
  }

  const env = await readHoverGptExtensionEnv();

  hoverGptCachedApiBackends = {
    remote: normalizeHoverGptUrl(
      env.HOVERGPT_REMOTE_API_URL ||
        env.HOVERGPT_API_URL ||
        HOVERGPT_DEFAULT_API_BACKENDS.remote
    ),
    local: normalizeHoverGptUrl(
      env.HOVERGPT_LOCAL_API_URL || HOVERGPT_DEFAULT_API_BACKENDS.local
    ),
  };

  return hoverGptCachedApiBackends;
}

async function readHoverGptExtensionEnv() {
  try {
    const response = await fetch(chrome.runtime.getURL(HOVERGPT_EXTENSION_ENV_FILE), {
      cache: "no-store",
    });

    if (!response.ok) {
      return {};
    }

    return parseHoverGptEnv(await response.text());
  } catch {
    return {};
  }
}

function parseHoverGptEnv(contents) {
  const env = {};

  for (const line of String(contents || "").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      env[key] = unquoteHoverGptEnvValue(value);
    }
  }

  return env;
}

function unquoteHoverGptEnvValue(value) {
  const first = value[0];
  const last = value[value.length - 1];

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }

  return value;
}

function normalizeHoverGptUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

globalThis.HoverGptConfig = Object.freeze({
  defaultApiBackends: HOVERGPT_DEFAULT_API_BACKENDS,
  getApiBackends: getHoverGptApiBackends,
  normalizeUrl: normalizeHoverGptUrl,
});
