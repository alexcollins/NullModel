import { createServer } from 'node:http';
import { handleChatCompletions } from './providers/openai.js';
import { handleMessages } from './providers/anthropic.js';
import { handleGenerateContent } from './providers/gemini.js';
import { shouldTriggerChaos, getChaosResponse } from './utils/chaos.js';
import { listPersonas } from './personas/index.js';
import { sleep } from './utils/streaming.js';

export function createNullModelServer(config) {
  const server = createServer(async (req, res) => {
    // CORS
    if (config.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${config.port}`);
    const path = url.pathname;

    if (config.verbose) {
      log('→', req.method, path);
    }

    try {
      // Health check
      if (path === '/' || path === '/health') {
        return sendJSON(res, 200, {
          status: 'ok',
          service: 'nullmodel',
          version: '0.1.0',
          uptime: process.uptime(),
          chaos: config.chaos.enabled ? 'enabled' : 'disabled',
        });
      }

      // List personas
      if (path === '/personas') {
        return sendJSON(res, 200, { personas: listPersonas() });
      }

      // Config endpoint (read-only)
      if (path === '/config') {
        return sendJSON(res, 200, {
          latency: config.latency,
          defaults: config.defaults,
          chaos: config.chaos,
        });
      }

      // Parse body for POST requests
      if (req.method !== 'POST') {
        return sendJSON(res, 405, { error: 'Method not allowed' });
      }

      const body = await parseBody(req);

      // Determine provider from path
      let provider;
      let providerMeta = {};
      if (path === '/v1/chat/completions') {
        provider = 'openai';
      } else if (path === '/v1/messages') {
        provider = 'anthropic';
      } else if (path.match(/^\/v1beta\/models\/[^/]+:(generateContent|streamGenerateContent)$/)) {
        provider = 'gemini';
        const match = path.match(/^\/v1beta\/models\/([^/]+):(generateContent|streamGenerateContent)$/);
        providerMeta.model = match[1];
        providerMeta.stream = match[2] === 'streamGenerateContent';
      } else {
        return sendJSON(res, 404, {
          error: `Unknown endpoint: ${path}`,
          hint: 'nullmodel supports /v1/chat/completions (OpenAI), /v1/messages (Anthropic), and /v1beta/models/:model:generateContent (Gemini)',
        });
      }

      // Chaos mode check
      const chaosType = shouldTriggerChaos(config);
      if (chaosType) {
        if (chaosType === 'slowdown') {
          if (config.verbose) log('⚡', 'Chaos: slowdown triggered');
          // Multiply all delays — handled by adjusting config temporarily
          const slowConfig = {
            ...config,
            latency: {
              ...config.latency,
              firstToken: config.latency.firstToken * config.chaos.slowdownMultiplier,
              perToken: config.latency.perToken * config.chaos.slowdownMultiplier,
            },
          };
          return routeToProvider(provider, req, res, body, slowConfig, providerMeta);
        }

        if (config.verbose) log('💥', `Chaos: ${chaosType} triggered`);
        const chaosResponse = getChaosResponse(chaosType, provider);
        res.writeHead(chaosResponse.status, {
          'Content-Type': 'application/json',
          ...chaosResponse.headers,
        });
        res.end(JSON.stringify(chaosResponse.body));
        return;
      }

      // Handle __ERROR__ persona responses
      return routeToProvider(provider, req, res, body, config, providerMeta);
    } catch (err) {
      if (config.verbose) log('❌', err.message);
      sendJSON(res, 500, { error: 'Internal nullmodel error', message: err.message });
    }
  });

  return server;
}

function routeToProvider(provider, req, res, body, config, meta = {}) {
  if (provider === 'openai') {
    return handleChatCompletions(req, res, body, config);
  }
  if (provider === 'anthropic') {
    return handleMessages(req, res, body, config);
  }
  if (provider === 'gemini') {
    return handleGenerateContent(req, res, body, config, meta);
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

function log(...args) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`  ${dim(time)}`, ...args);
}

function dim(str) {
  return `\x1b[2m${str}\x1b[0m`;
}

export default createNullModelServer;
