import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULTS = {
  port: 4000,
  latency: {
    firstToken: 300,
    perToken: 30,
    variance: 0.3,
  },
  defaults: {
    persona: 'balanced',
    maxTokens: 512,
  },
  chaos: {
    enabled: false,
    errorRate: 0.05,
    slowdownRate: 0.1,
    slowdownMultiplier: 5,
    rateLimitRate: 0.02,
  },
  cors: true,
  verbose: false,
};

export function loadConfig(overrides = {}) {
  let fileConfig = {};

  // Look for config file in cwd
  const configPath = resolve(process.cwd(), 'nullmodel.config.json');
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      fileConfig = JSON.parse(raw);
    } catch {
      // Ignore invalid config, use defaults
    }
  }

  return deepMerge(DEFAULTS, fileConfig, overrides);
}

function deepMerge(...objects) {
  const result = {};
  for (const obj of objects) {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && typeof result[key] === 'object') {
        result[key] = deepMerge(result[key], value);
      } else if (value !== undefined) {
        result[key] = value;
      }
    }
  }
  return result;
}

export default loadConfig;
