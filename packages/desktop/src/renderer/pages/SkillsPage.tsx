/**
 * Skills Page component
 */

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit3, X, Check } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../hooks.js';
import { fetchSkills, createSkill, deleteSkill, selectSkill } from '../slices/skillSlice.js';
import { showToast } from '../slices/uiSlice.js';

export function SkillsPage() {
  const dispatch = useAppDispatch();
  const { activeWorkspaceId } = useAppSelector((state) => state.workspace);
  const { skills, selectedSkill, loading } = useAppSelector((state) => state.skill);
  const [isCreating, setIsCreating] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillContent, setNewSkillContent] = useState('');

  useEffect(() => {
    if (activeWorkspaceId) {
      dispatch(fetchSkills(activeWorkspaceId));
    }
  }, [activeWorkspaceId, dispatch]);

  const handleCreate = async () => {
    if (!newSkillName.trim() || !activeWorkspaceId) return;

    await dispatch(createSkill({
      workspaceId: activeWorkspaceId,
      name: newSkillName,
      content: newSkillContent || `# ${newSkillName}\n\nDescribe your skill here...`,
    }));

    setIsCreating(false);
    setNewSkillName('');
    setNewSkillContent('');
    dispatch(showToast({ message: 'Skill created successfully', type: 'success' }));
  };

  const handleDelete = async (name: string) => {
    if (!activeWorkspaceId) return;

    await dispatch(deleteSkill({ workspaceId: activeWorkspaceId, name }));
    dispatch(showToast({ message: 'Skill deleted', type: 'info' }));
  };

  if (isCreating) {
    return (
      <div className="skills-page">
        <div className="skills-header">
          <h3>Create New Skill</h3>
          <button className="btn btn-ghost" onClick={() => setIsCreating(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="skill-form">
          <input
            className="input"
            placeholder="Skill name"
            value={newSkillName}
            onChange={(e) => setNewSkillName(e.target.value)}
          />
          <textarea
            className="input skill-content-input"
            placeholder="Skill content (Markdown supported)"
            value={newSkillContent}
            onChange={(e) => setNewSkillContent(e.target.value)}
            rows={20}
          />
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setIsCreating(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleCreate}>
              <Check size={16} />
              Create Skill
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="skills-page">
      <div className="skills-header">
        <h3>Skills ({skills.length})</h3>
        <button className="btn btn-primary" onClick={() => setIsCreating(true)}>
          <Plus size={16} />
          New Skill
        </button>
      </div>

      <div className="skills-list">
        {skills.map((skill) => (
          <div key={skill.id} className="skill-card">
            <div className="skill-info">
              <h4>{skill.name}</h4>
              <p>{skill.description}</p>
            </div>
            <div className="skill-actions">
              <button className="btn btn-ghost" onClick={() => dispatch(selectSkill(skill))}>
                <Edit3 size={16} />
              </button>
              <button className="btn btn-ghost btn-danger" onClick={() => handleDelete(skill.name)}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {skills.length === 0 && !loading && (
          <div className="empty-skills">
            <p>No skills yet. Create your first skill to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
