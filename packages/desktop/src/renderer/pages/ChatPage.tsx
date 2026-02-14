/**
 * Chat Page component
 */

import React, { useState, useEffect, useRef } from 'react';
import { Send, StopCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../hooks.js';
import { 
  fetchSessions, 
  createSession, 
  sendMessage, 
  streamAssistantResponse,
  setCurrentSession,
  addMessageToCurrentSession 
} from '../slices/sessionSlice.js';
import { formatTimestamp } from '@comrade/core';

export function ChatPage() {
  const dispatch = useAppDispatch();
  const { activeWorkspaceId } = useAppSelector((state) => state.workspace);
  const { sessions, currentSession, loading, streaming } = useAppSelector((state) => state.session);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeWorkspaceId) {
      dispatch(fetchSessions(activeWorkspaceId));
    }
  }, [activeWorkspaceId, dispatch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  const handleSend = async () => {
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
      messages: messages.map(m => ({ role: m.role, content: m.content }))
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

  return (
    <div className="chat-page">
      <div className="messages-container">
        {currentSession.messages.map((message) => (
          <div key={message.id} className={`message message-${message.role}`}>
            <div className="message-header">
              <span className="message-author">
                {message.role === 'user' ? 'You' : 'Comrade'}
              </span>
              <span className="message-time">
                {formatTimestamp(message.timestamp)}
              </span>
            </div>
            <div className="message-content">
              {message.content}
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
        disabled={loading || streaming}
        streaming={streaming}
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
          className="btn btn-primary send-btn"
          onClick={onSend}
          disabled={disabled || !input.trim()}
        >
          {streaming ? <StopCircle size={20} /> : <Send size={20} />}
        </button>
      </div>
    </div>
  );
}
