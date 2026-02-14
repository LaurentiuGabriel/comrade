/**
 * Sidebar component
 */

import React from 'react';
import { MessageSquare, BookOpen, Settings, ChevronLeft, ChevronRight, Plus, Folder } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../hooks.js';
import { toggleSidebar, setCurrentView } from '../slices/uiSlice.js';
import { setActiveWorkspace, createWorkspace } from '../slices/workspaceSlice.js';

export function Sidebar() {
  const dispatch = useAppDispatch();
  const { sidebarOpen, currentView } = useAppSelector((state) => state.ui);
  const { workspaces, activeWorkspaceId } = useAppSelector((state) => state.workspace);

  const handleCreateWorkspace = async () => {
    const path = await window.electronAPI.selectDirectory();
    if (path) {
      const name = path.split(/[/\\]/).pop() || 'New Workspace';
      dispatch(createWorkspace({ name, path }));
    }
  };

  const navItems = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'skills', label: 'Skills', icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
      <div className="sidebar-header">
        {sidebarOpen && <span className="logo">Comrade</span>}
        <button 
          className="btn btn-ghost toggle-btn"
          onClick={() => dispatch(toggleSidebar())}
        >
          {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      {sidebarOpen && (
        <>
          <div className="workspace-section">
            <div className="section-header">
              <span className="section-title">Workspaces</span>
              <button className="btn btn-ghost btn-sm" onClick={handleCreateWorkspace}>
                <Plus size={16} />
              </button>
            </div>
            <div className="workspace-list">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  className={`workspace-item ${workspace.id === activeWorkspaceId ? 'active' : ''}`}
                  onClick={() => dispatch(setActiveWorkspace(workspace.id))}
                >
                  <Folder size={16} />
                  <span className="workspace-name">{workspace.name}</span>
                </button>
              ))}
            </div>
          </div>

          <nav className="nav-section">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${currentView === item.id ? 'active' : ''}`}
                  onClick={() => dispatch(setCurrentView(item.id as any))}
                >
                  <Icon size={20} />
                  <span className="nav-label">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </>
      )}

      {!sidebarOpen && (
        <nav className="nav-section collapsed">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${currentView === item.id ? 'active' : ''}`}
                onClick={() => dispatch(setCurrentView(item.id as any))}
                title={item.label}
              >
                <Icon size={20} />
              </button>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
