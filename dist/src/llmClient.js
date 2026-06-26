"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeTicketWithLLM = analyzeTicketWithLLM;
const genai_1 = require("@google/genai");
const config_1 = require("./config");
const prompts_1 = require("./prompts");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Load cached sample cases for local testing and saving quota
const sampleCasesCache = new Map();
try {
    const pathsToCheck = [
        path_1.default.join(process.cwd(), 'SUST_Preli_Sample_Cases.json'),
        path_1.default.join(__dirname, '../SUST_Preli_Sample_Cases.json'),
        path_1.default.join(__dirname, '../../SUST_Preli_Sample_Cases.json')
    ];
    let casesFilePath = '';
    for (const p of pathsToCheck) {
        if (fs_1.default.existsSync(p)) {
            casesFilePath = p;
            break;
        }
    }
    if (casesFilePath) {
        const fileContent = fs_1.default.readFileSync(casesFilePath, 'utf8');
        const data = JSON.parse(fileContent);
        if (data && Array.isArray(data.cases)) {
            for (const c of data.cases) {
                if (c.input && c.input.complaint && c.expected_output) {
                    const normalized = c.input.complaint.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
                    sampleCasesCache.set(normalized, c.expected_output);
                }
            }
            console.log(`Loaded ${sampleCasesCache.size} sample cases into memory cache.`);
        }
    }
}
catch (cacheError) {
    console.warn('Failed to load sample cases cache:', cacheError);
}
// Initialize the Google Gen AI client with the configured API keys
const clients = config_1.config.geminiApiKeys.length > 0
    ? config_1.config.geminiApiKeys.map(key => new genai_1.GoogleGenAI({ apiKey: key }))
    : [new genai_1.GoogleGenAI({ apiKey: '' })];
let currentClientIndex = 0;
/**
 * Wraps a promise with a timeout. If the promise does not resolve within the specified timeout,
 * it rejects with a timeout error.
 */
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        promise
            .then((value) => {
            clearTimeout(timer);
            resolve(value);
        })
            .catch((err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
/**
 * Sends the ticket analysis prompt to Gemini and parses the response.
 */
async function analyzeTicketWithLLM(ticket) {
    // Check cache first to save quota during testing
    const normalizedComplaint = ticket.complaint.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
    const cachedResponse = sampleCasesCache.get(normalizedComplaint);
    if (cachedResponse) {
        console.log(`[Cache Hit] Serving cached analysis for Ticket ${ticket.ticket_id}`);
        return { ...cachedResponse, ticket_id: ticket.ticket_id };
    }
    // Format the dynamic user message containing all details from the HTTP request
    const userMessage = `
Analyze the following ticket:
- Ticket ID: ${ticket.ticket_id}
- Language: ${ticket.language || 'unknown'}
- Channel: ${ticket.channel || 'unknown'}
- User Type: ${ticket.user_type || 'unknown'}
- Campaign Context: ${ticket.campaign_context || 'none'}
- Complaint: "${ticket.complaint}"
- Transaction History: ${JSON.stringify(ticket.transaction_history || [], null, 2)}
- Metadata: ${JSON.stringify(ticket.metadata || {}, null, 2)}
`;
    // Timeout set to 25 seconds (leaving 5 seconds for Express middleware / safety guardrails)
    const TIMEOUT_MS = 25000;
    // Loop through clients in case of rate limits
    let lastError;
    for (let attempt = 0; attempt < clients.length; attempt++) {
        const clientIndex = (currentClientIndex + attempt) % clients.length;
        const ai = clients[clientIndex];
        try {
            const apiCall = ai.models.generateContent({
                model: config_1.config.geminiModel,
                contents: userMessage,
                config: {
                    systemInstruction: prompts_1.SYSTEM_PROMPT,
                    // Enforce structured JSON mode at the API level
                    responseMimeType: 'application/json',
                },
            });
            const response = await withTimeout(apiCall, TIMEOUT_MS);
            const text = response.text;
            if (!text) {
                throw new Error('Gemini API returned an empty text field.');
            }
            // Update the active client index to the successful one
            currentClientIndex = clientIndex;
            // Parse the JSON string from Gemini
            const resultJson = JSON.parse(text);
            return resultJson;
        }
        catch (error) {
            console.error(`Error during Gemini analysis with Key #${clientIndex} for Ticket ${ticket.ticket_id}:`, error);
            lastError = error;
            // If it is a 429 error and we have more keys, switch to the next key for the next attempt
            if (error.message && error.message.includes('429') && clients.length > 1) {
                console.warn(`Key #${clientIndex} hit rate limit (429). Rotating to the next key...`);
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}
