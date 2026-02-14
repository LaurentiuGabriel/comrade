/**
 * Header component
 */

import React from 'react';
import { useAppSelector } from '../hooks.js';

export function Header() {
  const { activeWorkspaceId, workspaces } = useAppSelector((state) => state.workspace);
  const { currentView } = useAppSelector((state) => state.ui);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);

  const getTitle = () => {
    switch (currentView) {
      case 'skills':
        return 'Skills';
      case 'settings':
        return 'Settings';
      case 'chat':
      default:
        return activeWorkspace?.name || 'Chat';
    }
  };

  return (
    <header className="header">
      <h2>{getTitle()}</h2>
      <div className="header-actions">
        {/* Add header actions here */}
      </div>
    </header>
  );
}
