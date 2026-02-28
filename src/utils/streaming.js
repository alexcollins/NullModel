// Simulates realistic token-by-token delivery

/**
 * Crude token splitter that approximates LLM tokenization.
 * Splits on word boundaries, punctuation, and whitespace — close enough
 * to real tokenizer behavior for mock purposes.
 */
export function tokenize(text) {
  const tokens = [];
  // Split into chunks that approximate BPE-style tokens
  const regex = /(\s+|[^\s\w]|\w+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

/**
 * Calculate delay for a token with realistic variance
 */
export function getTokenDelay(config) {
  const base = config.latency.perToken;
  const variance = config.latency.variance;
  const jitter = 1 + (Math.random() * 2 - 1) * variance;
  return Math.max(5, Math.round(base * jitter));
}

/**
 * Get first-token latency (simulates model "thinking" time)
 */
export function getFirstTokenDelay(config) {
  const base = config.latency.firstToken;
  const variance = config.latency.variance;
  const jitter = 1 + (Math.random() * 2 - 1) * variance;
  return Math.max(50, Math.round(base * jitter));
}

/**
 * Generate a fake ID in the style of OpenAI/Anthropic
 */
export function generateId(prefix = 'chatcmpl') {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 24; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${id}`;
}

/**
 * Approximate token count for a string
 */
export function estimateTokens(text) {
  // Rough approximation: ~4 chars per token on average
  return Math.ceil(text.length / 4);
}

/**
 * Sleep utility
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
