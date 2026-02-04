
import React from 'react';
import { RateLimitConfig } from '../types';

interface Props {
  config: RateLimitConfig;
  onChange: (config: RateLimitConfig) => void;
  disabled: boolean;
}

export const RateLimitConfigPanel: React.FC<Props> = ({ config, onChange, disabled }) => {
  return (
    <div className="bg-gray-850 p-4 rounded-lg border border-gray-700 mb-6">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Workflow Controls
      </h3>
      <div className="space-y-4">
        {/* Token Budget Section */}
        <div className="space-y-3">
             <label className="block text-xs font-bold text-gray-500 uppercase">Rate Limiting (Token Budget)</label>
             <div className="flex flex-col sm:flex-row gap-2 items-end">
                <div className="flex-1 w-full">
                <label className="block text-xs text-gray-400 mb-1">Max Tokens</label>
                <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={config.maxTokens}
                    onChange={(e) => onChange({ ...config, maxTokens: parseInt(e.target.value) || 1000 })}
                    disabled={disabled}
                    className="w-full bg-gray-950 border border-gray-700 text-white text-s rounded px-3 py-2 focus:border-brand-500 focus:outline-none disabled:opacity-50"
                />
                </div>
                <div className="flex-1 w-full">
                <label className="block text-xs text-gray-400 mb-1">Duration</label>
                <div className="flex gap-2">
                    <input
                        type="number"
                        min="1"
                        value={config.periodValue}
                        onChange={(e) => onChange({ ...config, periodValue: parseInt(e.target.value) || 1 })}
                        disabled={disabled}
                        className="w-16 bg-gray-950 border border-gray-700 text-white rounded px-3 py-2 focus:border-brand-500 focus:outline-none disabled:opacity-50"
                    />
                    <select
                        value={config.periodUnit}
                        onChange={(e) => onChange({ ...config, periodUnit: e.target.value as any })}
                        disabled={disabled}
                        className="flex-1 bg-gray-950 border border-gray-700 text-white rounded px-3 py-2 focus:border-brand-500 focus:outline-none disabled:opacity-50"
                    >
                        <option value="seconds">Seconds</option>
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                    </select>
                </div>
                </div>
            </div>
             <p className="text-[10px] text-gray-500">
                Pauses if &gt; 80% of budget used in duration.
            </p>
        </div>

        {/* Auto Resume Section */}
        <div className="space-y-3">
            <label className="block text-xs font-bold text-gray-500 uppercase">Automation</label>
            <div>
                 <label className="block text-xs text-gray-400 mb-1">Auto-Resume after Manual Pause</label>
                 <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min="0"
                        step="1"
                        value={config.autoResumeMinutes}
                        onChange={(e) => onChange({ ...config, autoResumeMinutes: Math.max(0, parseInt(e.target.value) || 0) })}
                        disabled={disabled}
                        className="w-20 bg-gray-950 border border-gray-700 text-white rounded px-3 py-2 focus:border-brand-500 focus:outline-none disabled:opacity-50 text-center"
                    />
                    <span className="text-sm text-gray-400">minutes</span>
                 </div>
                 <p className="text-[10px] text-gray-500 mt-2">
                    Set to <strong>0</strong> to disable. If set to &lt; 0, clicking "Pause" will start a countdown to auto-resume.
                 </p>
            </div>
        </div>
      </div>
    </div>
  );
};
