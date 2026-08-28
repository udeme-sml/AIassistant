const CORNER_TRIGGER = {
  size: 25, // zone de 25 x 25 px dans le coin inférieur droit
};

const LONG_ANSWER_TIMEOUT_MS = 50000;

let cornerEnabled = true;
let pointerWasInCorner = false;
let waitingForAnswer = false;
let activeLongRequestId = 0;

const popup = createPopup();

document.addEventListener("keydown", handleKeyDown, true);
document.addEventListener("mousemove", handleMouseMove, true);
document.addEventListener("mousedown", hidePopupOnOutsideClick, true);

function handleKeyDown(event) {
  // Q = active/désactive le déclenchement par coin
  if (isCornerToggle(event)) {
    event.preventDefault();
    event.stopPropagation();

    cornerEnabled = !cornerEnabled;
    pointerWasInCorner = false;

    showPopup(
      cornerEnabled
        ? "Corner trigger ON"
        : "Corner trigger OFF"
    );

    return;
  }

  // Tab = déclenchement manuel, comme avant
  if (isLongAnswerShortcut(event)) {
    event.preventDefault();
    event.stopPropagation();

    if (!cornerEnabled || waitingForAnswer) return;

    askLongScreenshotAnswer();
  }
}

function handleMouseMove(event) {
  if (!cornerEnabled) {
    pointerWasInCorner = false;
    return;
  }

  // Ne déclenche rien si un bouton de souris est enfoncé
  if (event.buttons !== 0) {
    return;
  }

  const inRightEdge =
    event.clientX >= window.innerWidth - CORNER_TRIGGER.size;

  const inBottomEdge =
    event.clientY >= window.innerHeight - CORNER_TRIGGER.size;

  const isInCorner = inRightEdge && inBottomEdge;

  /*
   * Si la souris n'est plus dans le coin,
   * on réarme le déclencheur.
   */
  if (!isInCorner) {
    pointerWasInCorner = false;
    return;
  }

  /*
   * La souris est dans le coin.
   *
   * Si elle y était déjà au mousemove précédent,
   * on ne redéclenche pas.
   */
  if (pointerWasInCorner) {
    return;
  }

  /*
   * On marque immédiatement le coin comme occupé.
   *
   * Pour pouvoir redéclencher plus tard,
   * il faudra sortir du coin puis y revenir.
   */
  pointerWasInCorner = true;

  if (waitingForAnswer) {
    return;
  }

  askLongScreenshotAnswer();
}

function askLongScreenshotAnswer() {
  const requestId = Date.now();

  activeLongRequestId = requestId;
  waitingForAnswer = true;

  showPopup("reading");

  /*
   * Watchdog côté content script.
   *
   * Même si le service worker, la capture ou l'API
   * ne répondent jamais, "reading" ne restera pas
   * affiché indéfiniment.
   */
  const timeout = setTimeout(() => {
    if (activeLongRequestId !== requestId) return;

    activeLongRequestId = 0;
    waitingForAnswer = false;

    showPopup("timeout");
  }, LONG_ANSWER_TIMEOUT_MS);

  chrome.runtime.sendMessage(
    {
      type: "ASK_LONG_SCREENSHOT",
    },
    (response) => {
      /*
       * Ignore une réponse arrivée après le timeout
       * ou appartenant à une ancienne requête.
       */
      if (activeLongRequestId !== requestId) {
        return;
      }

      clearTimeout(timeout);

      activeLongRequestId = 0;
      waitingForAnswer = false;

      if (chrome.runtime.lastError) {
        showPopup(
          chrome.runtime.lastError.message
        );
        return;
      }

      if (!response?.ok) {
        showPopup(
          response?.answer || "Erreur."
        );
        return;
      }

      showPopup(
        response.answer || "Erreur."
      );
    }
  );
}

function createPopup() {
  const host = document.createElement("aside");

  host.id = "social-media-detox-shield";

  host.classList.add(
    "detox-shield-active",
    "focus-mode"
  );

  host.setAttribute(
    "data-detox-version",
    "2.4.1"
  );

  Object.assign(host.style, {
    display: "block",
    width: "0",
    height: "0",
    position: "absolute",
    pointerEvents: "none",
  });

  const shadow = host.attachShadow({
    mode: "closed",
  });

  const style = document.createElement("style");

  style.textContent = `
    #answer {
      display: none;

      position: fixed;

      left: 16px;
      bottom: 16px;

      z-index: 2147483647;

      width: fit-content;

      min-width: 96px;
      max-width: 176px;
      max-height: 86px;

      overflow-y: auto;

      padding: 0;
      margin: 0;

      border: none;
      border-radius: 0;

      background: transparent;

      color: #eeeeee;

      box-shadow: none;

      backdrop-filter: none;
      -webkit-backdrop-filter: none;

      font-size: 10px;
      line-height: 1.35;
      font-weight: 400;

      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;

      pointer-events: auto;

      white-space: pre-wrap;

      scrollbar-width: none;
      -ms-overflow-style: none;

      text-shadow: none;
    }

    #answer::-webkit-scrollbar {
      display: none;

      width: 0;
      height: 0;
    }
  `;

  const answer =
    document.createElement("div");

  answer.id = "answer";

  shadow.append(
    style,
    answer
  );

  document.body.appendChild(host);

  return {
    answer,
    host,
  };
}

function showPopup(text) {
  popup.answer.textContent = text;

  popup.answer.style.display =
    "block";
}

function hidePopupOnOutsideClick(event) {
  if (
    !event
      .composedPath()
      .includes(popup.host)
  ) {
    popup.answer.style.display =
      "none";
  }
}

function isCornerToggle(event) {
  return (
    event.key?.toLowerCase() === "q" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !isEditableElement(event.target)
  );
}

function isLongAnswerShortcut(event) {
  return (
    event.key === "Tab" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !isEditableElement(event.target)
  );
}

function isEditableElement(element) {
  if (!element) {
    return false;
  }

  return (
    element.isContentEditable ||
    [
      "INPUT",
      "TEXTAREA",
      "SELECT",
    ].includes(element.tagName)
  );
}