import { tokenize, getTokenDelay, getFirstTokenDelay, generateId, estimateTokens, sleep } from '../utils/streaming.js';
import { getResponse, getToolCall, getPersona } from '../personas/index.js';

/**
 * Handle OpenAI-compatible /v1/chat/completions
 * Faithfully replicates the exact SSE chunk format
 */
export async function handleChatCompletions(req, res, body, config) {
  const model = body.model || 'gpt-4';
  const stream = body.stream ?? false;
  const persona = resolvePersona(body, config);
  const isToolCall = persona.name === 'tool_calls' || body.tools?.length > 0;

  // Resolve response content
  let content, toolCall;
  if (isToolCall && persona.toolCalls) {
    const tc = getToolCall(persona);
    toolCall = tc.toolCall;
    content = tc.response;
  } else {
    content = getResponse(persona);
  }

  const completionId = generateId('chatcmpl');
  const created = Math.floor(Date.now() / 1000);
  const promptTokens = estimateTokens(JSON.stringify(body.messages || []));
  const completionTokens = estimateTokens(content);

  if (!stream) {
    return sendNonStreaming(res, {
      completionId,
      created,
      model,
      content,
      toolCall,
      promptTokens,
      completionTokens,
    });
  }

  return sendStreaming(res, config, {
    completionId,
    created,
    model,
    content,
    toolCall,
    promptTokens,
    completionTokens,
  });
}

function sendNonStreaming(res, { completionId, created, model, content, toolCall, promptTokens, completionTokens }) {
  const message = toolCall
    ? {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: generateId('call'),
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments),
            },
          },
        ],
      }
    : {
        role: 'assistant',
        content,
      };

  const response = {
    id: completionId,
    object: 'chat.completion',
    created,
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: toolCall ? 'tool_calls' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

async function sendStreaming(res, config, { completionId, created, model, content, toolCall, promptTokens, completionTokens }) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Request-Id': generateId('req'),
  });

  // First chunk: role
  const roleChunk = {
    id: completionId,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: '' },
        finish_reason: null,
      },
    ],
  };
  res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

  // Wait for "thinking" time
  await sleep(getFirstTokenDelay(config));

  if (toolCall) {
    // Stream tool call
    const callId = generateId('call');
    const argsStr = JSON.stringify(toolCall.arguments);

    // Tool call header chunk
    const toolChunk = {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: callId,
                type: 'function',
                function: { name: toolCall.name, arguments: '' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    };
    res.write(`data: ${JSON.stringify(toolChunk)}\n\n`);

    // Stream arguments in chunks
    const argChunks = chunkString(argsStr, 8);
    for (const chunk of argChunks) {
      await sleep(getTokenDelay(config));
      const argChunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: chunk },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      };
      res.write(`data: ${JSON.stringify(argChunk)}\n\n`);
    }

    // Final chunk
    const doneChunk = {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    };
    res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
  } else {
    // Stream content tokens
    const tokens = tokenize(content);
    for (const token of tokens) {
      await sleep(getTokenDelay(config));

      if (res.destroyed) return; // Client disconnected (stop button)

      const chunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [
          {
            index: 0,
            delta: { content: token },
            finish_reason: null,
          },
        ],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    // Final chunk with finish_reason
    const finalChunk = {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };
    res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

function resolvePersona(body, config) {
  // Check for x-nullmodel-persona header-style hint in the body
  const hint = body._persona || config.defaults.persona;
  return getPersona(hint);
}

function chunkString(str, size) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}

export default { handleChatCompletions };
