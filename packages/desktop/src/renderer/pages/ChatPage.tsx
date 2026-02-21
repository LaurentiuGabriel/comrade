/**
 * Chat Page component
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, StopCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppDispatch, useAppSelector } from '../hooks.js';
import { 
  fetchSessions, 
  createSession, 
  sendMessage, 
  streamAssistantResponse,
  setCurrentSession,
  addMessageToCurrentSession,
  stopStreaming,
  StreamToolApproval,
} from '../slices/sessionSlice.js';
import { formatTimestamp } from '@comrade/core';
import { ToolApprovalDialog, ToolApprovalRequest, ToolApprovalResponse } from '../components/ToolApprovalDialog.js';

export function ChatPage() {
  const dispatch = useAppDispatch();
  const { activeWorkspaceId } = useAppSelector((state) => state.workspace);
  const { sessions, currentSession, loading, streaming } = useAppSelector((state) => state.session);
  const [input, setInput] = useState('');
  const [approvalRequest, setApprovalRequest] = useState<ToolApprovalRequest | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeWorkspaceId) {
      dispatch(fetchSessions(activeWorkspaceId));
    }
  }, [activeWorkspaceId, dispatch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  // Called when server sends a toolApproval SSE event during streaming
  const handleToolApprovalFromStream = useCallback((approval: StreamToolApproval) => {
    setApprovalRequest({
      tool: approval.tool,
      arguments: approval.arguments,
      timestamp: approval.timestamp,
    });
  }, []);

  // Handle approval response from dialog - POST to server to unblock the stream
  const handleApprovalResponse = useCallback(async (response: ToolApprovalResponse) => {
    setApprovalRequest(null);
    
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const token = await window.electronAPI.getHostToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['X-Comrade-Host-Token'] = token;
      
      await fetch(`${serverUrl}/tools/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          allowed: response.allowed, 
          allowAll: response.allowAll,
          workspaceId: activeWorkspaceId,
        }),
      });
    } catch (error) {
      console.error('Failed to send tool approval response:', error);
    }
  }, [activeWorkspaceId]);

  const handleSend = async () => {
    if (streaming) {
      // Stop the current streaming
      stopStreaming();
      return;
    }

    if (!input.trim() || !activeWorkspaceId) return;

    let sessionId = currentSession?.id;
    
    if (!sessionId) {
      const result = await dispatch(createSession({ 
        workspaceId: activeWorkspaceId, 
        title: input.slice(0, 50) 
      }));
      sessionId = (result.payload as any).id;
    }

    // Get current messages from session
    const currentMessages = currentSession?.messages || [];
    const messages = [...currentMessages, { role: 'user', content: input }];

    await dispatch(sendMessage({ sessionId: sessionId!, content: input }));
    setInput('');

    // Stream assistant response from LLM
    const result = await dispatch(streamAssistantResponse({ 
      sessionId: sessionId!, 
      workspaceId: activeWorkspaceId,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      onToolApproval: handleToolApprovalFromStream,
    }));

    // If streaming failed (e.g., LLM not configured), show error message
    if (streamAssistantResponse.rejected.match(result)) {
      const errorMessage = result.payload as string;
      dispatch(addMessageToCurrentSession({
        id: Date.now().toString(),
        sessionId: sessionId!,
        role: 'assistant',
        content: `⚠️ **LLM Error**: ${errorMessage}\n\nPlease configure an LLM provider in Settings to start using AI features.`,
        timestamp: Date.now(),
      }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!currentSession) {
    return (
      <div className="chat-page empty">
        <div className="empty-state">
          <h3>Start a new conversation</h3>
          <p>Type a message below to begin working with Comrade</p>
        </div>
        <ChatInput 
          input={input} 
          setInput={setInput} 
          onSend={handleSend} 
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
      </div>
    );
  }

  // Get the first user message index to highlight it
  const firstUserMessageIndex = currentSession.messages.findIndex(m => m.role === 'user');

  return (
    <div className="chat-page">
      <div className="messages-container">
        {currentSession.messages.map((message, index) => (
          <div key={message.id} className={`message message-${message.role} ${index === firstUserMessageIndex ? 'first-user-message' : ''}`}>
            <div className="message-header">
              <span className="message-author">
                {message.role === 'user' ? 'You' : 'Comrade'}
                {index === firstUserMessageIndex && message.role === 'user' && (
                  <span className="initial-prompt-badge">Initial Request</span>
                )}
              </span>
              <span className="message-time">
                {formatTimestamp(message.timestamp)}
              </span>
            </div>
            <div className="message-content">
              {message.role === 'assistant' ? (
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code: ({node, inline, className, children, ...props}: any) => {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <div className="code-block">
                          <div className="code-header">{match[1]}</div>
                          <pre className={className} {...props}>
                            <code>{children}</code>
                          </pre>
                        </div>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              ) : (
                message.content
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput 
        input={input} 
        setInput={setInput} 
        onSend={handleSend} 
        onKeyDown={handleKeyDown}
        disabled={loading || !!approvalRequest}
        streaming={streaming}
      />

      <ToolApprovalDialog 
        request={approvalRequest}
        onResponse={handleApprovalResponse}
      />
    </div>
  );
}

function ChatInput({ 
  input, 
  setInput, 
  onSend, 
  onKeyDown, 
  disabled,
  streaming 
}: { 
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  disabled?: boolean;
  streaming?: boolean;
}) {
  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type your message..."
          rows={1}
          disabled={disabled}
        />
        <button
          className={`btn btn-primary send-btn ${streaming ? 'stop-btn' : ''}`}
          onClick={onSend}
          disabled={disabled || (!streaming && !input.trim())}
          title={streaming ? 'Stop generating' : 'Send message'}
        >
          {streaming ? <StopCircle size={20} /> : <Send size={20} />}
        </button>
      </div>
    </div>
  );
}
