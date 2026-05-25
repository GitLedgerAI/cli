import { loadConfig, writeLastHealthReport } from '../config/store.js';
import { info, success, warn } from '../lib/output.js';

export type HealthOptions = {
  apiUrl?: string;
  json?: boolean;
  requireServices?: string;
  timeoutMs?: string;
};

function parseRequiredServices(input?: string): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseTimeoutMs(input?: string): number {
  if (!input) return 8000;
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return 8000;
  return Math.floor(n);
}

export async function runHealth(options: HealthOptions): Promise<void> {
  const cfg = await loadConfig();
  const base = options.apiUrl ?? process.env.GITLEDGER_API_URL ?? cfg.backendUrl;
  const url = `${base.replace(/\/$/, '')}/health`;
  const required = parseRequiredServices(options.requireServices);
  const timeoutMs = parseTimeoutMs(options.timeoutMs);

  info(`Checking backend health: ${url} (timeout ${timeoutMs}ms)`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    const isAbort = error instanceof Error && error.name === 'AbortError';
    const message = error instanceof Error ? error.message : String(error);
    const failure = {
      ok: false,
      error: isAbort ? 'timeout' : 'network_error',
      message,
      timeoutMs,
      checkedAt: new Date().toISOString(),
      url,
    };
    await writeLastHealthReport(failure);
    if (options.json) {
      console.log(JSON.stringify(failure));
    } else {
      warn(isAbort ? `Health request timed out after ${timeoutMs}ms` : `Health request failed: ${message}`);
    }
    process.exitCode = 1;
    return;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const failure = { ok: false, status: res.status, checkedAt: new Date().toISOString(), url };
    await writeLastHealthReport(failure);
    if (options.json) {
      console.log(JSON.stringify(failure));
    } else {
      warn(`Health endpoint returned status ${res.status}`);
    }
    process.exitCode = 1;
    return;
  }

  let payload: {
    ok?: boolean;
    services?: Record<string, { status?: string }>;
  };

  try {
    payload = (await res.json()) as {
      ok?: boolean;
      services?: Record<string, { status?: string }>;
    };
  } catch {
    const failure = { ok: false, error: 'invalid_json', checkedAt: new Date().toISOString(), url };
    await writeLastHealthReport(failure);
    if (options.json) {
      console.log(JSON.stringify(failure));
    } else {
      warn('Health endpoint returned invalid JSON');
    }
    process.exitCode = 1;
    return;
  }

  const report = {
    checkedAt: new Date().toISOString(),
    url,
    payload,
  };
  await writeLastHealthReport(report);

  if (!payload.ok) {
    if (options.json) {
      console.log(JSON.stringify(payload));
    } else {
      warn('Backend reports unhealthy state');
    }
    process.exitCode = 1;
    return;
  }

  const services = payload.services ?? {};
  const missingOrDown = required.filter((name) => (services[name]?.status ?? 'unknown') !== 'up');

  if (missingOrDown.length > 0) {
    if (options.json) {
      console.log(JSON.stringify({ ok: false, reason: 'required_services_not_healthy', services: missingOrDown, payload }));
    } else {
      warn(`Required services not healthy: ${missingOrDown.join(', ')}`);
    }
    process.exitCode = 1;
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(payload));
    return;
  }

  const summary = Object.entries(services)
    .map(([name, data]) => `${name}:${data.status ?? 'unknown'}`)
    .join(', ');

  if (required.length > 0) {
    success(`Backend healthy (${summary}) | required: ${required.join(', ')}`);
    return;
  }

  success(`Backend healthy (${summary})`);
}
