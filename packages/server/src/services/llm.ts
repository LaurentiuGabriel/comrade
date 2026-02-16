/**
 * LLM Service for managing AI providers and chat completions with AGENTIC tool use
 */

import { ServerConfig, LLMConfig, LLMProvider, LLMMessage, LLMStreamChunk, LLMProviderInfo } from '@comrade/core';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ollama from 'ollama';
import { ToolsService, AVAILABLE_TOOLS, Tool, ToolCall, ToolResult } from './tools.js';

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

// Convert our tools to OpenAI function format
function toOpenAIFunctions(tools: Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// Convert our tools to Anthropic tool format
function toAnthropicTools(tools: Tool[]): Anthropic.Messages.Tool[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      properties: tool.parameters.properties,
      required: tool.parameters.required,
    },
  }));
}

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

  /**
   * Get workspace-specific LLM config, or fall back to global config
   */
  getWorkspaceConfig(workspaceId: string): LLMConfig | undefined {
    const workspace = this.serverConfig.workspaces.find(w => w.id === workspaceId);
    if (workspace?.llmConfig) {
      return workspace.llmConfig;
    }
    // Fall back to global config
    return this.config || undefined;
  }

  /**
   * Update workspace-specific LLM config
   */
  updateWorkspaceConfig(workspaceId: string, config: LLMConfig): void {
    const workspaceIndex = this.serverConfig.workspaces.findIndex(w => w.id === workspaceId);
    if (workspaceIndex === -1) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    
    // Update the workspace's llmConfig
    this.serverConfig.workspaces[workspaceIndex].llmConfig = config;
    this.serverConfig.workspaces[workspaceIndex].updatedAt = Date.now();
    
    // Also update the active config if this is the active workspace
    if (this.serverConfig.activeWorkspaceId === workspaceId) {
      this.config = config;
      this.openaiClient = null;
      this.anthropicClient = null;
      this.googleClient = null;
      this.initializeClients();
    }
  }

  getProviders(): LLMProviderInfo[] {
    return LLM_PROVIDERS;
  }

  isEnabled(): boolean {
    return this.config?.enabled === true;
  }

  /**
   * Check if LLM is enabled for a specific workspace
   */
  isEnabledForWorkspace(workspaceId: string): boolean {
    const config = this.getWorkspaceConfig(workspaceId);
    return config?.enabled === true;
  }

  validateConfig(config?: LLMConfig): { valid: boolean; error?: string } {
    const cfg = config || this.config;
    
    if (!cfg) {
      return { valid: false, error: 'LLM configuration not found' };
    }

    if (!cfg.enabled) {
      return { valid: false, error: 'LLM is not enabled' };
    }

    if (!cfg.provider) {
      return { valid: false, error: 'Provider is required' };
    }

    if (!cfg.model) {
      return { valid: false, error: 'Model is required' };
    }

    const providerInfo = LLM_PROVIDERS.find(p => p.id === cfg.provider);
    if (!providerInfo) {
      return { valid: false, error: 'Invalid provider' };
    }

    if (providerInfo.requiresApiKey && !cfg.apiKey) {
      return { valid: false, error: `API key is required for ${providerInfo.name}` };
    }

    return { valid: true };
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

  /**
   * AGENTIC CHAT: True ReAct (Reasoning + Acting) implementation
   * The agent thinks, plans, executes, observes, and repeats until done
   */
  async *agenticChat(messages: LLMMessage[], workspaceId?: string): AsyncGenerator<LLMStreamChunk> {
    // Get workspace-specific or global config
    const workspaceConfig = workspaceId ? this.getWorkspaceConfig(workspaceId) : (this.config || undefined);
    
    if (!workspaceConfig) {
      yield { content: '', done: true, error: 'LLM configuration not found' };
      return;
    }
    
    const validation = this.validateConfig(workspaceConfig);
    
    if (!validation.valid) {
      yield { content: '', done: true, error: validation.error };
      return;
    }

    // Step 1: Planning Phase - Ask agent to create a plan
    yield { content: '🤔 **Planning task...**\n\n', done: false };
    
    const planningMessages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are an AI Agent creating a plan. Output ONLY a numbered list of steps.

DO NOT use <tool_call> tags. DO NOT execute anything. ONLY describe the plan.

Available tools: ${AVAILABLE_TOOLS.map(t => t.name).join(', ')}

Example output format:
1. Create project directory using create_directory
2. Create index.html with the HTML structure using write_file
3. Create styles.css with CSS using write_file
4. Test by running a local server using execute_command

Keep the plan concise (3-6 steps). Do NOT include actual file contents or code.`
      },
      ...messages
    ];

    // Get the plan using text-only mode for planning
    let plan = '';
    switch (workspaceConfig!.provider) {
      case 'openai':
        const openaiPlan = await this.callOpenAIWithTools(planningMessages, false, workspaceConfig); // false = no tool forcing
        plan = openaiPlan.content;
        break;
      case 'anthropic':
        const anthropicPlan = await this.callAnthropicWithTools(planningMessages, false, workspaceConfig);
        plan = anthropicPlan.content;
        break;
      default:
        plan = await this.collectStreamText(planningMessages, workspaceConfig);
    }
    
    yield { content: `\n**Plan:**\n${plan}\n`, done: false };

    // Step 2: Execution Phase - Execute the plan
    yield { content: '⚡ **Starting execution...**\n', done: false };
    
    const executionSystemMessage: LLMMessage = {
      role: 'system',
      content: `You are a tool-executing agent. Use the native tool API to execute actions.

CRITICAL RULES FOR write_file:
- You MUST provide BOTH "path" AND "content" parameters
- The "content" parameter must contain the COMPLETE file content
- Do NOT omit the content parameter - files need actual content

When creating files:
1. Think about what content the file needs
2. Call write_file with path AND the full content string
3. Include ALL the code/text in the content field

Example of CORRECT write_file usage:
- path: "src/app.js"  
- content: "function main() { console.log('hello'); }\nmain();"

Execute ONE tool at a time. After each tool result, continue with the next action or summarize if done.`
    };

    let currentMessages = [executionSystemMessage, ...messages];
    let toolExecutions = 0;
    const maxToolExecutions = 100; // Increased limit for complex tasks

    try {
      while (toolExecutions < maxToolExecutions) {
        let assistantContent = '';
        let toolCalls: Array<{name: string; arguments: string; id?: string}> = [];
        
        // Get response from LLM
    switch (workspaceConfig!.provider) {
          case 'openai':
            const openaiResult = await this.callOpenAIWithTools(currentMessages, true, workspaceConfig);
            assistantContent = openaiResult.content;
            toolCalls = openaiResult.toolCalls;
            break;
          case 'anthropic':
            const anthropicResult = await this.callAnthropicWithTools(currentMessages, true, workspaceConfig);
            assistantContent = anthropicResult.content;
            toolCalls = anthropicResult.toolCalls;
            break;
          case 'google':
          case 'ollama':
            const textResult = await this.collectStreamText(currentMessages, workspaceConfig);
            assistantContent = textResult;
            const { toolCalls: parsedCalls } = this.toolsService.parseToolCalls(textResult);
            if (parsedCalls.length > 0) {
              toolCalls = parsedCalls.map((tc: ToolCall) => ({ 
                name: tc.tool, 
                arguments: JSON.stringify(tc.arguments),
                id: undefined
              }));
            }
            break;
          default:
            yield { content: '', done: true, error: 'Unsupported provider' };
            return;
        }

        // Add assistant message
        currentMessages.push({ role: 'assistant', content: assistantContent });

        // If no tool calls from native API provider (OpenAI/Anthropic), FORCE it to use tools
        if (toolCalls.length === 0 && (workspaceConfig!.provider === 'openai' || workspaceConfig!.provider === 'anthropic')) {
          yield { content: '\n⚠️ **LLM did not use tools - forcing execution...**\n', done: false };
          
          // Check if this looks like a description that should be a tool call
          const detectedCalls = this.detectPseudoToolCalls(assistantContent);
          if (detectedCalls.length > 0) {
            yield { content: `✓ Converted ${detectedCalls.length} described actions to tool calls\n`, done: false };
            toolCalls = detectedCalls;
          } else {
            // Add a forceful message requiring tool use
            currentMessages.push({
              role: 'user',
              content: `⚠️ CRITICAL ERROR: You MUST use tools immediately. You output text instead of using tools.

The user asked you to perform actions. DO NOT describe what you would do. DO NOT explain the steps.

USE TOOLS NOW:
- If creating a file: call write_file with path and content
- If running a command: call execute_command with command
- If checking git: call git_status
- etc.

CALL A TOOL IMMEDIATELY.`
            });
            
            // Skip to next iteration to force tool use
            toolExecutions++;
            continue;
          }
        }
        
        // For non-native providers (Google/Ollama), try pseudo-code detection
        if (toolCalls.length === 0 && (workspaceConfig!.provider === 'google' || workspaceConfig!.provider === 'ollama')) {
          const pseudoToolCalls = this.detectPseudoToolCalls(assistantContent);
          if (pseudoToolCalls.length > 0) {
            yield { content: `[Converting ${pseudoToolCalls.length} described actions to tool calls...]\n`, done: false };
            toolCalls = pseudoToolCalls;
          } else {
            // No tools to execute, task is complete
            yield { content: '\n✅ **Task completed!**\n', done: false };
            yield { content: assistantContent, done: true };
            return;
          }
        }
        
        // If still no tool calls after all attempts, task is done
        if (toolCalls.length === 0) {
          yield { content: '\n✅ **Task completed!**\n', done: false };
          yield { content: assistantContent, done: true };
          return;
        }

        // Execute tools
        yield { content: `\n🛠️  **Executing ${toolCalls.length} tool(s):**\n\n`, done: false };
        
        let hasErrors = false;
        
        for (const toolCall of toolCalls) {
          try {
            let args: Record<string, unknown>;
            
            // Parse arguments
            try {
              args = JSON.parse(toolCall.arguments);
            } catch (parseError) {
              const errorMsg = `Invalid JSON in tool arguments: ${parseError instanceof Error ? parseError.message : 'parse error'}`;
              yield { content: `**${toolCall.name}** ❌ ${errorMsg}\n\n`, done: false };
              currentMessages.push({
                role: 'user',
                content: `${toolCall.name} result: FAILED\n${errorMsg}`
              });
              hasErrors = true;
              continue;
            }
            
            // Validate required arguments
            const validation = this.validateAndFixToolArgs(toolCall.name, args);
            if (!validation.valid) {
              const errorMsg = validation.error || 'Validation failed';
              console.error(`[llm] Validation failed for ${toolCall.name}:`, errorMsg);
              console.error(`[llm] Arguments received:`, JSON.stringify(args, null, 2));
              
              // Special handling for write_file missing content - fetch content separately
              if (toolCall.name === 'write_file' && args.path && !args.content) {
                yield { content: `**${toolCall.name}** ⏳ Fetching content for ${args.path}...\n`, done: false };
                
                const fetchedContent = await this.fetchFileContent(currentMessages, args.path as string);
                if (fetchedContent) {
                  args.content = fetchedContent;
                  console.log(`[llm] Successfully fetched content for ${args.path} (${fetchedContent.length} bytes)`);
                } else {
                  yield { content: `**${toolCall.name}** ❌ Could not generate content for ${args.path}\n\n`, done: false };
                  currentMessages.push({
                    role: 'user',
                    content: `write_file for "${args.path}" FAILED - could not get file content. Please provide the complete content for this file.`
                  });
                  hasErrors = true;
                  continue;
                }
              } else {
                yield { content: `**${toolCall.name}** ❌ ${errorMsg}\n\n`, done: false };
                currentMessages.push({
                  role: 'user',
                  content: `${toolCall.name} result: FAILED - ${errorMsg}\n\nThe tool was called but missing required arguments. You MUST provide ALL required parameters. For write_file, include BOTH "path" and "content" fields with actual values.`
                });
                hasErrors = true;
                continue;
              }
            } else {
              args = validation.args!;
            }
            
            // Debug: Log the tool call arguments
            console.log(`[llm] Executing tool ${toolCall.name} with args:`, JSON.stringify(args, null, 2));
            
            yield { content: `**${toolCall.name}** `, done: false };
            
            const result = await this.toolsService.executeTool({ tool: toolCall.name, arguments: args });
            
            if (result.success) {
              yield { content: `✅\n`, done: false };
              // Show output if there is any
              if (result.output) {
                const truncatedOutput = result.output.length > 200 
                  ? result.output.substring(0, 200) + '...' 
                  : result.output;
                yield { content: `\`\`\`\n${truncatedOutput}\n\`\`\`\n\n`, done: false };
              }
            } else {
              yield { content: `❌ Error: ${result.error}\n\n`, done: false };
              hasErrors = true;
            }
            
            // Add result to conversation
            currentMessages.push({
              role: 'user',
              content: `${toolCall.name} result: ${result.success ? 'SUCCESS' : 'FAILED'}\n${result.output || result.error || ''}`
            });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            yield { content: `❌ Error: ${errorMsg}\n\n`, done: false };
            currentMessages.push({
              role: 'user',
              content: `${toolCall.name} result: FAILED\n${errorMsg}`
            });
            hasErrors = true;
          }
        }
        
        // If there were errors, add guidance for the LLM
        if (hasErrors) {
          currentMessages.push({
            role: 'user',
            content: 'Some tools failed due to invalid arguments or errors. Review the error messages above and retry with correct parameters. Remember: write_file MUST have both path AND content fields.'
          });
        }
        
        toolExecutions++;
        
        // Add instruction to continue or complete
        currentMessages.push({
          role: 'user',
          content: 'Tools executed. Review the results above. If the task is complete, provide a summary of what was accomplished. If more actions are needed, continue using tools.'
        });
      }
      
      yield { content: '\n✅ **Task Complete!**\n\nExecuted ' + toolExecutions + ' tool operations.', done: true };
    } catch (error) {
      console.error('[llm] Agentic chat error:', error);
      yield { content: '', done: true, error: error instanceof Error ? error.message : 'Unknown streaming error' };
    }
  }

  private async callOpenAIWithTools(messages: LLMMessage[], forceTools: boolean = true, config?: LLMConfig): Promise<{content: string; toolCalls: Array<{name: string; arguments: string; id: string}>}> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const cfg = config || this.config!;
    const tools = toOpenAIFunctions(AVAILABLE_TOOLS);
    
    const response = await this.openaiClient.chat.completions.create({
      model: cfg.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      tools: forceTools ? tools : undefined,
      tool_choice: forceTools ? 'required' : undefined, // Only set tool_choice when tools are provided
      temperature: 0.1, // Lower temperature for more deterministic tool use
      max_tokens: cfg.maxTokens,
    });

    const message = response.choices[0].message;
    const content = message.content || '';
    
    // Debug: Log what OpenAI returned
    console.log('[llm] OpenAI response content:', content.substring(0, 200));
    console.log('[llm] OpenAI tool_calls:', JSON.stringify(message.tool_calls, null, 2));
    
    const toolCalls = (message.tool_calls || []).map(tc => {
      // Handle both function tool calls and other types
      const fn = (tc as { function: { name: string; arguments: string } }).function;
      
      // Debug: Log each tool call
      console.log(`[llm] OpenAI tool call: ${fn.name}`);
      console.log(`[llm] Arguments: ${fn.arguments}`);
      
      // Parse and validate the arguments
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(fn.arguments);
      } catch (e) {
        console.error('[llm] Failed to parse tool arguments:', fn.arguments);
        parsedArgs = {};
      }
      
      // Check for missing required fields
      if (fn.name === 'write_file') {
        if (!parsedArgs.content && parsedArgs.path) {
          console.error(`[llm] write_file missing content for path: ${parsedArgs.path}`);
        }
      }
      
      return {
        name: fn.name,
        arguments: fn.arguments,
        id: tc.id,
      };
    });

    return { content, toolCalls };
  }

  private async callAnthropicWithTools(messages: LLMMessage[], forceTools: boolean = true, config?: LLMConfig): Promise<{content: string; toolCalls: Array<{name: string; arguments: string; id: string}>}> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }

    const cfg = config || this.config!;
    const tools = toAnthropicTools(AVAILABLE_TOOLS);
    
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Use higher max_tokens to ensure content isn't truncated
    const maxTokens = Math.max(cfg.maxTokens || 4096, 16384);
    
    console.log(`[llm] Anthropic API call with max_tokens=${maxTokens}, model=${cfg.model}`);
    
    const response = await this.anthropicClient.messages.create({
      model: cfg.model,
      max_tokens: maxTokens,
      temperature: 0.1, // Low temperature for deterministic tool use
      system: systemMessage?.content,
      messages: chatMessages,
      tools: forceTools ? tools : undefined,
      tool_choice: forceTools ? { type: 'any' } : undefined,
    });
    
    // Log stop reason - important for debugging truncation
    console.log(`[llm] Anthropic response stop_reason: ${response.stop_reason}`);

    let content = '';
    let lastTextBlock = '';
    const toolCalls: Array<{name: string; arguments: string; id: string}> = [];

    // Log full response for debugging
    console.log('[llm] Anthropic full response blocks count:', response.content.length);
    
    for (let i = 0; i < response.content.length; i++) {
      const block = response.content[i];
      console.log(`[llm] Block ${i} type: ${block.type}`);
      
      if (block.type === 'text') {
        const textBlock = block as { text: string };
        const preview = textBlock.text.substring(0, 200);
        console.log(`[llm] Block ${i} text preview: ${preview}${textBlock.text.length > 200 ? '...' : ''}`);
        content += textBlock.text;
        lastTextBlock = textBlock.text;
      } else if (block.type === 'tool_use') {
        const toolBlock = block as { name: string; input: Record<string, unknown>; id: string };
        console.log(`[llm] Block ${i} tool_use: ${toolBlock.name}`);
        console.log(`[llm] Block ${i} input keys:`, Object.keys(toolBlock.input));
        console.log(`[llm] Block ${i} input:`, JSON.stringify(toolBlock.input, null, 2));
        
        // Handle write_file missing content - try to extract from previous text block
        if (toolBlock.name === 'write_file') {
          const hasContent = 'content' in toolBlock.input;
          const contentType = typeof toolBlock.input.content;
          
          if (!hasContent || contentType !== 'string' || (toolBlock.input.content as string).length === 0) {
            console.error(`[llm] CRITICAL: write_file for "${toolBlock.input.path}" missing content`);
            console.log(`[llm] Checking if content is in preceding text block...`);
            
            // Check if the previous text block looks like code content
            if (lastTextBlock && lastTextBlock.length > 100) {
              // Look for code blocks or substantial content
              const hasCodeBlock = lastTextBlock.includes('```');
              const looksLikeCode = /function|class|const|let|var|import|export/.test(lastTextBlock);
              
              if (hasCodeBlock || looksLikeCode) {
                console.log(`[llm] Found potential content in text block (${lastTextBlock.length} chars)`);
                
                // Extract code from markdown code blocks if present
                let extractedContent = lastTextBlock;
                const codeBlockMatch = lastTextBlock.match(/```(?:\w+)?\n?([\s\S]*?)```/);
                if (codeBlockMatch) {
                  extractedContent = codeBlockMatch[1].trim();
                  console.log(`[llm] Extracted ${extractedContent.length} chars from code block`);
                }
                
                // Inject the content into the tool call
                toolBlock.input.content = extractedContent;
                console.log(`[llm] Injected content into write_file for ${toolBlock.input.path}`);
              }
            }
          }
        }
        
        toolCalls.push({
          name: toolBlock.name,
          arguments: JSON.stringify(toolBlock.input),
          id: toolBlock.id,
        });
      }
    }

    return { content, toolCalls };
  }

  private async collectStreamText(messages: LLMMessage[], config?: LLMConfig): Promise<string> {
    let fullText = '';
    const cfg = config || this.config!;
    
    switch (cfg.provider) {
      case 'google':
        for await (const chunk of this.streamGoogle(messages, cfg)) {
          if (chunk.content) {
            fullText += chunk.content;
          }
        }
        break;
      case 'ollama':
        for await (const chunk of this.streamOllama(messages, cfg)) {
          if (chunk.content) {
            fullText += chunk.content;
          }
        }
        break;
    }
    
    return fullText;
  }

  // Legacy streaming methods (used as fallback)
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

  private async *streamGoogle(messages: LLMMessage[], config?: LLMConfig): AsyncGenerator<LLMStreamChunk> {
    if (!this.googleClient) {
      yield { content: '', done: true, error: 'Google client not initialized' };
      return;
    }

    const cfg = config || this.config!;
    const model = this.googleClient.getGenerativeModel({ model: cfg.model });

    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

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
        temperature: cfg.temperature ?? 0.7,
        maxOutputTokens: cfg.maxTokens,
        topP: cfg.topP,
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

  private async *streamOllama(messages: LLMMessage[], config?: LLMConfig): AsyncGenerator<LLMStreamChunk> {
    try {
      const cfg = config || this.config!;
      const response = await ollama.chat({
        model: cfg.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        options: {
          temperature: cfg.temperature ?? 0.7,
          num_predict: cfg.maxTokens,
          top_p: cfg.topP,
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

  /**
   * Legacy streamChat method (maintains backward compatibility)
   * Supports workspace-specific LLM configurations
   */
  async *streamChat(messages: LLMMessage[], workspaceId?: string): AsyncGenerator<LLMStreamChunk> {
    // Use agentic chat by default for better tool execution
    yield* this.agenticChat(messages, workspaceId);
  }

  /**
   * Execute tool calls from content (legacy method)
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

  /**
   * Detect when LLM outputs pseudo-code tool descriptions instead of actual tool calls
   * Examples: 'write_file "test.txt" "content"', 'create_directory "folder"', etc.
   */
  private detectPseudoToolCalls(content: string): Array<{name: string; arguments: string; id?: string}> {
    const toolCalls: Array<{name: string; arguments: string; id?: string}> = [];
    
    // Match patterns like: write_file "path" "content"
    // Or: create_directory "path"
    // Or: execute_command "npm install"
    // Also match natural language patterns like "I'll create a file...", "Let me run..."
    
    const patterns = [
      {
        regex: /write_file\s*\(?\s*["']([^"']+)["']\s*,?\s*["']?([^"']*)["']?\s*\)?/gi,
        tool: 'write_file',
        argMapper: (matches: RegExpExecArray) => ({ 
          path: matches[1], 
          content: matches[2] || '' 
        })
      },
      {
        regex: /(?:create|make)\s+(?:a\s+)?(?:new\s+)?(?:file|write_file)\s+["']?([^"'\n]+)["']?/gi,
        tool: 'write_file',
        argMapper: (matches: RegExpExecArray) => ({ 
          path: matches[1], 
          content: '' // Content would need to be extracted from context
        })
      },
      {
        regex: /create_directory\s*\(?\s*["']([^"']+)["']\s*\)?/gi,
        tool: 'create_directory',
        argMapper: (matches: RegExpExecArray) => ({ path: matches[1] })
      },
      {
        regex: /(?:create|make)\s+(?:a\s+)?(?:new\s+)?(?:folder|directory)\s+["']?([^"'\n]+)["']?/gi,
        tool: 'create_directory',
        argMapper: (matches: RegExpExecArray) => ({ path: matches[1] })
      },
      {
        regex: /read_file\s*\(?\s*["']([^"']+)["']\s*\)?/gi,
        tool: 'read_file',
        argMapper: (matches: RegExpExecArray) => ({ path: matches[1] })
      },
      {
        regex: /execute_command\s*\(?\s*["']([^"']+)["']\s*\)?/gi,
        tool: 'execute_command',
        argMapper: (matches: RegExpExecArray) => ({ command: matches[1] })
      },
      {
        regex: /(?:run|execute)\s+(?:the\s+)?(?:command|cmd)\s*[:\s]*["']?([^"'\n]+)["']?/gi,
        tool: 'execute_command',
        argMapper: (matches: RegExpExecArray) => ({ command: matches[1] })
      },
      {
        regex: /git_add\s*\(?\s*["']([^"']+)["']\s*\)?/gi,
        tool: 'git_add',
        argMapper: (matches: RegExpExecArray) => ({ files: matches[1] })
      },
      {
        regex: /(?:stage|add)\s+(?:files?\s+)?["']?([^"'\n]*)["']?/gi,
        tool: 'git_add',
        argMapper: (matches: RegExpExecArray) => ({ files: matches[1] || '.' })
      },
      {
        regex: /git_commit\s*\(?\s*["']([^"']+)["']\s*\)?/gi,
        tool: 'git_commit',
        argMapper: (matches: RegExpExecArray) => ({ message: matches[1] })
      },
      {
        regex: /(?:commit|make\s+commit)\s+(?:with\s+)?(?:message\s+)?["']([^"']+)["']/gi,
        tool: 'git_commit',
        argMapper: (matches: RegExpExecArray) => ({ message: matches[1] })
      },
      {
        regex: /package_install\s*\(?\s*["']([^"']+)["']\s*\)?/gi,
        tool: 'package_install',
        argMapper: (matches: RegExpExecArray) => ({ packages: matches[1] })
      },
      {
        regex: /(?:install|npm\s+install|yarn\s+add)\s+["']?([^"'\n]+)["']?/gi,
        tool: 'package_install',
        argMapper: (matches: RegExpExecArray) => ({ packages: matches[1] })
      },
      {
        regex: /code_search\s*\(?\s*["']([^"']+)["']\s*\)?/gi,
        tool: 'code_search',
        argMapper: (matches: RegExpExecArray) => ({ pattern: matches[1] })
      },
      {
        regex: /web_search\s*\(?\s*["']([^"']+)["']\s*\)?/gi,
        tool: 'web_search',
        argMapper: (matches: RegExpExecArray) => ({ query: matches[1] })
      },
      {
        regex: /web_fetch\s*\(?\s*["']([^"']+)["']\s*\)?/gi,
        tool: 'web_fetch',
        argMapper: (matches: RegExpExecArray) => ({ url: matches[1] })
      },
      {
        regex: /(?:fetch|get)\s+(?:the\s+)?(?:content\s+from\s+)?(?:url\s+)?["']?([^"'\n]+)["']?/gi,
        tool: 'web_fetch',
        argMapper: (matches: RegExpExecArray) => ({ url: matches[1] })
      },
      {
        regex: /\b(?:run_tests?|test|npm\s+test)\b/gi,
        tool: 'run_tests',
        argMapper: () => ({})
      },
      {
        regex: /\b(?:git_status|check\s+(?:the\s+)?git\s+status)\b/gi,
        tool: 'git_status',
        argMapper: () => ({})
      }
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        try {
          const args = pattern.argMapper(match);
          // Don't add if we already have this exact tool call
          const alreadyExists = toolCalls.some(tc => 
            tc.name === pattern.tool && tc.arguments === JSON.stringify(args)
          );
          if (!alreadyExists) {
            toolCalls.push({
              name: pattern.tool,
              arguments: JSON.stringify(args),
              id: undefined
            });
          }
        } catch (e) {
          console.error('[llm] Failed to parse pseudo tool call:', e);
        }
      }
    }
    
    return toolCalls;
  }

  /**
   * Validate and fix tool arguments to ensure required parameters are present
   * Returns { valid: boolean, args?: Record<string, unknown>, error?: string }
   */
  private validateAndFixToolArgs(toolName: string, args: Record<string, unknown>): { valid: boolean; args?: Record<string, unknown>; error?: string } {
    const fixed = { ...args };
    
    switch (toolName) {
      case 'write_file':
        if (!fixed.path) {
          const error = 'write_file requires a path parameter - specify which file to create';
          console.error('[llm]', error);
          return { valid: false, error };
        }
        if (fixed.content === undefined || fixed.content === null) {
          const error = `write_file for "${fixed.path}" is MISSING the content parameter. You MUST provide the file content.`;
          console.error('[llm]', error);
          return { valid: false, error };
        }
        if (typeof fixed.content !== 'string') {
          const error = `write_file content must be a string, got ${typeof fixed.content}`;
          console.error('[llm]', error);
          return { valid: false, error };
        }
        break;
      
      case 'read_file':
        if (!fixed.path) {
          const error = 'read_file requires a path parameter';
          console.error('[llm]', error);
          return { valid: false, error };
        }
        break;
      
      case 'create_directory':
        if (!fixed.path) {
          const error = 'create_directory requires a path parameter';
          console.error('[llm]', error);
          return { valid: false, error };
        }
        break;
      
      case 'execute_command':
        if (!fixed.command) {
          const error = 'execute_command requires a command parameter';
          console.error('[llm]', error);
          return { valid: false, error };
        }
        break;
      
      case 'git_commit':
        if (!fixed.message) {
          console.log('[llm] git_commit missing message, using default');
          fixed.message = 'Auto-commit';
        }
        break;
      
      case 'package_install':
        if (!fixed.packages) {
          const error = 'package_install requires a packages parameter';
          console.error('[llm]', error);
          return { valid: false, error };
        }
        break;
    }
    
    return { valid: true, args: fixed };
  }

  /**
   * Fetch file content separately when write_file is called without content
   * Makes a dedicated API call to get just the file content
   */
  private async fetchFileContent(currentMessages: LLMMessage[], filePath: string): Promise<string | null> {
    console.log(`[llm] Fetching content for file: ${filePath}`);
    
    // Build a focused request to get the content
    const contentRequest: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a code generator. Output ONLY the raw file content, nothing else. No markdown, no explanations, no code blocks - just the actual content that should go in the file.`
      },
      {
        role: 'user', 
        content: `Based on the conversation context, generate the complete content for the file: ${filePath}

The file should be part of a bacteria colony evolution simulation with:
- Interactive canvas visualization
- Bacteria with genetic traits (speed, size, resistance)
- Environmental controls (temperature, nutrients, toxins, UV, pH)
- Evolution/mutation mechanics
- Statistics tracking

Output ONLY the file content, nothing else.`
      }
    ];

    try {
      let content = '';
      
      switch (this.config?.provider) {
        case 'anthropic':
          if (!this.anthropicClient) return null;
          
          const response = await this.anthropicClient.messages.create({
            model: this.config!.model,
            max_tokens: 16384,
            temperature: 0.2,
            messages: contentRequest.filter(m => m.role !== 'system').map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
            system: contentRequest.find(m => m.role === 'system')?.content,
          });
          
          for (const block of response.content) {
            if (block.type === 'text') {
              content += (block as { text: string }).text;
            }
          }
          break;
          
        case 'openai':
          if (!this.openaiClient) return null;
          
          const openaiResponse = await this.openaiClient.chat.completions.create({
            model: this.config!.model,
            messages: contentRequest.map(m => ({ role: m.role, content: m.content })),
            max_tokens: 16384,
            temperature: 0.2,
          });
          
          content = openaiResponse.choices[0].message.content || '';
          break;
          
        default:
          return null;
      }
      
      // Clean up the content - remove markdown code blocks if present
      content = content.trim();
      
      // Remove ```javascript or similar wrappers
      const codeBlockMatch = content.match(/^```(?:\w+)?\n?([\s\S]*?)\n?```$/);
      if (codeBlockMatch) {
        content = codeBlockMatch[1];
      }
      
      // Also try to match just opening code block
      if (content.startsWith('```')) {
        const lines = content.split('\n');
        lines.shift(); // Remove first line with ```
        if (lines[lines.length - 1] === '```') {
          lines.pop(); // Remove last line with ```
        }
        content = lines.join('\n');
      }
      
      console.log(`[llm] Fetched content length: ${content.length}`);
      
      if (content.length > 100) {
        return content;
      }
      
      return null;
    } catch (error) {
      console.error('[llm] Failed to fetch file content:', error);
      return null;
    }
  }
}
