/**
 * Settings Page component with LLM and Telegram Configuration
 */

import React, { useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../hooks.js';
import { fetchLLMProviders, fetchLLMConfig, fetchLLMStatus, saveLLMConfig, clearLLMError } from '../slices/llmSlice.js';
import { fetchTelegramConfig, fetchTelegramStatus, saveTelegramConfig, startTelegramBot, stopTelegramBot, clearTelegramError } from '../slices/telegramSlice.js';
import { LLMConfig, LLMProvider, TelegramConfig } from '@comrade/core';
import { Loader2, Check, AlertCircle, Send, RefreshCw } from 'lucide-react';

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const { activeWorkspaceId, workspaces } = useAppSelector((state) => state.workspace);
  const { providers, config, status, loading, error } = useAppSelector((state) => state.llm);
  const { config: telegramConfig, status: telegramStatus, loading: telegramLoading, error: telegramError } = useAppSelector((state) => state.telegram);
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  const [formConfig, setFormConfig] = useState<LLMConfig>({
    provider: 'openai',
    model: '',
    apiKey: '',
    baseUrl: '',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1.0,
    enabled: false,
  });

  const [telegramFormConfig, setTelegramFormConfig] = useState<TelegramConfig>({
    botToken: '',
    enabled: false,
    authorizedUsers: [],
    defaultWorkspaceId: '',
    showTypingIndicator: true,
    parseMode: 'Markdown',
  });

  const [authorizedUsersInput, setAuthorizedUsersInput] = useState('');
  
  // Ollama-specific state
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchLLMProviders());
    dispatch(fetchLLMConfig(activeWorkspaceId));
    dispatch(fetchLLMStatus(activeWorkspaceId));
    dispatch(fetchTelegramConfig());
    dispatch(fetchTelegramStatus());
  }, [dispatch, activeWorkspaceId]);

  useEffect(() => {
    if (config) {
      setFormConfig(config);
    }
  }, [config]);

  useEffect(() => {
    if (telegramConfig) {
      setTelegramFormConfig(telegramConfig);
      setAuthorizedUsersInput(telegramConfig.authorizedUsers?.join(', ') || '');
    }
  }, [telegramConfig]);

  // Fetch Ollama models when Ollama is selected
  useEffect(() => {
    if (formConfig.provider === 'ollama' && formConfig.enabled) {
      fetchOllamaModels();
    }
  }, [formConfig.provider, formConfig.enabled, formConfig.baseUrl]);

  const fetchOllamaModels = async () => {
    setOllamaLoading(true);
    setOllamaError(null);
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const token = await window.electronAPI.getHostToken();
      const baseUrl = formConfig.baseUrl || undefined;
      const queryParams = baseUrl ? `?baseUrl=${encodeURIComponent(baseUrl)}` : '';
      
      const headers: Record<string, string> = {};
      if (token) {
        headers['X-Comrade-Host-Token'] = token;
      }
      
      const response = await fetch(`${serverUrl}/llm/ollama/models${queryParams}`, { headers });
      
      if (!response.ok) {
        throw new Error('Failed to fetch Ollama models');
      }
      
      const data = await response.json();
      setOllamaModels(data.items);
      
      // Auto-select first model if none selected
      if (data.items.length > 0 && !formConfig.model) {
        setFormConfig(prev => ({ ...prev, model: data.items[0] }));
      }
    } catch (err) {
      setOllamaError(err instanceof Error ? err.message : 'Failed to connect to Ollama');
      setOllamaModels([]);
    } finally {
      setOllamaLoading(false);
    }
  };

  const handleTelegramSave = async () => {
    await dispatch(saveTelegramConfig(telegramFormConfig));
    setTimeout(() => dispatch(clearTelegramError()), 3000);
  };

  const handleStartBot = async () => {
    await dispatch(startTelegramBot());
  };

  const handleStopBot = async () => {
    await dispatch(stopTelegramBot());
  };

  const updateAuthorizedUsers = (value: string) => {
    setAuthorizedUsersInput(value);
    const userIds = value
      .split(/[,\s]+/)
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id));
    setTelegramFormConfig(prev => ({ ...prev, authorizedUsers: userIds }));
  };

  const handleProviderChange = (provider: LLMProvider) => {
    const providerInfo = providers.find(p => p.id === provider);
    
    // For Ollama, don't set a default model - it will be fetched
    const isOllama = provider === 'ollama';
    
    setFormConfig(prev => ({
      ...prev,
      provider,
      model: isOllama ? '' : (providerInfo?.defaultModels[0] || ''),
      apiKey: '', // Clear API key when switching providers
    }));
    
    // Clear Ollama state when switching away from Ollama
    if (!isOllama) {
      setOllamaModels([]);
      setOllamaError(null);
    }
  };

  const handleSave = async () => {
    await dispatch(saveLLMConfig({ config: formConfig, workspaceId: activeWorkspaceId }));
    setTimeout(() => dispatch(clearLLMError()), 3000);
  };

  const selectedProvider = providers.find(p => p.id === formConfig.provider);
  const isOllama = formConfig.provider === 'ollama';

  return (
    <div className="settings-page">
      <div className="settings-section">
        <h3>LLM Configuration</h3>
        
        {status.enabled && status.valid && (
          <div className="llm-status success">
            <Check size={16} />
            <span>LLM is configured and ready</span>
          </div>
        )}
        
        {status.enabled && !status.valid && (
          <div className="llm-status error">
            <AlertCircle size={16} />
            <span>{status.error || 'Configuration error'}</span>
          </div>
        )}

        {!status.enabled && (
          <div className="llm-status info">
            <AlertCircle size={16} />
            <span>LLM is not enabled. Configure below to start using AI features.</span>
          </div>
        )}

        <div className="setting-item">
          <label>Enable LLM</label>
          <input
            type="checkbox"
            checked={formConfig.enabled}
            onChange={(e) => setFormConfig(prev => ({ ...prev, enabled: e.target.checked }))}
          />
        </div>

        <div className="setting-item">
          <label>Provider</label>
          <select
            className="input"
            value={formConfig.provider}
            onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
            disabled={!formConfig.enabled}
          >
            {providers.map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.name} - {provider.description}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-item">
          <label>Model</label>
          {isOllama ? (
            // Ollama model selector with fetch capability
            <div className="ollama-model-selector">
              {ollamaLoading ? (
                <div className="loading-indicator">
                  <Loader2 size={16} className="spinner" />
                  <span>Fetching models from Ollama...</span>
                </div>
              ) : ollamaError ? (
                <div className="error-with-retry">
                  <span className="error-text">{ollamaError}</span>
                  <button 
                    className="btn btn-small btn-secondary"
                    onClick={fetchOllamaModels}
                    disabled={!formConfig.enabled}
                  >
                    <RefreshCw size={14} />
                    Retry
                  </button>
                </div>
              ) : ollamaModels.length === 0 ? (
                <div className="no-models">
                  <span>No models found</span>
                  <button 
                    className="btn btn-small btn-secondary"
                    onClick={fetchOllamaModels}
                    disabled={!formConfig.enabled}
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>
              ) : (
                <select
                  className="input"
                  value={formConfig.model}
                  onChange={(e) => setFormConfig(prev => ({ ...prev, model: e.target.value }))}
                  disabled={!formConfig.enabled}
                >
                  <option value="">Select a model...</option>
                  {ollamaModels.map(model => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            // Standard dropdown for other providers
            <select
              className="input"
              value={formConfig.model}
              onChange={(e) => setFormConfig(prev => ({ ...prev, model: e.target.value }))}
              disabled={!formConfig.enabled}
            >
              <option value="">Select a model...</option>
              {selectedProvider?.defaultModels.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedProvider?.requiresApiKey && (
          <div className="setting-item">
            <label>API Key</label>
            <input
              type="password"
              className="input"
              value={formConfig.apiKey}
              onChange={(e) => setFormConfig(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder={`Enter your ${selectedProvider.name} API key`}
              disabled={!formConfig.enabled}
            />
          </div>
        )}

        {selectedProvider?.supportsBaseUrl && (
          <div className="setting-item">
            <label>Base URL (optional)</label>
            <input
              type="text"
              className="input"
              value={formConfig.baseUrl || ''}
              onChange={(e) => setFormConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="http://localhost:11434"
              disabled={!formConfig.enabled}
            />
            <small className="help-text">
              {isOllama && 'Ollama typically runs on http://localhost:11434'}
            </small>
          </div>
        )}

        <div className="setting-item">
          <label>Temperature ({formConfig.temperature})</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={formConfig.temperature}
            onChange={(e) => setFormConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
            disabled={!formConfig.enabled}
          />
        </div>

        <div className="setting-item">
          <label>Max Tokens</label>
          <input
            type="number"
            className="input"
            value={formConfig.maxTokens}
            onChange={(e) => setFormConfig(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 4096 }))}
            min="1"
            max="32000"
            disabled={!formConfig.enabled}
          />
        </div>

        <div className="setting-item">
          <label>Top P ({formConfig.topP})</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={formConfig.topP}
            onChange={(e) => setFormConfig(prev => ({ ...prev, topP: parseFloat(e.target.value) }))}
            disabled={!formConfig.enabled}
          />
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={loading || !formConfig.enabled}
        >
          {loading ? (
            <>
              <Loader2 size={16} className="spinner" />
              Saving...
            </>
          ) : (
            'Save Configuration'
          )}
        </button>
      </div>

      <div className="settings-section">
        <h3>Telegram Bot Configuration</h3>

        {telegramStatus.isRunning && (
          <div className="llm-status success">
            <Check size={16} />
            <span>Bot is running {telegramStatus.botInfo?.username && `(@${telegramStatus.botInfo.username})`}</span>
          </div>
        )}

        {!telegramStatus.isRunning && telegramStatus.isConfigured && (
          <div className="llm-status info">
            <AlertCircle size={16} />
            <span>Bot is configured but not running. Start it below.</span>
          </div>
        )}

        {!telegramStatus.isConfigured && (
          <div className="llm-status info">
            <AlertCircle size={16} />
            <span>Telegram bot is not configured. Set up below to enable Telegram integration.</span>
          </div>
        )}

        <div className="setting-item">
          <label>Enable Telegram Bot</label>
          <input
            type="checkbox"
            checked={telegramFormConfig.enabled}
            onChange={(e) => setTelegramFormConfig(prev => ({ ...prev, enabled: e.target.checked }))}
          />
        </div>

        <div className="setting-item">
          <label>Bot Token</label>
          <input
            type="password"
            className="input"
            value={telegramFormConfig.botToken}
            onChange={(e) => setTelegramFormConfig(prev => ({ ...prev, botToken: e.target.value }))}
            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
            disabled={!telegramFormConfig.enabled}
          />
          <small className="help-text">
            Get your bot token from @BotFather on Telegram
          </small>
        </div>

        <div className="setting-item">
          <label>Default Workspace</label>
          <select
            className="input"
            value={telegramFormConfig.defaultWorkspaceId}
            onChange={(e) => setTelegramFormConfig(prev => ({ ...prev, defaultWorkspaceId: e.target.value }))}
            disabled={!telegramFormConfig.enabled}
          >
            <option value="">Select a workspace...</option>
            {workspaces.map(workspace => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-item">
          <label>Authorized Users (optional)</label>
          <input
            type="text"
            className="input"
            value={authorizedUsersInput}
            onChange={(e) => updateAuthorizedUsers(e.target.value)}
            placeholder="123456789, 987654321"
            disabled={!telegramFormConfig.enabled}
          />
          <small className="help-text">
            Comma-separated list of Telegram user IDs. Leave empty to allow all users.
          </small>
        </div>

        <div className="setting-item">
          <label>Parse Mode</label>
          <select
            className="input"
            value={telegramFormConfig.parseMode}
            onChange={(e) => setTelegramFormConfig(prev => ({ ...prev, parseMode: e.target.value as 'Markdown' | 'HTML' | 'None' }))}
            disabled={!telegramFormConfig.enabled}
          >
            <option value="Markdown">Markdown</option>
            <option value="HTML">HTML</option>
            <option value="None">None (Plain Text)</option>
          </select>
        </div>

        <div className="setting-item">
          <label>Show Typing Indicator</label>
          <input
            type="checkbox"
            checked={telegramFormConfig.showTypingIndicator}
            onChange={(e) => setTelegramFormConfig(prev => ({ ...prev, showTypingIndicator: e.target.checked }))}
            disabled={!telegramFormConfig.enabled}
          />
        </div>

        {telegramError && (
          <div className="error-message">
            {telegramError}
          </div>
        )}

        <div className="telegram-actions">
          <button
            className="btn btn-primary"
            onClick={handleTelegramSave}
            disabled={telegramLoading || !telegramFormConfig.enabled}
          >
            {telegramLoading ? (
              <>
                <Loader2 size={16} className="spinner" />
                Saving...
              </>
            ) : (
              'Save Configuration'
            )}
          </button>

          {telegramStatus.isConfigured && (
            <>
              {!telegramStatus.isRunning ? (
                <button
                  className="btn btn-success"
                  onClick={handleStartBot}
                  disabled={telegramLoading}
                >
                  <Send size={16} />
                  Start Bot
                </button>
              ) : (
                <button
                  className="btn btn-danger"
                  onClick={handleStopBot}
                  disabled={telegramLoading}
                >
                  Stop Bot
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="settings-section">
        <h3>Workspace Settings</h3>
        <div className="setting-item">
          <label>Workspace Name</label>
          <input 
            className="input" 
            value={activeWorkspace?.name || ''} 
            readOnly 
          />
        </div>
        <div className="setting-item">
          <label>Workspace Path</label>
          <input 
            className="input" 
            value={activeWorkspace?.path || ''} 
            readOnly 
          />
        </div>
      </div>

      <div className="settings-section">
        <h3>Application</h3>
        <div className="setting-item">
          <label>Version</label>
          <span className="setting-value">0.1.0</span>
        </div>
      </div>

      <div className="settings-section">
        <h3>About</h3>
        <p className="about-text">
          Comrade is an open-source AI workspace for teams. It provides a premium interface
          for AI-powered workflows, built with transparency, extensibility, and local-first principles.
        </p>
      </div>
    </div>
  );
}
