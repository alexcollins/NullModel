import { tokenize, getTokenDelay, getFirstTokenDelay, generateId, estimateTokens, sleep } from '../utils/streaming.js';
import { getResponse, getToolCall, getPersona } from '../personas/index.js';

/**
 * Handle Anthropic-compatible /v1/messages
 * Faithfully replicates the exact SSE event format with event: and data: lines
 */
export async function handleMessages(req, res, body, config) {
  const model = body.model || 'claude-sonnet-4-20250514';
  const stream = body.stream ?? false;
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

  const messageId = generateId('msg');
  const inputTokens = estimateTokens(JSON.stringify(body.messages || []));
  const outputTokens = estimateTokens(content);

  if (!stream) {
    return sendNonStreaming(res, {
      messageId,
      model,
      content,
      toolCall,
      inputTokens,
      outputTokens,
    });
  }

  return sendStreaming(res, config, {
    messageId,
    model,
    content,
    toolCall,
    inputTokens,
    outputTokens,
  });
}

function sendNonStreaming(res, { messageId, model, content, toolCall, inputTokens, outputTokens }) {
  const contentBlocks = [];

  if (toolCall) {
    contentBlocks.push({
      type: 'text',
      text: content,
    });
    contentBlocks.push({
      type: 'tool_use',
      id: generateId('toolu'),
      name: toolCall.name,
      input: toolCall.arguments,
    });
  } else {
    contentBlocks.push({
      type: 'text',
      text: content,
    });
  }

  const response = {
    id: messageId,
    type: 'message',
    role: 'assistant',
    model,
    content: contentBlocks,
    stop_reason: toolCall ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

async function sendStreaming(res, config, { messageId, model, content, toolCall, inputTokens, outputTokens }) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Request-Id': generateId('req'),
  });

  // message_start event
  const messageStart = {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: inputTokens,
        output_tokens: 0,
      },
    },
  };
  writeSSE(res, 'message_start', messageStart);

  // Wait for "thinking" time
  await sleep(getFirstTokenDelay(config));

  if (toolCall) {
    // Text block first
    writeSSE(res, 'content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    });

    // Stream text tokens
    const tokens = tokenize(content);
    for (const token of tokens) {
      await sleep(getTokenDelay(config));
      if (res.destroyed) return;
      writeSSE(res, 'content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: token },
      });
    }

    writeSSE(res, 'content_block_stop', {
      type: 'content_block_stop',
      index: 0,
    });

    // Tool use block
    const toolUseId = generateId('toolu');
    writeSSE(res, 'content_block_start', {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: toolUseId, name: toolCall.name, input: {} },
    });

    // Stream tool input as JSON chunks
    const argsStr = JSON.stringify(toolCall.arguments);
    const argChunks = chunkString(argsStr, 12);
    for (const chunk of argChunks) {
      await sleep(getTokenDelay(config));
      if (res.destroyed) return;
      writeSSE(res, 'content_block_delta', {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: chunk },
      });
    }

    writeSSE(res, 'content_block_stop', {
      type: 'content_block_stop',
      index: 1,
    });
  } else {
    // content_block_start
    writeSSE(res, 'content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    });

    // Stream tokens as content_block_delta events
    const tokens = tokenize(content);
    for (const token of tokens) {
      await sleep(getTokenDelay(config));
      if (res.destroyed) return;
      writeSSE(res, 'content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: token },
      });
    }

    // content_block_stop
    writeSSE(res, 'content_block_stop', {
      type: 'content_block_stop',
      index: 0,
    });
  }

  // message_delta with final usage
  writeSSE(res, 'message_delta', {
    type: 'message_delta',
    delta: {
      stop_reason: toolCall ? 'tool_use' : 'end_turn',
      stop_sequence: null,
    },
    usage: {
      output_tokens: outputTokens,
    },
  });

  // message_stop
  writeSSE(res, 'message_stop', {
    type: 'message_stop',
  });

  res.end();
}

function writeSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function resolvePersona(body, config) {
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

export default { handleMessages };
