import React, { useState } from 'react';
import { Task, AgentRole } from '../types';
import { AGENT_ICONS } from '../constants';

interface Props {
  task: Task;
  index: number;
}

export const TaskItem: React.FC<Props> = ({ task, index }) => {
  const [expanded, setExpanded] = useState(false);

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'completed': return 'border-emerald-500/50 bg-emerald-900/10 text-emerald-400';
      case 'in-progress': return 'border-brand-500 bg-brand-900/10 text-brand-300';
      case 'failed': return 'border-red-500/50 bg-red-900/10 text-red-400';
      default: return 'border-gray-700 bg-gray-800 text-gray-400';
    }
  };

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'completed': return '✓';
      case 'in-progress': return '⟳';
      case 'failed': return '✕';
      default: return `${index + 1}`;
    }
  };

  return (
    <div className={`relative flex flex-col p-4 rounded-lg border mb-3 transition-all ${getStatusColor(task.status)}`}>
      <div className="flex items-start w-full cursor-pointer" onClick={() => task.result && setExpanded(!expanded)}>
        <div className={`
          flex items-center justify-center w-8 h-8 rounded-full border mr-4 text-sm font-bold shrink-0
          ${task.status === 'in-progress' ? 'animate-pulse' : ''}
          ${task.status === 'completed' ? 'bg-emerald-500/20 border-emerald-500' : 'border-current'}
        `}>
          {getStatusIcon(task.status)}
        </div>
        
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <h4 className={`font-medium ${task.status === 'completed' && !expanded ? 'opacity-90' : ''}`}>
              {task.title}
            </h4>
            <div className="flex items-center gap-2">
                {task.usage && (
                    <span className="text-[10px] font-mono bg-black/30 px-2 py-1 rounded text-gray-400">
                        {task.usage} toks
                    </span>
                )}
                <span className="text-xs font-mono bg-black/30 px-2 py-1 rounded flex items-center gap-1 shrink-0">
                    {AGENT_ICONS[task.assignedAgent]} {task.assignedAgent}
                </span>
            </div>
          </div>
          <p className="text-sm mt-1 opacity-80 text-gray-300">
            {task.description}
          </p>
          
          {task.status === 'in-progress' && (
            <div className="mt-3 text-xs text-brand-400 animate-pulse flex items-center">
              Agent is working...
            </div>
          )}
        </div>
      </div>

      {task.result && task.status === 'completed' && (
        <div className={`mt-3 pt-3 border-t border-white/10 text-sm text-gray-300 w-full transition-all duration-300 ${expanded ? 'block' : 'hidden'}`}>
          <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-500 uppercase font-bold">Full Output</span>
              <button 
                onClick={() => setExpanded(false)}
                className="text-xs text-brand-400 hover:text-brand-300 underline"
              >
                Collapse
              </button>
          </div>
          <div className="bg-black/30 p-3 rounded overflow-x-auto">
             <pre className="whitespace-pre-wrap font-mono text-xs">{task.result}</pre>
          </div>
        </div>
      )}
      
      {task.result && task.status === 'completed' && !expanded && (
        <div className="mt-2 pl-12 text-xs text-brand-400 hover:text-brand-300 cursor-pointer underline" onClick={() => setExpanded(true)}>
             View full output
        </div>
      )}
    </div>
  );
};
