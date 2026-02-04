import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AgentRole, Task, LogEntry, RateLimitConfig, AppState, SavedSession, AgentPrompts } from './types';
import { DEFAULT_RATE_LIMIT, AGENT_ICONS, DEFAULT_AGENT_PROMPTS } from './constants';
import { createSupervisorPlan, executeAgentTask, superviseFinalOutput, updateSupervisorPlan } from './services/geminiService';
import { saveSession, getSessions, deleteSession } from './services/storageService';
import { RateLimitConfigPanel } from './components/RateLimitConfig';
import { TaskItem } from './components/TaskItem';
import { LogFeed } from './components/LogFeed';
import { HistoryPanel } from './components/HistoryPanel';
import { AgentConfigPanel } from './components/AgentConfigPanel';

const INITIAL_STATE: AppState = {
  status: 'idle',
  tasks: [],
  logs: [],
  currentTaskIndex: 0,
  tokenUsage: 0,
  windowStartTime: Date.now(),
  nextAllowedQueryTime: 0,
  finalOutput: null,
  agentPrompts: DEFAULT_AGENT_PROMPTS
};

const AUTOSAVE_KEY = 'orchestrator_autosave_v1';

export default function App() {
  const [query, setQuery] = useState('');
  const [config, setConfig] = useState<RateLimitConfig>(DEFAULT_RATE_LIMIT);
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [history, setHistory] = useState<SavedSession[]>([]);
  
  // Settings State
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Refs to access latest state in async timeouts without dependency loops
  const stateRef = useRef(state);
  const configRef = useRef(config);
  const queryRef = useRef(query);

  useEffect(() => {
    stateRef.current = state;
    configRef.current = config;
    queryRef.current = query;
  }, [state, config, query]);

  // Load History & Auto-save on Mount
  useEffect(() => {
    setHistory(getSessions());
    
    // Check for auto-save
    try {
        const rawAutoSave = localStorage.getItem(AUTOSAVE_KEY);
        if (rawAutoSave) {
            const saved: SavedSession = JSON.parse(rawAutoSave);
            // Check if status is interrupted (not idle, not completed)
            if (saved.state.status !== 'idle' && saved.state.status !== 'completed') {
                if (confirm(`Found active mission: "${saved.query.substring(0, 50)}..." interrupted at ${new Date(saved.timestamp).toLocaleTimeString()}. Resume?`)) {
                    setQuery(saved.query);
                    setConfig(saved.config);
                    // Safe merge with INITIAL_STATE
                    setState({ 
                        ...INITIAL_STATE, 
                        ...saved.state, 
                        agentPrompts: saved.state.agentPrompts || INITIAL_STATE.agentPrompts,
                        status: 'paused' 
                    });
                }
            }
        }
    } catch (e) {
        console.error("Auto-save load failed", e);
    }
  }, []);

  // Aggressive Persistence for "Background-like" reliability
  useEffect(() => {
    const handleBeforeUnload = () => {
       // If working, save immediately before tab closes
       const s = stateRef.current.status;
       if (s === 'working' || s === 'planning' || s === 'cooldown' || s === 'auto-paused') {
           const session: SavedSession = {
                id: 'autosave',
                timestamp: Date.now(),
                query: queryRef.current,
                config: configRef.current,
                state: stateRef.current
           };
           localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(session));
       }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Regular Debounced Auto-Save
  useEffect(() => {
    if (state.status === 'idle') return;
    
    const timeout = setTimeout(() => {
        const session: SavedSession = {
            id: 'autosave',
            timestamp: Date.now(),
            query: queryRef.current,
            config: configRef.current,
            state: stateRef.current
        };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(session));
    }, 1000); 

    return () => clearTimeout(timeout);
  }, [state, query, config]);

  // Rate Limiting Logic (Token Based)
  const checkRateLimit = useCallback(() => {
    const { tokenUsage, windowStartTime } = stateRef.current;
    const { maxTokens, periodValue, periodUnit } = configRef.current;
    
    let periodMs = 0;
    if (periodUnit === 'seconds') periodMs = periodValue * 1000;
    if (periodUnit === 'minutes') periodMs = periodValue * 60 * 1000;
    if (periodUnit === 'hours') periodMs = periodValue * 60 * 60 * 1000;

    const now = Date.now();
    const elapsed = now - windowStartTime;

    if (elapsed > periodMs) {
      // Window reset
      setState(s => ({ ...s, tokenUsage: 0, windowStartTime: now, status: s.status === 'cooldown' ? 'working' : s.status }));
      return true;
    }

    // Check 80% Threshold
    const percentageUsed = (tokenUsage / maxTokens) * 100;
    if (percentageUsed >= 80) {
      // Limit hit
      const waitTime = periodMs - elapsed;
      setState(s => ({ 
        ...s, 
        status: 'cooldown', 
        nextAllowedQueryTime: now + waitTime 
      }));
      return false;
    }

    return true;
  }, []);

  // Cooldown & Auto-Resume Timer Effect
  useEffect(() => {
    let interval: any;
    if (state.status === 'cooldown' || state.status === 'auto-paused') {
      interval = setInterval(() => {
        const remaining = Math.max(0, stateRef.current.nextAllowedQueryTime - Date.now());
        setCooldownRemaining(remaining);
        
        if (remaining <= 0) {
            // Timer finished
            // Check if user has manually fully paused in the meantime
            const currentStatus = stateRef.current.status;
            if (currentStatus !== 'paused') { 
                setState(s => ({ ...s, status: 'working', windowStartTime: Date.now() }));
            }
        }
      }, 100);
    } else {
        setCooldownRemaining(0);
    }
    return () => clearInterval(interval);
  }, [state.status]);


  // Helper to add logs
  const addLog = (agent: AgentRole, message: string, type: LogEntry['type'], metadata?: any) => {
    setState(s => ({
      ...s,
      logs: [...s.logs, {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        agent,
        message,
        type,
        metadata
      }]
    }));
  };

  // Main Execution Step
  const processNextStep = useCallback(async () => {
    const current = stateRef.current;
    if (current.status !== 'working' && current.status !== 'planning') return;

    if (!checkRateLimit()) return;

    try {
        // CASE: Planning Phase
        if (current.status === 'planning') {
            addLog(AgentRole.SUPERVISOR, `Thinking... Analyzing request to build granular plan.`, 'plan');
            const { tasks, usage, prompt } = await createSupervisorPlan(query, current.agentPrompts);
            
            addLog(AgentRole.SUPERVISOR, `[SYSTEM] Supervisor Planning Prompt:\n${prompt}`, 'info');

            setState(s => ({
                ...s,
                status: 'working',
                tasks,
                currentTaskIndex: 0,
                tokenUsage: s.tokenUsage + usage
            }));
            
            addLog(AgentRole.SUPERVISOR, `Plan created with ${tasks.length} tasks. (Used ${usage} tokens)`, 'plan');
            return; 
        }

        // CASE: Working Phase
        const taskIndex = current.currentTaskIndex;
        if (taskIndex >= current.tasks.length) {
            addLog(AgentRole.SUPERVISOR, "All tasks completed. Compiling final report...", 'info');
            
            if (!checkRateLimit()) return; 

            const context = current.tasks.map(t => `Task: ${t.title}\nResult: ${t.result}`).join('\n\n');
            const { text: finalOutput, usage, prompt } = await superviseFinalOutput(context, current.agentPrompts);
            
            addLog(AgentRole.SUPERVISOR, `[SYSTEM] Final Synthesis Prompt:\n${prompt}`, 'info');

            setState(s => ({ 
                ...s, 
                status: 'completed', 
                finalOutput,
                tokenUsage: s.tokenUsage + usage
            }));
            addLog(AgentRole.SUPERVISOR, `Final output delivered. (Used ${usage} tokens)`, 'result');
            
            // Clear auto-save on successful completion
            localStorage.removeItem(AUTOSAVE_KEY);
            return;
        }

        // Execute Current Task
        const task = current.tasks[taskIndex];
        
        setState(s => ({
            ...s,
            tasks: s.tasks.map((t, i) => i === taskIndex ? { ...t, status: 'in-progress' } : t)
        }));
        
        addLog(AgentRole.SUPERVISOR, `Starting Task ${taskIndex + 1}/${current.tasks.length}: ${task.title} (${task.assignedAgent})`, 'action');

        const context = current.tasks
            .slice(0, taskIndex)
            .map(t => `[Completed Task: ${t.title}]\nResult: ${t.result}`)
            .join('\n\n');

        const result = await executeAgentTask(task.assignedAgent, task, context, current.agentPrompts);

        addLog(task.assignedAgent, `[SYSTEM] Agent Prompt:\n${result.prompt}`, 'info');
        addLog(task.assignedAgent, `[SYSTEM] Agent Output:\n${result.text}`, 'info');
        addLog(task.assignedAgent, `Task Complete. (Used ${result.usage} tokens)`, 'result', { sources: result.sources });

        const updatedTasksWithCurrentResult = current.tasks.map((t, i) => i === taskIndex ? { 
            ...t, 
            status: 'completed' as const, 
            result: result.text,
            usage: result.usage
        } : t);

        // REPLANNING
        let nextTasks = updatedTasksWithCurrentResult;
        let additionalUsage = 0;
        
        const remainingCount = updatedTasksWithCurrentResult.length - (taskIndex + 1);
        if (remainingCount > 0 && checkRateLimit()) {
             addLog(AgentRole.SUPERVISOR, "Evaluating progress and checking if plan needs updates...", 'plan');
             
             const completedTasks = updatedTasksWithCurrentResult.slice(0, taskIndex + 1);
             const remainingTasks = updatedTasksWithCurrentResult.slice(taskIndex + 1);
             
             const replanResult = await updateSupervisorPlan(query, completedTasks, remainingTasks, current.agentPrompts);
             additionalUsage = replanResult.usage;
             
             addLog(AgentRole.SUPERVISOR, `[SYSTEM] Re-planning Prompt:\n${replanResult.prompt}`, 'info');

             const newRemainingTasks = replanResult.tasks.map((t, i) => ({
                 id: `task-${Date.now()}-${i}`,
                 title: t.title,
                 description: t.description,
                 assignedAgent: t.assignedAgent,
                 status: 'pending' as const
             }));
             
             nextTasks = [...completedTasks, ...newRemainingTasks];
             addLog(AgentRole.SUPERVISOR, `Plan updated. Remaining tasks: ${newRemainingTasks.length} (Used ${replanResult.usage} tokens)`, 'plan');
        }

        setState(s => ({
            ...s,
            currentTaskIndex: s.currentTaskIndex + 1,
            tokenUsage: s.tokenUsage + result.usage + additionalUsage,
            tasks: nextTasks
        }));

    } catch (err: any) {
        console.error(err);
        const errMsg = err.message || '';
        const isQuota = err.status === 429 || errMsg.includes('429') || errMsg.includes('quota');
        
        if (isQuota) {
            addLog(AgentRole.SUPERVISOR, `CRITICAL: Rate limit exceeded. Pausing mission. Resume when quota resets.`, 'error');
            setState(s => ({ ...s, status: 'paused' })); 
        } else {
            addLog(AgentRole.SUPERVISOR, `Error: ${errMsg}`, 'error');
            setState(s => ({ ...s, status: 'paused' })); 
        }
    }

  }, [query, checkRateLimit]);

  useEffect(() => {
    let timeout: any;
    if (state.status === 'planning' || state.status === 'working') {
        timeout = setTimeout(() => {
            processNextStep();
        }, 1000); 
    }
    return () => clearTimeout(timeout);
  }, [state.status, state.currentTaskIndex, state.tokenUsage, processNextStep]);

  const handleStart = () => {
    if (!query.trim()) return;
    setState({
        ...INITIAL_STATE,
        status: 'planning',
        windowStartTime: Date.now(),
        agentPrompts: state.agentPrompts // Preserve prompts
    });
  };

  const handlePause = () => {
      // Check for auto-resume setting
      if (config.autoResumeMinutes > 0) {
          const delayMs = config.autoResumeMinutes * 60 * 1000;
          setState(s => ({ 
              ...s, 
              status: 'auto-paused',
              nextAllowedQueryTime: Date.now() + delayMs
          }));
      } else {
          setState(s => ({ ...s, status: 'paused' }));
      }
  };

  const handleStopTimer = () => {
      setState(s => ({ ...s, status: 'paused' }));
  };

  const handleSave = () => {
      saveSession(state, query, config);
      setHistory(getSessions());
      alert("Session saved to History.");
  }

  const handleResume = () => {
      const statusToResume = state.tasks.length > 0 ? 'working' : 'planning';
      setState(s => ({ ...s, status: statusToResume }));
  };

  const handleRestart = () => {
      if (confirm("Are you sure you want to restart? Current progress will be lost (unless saved).")) {
        setState({
            ...INITIAL_STATE,
            status: 'planning',
            windowStartTime: Date.now(),
            agentPrompts: state.agentPrompts
        });
      }
  };

  const handleLoadSession = (session: SavedSession) => {
      if (state.status === 'working' || state.status === 'planning') {
          if (!confirm("Load session? Current active mission will be stopped.")) return;
      }
      setQuery(session.query);
      setConfig(session.config);
      setState({ 
        ...INITIAL_STATE,
        ...session.state, 
        agentPrompts: session.state.agentPrompts || INITIAL_STATE.agentPrompts,
        status: 'paused' 
      });
  };

  const handleDeleteSession = (id: string) => {
      setHistory(deleteSession(id));
  };

  const updatePrompt = (role: AgentRole, prompt: string) => {
      setState(s => ({
          ...s,
          agentPrompts: { ...s.agentPrompts, [role]: prompt }
      }));
  };

  const resetPrompts = () => {
      setState(s => ({ ...s, agentPrompts: DEFAULT_AGENT_PROMPTS }));
  };

  const formatTime = (ms: number) => {
      const seconds = Math.ceil(ms / 1000);
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const usagePercent = Math.min(100, (state.tokenUsage / config.maxTokens) * 100);
  const isRunning = state.status === 'working' || state.status === 'planning';
  const isPaused = state.status === 'paused' || state.status === 'auto-paused';
  const isIdle = state.status === 'idle' || state.status === 'completed' || state.status === 'error';
  const isConfigEnabled = isIdle || isPaused;

  const isTimerActive = state.status === 'cooldown' || state.status === 'auto-paused';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Header & Config Column */}
        <div className="lg:col-span-4 space-y-6">
            <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-500 to-purple-500">
                    Orchestrator AI
                </h1>
                <p className="text-gray-400 mt-2 text-sm">
                    Multi-agent supervisor system with strict token rate limiting.
                </p>
                <div className="mt-2 bg-blue-900/20 border border-blue-900/50 rounded p-2 text-xs text-blue-300 flex items-start gap-2">
                    <span>⚠️</span>
                    <span>
                        <strong>Cloud Persistence Active:</strong> Closing this tab pauses the mission. Resume anytime—your state is auto-saved locally.
                    </span>
                </div>
            </div>

            <RateLimitConfigPanel 
                config={config} 
                onChange={setConfig} 
                disabled={!isConfigEnabled} 
            />

            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <label className="block text-sm font-bold text-gray-300 mb-2">Objective</label>
                <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g., Research the current state of Quantum Computing, analyze the top 3 players, and write a summary blog post."
                    className="w-full h-32 bg-gray-950 border border-gray-700 rounded-lg p-3 text-sm focus:border-brand-500 focus:outline-none resize-none mb-4"
                    disabled={!isConfigEnabled} 
                />
                
                <div className="grid grid-cols-2 gap-3 mb-3">
                    {/* Primary Action Button Logic */}
                    {isIdle ? (
                        <button
                            onClick={handleStart}
                            disabled={!query.trim()}
                            className="col-span-2 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Start Mission
                        </button>
                    ) : isPaused ? (
                        // If Auto-Paused, offer two buttons
                        state.status === 'auto-paused' ? (
                            <>
                                <button
                                    onClick={handleResume}
                                    className="col-span-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors"
                                >
                                    Resume Now
                                </button>
                                <button
                                    onClick={handleStopTimer}
                                    className="col-span-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                                >
                                    Stop Timer
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleResume}
                                className="col-span-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors"
                            >
                                Resume
                            </button>
                        )
                    ) : (
                        <button
                            onClick={handlePause}
                            className="col-span-1 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold transition-colors"
                        >
                            {config.autoResumeMinutes > 0 ? "Pause & Timer" : "Pause"}
                        </button>
                    )}

                    {/* Secondary Action Button (Restart) - Only show if not auto-paused (takes up slot) or check layout */}
                    {!isIdle && state.status !== 'auto-paused' && (
                        <button
                            onClick={handleRestart}
                            className={`col-span-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors ${isRunning ? 'opacity-50 hover:opacity-100' : ''}`}
                            title="Restart Mission from Scratch"
                        >
                            Restart
                        </button>
                    )}
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleSave}
                        disabled={isIdle && !state.tasks.length}
                        className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 text-sm disabled:opacity-50"
                    >
                        Save Progress
                    </button>
                    <button
                        onClick={() => setIsConfigOpen(true)}
                        className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 text-sm"
                    >
                        Agent Settings
                    </button>
                </div>
                
                {isPaused && (
                     <div className="mt-2 text-center text-xs text-amber-500 font-medium animate-pulse">
                        {state.status === 'auto-paused' ? "Paused (Timer Active)" : "Mission Paused. Progress Saved."}
                     </div>
                )}
            </div>

            {/* Status Card */}
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h3 className="text-xs text-gray-500 uppercase">System Status</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`w-2 h-2 rounded-full ${
                                state.status === 'cooldown' ? 'bg-amber-500' :
                                state.status === 'auto-paused' ? 'bg-amber-500' :
                                state.status === 'paused' ? 'bg-amber-400' :
                                state.status === 'working' || state.status === 'planning' ? 'bg-green-500 animate-pulse' :
                                state.status === 'error' ? 'bg-red-500' : 'bg-gray-500'
                            }`} />
                            <span className="font-mono font-bold capitalize text-white">
                                {state.status === 'cooldown' ? `Paused (Limit Hit)` : 
                                 state.status === 'auto-paused' ? `Paused (Auto-Resume)` :
                                 state.status}
                            </span>
                        </div>
                    </div>
                    {isTimerActive && (
                        <div className="text-right">
                            <h3 className="text-xs text-amber-500 uppercase">Resuming In</h3>
                            <span className="font-mono text-xl font-bold text-amber-400">
                                {formatTime(cooldownRemaining)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Token Usage Bar */}
                <div className="mt-4 pt-4 border-t border-gray-800">
                    <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-gray-400">Token Usage (Current Period)</span>
                        <span className={`font-mono ${usagePercent > 80 ? 'text-amber-400' : 'text-gray-300'}`}>
                            {state.tokenUsage.toLocaleString()} / {config.maxTokens.toLocaleString()}
                        </span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-500 ${usagePercent >= 80 ? 'bg-amber-500' : 'bg-brand-500'}`}
                            style={{ width: `${usagePercent}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-gray-600">0%</span>
                        <span className="text-[10px] text-amber-500">80% Threshold</span>
                        <span className="text-[10px] text-gray-600">100%</span>
                    </div>
                </div>
            </div>
            
            {/* History Panel */}
            <HistoryPanel 
                sessions={history} 
                onLoad={handleLoadSession} 
                onDelete={handleDeleteSession}
                disabled={isRunning}
            />
            
            {/* Agent Legend */}
            <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-800">
                <h3 className="text-xs text-gray-500 uppercase mb-3">Active Agents</h3>
                <div className="grid grid-cols-2 gap-2">
                    {Object.values(AgentRole).map(role => (
                        <div key={role} className="flex items-center gap-2 text-xs text-gray-400">
                            <span>{AGENT_ICONS[role]}</span>
                            <span>{role}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Main Content Column */}
        <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Plan View */}
            {state.tasks.length > 0 && (
                <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-6">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <span>📋</span> Mission Plan
                    </h2>
                    <div className="space-y-1">
                        {state.tasks.map((task, idx) => (
                            <TaskItem key={task.id} task={task} index={idx} />
                        ))}
                    </div>
                </div>
            )}

            {/* Final Output View */}
            {state.finalOutput && (
                 <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg border border-brand-500/30 p-8 shadow-2xl">
                    <h2 className="text-xl font-bold text-brand-400 mb-6 flex items-center gap-2">
                        <span>🚀</span> Final Report
                    </h2>
                    <div className="prose prose-invert max-w-none text-gray-200 whitespace-pre-line">
                        {state.finalOutput}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-500 font-mono">
                        Total Session Tokens: {state.tokenUsage}
                    </div>
                 </div>
            )}

            {/* Logs View */}
            <LogFeed logs={state.logs} />
        </div>
      </div>

      <AgentConfigPanel 
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        prompts={state.agentPrompts}
        onUpdate={updatePrompt}
        onReset={resetPrompts}
      />
    </div>
  );
}
