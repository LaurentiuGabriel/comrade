/**
 * Session state slice
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Session, Message } from '@comrade/core';

interface SessionState {
  sessions: Session[];
  currentSession: Session | null;
  loading: boolean;
  error: string | null;
  streaming: boolean;
}

const initialState: SessionState = {
  sessions: [],
  currentSession: null,
  loading: false,
  error: null,
  streaming: false,
};

// Helper function to get auth headers
async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await window.electronAPI.getHostToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['X-Comrade-Host-Token'] = token;
  }
  return headers;
}

// Async thunks
export const fetchSessions = createAsyncThunk(
  'session/fetchAll',
  async (workspaceId: string, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/workspaces/${workspaceId}/sessions`, { headers });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data.items;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const createSession = createAsyncThunk(
  'session/create',
  async ({ workspaceId, title }: { workspaceId: string; title: string }, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/workspaces/${workspaceId}/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title }),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const sendMessage = createAsyncThunk(
  'session/sendMessage',
  async ({ sessionId, content }: { sessionId: string; content: string }, { rejectWithValue, dispatch }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      
      // Add message locally first for immediate UI feedback
      const messageId = Date.now().toString();
      dispatch(addMessageToCurrentSession({
        id: messageId,
        sessionId,
        role: 'user',
        content,
        timestamp: Date.now(),
      }));
      
      // Send user message to server
      await fetch(`${serverUrl}/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: 'user', content }),
      });

      return { sessionId, content, messageId };
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const streamAssistantResponse = createAsyncThunk(
  'session/streamAssistantResponse',
  async ({ sessionId, workspaceId, messages }: { sessionId: string; workspaceId: string; messages: Array<{ role: string; content: string }> }, { dispatch, rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      
      // First check LLM status
      const statusResponse = await fetch(`${serverUrl}/llm/status`, { headers });
      const status = await statusResponse.json();
      
      if (!status.enabled || !status.valid) {
        throw new Error(status.error || 'LLM is not configured. Please configure an LLM provider in Settings.');
      }
      
      // Start streaming
      dispatch(setStreaming(true));
      
      // Create initial assistant message
      const assistantMessageId = Date.now().toString();
      dispatch(addMessageToCurrentSession({
        id: assistantMessageId,
        sessionId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }));
      
      const response = await fetch(`${serverUrl}/llm/chat`, {
        method: 'POST',
        headers: {
          ...headers,
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({ messages, workspaceId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start chat stream');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.error) {
                dispatch(updateAssistantMessage({
                  id: assistantMessageId,
                  content: `⚠️ Error: ${data.error}`,
                }));
                dispatch(setStreaming(false));
                return;
              }

              if (data.content) {
                fullContent += data.content;
                dispatch(updateAssistantMessage({
                  id: assistantMessageId,
                  content: fullContent,
                }));
              }

              // Handle tool execution results
              if (data.toolResults && data.updatedContent) {
                fullContent = data.updatedContent;
                dispatch(updateAssistantMessage({
                  id: assistantMessageId,
                  content: fullContent,
                }));
              }

              if (data.done) {
                dispatch(setStreaming(false));
                return;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      dispatch(setStreaming(false));
    } catch (error) {
      dispatch(setStreaming(false));
      return rejectWithValue((error as Error).message);
    }
  }
);

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setCurrentSession: (state, action: PayloadAction<Session | null>) => {
      state.currentSession = action.payload;
    },
    addMessageToCurrentSession: (state, action: PayloadAction<Message>) => {
      if (state.currentSession) {
        state.currentSession.messages.push(action.payload);
      }
    },
    updateAssistantMessage: (state, action: PayloadAction<{ id: string; content: string }>) => {
      if (state.currentSession) {
        const message = state.currentSession.messages.find(m => m.id === action.payload.id);
        if (message) {
          message.content = action.payload.content;
        }
      }
    },
    setStreaming: (state, action: PayloadAction<boolean>) => {
      state.streaming = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSessions.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchSessions.fulfilled, (state, action) => {
        state.loading = false;
        state.sessions = action.payload;
      })
      .addCase(fetchSessions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createSession.fulfilled, (state, action) => {
        state.sessions.unshift(action.payload);
        state.currentSession = action.payload;
      });
  },
});

export const { setCurrentSession, addMessageToCurrentSession, updateAssistantMessage, setStreaming, clearError } = sessionSlice.actions;
export default sessionSlice.reducer;
