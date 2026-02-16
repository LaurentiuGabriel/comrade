/**
 * CLI entry point for Comrade server
 */

import { program } from 'commander';
import { startServer } from './server.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

program
  .name('comrade-server')
  .description('Comrade API server for workspace management')
  .version(pkg.version)
  .option('-p, --port <port>', 'Port to listen on', '8080')
  .option('-h, --host <host>', 'Host to bind to', '127.0.0.1')
  .option('--readonly', 'Run in read-only mode', false)
  .option('-c, --config <path>', 'Path to config file')
  .option('--log-format <format>', 'Log format (json|text)', 'text')
  .option('--no-log-requests', 'Disable request logging')
  .action(async (options: { port: string; host: string; readonly: boolean; config?: string; logFormat: string; logRequests: boolean }) => {
    const configPath = options.config || join(homedir(), '.comrade', 'server.json');
    
    let config: any = {};
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, 'utf8'));
        console.log(`[comrade-server] Loaded config from ${configPath}`);
      } catch (error) {
        console.error(`[comrade-server] Failed to load config: ${error}`);
      }
    }

    await startServer({
      ...config,
      port: parseInt(options.port, 10),
      host: options.host,
      readOnly: options.readonly,
      logFormat: options.logFormat,
      logRequests: options.logRequests,
      configPath,
    });
  });

program.parse();
