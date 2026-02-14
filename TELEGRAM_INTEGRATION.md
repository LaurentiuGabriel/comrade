# Telegram Bot Integration

This document describes the Telegram Bot integration for Comrade, allowing you to control Comrade remotely via Telegram.

## Overview

The Telegram Bot integration enables you to:
- Chat with Comrade from anywhere via Telegram
- Use AI features through the Telegram interface
- Control Comrade remotely without opening the desktop app
- Maintain conversation history synced with Comrade sessions

## Setup Instructions

### 1. Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Start a conversation and send the command `/newbot`
3. Follow the prompts:
   - Enter a name for your bot (e.g., "My Comrade Bot")
   - Enter a username for your bot (must end in 'bot', e.g., "my_comrade_bot")
4. BotFather will provide you with a **Bot Token** (save this!)

### 2. Configure Comrade

1. Open Comrade Desktop application
2. Go to **Settings**
3. Scroll to **Telegram Bot Configuration** section
4. Check "Enable Telegram Bot"
5. Paste your Bot Token in the field
6. Select a **Default Workspace** (this is where the bot will operate)
7. (Optional) Add **Authorized Users** to restrict access
8. Click **Save Configuration**
9. Click **Start Bot**

### 3. Test the Bot

1. Open Telegram and search for your bot by its username
2. Start a conversation and send `/start`
3. The bot should respond with a welcome message
4. Try sending a message - it should respond using your configured LLM!

## Features

### Bot Commands

- `/start` - Show welcome message and available commands
- `/status` - Check bot and LLM status
- `/new` - Start a new conversation
- `/workspace` - Show current workspace information
- `/help` - Show help and tips

### Security Features

**Authorized Users**
- You can restrict bot access to specific Telegram user IDs
- Leave empty to allow all users (not recommended for production)
- To find your Telegram user ID, message @userinfobot on Telegram

**API Key Security**
- Bot token is stored in server memory only
- Token is never persisted to disk
- Token must be re-entered after server restart

### Configuration Options

**Bot Token** (Required)
- Your Telegram bot token from @BotFather
- Format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

**Default Workspace** (Required)
- The workspace the bot will use for file operations
- Can be changed per-session with commands (future feature)

**Authorized Users** (Optional)
- Comma-separated list of Telegram user IDs
- Only these users can interact with the bot
- Example: `123456789, 987654321`

**Parse Mode**
- `Markdown` - Supports **bold**, *italic*, `code`, etc.
- `HTML` - Supports HTML tags
- `None` - Plain text only

**Show Typing Indicator**
- Shows "typing..." status while the AI is generating a response
- Improves user experience but adds slight overhead

## Architecture

### Backend Components

#### TelegramBotService (`packages/server/src/services/telegram.ts`)
The main service managing Telegram bot interactions:
- Bot initialization and polling
- Message handling and command parsing
- Integration with LLM service for AI responses
- Session management per chat
- Authorization checking

#### API Routes (`packages/server/src/routes/index.ts`)
- `GET /telegram/config` - Get current configuration
- `POST /telegram/config` - Update configuration
- `GET /telegram/status` - Check bot status
- `POST /telegram/start` - Start the bot
- `POST /telegram/stop` - Stop the bot
- `POST /telegram/validate` - Validate configuration

### Frontend Components

#### Telegram Slice (`packages/desktop/src/renderer/slices/telegramSlice.ts`)
Redux state management for Telegram configuration:
- Fetch and save configuration
- Start/stop bot controls
- Status monitoring

#### Settings Page (`packages/desktop/src/renderer/pages/SettingsPage.tsx`)
UI for configuring Telegram bot with:
- Bot token input
- Workspace selection
- Authorized users management
- Start/Stop bot buttons
- Status indicators

## Usage Examples

### Example 1: Code Review

**You:** Please review this code for any issues
```javascript
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

**Bot:** Looking at this code, here are my observations:
1. **No input validation** - If `items` is undefined or null, this will throw an error
2. **Missing semicolon** - While optional in JavaScript, consistent style is good
3. **No error handling** - Consider wrapping in try-catch for production code

Here's an improved version:
```javascript
function calculateTotal(items) {
  if (!Array.isArray(items)) {
    throw new Error('Items must be an array');
  }
  return items.reduce((sum, item) => {
    if (!item || typeof item.price !== 'number') {
      return sum;
    }
    return sum + item.price;
  }, 0);
}
```

### Example 2: File Operations

**You:** Create a new file called "README.md" with basic project info

**Bot:** I can help you create a README file! However, I need to let you know that through Telegram, I can provide you with the content, but I cannot directly create files on your system. Here's a template you can use:

```markdown
# Project Name

## Description
Brief description of your project.

## Installation
\`\`\`bash
npm install
\`\`\`

## Usage
\`\`\`bash
npm start
\`\`\`

## License
MIT
```

*(Note: Future versions will support direct file operations)*

### Example 3: Code Generation

**You:** Generate a Python function to parse JSON from a URL

**Bot:** Here's a Python function to fetch and parse JSON from a URL:

```python
import requests
import json

def fetch_json_from_url(url, timeout=30):
    """
    Fetch JSON data from a URL.
    
    Args:
        url (str): The URL to fetch from
        timeout (int): Request timeout in seconds
        
    Returns:
        dict: Parsed JSON data
        
    Raises:
        requests.RequestException: If the request fails
        json.JSONDecodeError: If the response is not valid JSON
    """
    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Request failed: {e}")
        raise
    except json.JSONDecodeError as e:
        print(f"Invalid JSON: {e}")
        raise

# Example usage
if __name__ == "__main__":
    try:
        data = fetch_json_from_url("https://api.example.com/data")
        print(json.dumps(data, indent=2))
    except Exception as e:
        print(f"Error: {e}")
```

This includes error handling and type hints for better code quality.

## Troubleshooting

### Bot Not Responding

1. Check if the bot is running in Comrade Settings
2. Verify the bot token is correct
3. Make sure you've started the bot with the **Start Bot** button
4. Check server logs for errors

### "LLM Not Configured" Error

The Telegram bot requires an LLM to be configured:
1. Go to Settings > LLM Configuration
2. Enable and configure an LLM provider (OpenAI, Anthropic, Google, or Ollama)
3. Save the LLM configuration
4. Return to Telegram settings and start the bot

### "You are not authorized" Error

If you've configured authorized users:
1. Check that your Telegram user ID is in the list
2. To find your user ID, message @userinfobot on Telegram
3. Add your ID to the Authorized Users field
4. Save and restart the bot

### Token Validation Errors

Bot token format should be: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
- Numbers followed by a colon
- Then alphanumeric characters, underscores, or hyphens
- If token was revoked in @BotFather, generate a new one

### Connection Issues

The bot uses Telegram's polling mechanism:
- Requires internet connection
- No need for public IP or port forwarding
- If behind a firewall, ensure outbound HTTPS (443) is allowed

## Advanced Configuration

### Environment Variables

For development, you can set these environment variables:
```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_DEFAULT_WORKSPACE=workspace_id
```

### Programmatic Usage

```typescript
import { TelegramBotService } from './services/telegram.js';

const telegramService = new TelegramBotService(config, llmService, sessionService);

// Update configuration
telegramService.updateConfig({
  botToken: 'your-token',
  enabled: true,
  authorizedUsers: [123456789],
  defaultWorkspaceId: 'workspace-id',
  showTypingIndicator: true,
  parseMode: 'Markdown'
});

// Start the bot
const result = await telegramService.start();
if (result.success) {
  console.log(`Bot @${result.botInfo?.username} started`);
}

// Stop the bot
await telegramService.stop();
```

## Security Best Practices

1. **Restrict Access**: Always set authorized users in production
2. **Token Rotation**: Regenerate token periodically via @BotFather
3. **Workspace Isolation**: Use a dedicated workspace for bot operations
4. **Monitor Usage**: Check audit logs regularly
5. **Don't Share**: Never share your bot token or commit it to version control

## Limitations

- **File Operations**: Currently limited compared to desktop interface
- **Workspace Switching**: Default workspace is used for all chats
- **Session Persistence**: Chat sessions are maintained in memory (server restart clears them)
- **Rate Limiting**: Subject to Telegram Bot API rate limits

## Future Enhancements

- [ ] File upload/download via Telegram
- [ ] Multi-workspace support per chat
- [ ] Voice message support
- [ ] Inline keyboard buttons for actions
- [ ] Message threading for long responses
- [ ] Group chat support with admin controls
- [ ] Webhook mode (alternative to polling)

## Contributing

To contribute to the Telegram integration:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with a test bot
5. Submit a pull request

## Support

For issues or questions:
- Open an issue on GitHub
- Check existing documentation
- Review troubleshooting section above

## License

This Telegram integration is part of Comrade and follows the MIT license.
