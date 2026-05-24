import { loadConfig } from '../config/store.js';
import { info, success, warn } from '../lib/output.js';

export type HealthOptions = {
  apiUrl?: string;
  json?: boolean;
};

const RETRY_COUNT = 2;
const TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function runHealth(options: HealthOptions): Promise<void> {
  const cfg = await loadConfig();
  const base = options.apiUrl ?? process.env.GITLEDGER_API_URL ?? cfg.backendUrl;
  const url = `${base.replace(/\/$/, '')}/health`;

  info(`Checking backend health: ${url}`);

  let res: Response | null = null;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= RETRY_COUNT + 1; attempt += 1) {
    try {
      res = await fetchWithTimeout(url, TIMEOUT_MS);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt <= RETRY_COUNT) {
        warn(`Health check attempt ${attempt} failed (${lastError}), retrying...`);
      }
    }
  }

  if (!res) {
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: lastError ?? 'request_failed' }));
    } else {
      warn(`Health check failed: ${lastError ?? 'request_failed'}`);
    }
    process.exitCode = 1;
    return;
  }

  if (!res.ok) {
    if (options.json) {
      console.log(JSON.stringify({ ok: false, status: res.status }));
    } else {
      warn(`Health endpoint returned status ${res.status}`);
    }
    process.exitCode = 1;
    return;
  }

  const payload = (await res.json()) as {
    ok?: boolean;
    services?: Record<string, { status?: string }>;
  };

  if (!payload.ok) {
    if (options.json) {
      console.log(JSON.stringify(payload));
    } else {
      warn('Backend reports unhealthy state');
    }
    process.exitCode = 1;
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(payload));
    return;
  }

  const services = payload.services ?? {};
  const summary = Object.entries(services)
    .map(([name, data]) => `${name}:${data.status ?? 'unknown'}`)
    .join(', ');

  success(`Backend healthy (${summary})`);
}
