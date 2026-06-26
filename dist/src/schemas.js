"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseSchema = exports.RequestSchema = exports.TransactionSchema = void 0;
const zod_1 = require("zod");
exports.TransactionSchema = zod_1.z.object({
    transaction_id: zod_1.z.string(),
    timestamp: zod_1.z.string(),
    type: zod_1.z.enum(['transfer', 'payment', 'cash_in', 'cash_out', 'settlement', 'refund']),
    amount: zod_1.z.number(),
    counterparty: zod_1.z.string(),
    status: zod_1.z.enum(['completed', 'failed', 'pending', 'reversed'])
});
exports.RequestSchema = zod_1.z.object({
    ticket_id: zod_1.z.string(),
    complaint: zod_1.z.string(),
    language: zod_1.z.enum(['en', 'bn', 'mixed']).optional(),
    channel: zod_1.z.enum(['in_app_chat', 'call_center', 'email', 'merchant_portal', 'field_agent']).optional(),
    user_type: zod_1.z.enum(['customer', 'merchant', 'agent', 'unknown']).optional(),
    campaign_context: zod_1.z.string().optional(),
    transaction_history: zod_1.z.array(exports.TransactionSchema).optional().default([]),
    metadata: zod_1.z.record(zod_1.z.any()).optional()
});
exports.ResponseSchema = zod_1.z.object({
    ticket_id: zod_1.z.string(),
    relevant_transaction_id: zod_1.z.string().nullable(),
    evidence_verdict: zod_1.z.enum(['consistent', 'inconsistent', 'insufficient_data']),
    case_type: zod_1.z.enum([
        'wrong_transfer',
        'payment_failed',
        'refund_request',
        'duplicate_payment',
        'merchant_settlement_delay',
        'agent_cash_in_issue',
        'phishing_or_social_engineering',
        'other'
    ]),
    severity: zod_1.z.enum(['low', 'medium', 'high', 'critical']),
    department: zod_1.z.enum([
        'customer_support',
        'dispute_resolution',
        'payments_ops',
        'merchant_operations',
        'agent_operations',
        'fraud_risk'
    ]),
    agent_summary: zod_1.z.string(),
    recommended_next_action: zod_1.z.string(),
    customer_reply: zod_1.z.string(),
    human_review_required: zod_1.z.boolean(),
    confidence: zod_1.z.number().min(0).max(1).optional(),
    reason_codes: zod_1.z.array(zod_1.z.string()).optional()
});
