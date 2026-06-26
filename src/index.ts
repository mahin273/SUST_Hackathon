import express from 'express';
import cors from 'cors';
import { config } from './config';
import { RequestSchema, ResponseSchema, TicketResponse } from './schemas';
import { analyzeTicketWithLLM } from './llmClient';
import { applySafetyGuardrails } from './safetyGuardrails';

const app = express();
const PORT = config.port;

app.use(cors());
app.use(express.json());

// GET /health - Readiness endpoint for the judge harness
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// POST /analyze-ticket - Main investigator endpoint
app.post('/analyze-ticket', async (req, res) => {
  try {
    // 1. Validate the incoming request body using Zod
    const requestParseResult = RequestSchema.safeParse(req.body);
    
    if (!requestParseResult.success) {
      // Return 400 Bad Request with non-sensitive validation details
      return res.status(400).json({
        error: 'Malformed input',
        details: requestParseResult.error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
      });
    }

    const ticket = requestParseResult.data;

    // Reject empty complaint if semantically invalid (422 Unprocessable Entity)
    if (!ticket.complaint.trim()) {
      return res.status(422).json({
        error: 'Semantic validation failed',
        details: 'Complaint text cannot be empty'
      });
    }

    // 2. Query the LLM for ticket analysis (within a 25s timeout)
    let llmResult;
    try {
      llmResult = await analyzeTicketWithLLM(ticket);
    } catch (llmError) {
      console.error(`LLM invocation failed for Ticket ${ticket.ticket_id}:`, llmError);
      
      // Return a safe 500 error if the external LLM is down
      return res.status(500).json({
        error: 'Internal service error',
        details: 'Analysis engine failed to respond. Please try again.'
      });
    }

    // 3. Apply programmatic safety rules and routing overrides
    const sanitizedResponse = applySafetyGuardrails(ticket, llmResult);

    // 4. Validate output schema before sending it back
    const responseParseResult = ResponseSchema.safeParse(sanitizedResponse);

    if (!responseParseResult.success) {
      console.error('Sanitized response failed output schema validation:', responseParseResult.error);
      
      // Fallback: If output validation fails, construct a safe, compliant fallback response
      const isBangla = ticket.language === 'bn' || /[\u0980-\u09FF]/.test(ticket.complaint);
      const fallbackReply = isBangla
        ? "আমরা আপনার অভিযোগটি পেয়েছি। আমাদের প্রতিনিধি এটি পর্যালোচনা করে অফিসিয়াল চ্যানেলে আপনার সাথে যোগাযোগ করবেন। অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।"
        : "We have received your ticket. Our support team will review it and contact you via official channels. Please do not share your PIN or OTP with anyone.";

      const fallbackResponse: TicketResponse = {
        ticket_id: ticket.ticket_id,
        relevant_transaction_id: null,
        evidence_verdict: 'insufficient_data',
        case_type: 'other',
        severity: 'medium',
        department: 'customer_support',
        agent_summary: 'Ticket details failed output schema validation. Routed to support.',
        recommended_next_action: 'Manually inspect ticket details and contact customer.',
        customer_reply: fallbackReply,
        human_review_required: true,
        confidence: 0.1,
        reason_codes: ['schema_validation_failure_fallback']
      };

      return res.status(200).json(fallbackResponse);
    }

    // Return the successful, compliant response
    return res.status(200).json(responseParseResult.data);

  } catch (error) {
    // General error handler to ensure server doesn't crash on unhandled exceptions
    console.error('Unhandled request exception:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: 'An unexpected error occurred during processing.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

export default app;
