/**
 * CLI entry point
 */

import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { workspaceCommand } from './commands/workspace.js';
import { skillCommand } from './commands/skill.js';
import { serverCommand } from './commands/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
);

program
  .name('comrade')
  .description('Comrade - AI-powered workspace CLI')
  .version(pkg.version);

// Workspace commands
program
  .command('workspace')
  .alias('ws')
  .description('Manage workspaces')
  .option('-l, --list', 'List all workspaces')
  .option('-c, --create <name>', 'Create a new workspace')
  .option('-p, --path <path>', 'Path for the workspace')
  .option('-d, --delete <id>', 'Delete a workspace')
  .option('-a, --activate <id>', 'Activate a workspace')
  .action(workspaceCommand);

// Skill commands
program
  .command('skill')
  .alias('sk')
  .description('Manage skills')
  .option('-l, --list', 'List all skills')
  .option('-c, --create <name>', 'Create a new skill')
  .option('-d, --delete <name>', 'Delete a skill')
  .option('-w, --workspace <id>', 'Workspace ID')
  .action(skillCommand);

// Server commands
program
  .command('server')
  .alias('srv')
  .description('Manage the Comrade server')
  .option('-s, --start', 'Start the server')
  .option('-p, --port <port>', 'Port to listen on', '8080')
  .option('-h, --host <host>', 'Host to bind to', '127.0.0.1')
  .option('--readonly', 'Run in read-only mode')
  .action(serverCommand);

// Status command
program
  .command('status')
  .description('Check server status')
  .action(async () => {
    try {
      const response = await fetch('http://127.0.0.1:8080/health');
      const data = await response.json() as { version: string; uptimeMs: number; ok: boolean };
      console.log('Server Status:');
      console.log('  Version:', data.version);
      console.log('  Uptime:', Math.round(data.uptimeMs / 1000), 'seconds');
      console.log('  Status:', data.ok ? '✓ Running' : '✗ Error');
    } catch (error) {
      console.log('Server Status: ✗ Not running');
      console.log('  Start with: comrade server --start');
    }
  });

program.parse();
