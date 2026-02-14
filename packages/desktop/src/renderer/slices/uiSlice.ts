/**
 * UI state slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  sidebarOpen: boolean;
  currentView: 'chat' | 'skills' | 'settings' | 'history';
  theme: 'light' | 'dark' | 'system';
  toast: {
    message: string;
    type: 'success' | 'error' | 'info';
    visible: boolean;
  } | null;
}

const initialState: UIState = {
  sidebarOpen: true,
  currentView: 'chat',
  theme: 'system',
  toast: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    setCurrentView: (state, action: PayloadAction<UIState['currentView']>) => {
      state.currentView = action.payload;
    },
    setTheme: (state, action: PayloadAction<UIState['theme']>) => {
      state.theme = action.payload;
    },
    showToast: (state, action: PayloadAction<{ message: string; type: UIState['toast']['type'] }>) => {
      state.toast = {
        ...action.payload,
        visible: true,
      };
    },
    hideToast: (state) => {
      if (state.toast) {
        state.toast.visible = false;
      }
    },
  },
});

export const { toggleSidebar, setSidebarOpen, setCurrentView, setTheme, showToast, hideToast } = uiSlice.actions;
export default uiSlice.reducer;
