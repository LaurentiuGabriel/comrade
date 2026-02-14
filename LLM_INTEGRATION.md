# Comrade LLM Integration

This document describes the LLM (Large Language Model) integration in Comrade, which supports multiple AI providers.

## Supported Providers

### 1. OpenAI
- **Models**: GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo
- **Requirements**: OpenAI API key
- **Configuration**: Set API key in Settings

### 2. Anthropic (Claude)
- **Models**: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku
- **Requirements**: Anthropic API key
- **Configuration**: Set API key in Settings

### 3. Google Gemini
- **Models**: Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash
- **Requirements**: Google AI API key
- **Configuration**: Set API key in Settings

### 4. Ollama (Local Models)
- **Models**: Llama 3.2, Llama 3.1, Mistral, CodeLlama, Phi4, and any Ollama-compatible model
- **Requirements**: Ollama installed and running locally
- **Configuration**: Set base URL (default: http://localhost:11434)
- **Note**: No API key required for local models

## Configuration

### Initial Setup

1. Open Comrade Desktop application
2. Navigate to **Settings** page
3. Scroll to **LLM Configuration** section
4. Enable LLM by checking the "Enable LLM" checkbox
5. Select your preferred provider from the dropdown
6. Choose a model from the available options
7. Enter your API key (if required by the provider)
8. Adjust optional parameters:
   - **Temperature**: Controls randomness (0-2, default: 0.7)
   - **Max Tokens**: Maximum response length (default: 4096)
   - **Top P**: Nucleus sampling parameter (0-1, default: 1.0)
9. Click **Save Configuration**

### Provider-Specific Notes

#### Ollama Setup
1. Install Ollama from [ollama.com](https://ollama.com)
2. Start Ollama service
3. Pull desired models: `ollama pull llama3.2`
4. In Comrade Settings, select Ollama as provider
5. Optional: Set custom base URL if Ollama is not running on default port

#### API Key Security
- API keys are stored in server memory only (not persisted to disk)
- Keys are never logged or exposed in the UI
- Each server restart requires re-configuration

## Architecture

### Backend Components

#### LLMService (`packages/server/src/services/llm.ts`)
The main service that manages LLM interactions:
- Provider client initialization
- Configuration validation
- Streaming chat completions
- Error handling and retries

#### API Routes (`packages/server/src/routes/index.ts`)
- `GET /llm/providers` - List available providers
- `GET /llm/config` - Get current configuration
- `POST /llm/config` - Update configuration
- `GET /llm/status` - Check LLM status
- `POST /llm/chat` - Stream chat completions (SSE)

### Frontend Components

#### LLM Slice (`packages/desktop/src/renderer/slices/llmSlice.ts`)
Redux state management for LLM configuration:
- Fetch providers and configuration
- Save configuration
- Track LLM status

#### Settings Page (`packages/desktop/src/renderer/pages/SettingsPage.tsx`)
UI for configuring LLM providers with:
- Provider selection
- Model selection
- API key input
- Parameter sliders
- Status indicators

#### Chat Page (`packages/desktop/src/renderer/pages/ChatPage.tsx`)
Updated to use real LLM streaming instead of simulated responses.

## Usage

### Chat Interface
1. Select or create a workspace
2. Start a new conversation in the Chat page
3. Type your message and press Enter
4. The LLM will respond with streaming text
5. All messages are saved to the session

### Error Handling
If LLM is not configured:
- A warning message appears in the chat
- User is directed to Settings to configure an LLM
- Graceful fallback without crashing the application

## Testing

### Manual Testing Checklist

1. **OpenAI Integration**
   - [ ] Configure with valid API key
   - [ ] Send test message
   - [ ] Verify streaming response
   - [ ] Test with invalid key (should show error)

2. **Anthropic Integration**
   - [ ] Configure with valid API key
   - [ ] Send test message
   - [ ] Verify streaming response
   - [ ] Test with invalid key (should show error)

3. **Google Gemini Integration**
   - [ ] Configure with valid API key
   - [ ] Send test message
   - [ ] Verify streaming response
   - [ ] Test with invalid key (should show error)

4. **Ollama Integration**
   - [ ] Start Ollama locally
   - [ ] Configure with base URL
   - [ ] Send test message
   - [ ] Verify streaming response
   - [ ] Test when Ollama is offline (should show error)

5. **Configuration**
   - [ ] Switch between providers
   - [ ] Adjust temperature/max tokens
   - [ ] Verify settings persist during session
   - [ ] Test without configuration (should show helpful message)

### Provider Configuration Examples

#### OpenAI
```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "apiKey": "sk-...",
  "temperature": 0.7,
  "maxTokens": 4096,
  "enabled": true
}
```

#### Anthropic
```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "apiKey": "sk-ant-...",
  "temperature": 0.7,
  "maxTokens": 4096,
  "enabled": true
}
```

#### Google Gemini
```json
{
  "provider": "google",
  "model": "gemini-1.5-pro",
  "apiKey": "AIza...",
  "temperature": 0.7,
  "maxTokens": 4096,
  "enabled": true
}
```

#### Ollama
```json
{
  "provider": "ollama",
  "model": "llama3.2",
  "baseUrl": "http://localhost:11434",
  "temperature": 0.7,
  "maxTokens": 4096,
  "enabled": true
}
```

## Troubleshooting

### Common Issues

**"LLM is not configured" error**
- Go to Settings > LLM Configuration
- Enable LLM and configure a provider
- Save the configuration

**"Invalid API key" error**
- Verify your API key is correct
- Check that the key has not expired
- Ensure the key has access to the selected model

**"Connection refused" error (Ollama)**
- Verify Ollama is running: `ollama serve`
- Check the base URL is correct
- Ensure the model is pulled: `ollama pull <model>`

**Slow responses**
- Reduce max tokens setting
- Use a faster model (e.g., GPT-3.5-turbo instead of GPT-4)
- Check internet connection
- For Ollama, ensure your machine has enough RAM

**Streaming not working**
- Check browser console for errors
- Verify server is running
- Try refreshing the page

## Security Considerations

1. **API Keys**: Never commit API keys to version control
2. **Local Storage**: API keys are not persisted to disk
3. **Network**: All API calls are made server-side, keeping keys secure
4. **CORS**: Server only accepts requests from configured origins

## Future Enhancements

- [ ] Support for more providers (Cohere, AI21, etc.)
- [ ] Encrypted API key storage
- [ ] Per-workspace LLM configuration
- [ ] Model comparison feature
- [ ] Token usage tracking
- [ ] Cost estimation
- [ ] Custom model endpoints
- [ ] Prompt templates

## Development

### Adding a New Provider

1. Add provider info to `LLM_PROVIDERS` array in `llm.ts`
2. Install the provider's SDK: `pnpm add <provider-sdk>`
3. Add client initialization in `initializeClients()`
4. Implement streaming method `stream<Provider>()`
5. Update types in `packages/core/src/types.ts` if needed
6. Add tests
7. Update documentation

### Environment Variables

For development, you can set these environment variables:
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `GOOGLE_API_KEY` - Google AI API key

## License

This LLM integration is part of Comrade and follows the same MIT license.
