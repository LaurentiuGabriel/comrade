/**
 * Skill command handler
 */

import ora from 'ora';
import chalk from 'chalk';

export async function skillCommand(options: {
  list?: boolean;
  create?: string;
  delete?: string;
  workspace?: string;
}) {
  const serverUrl = 'http://127.0.0.1:8080';

  // Get active workspace if not specified
  let workspaceId: string | null | undefined = options.workspace;
  if (!workspaceId) {
    try {
      const response = await fetch(`${serverUrl}/workspaces`);
      const data = await response.json() as { activeId: string | null };
      workspaceId = data.activeId;
      if (!workspaceId) {
        console.log(chalk.red('Error: No active workspace. Use -w to specify one.'));
        return;
      }
    } catch (error) {
      console.log(chalk.red('Error: Could not fetch workspaces. Is the server running?'));
      return;
    }
  }

  if (options.list) {
    const spinner = ora('Fetching skills...').start();
    try {
      const response = await fetch(`${serverUrl}/workspaces/${workspaceId}/skills`);
      const data = await response.json() as { items: Array<{ name: string; description: string }> };
      spinner.succeed('Skills:');
      
      if (data.items.length === 0) {
        console.log(chalk.gray('  No skills found'));
      } else {
        data.items.forEach((skill) => {
          console.log(`  • ${chalk.cyan(skill.name)}`);
          console.log(`    ${skill.description}`);
        });
      }
    } catch (error) {
      spinner.fail('Failed to fetch skills');
    }
    return;
  }

  if (options.create) {
    const spinner = ora('Creating skill...').start();
    try {
      const content = `# ${options.create}\n\nAdd your skill description here.`;
      const response = await fetch(`${serverUrl}/workspaces/${workspaceId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: options.create, content }),
      });
      const data = await response.json() as { name: string };
      spinner.succeed(`Created skill: ${chalk.green(data.name)}`);
    } catch (error) {
      spinner.fail('Failed to create skill');
    }
    return;
  }

  if (options.delete) {
    const spinner = ora('Deleting skill...').start();
    try {
      await fetch(`${serverUrl}/workspaces/${workspaceId}/skills/${options.delete}`, {
        method: 'DELETE',
      });
      spinner.succeed('Skill deleted');
    } catch (error) {
      spinner.fail('Failed to delete skill');
    }
    return;
  }

  // Default: show help
  console.log('Usage: comrade skill [options]');
  console.log('');
  console.log('Options:');
  console.log('  -l, --list              List all skills');
  console.log('  -c, --create <name>     Create a new skill');
  console.log('  -d, --delete <name>     Delete a skill');
  console.log('  -w, --workspace <id>    Workspace ID (defaults to active)');
}
