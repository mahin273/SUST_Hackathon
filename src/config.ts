import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
};

// Check for missing API Key to alert the developer early
if (!config.geminiApiKey) {
  console.warn(
    'WARNING: GEMINI_API_KEY is not defined in your environment. API calls to Gemini will fail unless it is set.'
  );
}
