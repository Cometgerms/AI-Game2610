import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sandboxBridge } from './src/server/bridge';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return { plugins: [react(), sandboxBridge({ supabaseUrl: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY, dataPath: env.GAME_DATA_PATH,
    ai: { key: env.OPENAI_API_KEY, model: env.MODEL_NAME, roomBudget: Number(env.AI_SESSION_BUDGET_USD) || 1, projectBudget: Math.min(10, Number(env.AI_PROJECT_BUDGET_USD) || 10) }
  })], server: { host: '0.0.0.0', port: 5173, strictPort: true } };
});
