import { registerAs } from '@nestjs/config';

export interface AiConfig {
  enabled: boolean;
  googleApiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxToolRounds: number;
}

export const AI_CONFIG_KEY = 'ai';

export default registerAs(AI_CONFIG_KEY, (): AiConfig => ({
  enabled: (process.env.AI_ENABLED ?? 'true') !== 'false',
  googleApiKey: process.env.GOOGLE_API_KEY ?? '',
  model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  temperature: parseFloat(process.env.AI_TEMPERATURE ?? '0.1'),
  timeoutMs: parseInt(process.env.AI_TIMEOUT_MS ?? '25000', 10),
  maxToolRounds: parseInt(process.env.AI_MAX_TOOL_ROUNDS ?? '4', 10),
}));
