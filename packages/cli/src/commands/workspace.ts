/**
 * Workspace command handler
 */

import ora from 'ora';
import chalk from 'chalk';

export async function workspaceCommand(options: {
  list?: boolean;
  create?: string;
  path?: string;
  delete?: string;
  activate?: string;
}) {
  const serverUrl = 'http://127.0.0.1:8080';

  if (options.list) {
    const spinner = ora('Fetching workspaces...').start();
    try {
      const response = await fetch(`${serverUrl}/workspaces`);
      const data = await response.json() as { items: Array<{ id: string; name: string }>; activeId: string | null };
      spinner.succeed('Workspaces:');
      
      if (data.items.length === 0) {
        console.log(chalk.gray('  No workspaces found'));
      } else {
        data.items.forEach((workspace) => {
          const active = workspace.id === data.activeId ? chalk.green('●') : '○';
          console.log(`  ${active} ${workspace.name} (${workspace.id})`);
        });
      }
    } catch (error) {
      spinner.fail('Failed to fetch workspaces. Is the server running?');
    }
    return;
  }

  if (options.create) {
    const spinner = ora('Creating workspace...').start();
    try {
      const workspacePath = options.path || `./${options.create}`;
      const response = await fetch(`${serverUrl}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: options.create, path: workspacePath }),
      });
      const data = await response.json() as { name: string; id: string; path: string };
      spinner.succeed(`Created workspace: ${chalk.green(data.name)}`);
      console.log(`  ID: ${data.id}`);
      console.log(`  Path: ${data.path}`);
    } catch (error) {
      spinner.fail('Failed to create workspace');
    }
    return;
  }

  if (options.delete) {
    const spinner = ora('Deleting workspace...').start();
    try {
      await fetch(`${serverUrl}/workspaces/${options.delete}`, {
        method: 'DELETE',
      });
      spinner.succeed('Workspace deleted');
    } catch (error) {
      spinner.fail('Failed to delete workspace');
    }
    return;
  }

  if (options.activate) {
    const spinner = ora('Activating workspace...').start();
    try {
      await fetch(`${serverUrl}/workspaces/${options.activate}/activate`, {
        method: 'POST',
      });
      spinner.succeed('Workspace activated');
    } catch (error) {
      spinner.fail('Failed to activate workspace');
    }
    return;
  }

  // Default: show help
  console.log('Usage: comrade workspace [options]');
  console.log('');
  console.log('Options:');
  console.log('  -l, --list              List all workspaces');
  console.log('  -c, --create <name>     Create a new workspace');
  console.log('  -p, --path <path>       Path for the workspace');
  console.log('  -d, --delete <id>       Delete a workspace');
  console.log('  -a, --activate <id>     Activate a workspace');
}
