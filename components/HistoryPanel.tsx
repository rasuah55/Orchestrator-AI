import React from 'react';
import { SavedSession } from '../types';

interface Props {
  sessions: SavedSession[];
  onLoad: (session: SavedSession) => void;
  onDelete: (id: string) => void;
  disabled: boolean;
}

export const HistoryPanel: React.FC<Props> = ({ sessions, onLoad, onDelete, disabled }) => {
  if (sessions.length === 0) return null;

  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <h3 className="text-xs text-gray-500 uppercase mb-3 flex justify-between items-center">
        <span>History / Saved Progress</span>
      </h3>
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {sessions.map((session) => (
          <div 
            key={session.id} 
            className="p-3 rounded bg-gray-950 border border-gray-800 hover:border-gray-700 transition-colors group"
          >
            <div className="flex justify-between items-start mb-1">
              <span className="text-[10px] text-gray-500 font-mono">
                {new Date(session.timestamp).toLocaleString()}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity px-1"
                title="Delete"
              >
                ✕
              </button>
            </div>
            <div className="text-xs text-gray-300 font-medium line-clamp-2 mb-2" title={session.query}>
              {session.query || "Untitled Session"}
            </div>
            <div className="flex justify-between items-center">
                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                    session.state.status === 'completed' ? 'bg-emerald-900/50 text-emerald-400' :
                    session.state.status === 'paused' ? 'bg-amber-900/50 text-amber-400' :
                    'bg-blue-900/50 text-blue-400'
                }`}>
                    {session.state.status}
                </span>
                
                <button
                    onClick={() => onLoad(session)}
                    disabled={disabled}
                    className="text-[10px] bg-gray-800 hover:bg-gray-700 text-white px-2 py-1 rounded border border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Load
                </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
