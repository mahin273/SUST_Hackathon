import { GoogleGenAI } from '@google/genai';
import { config } from './config';
import { TicketRequest, TicketResponse } from './schemas';
import { SYSTEM_PROMPT } from './prompts';

// Initialize the Google Gen AI client with the configured API key
const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

/**
 * Wraps a promise with a timeout. If the promise does not resolve within the specified timeout,
 * it rejects with a timeout error.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
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
export async function analyzeTicketWithLLM(
  ticket: TicketRequest
): Promise<Partial<TicketResponse>> {
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

  try {
    const apiCall = ai.models.generateContent({
      model: config.geminiModel,
      contents: userMessage,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        // Enforce structured JSON mode at the API level
        responseMimeType: 'application/json',
      },
    });

    const response = await withTimeout(apiCall, TIMEOUT_MS);
    const text = response.text;

    if (!text) {
      throw new Error('Gemini API returned an empty text field.');
    }

    // Parse the JSON string from Gemini
    const resultJson = JSON.parse(text);
    return resultJson;
  } catch (error) {
    console.error(`Error during Gemini analysis for Ticket ${ticket.ticket_id}:`, error);
    throw error;
  }
}
