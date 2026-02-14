/**
 * Skill state slice
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Skill } from '@comrade/core';

interface SkillState {
  skills: Skill[];
  selectedSkill: Skill | null;
  loading: boolean;
  error: string | null;
}

const initialState: SkillState = {
  skills: [],
  selectedSkill: null,
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
export const fetchSkills = createAsyncThunk(
  'skill/fetchAll',
  async (workspaceId: string, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/workspaces/${workspaceId}/skills`, { headers });
      
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

export const createSkill = createAsyncThunk(
  'skill/create',
  async ({ workspaceId, name, content }: { workspaceId: string; name: string; content: string }, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/workspaces/${workspaceId}/skills`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, content }),
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

export const deleteSkill = createAsyncThunk(
  'skill/delete',
  async ({ workspaceId, name }: { workspaceId: string; name: string }, { rejectWithValue }) => {
    try {
      const serverUrl = await window.electronAPI.getServerUrl();
      const headers = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/workspaces/${workspaceId}/skills/${name}`, {
        method: 'DELETE',
        headers,
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }
      
      return name;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

const skillSlice = createSlice({
  name: 'skill',
  initialState,
  reducers: {
    selectSkill: (state, action: PayloadAction<Skill | null>) => {
      state.selectedSkill = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSkills.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchSkills.fulfilled, (state, action) => {
        state.loading = false;
        state.skills = action.payload;
      })
      .addCase(fetchSkills.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createSkill.fulfilled, (state, action) => {
        state.skills.push(action.payload);
      })
      .addCase(deleteSkill.fulfilled, (state, action) => {
        state.skills = state.skills.filter(s => s.name !== action.payload);
      });
  },
});

export const { selectSkill, clearError } = skillSlice.actions;
export default skillSlice.reducer;
