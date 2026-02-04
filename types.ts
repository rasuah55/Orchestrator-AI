
export enum AgentRole {
  SUPERVISOR = 'Supervisor',
  RESEARCHER = 'Researcher',
  ANALYST = 'Analyst',
  WRITER = 'Writer',
  EDITOR = 'Editor',
  CODER = 'Coder'
}

export type AgentPrompts = Record<AgentRole, string>;

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedAgent: AgentRole;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  result?: string;
  usage?: number; // Token usage for this task
}

export interface LogEntry {
  id: string;
  timestamp: number;
  agent: AgentRole;
  message: string;
  type: 'plan' | 'action' | 'result' | 'error' | 'info';
  metadata?: Record<string, any>; // For things like URLs found or usage
}

export interface RateLimitConfig {
  maxTokens: number;
  periodValue: number;
  periodUnit: 'seconds' | 'minutes' | 'hours';
  autoResumeMinutes: number; // New: Auto resume timer duration
}

export interface AppState {
  status: 'idle' | 'planning' | 'working' | 'cooldown' | 'completed' | 'error' | 'paused' | 'auto-paused';
  tasks: Task[];
  logs: LogEntry[];
  currentTaskIndex: number;
  tokenUsage: number;
  windowStartTime: number;
  nextAllowedQueryTime: number;
  finalOutput: string | null;
  agentPrompts: AgentPrompts;
}

export interface SavedSession {
  id: string;
  timestamp: number;
  query: string;
  config: RateLimitConfig;
  state: AppState;
}
