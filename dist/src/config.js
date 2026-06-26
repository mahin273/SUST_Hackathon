"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables from .env file
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || '8000', 10),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
};
// Check for missing API Key to alert the developer early
if (!exports.config.geminiApiKey) {
    console.warn('WARNING: GEMINI_API_KEY is not defined in your environment. API calls to Gemini will fail unless it is set.');
}
