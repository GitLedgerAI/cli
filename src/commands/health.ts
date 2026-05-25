import { loadConfig, writeLastHealthReport } from '../config/store.js';
import { info, success, warn } from '../lib/output.js';

export type HealthOptions = {
  apiUrl?: string;
  json?: boolean;
  requireServices?: string;
};

function parseRequiredServices(input?: string): string[] {
  if (!input) return [];
  const parsed = input
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set(parsed)];
}

export async function runHealth(options: HealthOptions): Promise<void> {
  const cfg = await loadConfig();
  const base = options.apiUrl ?? process.env.GITLEDGER_API_URL ?? cfg.backendUrl;
  const url = `${base.replace(/\/$/, '')}/health`;
  const required = parseRequiredServices(options.requireServices);

  info(`Checking backend health: ${url}`);

  let res: Response;
  try {
    res = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = { ok: false, error: 'network_error', message, checkedAt: new Date().toISOString(), url };
    await writeLastHealthReport(failure);
    if (options.json) {
      console.log(JSON.stringify(failure));
    } else {
      warn(`Health request failed: ${message}`);
    }
    process.exitCode = 1;
    return;
  }

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
  const availableServiceNames = new Set(Object.keys(services));
  const unknownRequired = required.filter((name) => !availableServiceNames.has(name));

  if (unknownRequired.length > 0) {
    const available = [...availableServiceNames].sort();
    if (options.json) {
      console.log(
        JSON.stringify({
          ok: false,
          reason: 'invalid_required_services',
          unknownRequired,
          availableServices: available,
        }),
      );
    } else {
      warn(
        `Unknown required services: ${unknownRequired.join(', ')}. ` +
        `Available: ${available.length > 0 ? available.join(', ') : 'none'}`,
      );
    }
    process.exitCode = 1;
    return;
  }

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
