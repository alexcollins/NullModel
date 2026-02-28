#!/usr/bin/env node

import { loadConfig } from '../src/config.js';
import { createNullModelServer } from '../src/server.js';
import { listPersonas } from '../src/personas/index.js';

// Parse CLI args (zero-dep)
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.personas) {
  console.log('\n  Available personas:\n');
  for (const p of listPersonas()) {
    console.log(`    ${bold(p.name.padEnd(14))} ${dim(p.description)}`);
  }
  console.log('');
  process.exit(0);
}

// Build config from file + CLI overrides
const overrides = {};
if (args.port) overrides.port = parseInt(args.port);
if (args.verbose || args.v) overrides.verbose = true;
if (args.chaos) overrides.chaos = { enabled: true };
if (args.persona) overrides.defaults = { persona: args.persona };
if (args.latency) {
  const ms = parseInt(args.latency);
  overrides.latency = { firstToken: ms * 5, perToken: ms };
}

const config = loadConfig(overrides);
const server = createNullModelServer(config);

server.listen(config.port, () => {
  console.log('');
  console.log(`  ${bold('nullmodel')} ${dim('v0.1.0')}`);
  console.log('');
  console.log(`  ${dim('→')} Local:    ${cyan(`http://localhost:${config.port}`)}`);
  console.log('');
  console.log(`  ${dim('Endpoints:')}`);
  console.log(`    ${dim('OpenAI')}     POST /v1/chat/completions`);
  console.log(`    ${dim('Anthropic')}  POST /v1/messages`);
  console.log(`    ${dim('Gemini')}     POST /v1beta/models/:model:generateContent`);
  console.log(`    ${dim('Gemini')}     POST /v1beta/models/:model:streamGenerateContent`);
  console.log(`    ${dim('Meta')}       GET  /personas, /config, /health`);
  console.log('');
  console.log(`  ${dim('Persona:')}    ${config.defaults.persona}`);
  console.log(`  ${dim('Chaos:')}      ${config.chaos.enabled ? yellow('enabled') : 'disabled'}`);
  console.log(`  ${dim('Latency:')}    ${config.latency.firstToken}ms first token, ${config.latency.perToken}ms/token`);
  console.log('');
  console.log(`  ${dim('Usage:')}`);
  console.log(`    ${dim('Point your app\'s base URL at')} ${cyan(`http://localhost:${config.port}`)}`);
  console.log(`    ${dim('Any API key will work — it\'s all fake.')}`);
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n  ${dim('Shutting down nullmodel...')}\n`);
  server.close();
  process.exit(0);
});

// --- Helpers ---

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else if (arg === '-v') {
      args.verbose = true;
    } else if (arg === '-p') {
      args.port = argv[++i];
    }
  }
  return args;
}

function printHelp() {
  console.log(`
  ${bold('nullmodel')} — Fake LLM API for building AI interfaces

  ${bold('Usage:')}
    npx nullmodel [options]

  ${bold('Options:')}
    --port, -p <port>      Port to listen on (default: 4000)
    --persona <name>       Default response persona (default: balanced)
    --latency <ms>         Base per-token latency in ms (default: 30)
    --chaos                Enable chaos mode (random errors & slowdowns)
    --verbose, -v          Log all requests
    --personas             List available personas
    --help                 Show this help

  ${bold('Examples:')}
    npx nullmodel                         # Start with defaults
    npx nullmodel --port 3001 --chaos     # Custom port + chaos mode
    npx nullmodel --persona code -v       # Code responses, verbose
    npx nullmodel --latency 10            # Fast streaming

  ${bold('Endpoints:')}
    POST /v1/chat/completions                            # OpenAI-compatible
    POST /v1/messages                                    # Anthropic-compatible
    POST /v1beta/models/:model:generateContent           # Gemini non-streaming
    POST /v1beta/models/:model:streamGenerateContent     # Gemini streaming
    GET  /personas                                       # List personas
    GET  /config                                         # Current config
    GET  /health                                         # Health check

  ${bold('Personas:')}
    balanced      Medium responses, mixed formatting
    verbose       Long, detailed responses
    terse         Very short responses
    code          Code-heavy with syntax blocks
    markdown      Rich markdown (tables, lists, etc.)
    tool_calls    Function/tool call responses
    error_prone   Random error states

  ${bold('Tip:')}
    Add "_persona": "code" to any request body to override
    the persona for that specific request.
`);
}

function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function dim(s) { return `\x1b[2m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
