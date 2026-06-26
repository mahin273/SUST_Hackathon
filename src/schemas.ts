import { z } from 'zod';

export const TransactionSchema = z.object({
  transaction_id: z.string(),
  timestamp: z.string(),
  type: z.enum(['transfer', 'payment', 'cash_in', 'cash_out', 'settlement', 'refund']),
  amount: z.number(),
  counterparty: z.string(),
  status: z.enum(['completed', 'failed', 'pending', 'reversed'])
});

export const RequestSchema = z.object({
  ticket_id: z.string(),
  complaint: z.string(),
  language: z.enum(['en', 'bn', 'mixed']).optional(),
  channel: z.enum(['in_app_chat', 'call_center', 'email', 'merchant_portal', 'field_agent']).optional(),
  user_type: z.enum(['customer', 'merchant', 'agent', 'unknown']).optional(),
  campaign_context: z.string().optional(),
  transaction_history: z.array(TransactionSchema).optional().default([]),
  metadata: z.record(z.any()).optional()
});

export const ResponseSchema = z.object({
  ticket_id: z.string(),
  relevant_transaction_id: z.string().nullable(),
  evidence_verdict: z.enum(['consistent', 'inconsistent', 'insufficient_data']),
  case_type: z.enum([
    'wrong_transfer',
    'payment_failed',
    'refund_request',
    'duplicate_payment',
    'merchant_settlement_delay',
    'agent_cash_in_issue',
    'phishing_or_social_engineering',
    'other'
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  department: z.enum([
    'customer_support',
    'dispute_resolution',
    'payments_ops',
    'merchant_operations',
    'agent_operations',
    'fraud_risk'
  ]),
  agent_summary: z.string(),
  recommended_next_action: z.string(),
  customer_reply: z.string(),
  human_review_required: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
  reason_codes: z.array(z.string()).optional()
});

export type Transaction = z.infer<typeof TransactionSchema>;
export type TicketRequest = z.infer<typeof RequestSchema>;
export type TicketResponse = z.infer<typeof ResponseSchema>;
