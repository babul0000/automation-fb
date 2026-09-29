import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();
// Fallback check to ensure .env is resolved if executed from subdirectories
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  PAGE_ID: string;
  PAGE_ACCESS_TOKEN: string;
  VERIFY_TOKEN: string;
  GEMINI_API_KEY: string;
  CRON_SCHEDULE: string;
}

const parsePort = (val: string | undefined, defaultPort: number = 3000): number => {
  if (!val) return defaultPort;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? defaultPort : parsed;
};

export const env: EnvConfig = {
  get PORT(): number {
    return parsePort(process.env.PORT, 3000);
  },
  get NODE_ENV(): string {
    return process.env.NODE_ENV || 'development';
  },
  get PAGE_ID(): string {
    return (process.env.PAGE_ID || '').trim();
  },
  get PAGE_ACCESS_TOKEN(): string {
    return (process.env.PAGE_ACCESS_TOKEN || '').trim();
  },
  get VERIFY_TOKEN(): string {
    return (process.env.VERIFY_TOKEN || 'bytebangla_verify_token').trim();
  },
  get GEMINI_API_KEY(): string {
    return (process.env.GEMINI_API_KEY || '').trim();
  },
  get CRON_SCHEDULE(): string {
    return (process.env.CRON_SCHEDULE || '30 9 * * *').trim();
  },
};

/**
 * Checks if a config key has a dummy or placeholder value
 */
const isPlaceholder = (value: string): boolean => {
  return !value || value.startsWith('your_') || value.includes('placeholder');
};

/**
 * Validates critical environment variables and prints actionable warnings or throws.
 */
export const validateEnv = (strict: boolean = false): { isValid: boolean; missing: string[] } => {
  const missing: string[] = [];

  if (isPlaceholder(env.PAGE_ID)) missing.push('PAGE_ID');
  if (isPlaceholder(env.PAGE_ACCESS_TOKEN)) missing.push('PAGE_ACCESS_TOKEN');
  if (isPlaceholder(env.VERIFY_TOKEN)) missing.push('VERIFY_TOKEN');
  if (isPlaceholder(env.GEMINI_API_KEY)) missing.push('GEMINI_API_KEY');

  if (missing.length > 0) {
    const message = `[Config Warning] The following environment variables are missing or using placeholder values: ${missing.join(', ')}. Please update your .env file.`;
    if (strict && env.NODE_ENV === 'production') {
      throw new Error(`[Fatal Config Error] ${message}`);
    } else {
      console.warn(`\x1b[33m${message}\x1b[0m`);
    }
    return { isValid: false, missing };
  }

  return { isValid: true, missing: [] };
};

export const isConfiguredForGemini = (): boolean => {
  return !isPlaceholder(env.GEMINI_API_KEY);
};

export const isConfiguredForFacebook = (): boolean => {
  return !isPlaceholder(env.PAGE_ID) && !isPlaceholder(env.PAGE_ACCESS_TOKEN);
};
