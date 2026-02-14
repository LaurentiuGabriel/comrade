/**
 * Session service for managing AI sessions
 */

import { ServerConfig, Session, Message, Task, Plan, Step, generateId, TaskStatus } from '@comrade/core';

export class SessionService {
  private sessions: Map<string, Session> = new Map();
  private tasks: Map<string, Task> = new Map();
  private plans: Map<string, Plan> = new Map();
  private steps: Map<string, Step> = new Map();

  constructor(private config: ServerConfig) {}

  async create(workspaceId: string, title: string): Promise<Session> {
    const session: Session = {
      id: generateId(),
      workspaceId,
      title,
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };

    this.sessions.set(session.id, session);
    return session;
  }

  async get(sessionId: string): Promise<Session | null> {
    return this.sessions.get(sessionId) || null;
  }

  async list(workspaceId?: string): Promise<Session[]> {
    const sessions = Array.from(this.sessions.values());
    if (workspaceId) {
      return sessions.filter(s => s.workspaceId === workspaceId);
    }
    return sessions;
  }

  async addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<Message> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const message: Message = {
      id: generateId(),
      sessionId,
      role,
      content,
      timestamp: Date.now(),
    };

    session.messages.push(message);
    session.updatedAt = Date.now();

    return message;
  }

  async updateStatus(sessionId: string, status: Session['status']): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    session.status = status;
    session.updatedAt = Date.now();
  }

  async createTask(sessionId: string, goal: string): Promise<Task> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const task: Task = {
      id: generateId(),
      sessionId,
      goal,
      status: 'planning',
      createdAt: Date.now(),
    };

    this.tasks.set(task.id, task);
    return task;
  }

  async getTask(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) || null;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Task not found');

    task.status = status;
    if (status === 'completed' || status === 'error' || status === 'cancelled') {
      task.completedAt = Date.now();
    }
  }

  async createPlan(taskId: string, steps: string[]): Promise<Plan> {
    const planSteps: Step[] = steps.map((description, index) => ({
      id: generateId(),
      planId: '', // Will be set below
      description,
      status: 'pending',
    }));

    const plan: Plan = {
      id: generateId(),
      taskId,
      steps: planSteps,
      editable: true,
    };

    // Update step planIds
    plan.steps.forEach(step => step.planId = plan.id);

    this.plans.set(plan.id, plan);
    
    // Link plan to task
    const task = this.tasks.get(taskId);
    if (task) {
      task.plan = plan;
    }

    return plan;
  }

  async updateStepStatus(stepId: string, status: Step['status']): Promise<void> {
    for (const plan of this.plans.values()) {
      const step = plan.steps.find(s => s.id === stepId);
      if (step) {
        step.status = status;
        if (status === 'running' && !step.startTime) {
          step.startTime = Date.now();
        }
        if ((status === 'completed' || status === 'error' || status === 'skipped') && !step.endTime) {
          step.endTime = Date.now();
        }
        return;
      }
    }
    throw new Error('Step not found');
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }
}
