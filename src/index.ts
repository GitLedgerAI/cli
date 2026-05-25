#!/usr/bin/env node
import { Command } from 'commander';
import { runHealth } from './commands/health.js';
import { runConfigGet, runConfigInit, runConfigSet, runConfigShow } from './commands/config.js';
import { runDoctor } from './commands/doctor.js';

const program = new Command();

program
  .name('gitledger')
  .description('GitLedger command line interface')
  .version('0.1.0');

program
  .command('health')
  .description('Check GitLedger backend health')
  .option('--api-url <url>', 'Override backend API URL')
  .option('--json', 'Output raw JSON response')
  .option('--require-services <list>', 'Comma-separated list of services that must be up (e.g. postgres,redis,github,baseRpc)')
  .option('--timeout-ms <ms>', 'Request timeout in milliseconds (default: 8000)')
  .action(async (opts: { apiUrl?: string; json?: boolean; requireServices?: string; timeoutMs?: string }) => {
    await runHealth(opts);
  });

program
  .command('config:show')
  .description('Show effective CLI config')
  .action(async () => {
    await runConfigShow();
  });

program
  .command('config:init')
  .description('Create local config file with defaults')
  .action(async () => {
    await runConfigInit();
  });

program
  .command('config:get')
  .description('Read a config key')
  .argument('<key>', 'backendUrl|chain|walletAddress|notifierWebhookUrl')
  .action(async (key: 'backendUrl' | 'chain' | 'walletAddress' | 'notifierWebhookUrl') => {
    await runConfigGet(key);
  });


program
  .command('doctor')
  .description('Run local CLI and backend diagnostics')
  .action(async () => {
    await runDoctor();
  });
program
  .command('config:set')
  .description('Set a config key')
  .argument('<key>', 'backendUrl|chain|walletAddress|notifierWebhookUrl')
  .argument('<value>', 'new value')
  .action(async (key: 'backendUrl' | 'chain' | 'walletAddress' | 'notifierWebhookUrl', value: string) => {
    await runConfigSet(key, value);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
