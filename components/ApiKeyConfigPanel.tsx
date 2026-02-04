import React, { useState, useEffect } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  apiKeys: string[];
  onSave: (keys: string[]) => void;
}

export const ApiKeyConfigPanel: React.FC<Props> = ({ isOpen, onClose, apiKeys, onSave }) => {
  const [keys, setKeys] = useState<string[]>(['', '', '', '', '']);

  useEffect(() => {
    if (isOpen) {
      // Pad with empty strings up to 5
      const current = [...apiKeys];
      while (current.length < 5) current.push('');
      setKeys(current.slice(0, 5));
    }
  }, [isOpen, apiKeys]);

  const handleChange = (index: number, value: string) => {
    const newKeys = [...keys];
    newKeys[index] = value;
    setKeys(newKeys);
  };

  const handleSave = () => {
    const validKeys = keys.map(k => k.trim()).filter(k => k.length > 0);
    onSave(validKeys);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-800 bg-gray-950 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🔑</span> API Key Management
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-400 mb-4">
            Add up to 5 Google Gemini API keys. If a key exhausts its quota (Error 429), the system will automatically switch to the next available key.
          </p>
          
          <div className="space-y-3">
            {keys.map((key, index) => (
              <div key={index} className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-gray-500 font-mono">
                  {index + 1}
                </span>
                <input
                  type="password"
                  value={key}
                  onChange={(e) => handleChange(index, e.target.value)}
                  placeholder={`API Key ${index + 1}`}
                  className="w-full bg-gray-950 border border-gray-700 rounded pl-8 pr-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none placeholder-gray-800 font-mono"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-gray-800 bg-gray-950 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded font-bold transition-colors shadow-lg shadow-brand-900/20"
          >
            Save Keys
          </button>
        </div>
      </div>
    </div>
  );
};
