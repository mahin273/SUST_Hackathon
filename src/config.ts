import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  geminiApiKeys: (process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
};

// Check for missing API Key to alert the developer early
if (config.geminiApiKeys.length === 0) {
  console.warn(
    'WARNING: GEMINI_API_KEY is not defined in your environment. API calls to Gemini will fail unless it is set.'
  );
}
