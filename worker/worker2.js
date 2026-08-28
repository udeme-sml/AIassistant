const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5.6-sol";
const REQUEST_TIMEOUT_MS = 30000;
const MAX_IMAGE_LENGTH = 4_500_000;

const MODES = {
  choice: {
    maxOutputTokens: 32,
    reasoningEffort: "low",
    prompt: [
      "Analyse la capture d'ecran.",
      "Utilise ce mode uniquement pour une page qui contient exactement une seule question QCM a choix unique.",
      "Si les choix sont des lettres, reponds uniquement avec CHOIX=lettre. Exemples: CHOIX=A, CHOIX=F, CHOIX=G, CHOIX=V.",
      "Si la question est un vrai/faux, reponds uniquement avec CHOIX=V pour vrai ou CHOIX=F pour faux.",
    ].join("\n"),
    system: [
      "Tu analyses une capture d'ecran pour une extension Chrome.",
      "Mode strict QCM: reponds seulement si l'image montre exactement une seule question QCM a choix unique.",
      "Reponses autorisees: CHOIX=A jusqu'a CHOIX=Z ",
      "N'ajoute aucun autre texte.",
    ].join("\n"),
  },
  long: {
    maxOutputTokens: null,
    reasoningEffort: "medium",
    prompt: [
      "Analyse la capture d'ecran et reponds en francais.",
      "Si c'est une question ou un exercice, donne d'abord la ou les reponses finales.",
      "Ensuite seulement, ajoute les explications et le raisonnement utile.",
    ].join("\n"),
    system: [
      "Tu analyses une capture d'ecran.",
      "Reponds en francais de maniere detaillee, utile et naturelle.",
      "Commence toujours par la reponse finale, puis explique apres.",
      "Ne te limite pas a une reponse courte: donne les explications necessaires.",
    ].join("\n"),
  },
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method === "GET") {
      return jsonResponse("HoverGPT OpenAI backend is running.");
    }

    if (request.method !== "POST") {
      return jsonResponse("Method not allowed.", 405);
    }

    const apiKey = env.OPENAI_API_KEY || env.OPENAIKEY;
    if (!apiKey) {
      return jsonResponse("Missing OPENAI_API_KEY environment variable.", 500);
    }

    if (!isAuthorized(request, env)) {
      return jsonResponse("Unauthorized.", 401);
    }

    const body = await readJson(request);
    if (!body) {
      return jsonResponse("Invalid JSON request body.", 400);
    }

    const image = normalizeImage(body.image);
    if (!image) {
      return jsonResponse("Missing screenshot image.", 400);
    }

    if (image.length > MAX_IMAGE_LENGTH) {
      return jsonResponse("Screenshot is too large.", 413);
    }

    const modeName = body.mode === "choice" ? "choice" : "long";
    const mode = MODES[modeName];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const openAiPayload = {
        model: OPENAI_MODEL,
        reasoning: {
          effort: mode.reasoningEffort,
        },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: mode.system,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: mode.prompt,
              },
              {
                type: "input_image",
                image_url: image,
                detail: "auto",
              },
            ],
          },
        ],
      };

      if (mode.maxOutputTokens) {
        openAiPayload.max_output_tokens = mode.maxOutputTokens;
      }

      const response = await fetch(OPENAI_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(openAiPayload),
      });

      const result = await readJson(response);
      if (!response.ok) {
        return jsonResponse(getOpenAiErrorMessage(result, response.status), response.status);
      }

      return jsonResponse(normalizeAnswer(result, modeName));
    } catch (error) {
      const message =
        error.name === "AbortError"
          ? `OpenAI request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`
          : error.message || "OpenAI request failed.";

      return jsonResponse(message, 504);
    } finally {
      clearTimeout(timeout);
    }
  },
};

async function readJson(requestOrResponse) {
  try {
    return await requestOrResponse.json();
  } catch {
    return null;
  }
}

function normalizeImage(image) {
  return typeof image === "string" && image.startsWith("data:image/")
    ? image
    : "";
}

function normalizeAnswer(result, mode) {
  const answer = extractResponseText(result)
    .replace(/\r/g, "")
    .replace(/[*_`>#~]/g, "")
    .trim();

  return (mode === "choice" ? answer.slice(0, 80) : answer) || "No answer";
}

function extractResponseText(result) {
  if (typeof result?.output_text === "string") {
    return result.output_text;
  }

  const parts = [];
  for (const item of result?.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n");
}

function getOpenAiErrorMessage(result, status) {
  return (
    result?.error?.message ||
    result?.message ||
    `OpenAI API error (${status})`
  );
}

function isAuthorized(request, env) {
  return !env.HOVERGPT_TOKEN || request.headers.get("x-hovergpt-token") === env.HOVERGPT_TOKEN;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-hovergpt-token",
    "Cache-Control": "no-store",
  };
}
