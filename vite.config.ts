import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Ensure Vite loads environment variables from the appropriate .env files
  loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
  };
});