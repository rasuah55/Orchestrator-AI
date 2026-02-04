import React, { useEffect, useRef, useState } from 'react';
import { LogEntry, AgentRole } from '../types';
import { AGENT_ICONS } from '../constants';

interface Props {
  logs: LogEntry[];
}

interface LogItemProps {
  log: LogEntry;
  getLogStyle: (type: LogEntry['type']) => string;
}

const LogItem: React.FC<LogItemProps> = ({ log, getLogStyle }) => {
    const isSystemInfo = log.message.startsWith('[SYSTEM]');
    const [expanded, setExpanded] = useState(!isSystemInfo); // Collapse system info by default to reduce noise, but expandable

    // If it is a system log, we show a preview line and a toggle
    // If it is a normal log, we show it fully
    
    return (
        <div className={`p-3 rounded border ${getLogStyle(log.type)}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg leading-none" role="img" aria-label={log.agent}>
                {AGENT_ICONS[log.agent]}
              </span>
              <span className="font-bold text-xs uppercase opacity-70">
                {log.agent}
              </span>
              <span className="ml-auto text-[10px] opacity-40">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
            </div>
            
            {isSystemInfo ? (
                <div>
                    <div 
                        className="cursor-pointer flex items-center gap-2 opacity-80 hover:opacity-100"
                        onClick={() => setExpanded(!expanded)}
                    >
                        <span className="text-[10px] uppercase font-bold text-brand-400">
                            {expanded ? '▼ Hide Details' : '▶ Show System Details'}
                        </span>
                        {!expanded && <span className="text-xs opacity-50 truncate">{log.message.substring(0, 50)}...</span>}
                    </div>
                    {expanded && (
                         <div className="mt-2 whitespace-pre-wrap break-words opacity-90 text-xs bg-black/20 p-2 rounded">
                            {log.message}
                         </div>
                    )}
                </div>
            ) : (
                <div className="whitespace-pre-wrap break-words opacity-90">
                    {log.message}
                </div>
            )}

            {log.metadata?.sources && log.metadata.sources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/10">
                 <p className="text-[10px] uppercase font-bold opacity-60 mb-1">Sources Used:</p>
                 <ul className="list-disc pl-4 space-y-1">
                    {log.metadata.sources.map((src: string, i: number) => (
                        <li key={i} className="text-xs truncate text-blue-400 hover:underline">
                            <a href={src} target="_blank" rel="noopener noreferrer">{src}</a>
                        </li>
                    ))}
                 </ul>
              </div>
            )}
        </div>
    );
}

export const LogFeed: React.FC<Props> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLogStyle = (type: LogEntry['type']) => {
    switch (type) {
      case 'error': return 'text-red-400 bg-red-900/10 border-red-900/30';
      case 'plan': return 'text-purple-300 bg-purple-900/10 border-purple-900/30';
      case 'result': return 'text-emerald-300 bg-emerald-900/10 border-emerald-900/30';
      case 'action': return 'text-blue-300 bg-blue-900/10 border-blue-900/30';
      default: return 'text-gray-300 bg-gray-800 border-gray-700'; // info
    }
  };

  return (
    <div className="bg-gray-950 rounded-lg border border-gray-800 h-[500px] flex flex-col">
      <div className="p-3 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center sticky top-0">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">System Logs</span>
        <span className="text-xs text-gray-600">{logs.length} events</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm">
        {logs.length === 0 && (
          <div className="text-center text-gray-600 italic py-10">
            Waiting for mission start...
          </div>
        )}
        
        {logs.map((log) => (
          <LogItem key={log.id} log={log} getLogStyle={getLogStyle} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};