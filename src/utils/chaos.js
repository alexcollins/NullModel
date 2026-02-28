// Chaos mode: inject realistic failure scenarios

export function shouldTriggerChaos(config) {
  if (!config.chaos.enabled) return null;

  const roll = Math.random();

  if (roll < config.chaos.rateLimitRate) {
    return 'rate_limit';
  }

  if (roll < config.chaos.rateLimitRate + config.chaos.errorRate) {
    return 'server_error';
  }

  if (roll < config.chaos.rateLimitRate + config.chaos.errorRate + config.chaos.slowdownRate) {
    return 'slowdown';
  }

  return null;
}

export function getChaosResponse(type, provider = 'openai') {
  const errors = {
    rate_limit: {
      openai: {
        status: 429,
        body: {
          error: {
            message: 'Rate limit reached for gpt-4 in organization org-mock on tokens per min (TPM): Limit 40000, Used 39532, Requested 1024.',
            type: 'tokens',
            param: null,
            code: 'rate_limit_exceeded',
          },
        },
        headers: { 'retry-after': '2', 'x-ratelimit-remaining-tokens': '468' },
      },
      anthropic: {
        status: 429,
        body: {
          type: 'error',
          error: {
            type: 'rate_limit_error',
            message: 'Number of request tokens has exceeded your per-minute rate limit.',
          },
        },
        headers: { 'retry-after': '2' },
      },
      gemini: {
        status: 429,
        body: {
          error: {
            code: 429,
            message: 'Resource has been exhausted (e.g. check quota).',
            status: 'RESOURCE_EXHAUSTED',
          },
        },
        headers: { 'retry-after': '2' },
      },
    },
    server_error: {
      openai: {
        status: 500,
        body: {
          error: {
            message: 'The server had an error while processing your request. Sorry about that!',
            type: 'server_error',
            param: null,
            code: null,
          },
        },
      },
      anthropic: {
        status: 500,
        body: {
          type: 'error',
          error: {
            type: 'api_error',
            message: 'An unexpected error has occurred internal to Anthropic\'s systems.',
          },
        },
      },
      gemini: {
        status: 500,
        body: {
          error: {
            code: 500,
            message: 'An internal error has occurred. Please retry or report in https://developers.generativeai.google/guide/troubleshooting',
            status: 'INTERNAL',
          },
        },
      },
    },
    context_length: {
      openai: {
        status: 400,
        body: {
          error: {
            message: "This model's maximum context length is 128000 tokens. However, your messages resulted in 129847 tokens. Please reduce the length of the messages.",
            type: 'invalid_request_error',
            param: 'messages',
            code: 'context_length_exceeded',
          },
        },
      },
      anthropic: {
        status: 400,
        body: {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'prompt is too long: 129847 tokens > 200000 maximum',
          },
        },
      },
      gemini: {
        status: 400,
        body: {
          error: {
            code: 400,
            message: 'Request payload size exceeds the limit: 2097152 bytes.',
            status: 'INVALID_ARGUMENT',
          },
        },
      },
    },
    timeout: {
      openai: {
        status: 408,
        body: {
          error: {
            message: 'Request timed out.',
            type: 'timeout_error',
            param: null,
            code: 'timeout',
          },
        },
      },
      anthropic: {
        status: 408,
        body: {
          type: 'error',
          error: {
            type: 'timeout_error',
            message: 'Request timed out.',
          },
        },
      },
      gemini: {
        status: 504,
        body: {
          error: {
            code: 504,
            message: 'Deadline exceeded.',
            status: 'DEADLINE_EXCEEDED',
          },
        },
      },
    },
  };

  return errors[type]?.[provider] || errors.server_error[provider] || errors.server_error.openai;
}

export default { shouldTriggerChaos, getChaosResponse };
