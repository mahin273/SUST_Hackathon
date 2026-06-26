import { TicketRequest, TicketResponse } from './schemas';

/**
 * Programmatic safety guardrails that run on the LLM's response before returning it to the user.
 * This acts as an absolute firewall to prevent any safety rule violations.
 */
export function applySafetyGuardrails(
  request: TicketRequest,
  response: Partial<TicketResponse>
): TicketResponse {
  // 1. Initialize and echo back ticket_id
  const ticketId = request.ticket_id;
  
  // Set defaults for missing fields
  let relevantTxnId = response.relevant_transaction_id !== undefined ? response.relevant_transaction_id : null;
  let evidenceVerdict = response.evidence_verdict || 'insufficient_data';
  let caseType = response.case_type || 'other';
  let severity = response.severity || 'low';
  let department = response.department || 'customer_support';
  let agentSummary = response.agent_summary || 'Customer ticket requires review.';
  let recommendedNextAction = response.recommended_next_action || 'Review the ticket and transaction details.';
  let customerReply = response.customer_reply || 'Thank you for contacting us. We are reviewing your request.';
  let humanReviewRequired = response.human_review_required !== undefined ? response.human_review_required : true;
  const confidence = response.confidence !== undefined ? response.confidence : 0.5;
  const reasonCodes = response.reason_codes || [];

  // Determine the response language (based on requested language or complaint text)
  const isBangla = request.language === 'bn' || 
                   /[\u0980-\u09FF]/.test(request.complaint) || 
                   /[\u0980-\u09FF]/.test(customerReply);

  // 2. Safety Rule 1: Never ask the customer for credentials (PIN, OTP, password, card numbers)
  // Scan for dangerous keywords in the customer reply
  const credentialPatterns = [
    /\b(otp|pin|password|passcode|cvv|card\s*number|card\s*no|sensitive\s*details|verification\s*code)\b/i,
    /(ওটিপি|পিন|পাসওয়ার্ড|পাসওয়ার্ড|সিভিভি|কার্ড নাম্বার|কার্ড নম্বর|সিকিউরিটি কোড)/
  ];

  // If the reply contains credential terms, we need to inspect if it is requesting them.
  // To be safe, if it asks a question or instructs the user to give/share them, we sanitize it.
  const containsCredentialWord = credentialPatterns.some(pattern => pattern.test(customerReply));
  
  if (containsCredentialWord) {
    // Check if the credential term is NOT part of a safety warning (like "do not share", "never ask")
    const isWarning = /do\s+not\s+share|never\s+ask|safe|protection|অনুগ্রহ\s+করে\s+কারো\s+সাথে\s+শেয়ার\s+করবেন\s+না/i.test(customerReply);
    
    // If it's not explicitly a warning, or if it looks like a request (contains "please", "enter", "share", "give", "what is"), sanitize it.
    if (!isWarning || /share\s+your|give\s+us|enter\s+your|provide|tell\s+us|শেয়ার\s+করুন|দিন|বলুন|পাঠান/i.test(customerReply)) {
      if (isBangla) {
        customerReply = "আমরা আপনার সমস্যাটি খতিয়ে দেখছি। নিরাপত্তা স্বার্থে, অনুগ্রহ করে আপনার পিন বা ওটিপি কারো সাথে শেয়ার করবেন না।";
      } else {
        customerReply = "We are currently investigating your issue. For your security, please do not share your PIN, OTP, or password with anyone.";
      }
      humanReviewRequired = true;
      severity = 'critical';
      if (!reasonCodes.includes('credential_request_sanitized')) {
        reasonCodes.push('credential_request_sanitized');
      }
    }
  }

  // Ensure a safety warning is ALWAYS present in the customer reply
  const hasSafetyWarning = /do\s+not\s+share\s+(your\s+)?(pin|otp)|পিন\s+বা\s+ওটিপি\s+শেয়ার\s+করবেন\s+না/i.test(customerReply);
  if (!hasSafetyWarning) {
    if (isBangla) {
      customerReply += " অনুগ্রহ করে কারো সাথে আপনার পিন (PIN) বা ওটিপি (OTP) শেয়ার করবেন না।";
    } else {
      customerReply += " Please do not share your PIN or OTP with anyone.";
    }
  }

  // 3. Safety Rule 2: Never confirm a refund, reversal, account unblock, or recovery without authority
  // Scan for confirmation phrases in customer_reply and recommended_next_action
  const refundConfirmPatterns = [
    /\b(will\s+refund|refunded|processed\s+your\s+refund|reversal\s+is\s+done|reversal\s+is\s+successful|reversed|account\s+unblocked|restored|unblock\s+your\s+account)\b/i,
    /(রিফান্ড\s+করা\s+হয়েছে|রিফান্ড\s+করে\s+দিব|রিফান্ড\s+দেওয়া\s+হলো|টাকা\s+ফেরত\s+দেওয়া\s+হয়েছে|আনব্লক\s+করা\s+হয়েছে|অ্যাকাউন্ট\s+সচল\s+করা\s+হয়েছে)/
  ];

  // Process customer_reply
  let refundConfirmFoundInReply = refundConfirmPatterns.some(pattern => pattern.test(customerReply));
  if (refundConfirmFoundInReply) {
    if (isBangla) {
      customerReply = customerReply.replace(
        /(রিফান্ড\s+করা\s+হয়েছে|রিফান্ড\s+করে\s+দিব|রিফান্ড\s+দেওয়া\s+হলো|টাকা\s+ফেরত\s+দেওয়া\s+হয়েছে|আমরা\s+ফেরত\s+দিব)/g,
        "যেকোনো যোগ্য পরিমাণ অর্থ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে"
      );
    } else {
      customerReply = customerReply.replace(
        /\b(will\s+refund\s+you|refunded\s+your\s+money|reversal\s+is\s+done|refund\s+has\s+been\s+processed|we\s+will\s+refund)\b/gi,
        "any eligible amount will be returned through official channels"
      );
    }
    if (!reasonCodes.includes('refund_confirmation_sanitized')) {
      reasonCodes.push('refund_confirmation_sanitized');
    }
  }

  // Process recommended_next_action
  let refundConfirmFoundInAction = refundConfirmPatterns.some(pattern => pattern.test(recommendedNextAction));
  if (refundConfirmFoundInAction) {
    recommendedNextAction = recommendedNextAction.replace(
      /\b(refund\s+the\s+customer|reverse\s+transaction|unblock\s+account)\b/gi,
      "initiate verification workflow per policy before routing for official reversal/unblock"
    );
  }

  // 4. Safety Rule 3: Never instruct the customer to contact a suspicious third party
  // Strip any phone numbers or links from the reply that are not official channels
  const phoneOrLinkPattern = /(\+?880\d{10}|\b01[3-9]\d{8}\b|https?:\/\/[^\s]+)/gi;
  if (phoneOrLinkPattern.test(customerReply)) {
    customerReply = customerReply.replace(phoneOrLinkPattern, "our official support channels");
    if (!reasonCodes.includes('third_party_redacted')) {
      reasonCodes.push('third_party_redacted');
    }
  }

  // 5. Taxonomy & Routing Overrides (Ensure correct routing based on case_type)
  if (caseType === 'phishing_or_social_engineering') {
    department = 'fraud_risk';
    severity = 'critical';
    humanReviewRequired = true;
  } else if (caseType === 'wrong_transfer') {
    department = 'dispute_resolution';
    severity = severity === 'low' ? 'medium' : severity; // Wrong transfer is at least medium/high
    humanReviewRequired = true; // disputes always require human review
  } else if (caseType === 'payment_failed') {
    department = 'payments_ops';
  } else if (caseType === 'duplicate_payment') {
    department = 'payments_ops';
    humanReviewRequired = true;
  } else if (caseType === 'merchant_settlement_delay') {
    department = 'merchant_operations';
  } else if (caseType === 'agent_cash_in_issue') {
    department = 'agent_operations';
    humanReviewRequired = true;
  }

  // Force human review on inconsistent transaction records or safety escalations
  if (evidenceVerdict === 'inconsistent') {
    humanReviewRequired = true;
  }

  // Return the fully sanitized and validated response
  return {
    ticket_id: ticketId,
    relevant_transaction_id: relevantTxnId,
    evidence_verdict: evidenceVerdict,
    case_type: caseType,
    severity: severity,
    department: department,
    agent_summary: agentSummary,
    recommended_next_action: recommendedNextAction,
    customer_reply: customerReply,
    human_review_required: humanReviewRequired,
    confidence: confidence,
    reason_codes: reasonCodes
  };
}
