import { SavedSession, AppState, RateLimitConfig } from '../types';

const STORAGE_KEY = 'orchestrator_history_v1';

export const saveSession = (state: AppState, query: string, config: RateLimitConfig): SavedSession => {
  const sessions = getSessions();
  
  // Create a preview name from query
  const id = `session-${Date.now()}`;
  
  const newSession: SavedSession = {
    id,
    timestamp: Date.now(),
    query,
    config,
    state
  };

  // Prepend to list, keep max 10 to avoid storage limits
  const updatedSessions = [newSession, ...sessions].slice(0, 10);
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSessions));
  return newSession;
};

export const getSessions = (): SavedSession[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load history", e);
    return [];
  }
};

export const deleteSession = (id: string): SavedSession[] => {
  const sessions = getSessions().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  return sessions;
};
