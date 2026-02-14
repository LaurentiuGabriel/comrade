/**
 * LLM Service for managing AI providers and chat completions
 */

import { ServerConfig, LLMConfig, LLMProvider, LLMMessage, LLMStreamChunk, LLMProviderInfo } from '@comrade/core';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ollama from 'ollama';
import { ToolsService, getToolsPrompt } from './tools.js';

export const LLM_PROVIDERS: LLMProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models including GPT-4.1, GPT-4o, and reasoning models',
    requiresApiKey: true,
    supportsBaseUrl: false,
    defaultModels: [
      'gpt-4.1',
      'gpt-4.1-mini', 
      'gpt-4.1-nano',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.5-preview',
      'gpt-4-turbo',
      'o3-mini',
      'o1',
      'o1-mini',
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models including Opus 4.5, Sonnet 4.5, and Claude 3.5',
    requiresApiKey: true,
    supportsBaseUrl: false,
    defaultModels: [
      'claude-opus-4-5-20251101',
      'claude-sonnet-4-5-20251001',
      'claude-haiku-4-5-20251001',
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Gemini models from Google AI',
    requiresApiKey: true,
    supportsBaseUrl: false,
    defaultModels: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local open-source models (Llama, Mistral, etc.)',
    requiresApiKey: false,
    supportsBaseUrl: true,
    defaultModels: [], // Models fetched dynamically from local Ollama instance
  },
];

export class LLMService {
  private config: LLMConfig | null = null;
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private googleClient: GoogleGenerativeAI | null = null;
  private toolsService: ToolsService;

  constructor(private serverConfig: ServerConfig) {
    this.config = serverConfig.llm || null;
    this.toolsService = new ToolsService(serverConfig);
    this.initializeClients();
  }

  setWorkspace(workspacePath: string): void {
    this.toolsService.setWorkspace(workspacePath);
  }

  private initializeClients(): void {
    if (!this.config?.enabled) return;

    try {
      switch (this.config.provider) {
        case 'openai':
          this.openaiClient = new OpenAI({
            apiKey: this.config.apiKey,
          });
          break;
        case 'anthropic':
          this.anthropicClient = new Anthropic({
            apiKey: this.config.apiKey,
          });
          break;
        case 'google':
          if (this.config.apiKey) {
            this.googleClient = new GoogleGenerativeAI(this.config.apiKey);
          }
          break;
        case 'ollama':
          // Ollama client is used directly, no initialization needed
          break;
      }
    } catch (error) {
      console.error('[llm] Failed to initialize client:', error);
    }
  }

  updateConfig(config: LLMConfig): void {
    this.config = config;
    this.openaiClient = null;
    this.anthropicClient = null;
    this.googleClient = null;
    this.initializeClients();
  }

  getConfig(): LLMConfig | null {
    return this.config;
  }

  getProviders(): LLMProviderInfo[] {
    return LLM_PROVIDERS;
  }

  async getOllamaModels(baseUrl?: string): Promise<string[]> {
    try {
      const url = baseUrl || 'http://localhost:11434';
      const response = await fetch(`${url}/api/tags`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch Ollama models: ${response.status}`);
      }
      
      const data = await response.json() as { models?: Array<{ name: string }> };
      
      if (!data.models || !Array.isArray(data.models)) {
        return [];
      }
      
      // Extract model names and sort alphabetically
      return data.models
        .map((model: { name: string }) => model.name)
        .sort();
    } catch (error) {
      console.error('[llm] Failed to fetch Ollama models:', error);
      return [];
    }
  }

  isEnabled(): boolean {
    return this.config?.enabled === true;
  }

  validateConfig(): { valid: boolean; error?: string } {
    if (!this.config) {
      return { valid: false, error: 'LLM configuration not found' };
    }

    if (!this.config.enabled) {
      return { valid: false, error: 'LLM is not enabled' };
    }

    if (!this.config.provider) {
      return { valid: false, error: 'Provider is required' };
    }

    if (!this.config.model) {
      return { valid: false, error: 'Model is required' };
    }

    const providerInfo = LLM_PROVIDERS.find(p => p.id === this.config!.provider);
    if (!providerInfo) {
      return { valid: false, error: 'Invalid provider' };
    }

    if (providerInfo.requiresApiKey && !this.config.apiKey) {
      return { valid: false, error: `API key is required for ${providerInfo.name}` };
    }

    return { valid: true };
  }

  async *streamChat(messages: LLMMessage[]): AsyncGenerator<LLMStreamChunk> {
    const validation = this.validateConfig();
    if (!validation.valid) {
      yield { content: '', done: true, error: validation.error };
      return;
    }

    try {
      // Add tools prompt as system message if not already present
      const messagesWithTools = this.injectToolsPrompt(messages);

      switch (this.config!.provider) {
        case 'openai':
          yield* this.streamOpenAI(messagesWithTools);
          break;
        case 'anthropic':
          yield* this.streamAnthropic(messagesWithTools);
          break;
        case 'google':
          yield* this.streamGoogle(messagesWithTools);
          break;
        case 'ollama':
          yield* this.streamOllama(messagesWithTools);
          break;
        default:
          yield { content: '', done: true, error: 'Unsupported provider' };
      }
    } catch (error) {
      console.error('[llm] Streaming error:', error);
      yield { 
        content: '', 
        done: true, 
        error: error instanceof Error ? error.message : 'Unknown streaming error' 
      };
    }
  }

  private injectToolsPrompt(messages: LLMMessage[]): LLMMessage[] {
    const toolsPrompt = getToolsPrompt();
    
    // Check if tools prompt is already present
    const hasToolsPrompt = messages.some(
      m => m.role === 'system' && m.content.includes('Available tools')
    );
    
    if (hasToolsPrompt) {
      return messages;
    }
    
    // Insert tools prompt at the beginning
    return [
      { role: 'system', content: toolsPrompt },
      ...messages
    ];
  }

  /**
   * Execute tool calls from LLM response and return results
   */
  async executeToolCalls(content: string): Promise<{ text: string; executed: boolean }> {
    const { text, toolCalls } = this.toolsService.parseToolCalls(content);
    
    if (toolCalls.length === 0) {
      return { text: content, executed: false };
    }

    let resultText = text;
    
    for (const toolCall of toolCalls) {
      const result = await this.toolsService.executeTool(toolCall);
      
      if (result.success) {
        resultText += `\n\n[Tool ${toolCall.tool} executed successfully: ${result.output}]`;
      } else {
        resultText += `\n\n[Tool ${toolCall.tool} failed: ${result.error}]`;
      }
    }

    return { text: resultText, executed: true };
  }

  private async *streamOpenAI(messages: LLMMessage[]): AsyncGenerator<LLMStreamChunk> {
    if (!this.openaiClient) {
      yield { content: '', done: true, error: 'OpenAI client not initialized' };
      return;
    }

    const stream = await this.openaiClient.chat.completions.create({
      model: this.config!.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: this.config!.temperature ?? 0.7,
      max_tokens: this.config!.maxTokens,
      top_p: this.config!.topP,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      yield { content, done: false };
    }

    yield { content: '', done: true };
  }

  private async *streamAnthropic(messages: LLMMessage[]): AsyncGenerator<LLMStreamChunk> {
    if (!this.anthropicClient) {
      yield { content: '', done: true, error: 'Anthropic client not initialized' };
      return;
    }

    // Separate system message from other messages
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const stream = this.anthropicClient.messages.stream({
      model: this.config!.model,
      max_tokens: this.config!.maxTokens || 4096,
      temperature: this.config!.temperature ?? 0.7,
      top_p: this.config!.topP,
      system: systemMessage?.content,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: 'text_delta'; text: string };
        if (delta.type === 'text_delta') {
          yield { content: delta.text, done: false };
        }
      }
    }

    yield { content: '', done: true };
  }

  private async *streamGoogle(messages: LLMMessage[]): AsyncGenerator<LLMStreamChunk> {
    if (!this.googleClient) {
      yield { content: '', done: true, error: 'Google client not initialized' };
      return;
    }

    const model = this.googleClient.getGenerativeModel({ model: this.config!.model });

    // Separate system message from chat history
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    // Build chat history for context
    const history = [];
    for (let i = 0; i < chatMessages.length - 1; i++) {
      const msg = chatMessages[i];
      history.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      });
    }

    const chat = model.startChat({
      history,
      systemInstruction: systemMessage?.content,
      generationConfig: {
        temperature: this.config!.temperature ?? 0.7,
        maxOutputTokens: this.config!.maxTokens,
        topP: this.config!.topP,
      },
    });

    const lastMessage = chatMessages[chatMessages.length - 1];
    const result = await chat.sendMessageStream(lastMessage.content);

    for await (const chunk of result.stream) {
      const content = chunk.text();
      if (content) {
        yield { content, done: false };
      }
    }

    yield { content: '', done: true };
  }

  private async *streamOllama(messages: LLMMessage[]): AsyncGenerator<LLMStreamChunk> {
    try {
      const response = await ollama.chat({
        model: this.config!.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        options: {
          temperature: this.config!.temperature ?? 0.7,
          num_predict: this.config!.maxTokens,
          top_p: this.config!.topP,
        },
      });

      for await (const part of response) {
        yield { content: part.message?.content || '', done: false };
      }

      yield { content: '', done: true };
    } catch (error) {
      yield { 
        content: '', 
        done: true, 
        error: error instanceof Error ? error.message : 'Ollama streaming error' 
      };
    }
  }
}
