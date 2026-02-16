/**
 * Main App component
 */

import React, { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from './hooks.js';
import { fetchWorkspaces, createWorkspace } from './slices/workspaceSlice.js';
import { fetchLLMConfig, fetchLLMProviders, fetchLLMStatus } from './slices/llmSlice.js';
import { Sidebar } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { ChatPage } from './pages/ChatPage.js';
import { SkillsPage } from './pages/SkillsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { Toast } from './components/Toast.js';
import './components/Sidebar.css';
import './components/Header.css';
import './components/Toast.css';
import './pages/ChatPage.css';
import './pages/SkillsPage.css';
import './pages/SettingsPage.css';

export function App() {
  const dispatch = useAppDispatch();
  const { currentView } = useAppSelector((state) => state.ui);
  const { activeWorkspaceId } = useAppSelector((state) => state.workspace);

  useEffect(() => {
    // Fetch workspaces and LLM config on app startup
    dispatch(fetchWorkspaces());
    dispatch(fetchLLMProviders());
    dispatch(fetchLLMConfig());
    dispatch(fetchLLMStatus());
  }, [dispatch]);

  const renderPage = () => {
    switch (currentView) {
      case 'skills':
        return <SkillsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'chat':
      default:
        return <ChatPage />;
    }
  };

  return (
    <div className="app">
      <Sidebar />
      <div className="main-content">
        <Header />
        <div className="page-container">
          {activeWorkspaceId ? renderPage() : <WelcomeScreen />}
        </div>
      </div>
      <Toast />
    </div>
  );
}

function WelcomeScreen() {
  const dispatch = useAppDispatch();

  const handleCreateWorkspace = async () => {
    // Check if electronAPI is available
    if (!window.electronAPI?.selectDirectory) {
      console.error('electronAPI.selectDirectory is not available');
      alert('File selection is not available. Please restart the application.');
      return;
    }

    try {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        const name = path.split(/[/\\]/).pop() || 'New Workspace';
        dispatch(createWorkspace({ name, path }));
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
      alert('Failed to select directory. Please try again.');
    }
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <h1>Welcome to Comrade</h1>
        <p>Your AI-powered workspace for teams</p>
        <button className="btn btn-primary" onClick={handleCreateWorkspace}>
          Create Workspace
        </button>
      </div>
    </div>
  );
}


