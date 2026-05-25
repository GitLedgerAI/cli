import { loadConfig } from '../config/store.js';
import { info, success, warn } from '../lib/output.js';

export type HealthOptions = {
  apiUrl?: string;
  json?: boolean;
};

export async function runHealth(options: HealthOptions): Promise<void> {
  const cfg = await loadConfig();
  const base = options.apiUrl ?? process.env.GITLEDGER_API_URL ?? cfg.backendUrl;
  const url = `${base.replace(/\/$/, '')}/health`;

  info(`Checking backend health: ${url}`);

  let res: Response;
  try {
    res = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: 'network_error', message }));
    } else {
      warn(`Health request failed: ${message}`);
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
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: 'invalid_json' }));
    } else {
      warn('Health endpoint returned invalid JSON');
    }
    process.exitCode = 1;
    return;
  }

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
