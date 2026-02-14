/**
 * Workspace state slice
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Workspace } from '@comrade/core';

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: WorkspaceState = {
  workspaces: [],
  activeWorkspaceId: null,
  loading: false,
  error: null,
};

// Helper function to get auth headers
async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await window.electronAPI.getHostToken();
  console.log('[workspaceSlice] Got host token:', token ? token.slice(0, 8) + '...' : 'null');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    // Server expects host token in X-Comrade-Host-Token header
    headers['X-Comrade-Host-Token'] = token;
    console.log('[workspaceSlice] Adding X-Comrade-Host-Token header');
  } else {
    console.error('[workspaceSlice] No host token available!');
  }
  return headers;
}

// Async thunks
export const fetchWorkspaces = createAsyncThunk(
  'workspace/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/workspaces`, { headers });
      
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

export const createWorkspace = createAsyncThunk(
  'workspace/create',
  async ({ name, path }: { name: string; path: string }, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/workspaces`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, path }),
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

export const activateWorkspace = createAsyncThunk(
  'workspace/activate',
  async (workspaceId: string, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/workspaces/${workspaceId}/activate`, {
        method: 'POST',
        headers,
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }
      
      return workspaceId;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    setActiveWorkspace: (state, action: PayloadAction<string>) => {
      state.activeWorkspaceId = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkspaces.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWorkspaces.fulfilled, (state, action) => {
        state.loading = false;
        state.workspaces = action.payload.items;
        state.activeWorkspaceId = action.payload.activeId;
      })
      .addCase(fetchWorkspaces.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createWorkspace.fulfilled, (state, action) => {
        state.workspaces.push(action.payload);
        state.activeWorkspaceId = action.payload.id;
      })
      .addCase(activateWorkspace.fulfilled, (state, action) => {
        state.activeWorkspaceId = action.payload;
      });
  },
});

export const { setActiveWorkspace, clearError } = workspaceSlice.actions;
export default workspaceSlice.reducer;
