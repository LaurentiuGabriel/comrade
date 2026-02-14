/**
 * LLM Configuration state slice
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { LLMConfig, LLMProviderInfo } from '@comrade/core';

interface LLMState {
  config: LLMConfig | null;
  providers: LLMProviderInfo[];
  status: {
    enabled: boolean;
    valid: boolean;
    error?: string;
  };
  loading: boolean;
  error: string | null;
}

const initialState: LLMState = {
  config: null,
  providers: [],
  status: {
    enabled: false,
    valid: false,
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
export const fetchLLMProviders = createAsyncThunk(
  'llm/fetchProviders',
  async (_, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/llm/providers`, { headers });
      
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

export const fetchLLMConfig = createAsyncThunk(
  'llm/fetchConfig',
  async (_, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/llm/config`, { headers });
      
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

export const fetchLLMStatus = createAsyncThunk(
  'llm/fetchStatus',
  async (_, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/llm/status`, { headers });
      
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

export const saveLLMConfig = createAsyncThunk(
  'llm/saveConfig',
  async (config: LLMConfig, { rejectWithValue, dispatch }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/llm/config`, {
        method: 'POST',
        headers,
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save config');
      }

      // Refresh status after saving
      dispatch(fetchLLMStatus());
      
      return config;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

const llmSlice = createSlice({
  name: 'llm',
  initialState,
  reducers: {
    setLLMConfig: (state, action: PayloadAction<LLMConfig>) => {
      state.config = action.payload;
    },
    clearLLMError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch providers
      .addCase(fetchLLMProviders.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchLLMProviders.fulfilled, (state, action) => {
        state.loading = false;
        state.providers = action.payload;
      })
      .addCase(fetchLLMProviders.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Fetch config
      .addCase(fetchLLMConfig.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchLLMConfig.fulfilled, (state, action) => {
        state.loading = false;
        state.config = action.payload;
      })
      .addCase(fetchLLMConfig.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Fetch status
      .addCase(fetchLLMStatus.fulfilled, (state, action) => {
        state.status = action.payload;
      })
      // Save config
      .addCase(saveLLMConfig.pending, (state) => {
        state.loading = true;
      })
      .addCase(saveLLMConfig.fulfilled, (state, action) => {
        state.loading = false;
        state.config = action.payload;
      })
      .addCase(saveLLMConfig.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { setLLMConfig, clearLLMError } = llmSlice.actions;
export default llmSlice.reducer;
