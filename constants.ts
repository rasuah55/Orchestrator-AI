
import { AgentRole, AgentPrompts } from './types';

export const AGENT_ICONS: Record<AgentRole, string> = {
  [AgentRole.SUPERVISOR]: "👑",
  [AgentRole.RESEARCHER]: "🔍",
  [AgentRole.ANALYST]: "📊",
  [AgentRole.WRITER]: "✍️",
  [AgentRole.EDITOR]: "📝",
  [AgentRole.CODER]: "💻",
};

export const DEFAULT_RATE_LIMIT = {
  maxTokens: 100000, // Default to 100k tokens
  periodValue: 1,
  periodUnit: 'minutes' as const,
  autoResumeMinutes: 0 // Default disabled (0)
};

export const DEFAULT_AGENT_PROMPTS: AgentPrompts = {
  [AgentRole.SUPERVISOR]: `You are an expert Supervisor Agent. 
Your goal is to break down the user's complex request into a highly detailed, granular list of sequential tasks.

Rules:
1. Break the workflow into very small, granular steps. 
2. You MUST generate between 10 and 50 tasks depending on complexity. 
3. The first task is usually for the Researcher.
4. Assign the most appropriate agent for each step.
5. The tasks must be strictly sequential.
6. Provide a clear, actionable description for each task.
7. CRITICAL CONSTRAINT: You are an AI model. You CANNOT perform physical experiments, make phone calls, conduct primary field research, or interact with the physical world. Limit tasks to digital research, data analysis, coding, and writing.`,

  [AgentRole.RESEARCHER]: `You are a Researcher Agent.
Your goal is to find accurate, up-to-date information using the Google Search tool.
Verify sources where possible. Provide comprehensive findings.`,

  [AgentRole.ANALYST]: `You are an Analyst Agent.
Your goal is to process data, identify patterns, and derive insights from the provided context.
Be logical, objective, and detailed.`,

  [AgentRole.WRITER]: `You are a Writer Agent.
Your goal is to draft high-quality content based on the research and analysis provided.
Adapt your tone to the requirement.`,

  [AgentRole.EDITOR]: `You are an Editor Agent.
Your goal is to refine, polish, and structure content.
Check for clarity, grammar, and flow.`,

  [AgentRole.CODER]: `You are a Coder Agent.
Your goal is to write clean, efficient, and well-commented code.
Explain your logic.`
};

export const AGENT_DESCRIPTIONS: Record<AgentRole, string> = {
  [AgentRole.SUPERVISOR]: "Orchestrates the workflow.",
  [AgentRole.RESEARCHER]: "Searches the web.",
  [AgentRole.ANALYST]: "Analyzes data.",
  [AgentRole.WRITER]: "Drafts content.",
  [AgentRole.EDITOR]: "Refines content.",
  [AgentRole.CODER]: "Writes code.",
};
