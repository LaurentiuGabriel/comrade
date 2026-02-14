/**
 * Redux store configuration
 */

import { configureStore } from '@reduxjs/toolkit';
import workspaceReducer from '../slices/workspaceSlice.js';
import sessionReducer from '../slices/sessionSlice.js';
import skillReducer from '../slices/skillSlice.js';
import uiReducer from '../slices/uiSlice.js';
import llmReducer from '../slices/llmSlice.js';
import telegramReducer from '../slices/telegramSlice.js';

export const store = configureStore({
  reducer: {
    workspace: workspaceReducer,
    session: sessionReducer,
    skill: skillReducer,
    ui: uiReducer,
    llm: llmReducer,
    telegram: telegramReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
