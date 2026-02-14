/**
 * Telegram Bot Configuration state slice
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { TelegramConfig } from '@comrade/core';

interface TelegramState {
  config: TelegramConfig | null;
  status: {
    isRunning: boolean;
    isConfigured: boolean;
    botInfo?: { username: string; id: number };
    activeChats: number;
  };
  loading: boolean;
  error: string | null;
}

const initialState: TelegramState = {
  config: null,
  status: {
    isRunning: false,
    isConfigured: false,
    activeChats: 0,
  },
  loading: false,
  error: null,
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
export const fetchTelegramConfig = createAsyncThunk(
  'telegram/fetchConfig',
  async (_, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/telegram/config`, { headers });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data.config;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const fetchTelegramStatus = createAsyncThunk(
  'telegram/fetchStatus',
  async (_, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/telegram/status`, { headers });
      
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

export const saveTelegramConfig = createAsyncThunk(
  'telegram/saveConfig',
  async (config: TelegramConfig, { rejectWithValue, dispatch }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/telegram/config`, {
        method: 'POST',
        headers,
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save config');
      }

      // Refresh status after saving
      dispatch(fetchTelegramStatus());
      
      return config;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const startTelegramBot = createAsyncThunk(
  'telegram/startBot',
  async (_, { rejectWithValue, dispatch }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/telegram/start`, {
        method: 'POST',
        headers,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start bot');
      }

      const data = await response.json();
      
      // Refresh status after starting
      dispatch(fetchTelegramStatus());
      
      return data;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const stopTelegramBot = createAsyncThunk(
  'telegram/stopBot',
  async (_, { rejectWithValue, dispatch }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/telegram/stop`, {
        method: 'POST',
        headers,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to stop bot');
      }

      // Refresh status after stopping
      dispatch(fetchTelegramStatus());
      
      return true;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

const telegramSlice = createSlice({
  name: 'telegram',
  initialState,
  reducers: {
    setTelegramConfig: (state, action: PayloadAction<TelegramConfig>) => {
      state.config = action.payload;
    },
    clearTelegramError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch config
      .addCase(fetchTelegramConfig.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTelegramConfig.fulfilled, (state, action) => {
        state.loading = false;
        state.config = action.payload;
      })
      .addCase(fetchTelegramConfig.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Fetch status
      .addCase(fetchTelegramStatus.fulfilled, (state, action) => {
        state.status = action.payload;
      })
      // Save config
      .addCase(saveTelegramConfig.pending, (state) => {
        state.loading = true;
      })
      .addCase(saveTelegramConfig.fulfilled, (state, action) => {
        state.loading = false;
        state.config = action.payload;
      })
      .addCase(saveTelegramConfig.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Start bot
      .addCase(startTelegramBot.pending, (state) => {
        state.loading = true;
      })
      .addCase(startTelegramBot.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.botInfo) {
          state.status.botInfo = action.payload.botInfo;
        }
      })
      .addCase(startTelegramBot.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Stop bot
      .addCase(stopTelegramBot.pending, (state) => {
        state.loading = true;
      })
      .addCase(stopTelegramBot.fulfilled, (state) => {
        state.loading = false;
        state.status.isRunning = false;
      })
      .addCase(stopTelegramBot.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { setTelegramConfig, clearTelegramError } = telegramSlice.actions;
export default telegramSlice.reducer;
