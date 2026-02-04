import React, { useState } from 'react';
import { AgentRole, AgentPrompts } from '../types';
import { AGENT_ICONS } from '../constants';

interface Props {
  prompts: AgentPrompts;
  onUpdate: (role: AgentRole, prompt: string) => void;
  onReset: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const AgentConfigPanel: React.FC<Props> = ({ prompts, onUpdate, onReset, isOpen, onClose }) => {
  const [activeRole, setActiveRole] = useState<AgentRole>(AgentRole.SUPERVISOR);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>⚙️</span> Agent Prompt Configuration
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-1/4 border-r border-gray-700 bg-gray-950/50 p-2 space-y-1 overflow-y-auto">
            {Object.values(AgentRole).map(role => (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                  activeRole === role ? 'bg-brand-600 text-white' : 'text-gray-400 hover:bg-gray-800'
                }`}
              >
                <span>{AGENT_ICONS[role]}</span>
                {role}
              </button>
            ))}
          </div>

          {/* Editor Area */}
          <div className="flex-1 p-4 flex flex-col bg-gray-900">
             <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-gray-300">
                    System Instructions for {activeRole}
                </h3>
                <span className="text-xs text-gray-500">
                    Defines behavior, constraints, and capabilities.
                </span>
             </div>
             <textarea
                value={prompts[activeRole]}
                onChange={(e) => onUpdate(activeRole, e.target.value)}
                className="flex-1 w-full bg-gray-950 border border-gray-700 rounded p-4 text-sm font-mono text-gray-300 focus:border-brand-500 focus:outline-none resize-none"
             />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900 flex justify-end gap-3">
          <button 
            onClick={onReset}
            className="px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded border border-transparent hover:border-red-900/50 transition-colors"
          >
            Reset to Defaults
          </button>
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded font-bold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
