import { tokenize, getTokenDelay, getFirstTokenDelay, generateId, estimateTokens, sleep } from '../utils/streaming.js';
import { getResponse, getToolCall, getPersona } from '../personas/index.js';

/**
 * Handle Google Gemini-compatible endpoints:
 *   POST /v1beta/models/:model:generateContent       (non-streaming)
 *   POST /v1beta/models/:model:streamGenerateContent  (streaming, SSE)
 *
 * Faithfully replicates the Gemini API response shapes.
 */
export async function handleGenerateContent(req, res, body, config, { model, stream }) {
  const persona = resolvePersona(body, config);
  const isToolCall = persona.name === 'tool_calls' || body.tools?.length > 0;

  let content, toolCall;
  if (isToolCall && persona.toolCalls) {
    const tc = getToolCall(persona);
    toolCall = tc.toolCall;
    content = tc.response;
  } else {
    content = getResponse(persona);
  }

  const promptTokens = estimateTokens(JSON.stringify(body.contents || []));
  const completionTokens = estimateTokens(content);

  if (!stream) {
    return sendNonStreaming(res, { model, content, toolCall, promptTokens, completionTokens });
  }

  return sendStreaming(res, config, { model, content, toolCall, promptTokens, completionTokens });
}

function sendNonStreaming(res, { model, content, toolCall, promptTokens, completionTokens }) {
  const parts = [];

  if (toolCall) {
    parts.push({
      functionCall: {
        name: toolCall.name,
        args: toolCall.arguments,
      },
    });
  } else {
    parts.push({ text: content });
  }

  const response = {
    candidates: [
      {
        content: {
          parts,
          role: 'model',
        },
        finishReason: toolCall ? 'TOOL_CALLS' : 'STOP',
        index: 0,
        safetyRatings: makeSafetyRatings(),
      },
    ],
    usageMetadata: {
      promptTokenCount: promptTokens,
      candidatesTokenCount: completionTokens,
      totalTokenCount: promptTokens + completionTokens,
    },
    modelVersion: model,
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

async function sendStreaming(res, config, { model, content, toolCall, promptTokens, completionTokens }) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Wait for "thinking" time
  await sleep(getFirstTokenDelay(config));

  if (toolCall) {
    // Tool calls come as a single chunk in Gemini
    const chunk = {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: toolCall.name,
                  args: toolCall.arguments,
                },
              },
            ],
            role: 'model',
          },
          finishReason: 'TOOL_CALLS',
          index: 0,
          safetyRatings: makeSafetyRatings(),
        },
      ],
      usageMetadata: {
        promptTokenCount: promptTokens,
        candidatesTokenCount: completionTokens,
        totalTokenCount: promptTokens + completionTokens,
      },
      modelVersion: model,
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  } else {
    // Stream content token-by-token — Gemini sends incremental text parts
    const tokens = tokenize(content);

    for (let i = 0; i < tokens.length; i++) {
      await sleep(getTokenDelay(config));
      if (res.destroyed) return;

      const isLast = i === tokens.length - 1;

      const chunk = {
        candidates: [
          {
            content: {
              parts: [{ text: tokens[i] }],
              role: 'model',
            },
            ...(isLast
              ? { finishReason: 'STOP', safetyRatings: makeSafetyRatings() }
              : {}),
            index: 0,
          },
        ],
        ...(isLast
          ? {
              usageMetadata: {
                promptTokenCount: promptTokens,
                candidatesTokenCount: completionTokens,
                totalTokenCount: promptTokens + completionTokens,
              },
            }
          : {}),
        modelVersion: model,
      };

      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
  }

  res.end();
}

function resolvePersona(body, config) {
  const hint = body._persona || config.defaults.persona;
  return getPersona(hint);
}

function makeSafetyRatings() {
  return [
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', probability: 'NEGLIGIBLE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'NEGLIGIBLE' },
    { category: 'HARM_CATEGORY_HARASSMENT', probability: 'NEGLIGIBLE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'NEGLIGIBLE' },
  ];
}

export default { handleGenerateContent };
