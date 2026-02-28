// Built-in response personas for exercising different UI states
// Each persona returns content that stress-tests a specific rendering scenario

const personas = {
  balanced: {
    name: 'balanced',
    description: 'Medium-length, natural responses with mixed formatting',
    responses: [
      "That's a great question. Let me break it down.\n\nThe core idea is relatively simple: you're building a pipeline that transforms raw input into structured output. The tricky part is handling edge cases — malformed data, timeouts, and partial failures.\n\nI'd recommend starting with the happy path, getting that solid, then layering in error handling incrementally. Don't try to boil the ocean on v1.",
      "Here's what I'd suggest:\n\nFirst, separate your concerns. The data fetching layer shouldn't know anything about how the UI renders. Second, make your state transitions explicit — don't let things happen implicitly.\n\nThe biggest mistake I see is coupling the loading state to the data state. Keep them independent, and your UI will be much more predictable.",
      "There are a few ways to approach this, each with tradeoffs.\n\nThe simplest approach is a direct API call on each interaction. Low complexity, but you'll hit latency issues at scale. The more robust approach is to batch requests and process them async, but that adds complexity to your state management.\n\nFor most cases, I'd start simple and optimize later. Premature optimization is still the root of all evil.",
    ],
  },

  verbose: {
    name: 'verbose',
    description: 'Long, detailed responses — tests scroll, rendering perf, and overflow',
    responses: [
      "This is a really important topic, and I want to make sure I give you a comprehensive answer.\n\n## Background\n\nTo understand the current state of things, we need to go back to the fundamentals. The architecture you're describing evolved from earlier patterns in distributed systems, specifically the idea of message-passing between loosely coupled services.\n\nThe key insight was that by decoupling producers from consumers, you gain flexibility in how you scale, deploy, and recover from failures. This isn't a new idea — it dates back to the early days of Unix pipes — but the modern implementation looks quite different.\n\n## The Current Landscape\n\nToday, you have several options:\n\n1. **Event-driven architecture** — Services emit events, other services react. Great for loose coupling, but debugging can be painful because the flow isn't linear.\n\n2. **Request-response with queues** — More traditional, easier to reason about, but you lose some of the flexibility of pure event-driven systems.\n\n3. **Hybrid approaches** — Most production systems end up here. Synchronous for the critical path, async for everything else.\n\n## My Recommendation\n\nGiven what you've described, I'd lean toward option 3. Here's why:\n\n- Your latency requirements on the critical path suggest you need synchronous responses\n- But your analytics and logging pipeline is a perfect candidate for async processing\n- The hybrid approach lets you optimize each path independently\n\nThe implementation would look something like this: your API gateway handles the synchronous request-response cycle, and after returning the response to the client, it drops a message onto a queue for downstream processing. This gives you the best of both worlds — low latency for the user, and decoupled processing for everything else.\n\n## Common Pitfalls\n\nA few things to watch out for:\n\n- **Don't forget about backpressure.** If your async consumers can't keep up, your queues will grow unbounded. Set up dead-letter queues and alerting from day one.\n- **Idempotency is non-negotiable.** Messages will be delivered more than once. Design your consumers to handle that gracefully.\n- **Observability first.** In a distributed system, the ability to trace a request across services is critical. Invest in this early.\n\nI know this is a lot, but these fundamentals will save you significant pain down the line. Happy to dive deeper into any specific area.",
    ],
  },

  terse: {
    name: 'terse',
    description: 'Very short responses — tests compact UI states',
    responses: [
      "Yes, that's correct.",
      "No. Use a `Map` instead.",
      "42.",
      "Try `JSON.parse()` with a try-catch wrapper.",
      "That's a bug, not a feature.",
      "Correct.",
    ],
  },

  code: {
    name: 'code',
    description: 'Code-heavy responses — tests syntax highlighting, code blocks',
    responses: [
      "Here's a clean implementation:\n\n```typescript\ninterface StreamOptions {\n  onToken: (token: string) => void;\n  onComplete: () => void;\n  onError: (error: Error) => void;\n  signal?: AbortSignal;\n}\n\nasync function streamCompletion(\n  prompt: string,\n  options: StreamOptions\n): Promise<void> {\n  const { onToken, onComplete, onError, signal } = options;\n\n  try {\n    const response = await fetch('/api/chat', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ prompt }),\n      signal,\n    });\n\n    if (!response.ok) {\n      throw new Error(`HTTP ${response.status}`);\n    }\n\n    const reader = response.body?.getReader();\n    if (!reader) throw new Error('No reader available');\n\n    const decoder = new TextDecoder();\n\n    while (true) {\n      const { done, value } = await reader.read();\n      if (done) break;\n\n      const chunk = decoder.decode(value, { stream: true });\n      const lines = chunk.split('\\n').filter(Boolean);\n\n      for (const line of lines) {\n        if (line.startsWith('data: ')) {\n          const data = line.slice(6);\n          if (data === '[DONE]') {\n            onComplete();\n            return;\n          }\n          const parsed = JSON.parse(data);\n          const token = parsed.choices?.[0]?.delta?.content ?? '';\n          if (token) onToken(token);\n        }\n      }\n    }\n\n    onComplete();\n  } catch (err) {\n    if (err instanceof Error) onError(err);\n  }\n}\n```\n\nKey things: the `AbortSignal` support lets you wire up a stop button, and the chunked line parsing handles the SSE format correctly even when chunks split across lines.",
      "Quick solution:\n\n```javascript\nconst retry = async (fn, retries = 3, delay = 1000) => {\n  for (let i = 0; i < retries; i++) {\n    try {\n      return await fn();\n    } catch (err) {\n      if (i === retries - 1) throw err;\n      await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));\n    }\n  }\n};\n\n// Usage\nconst result = await retry(() => callLLM(prompt), 3, 500);\n```\n\nExponential backoff built in. Adjust `retries` and base `delay` to taste.",
    ],
  },

  markdown: {
    name: 'markdown',
    description: 'Rich markdown with tables, lists, emphasis — tests full markdown rendering',
    responses: [
      "# Comparison: Streaming Approaches\n\nHere's how the main approaches stack up:\n\n| Approach | Latency | Complexity | Browser Support |\n|----------|---------|------------|----------------|\n| **SSE** | Low | Low | ✅ All modern |\n| **WebSocket** | Very Low | Medium | ✅ All modern |\n| **Long Polling** | Medium | Low | ✅ Universal |\n| **WebTransport** | Very Low | High | ⚠️ Limited |\n\n## Key Takeaways\n\n- **For most AI apps, SSE is the right choice.** It's simple, well-supported, and designed for exactly this use case (server → client streaming).\n- **WebSockets** make sense if you need bidirectional streaming (e.g., real-time collaboration on prompts).\n- **Long polling** is your fallback for hostile network environments.\n\n> **Pro tip:** Always implement a reconnection strategy. SSE has `EventSource` built-in retry, but if you're using `fetch` with a `ReadableStream`, you'll need to handle reconnection yourself.\n\n### The decision tree\n\n1. Do you need server → client only? → **SSE**\n2. Do you need bidirectional? → **WebSocket**\n3. Are you behind a corporate proxy that kills connections? → **Long Polling**\n4. Do you need multiplexed streams? → **WebTransport** *(but check browser support)*\n\n---\n\n*Note: All approaches benefit from `gzip` or `brotli` compression on the wire. Don't skip this — it makes a bigger difference than you'd expect on token-heavy payloads.*",
    ],
  },

  tool_calls: {
    name: 'tool_calls',
    description: 'Responses with tool/function calls — tests tool call UI rendering',
    toolCalls: [
      {
        name: 'get_weather',
        arguments: { location: 'San Francisco, CA', unit: 'celsius' },
      },
      {
        name: 'search_database',
        arguments: { query: 'recent orders', limit: 10, status: 'pending' },
      },
      {
        name: 'create_document',
        arguments: {
          title: 'Q4 Planning Notes',
          content: 'Initial draft for Q4 planning...',
          tags: ['planning', 'q4', '2025'],
        },
      },
    ],
    responses: [
      "I'll look up the current weather for you.",
      "Let me search the database for that information.",
      "I'll create that document for you now.",
    ],
  },

  error_prone: {
    name: 'error_prone',
    description: 'Simulates various error states — tests error UI handling',
    responses: [
      '__ERROR__:rate_limit',
      '__ERROR__:context_length',
      '__ERROR__:server_error',
      '__ERROR__:timeout',
      "This response works fine though.",
    ],
  },
};

export function getPersona(name) {
  return personas[name] || personas.balanced;
}

export function getResponse(persona) {
  const p = typeof persona === 'string' ? getPersona(persona) : persona;
  const idx = Math.floor(Math.random() * p.responses.length);
  return p.responses[idx];
}

export function getToolCall(persona) {
  const p = typeof persona === 'string' ? getPersona(persona) : persona;
  if (!p.toolCalls) return null;
  const idx = Math.floor(Math.random() * p.toolCalls.length);
  return {
    toolCall: p.toolCalls[idx],
    response: p.responses[idx] || p.responses[0],
  };
}

export function listPersonas() {
  return Object.entries(personas).map(([key, p]) => ({
    name: key,
    description: p.description,
  }));
}

export default personas;
