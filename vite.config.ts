import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env vars from .env files
  const env = loadEnv(mode, (process as any).cwd(), '');

  // Prioritize process.env (Vercel), then .env file, then HARDCODED fallback
  const apiKey = process.env.API_KEY || env.API_KEY || "AIzaSyDcYjKunrE-ID2qKI6Dgw7IIMeN5vOmmLA";

  return {
    plugins: [react()],
    define: {
      // Define the global variable replacement
      'process.env.API_KEY': JSON.stringify(apiKey),
    }
  };
});