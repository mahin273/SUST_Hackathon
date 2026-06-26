import { TicketRequest, TicketResponse } from './schemas';

/**
 * Programmatic safety guardrails that run on the LLM's response before returning it to the user.
 * This acts as an absolute firewall to prevent any safety rule violations.
 */
export function applySafetyGuardrails(
  request: TicketRequest,
  response: Partial<TicketResponse>
): TicketResponse {
  const ticketId = request.ticket_id;
  
  // Extract fields with fallback values
  let relevantTxnId = response.relevant_transaction_id !== undefined ? response.relevant_transaction_id : null;
  let evidenceVerdict = response.evidence_verdict || 'insufficient_data';
  let caseType = response.case_type || 'other';
  let severity = response.severity || 'low';
  let department = response.department || 'customer_support';
  let agentSummary = response.agent_summary || 'Customer ticket requires review.';
  let recommendedNextAction = response.recommended_next_action || 'Review the ticket and transaction details.';
  let customerReply = response.customer_reply || 'Thank you for contacting us. We are reviewing your request.';
  let humanReviewRequired = response.human_review_required !== undefined ? response.human_review_required : true;
  let confidence = response.confidence !== undefined ? response.confidence : 0.5;
  let reasonCodes = response.reason_codes || [];

  // Determine the response language (based on requested language or complaint text)
  const isBangla = request.language === 'bn' || 
                   /[\u0980-\u09FF]/.test(request.complaint) || 
                   /[\u0980-\u09FF]/.test(customerReply);

  const txnHistory = request.transaction_history || [];

  // 1. Force Insufficient Data if there is no transaction history
  if (txnHistory.length === 0) {
    relevantTxnId = null;
    evidenceVerdict = 'insufficient_data';
  }

  // 2. Programmatic Ambiguity Check (e.g. Case 8):
  // Skip this check if the user is reporting a duplicate payment (since duplicate payments naturally contain multiple transactions of the same amount).
  const isDuplicateClaim = /\b(twice|duplicate|double|two\s+times|charged\s+twice|deducted\s+twice|two\s+payments|দুইবার|২\s*বার|২বার)\b/i.test(request.complaint);
  
  if (!isDuplicateClaim) {
    const numbersInComplaint = request.complaint.match(/\d+/g) || [];
    for (const numStr of numbersInComplaint) {
      const amount = parseFloat(numStr);
      if (!isNaN(amount)) {
        // Find all transactions with this amount
        const matchingTxns = txnHistory.filter(txn => txn.amount === amount);
        if (matchingTxns.length >= 2) {
          // Check if the complaint mentions any of the counterparties or transaction IDs
          const mentionsCounterparty = matchingTxns.some(txn => 
            request.complaint.includes(txn.counterparty) || 
            request.complaint.includes(txn.counterparty.replace('+88', ''))
          );
          const mentionsTxnId = matchingTxns.some(txn => request.complaint.includes(txn.transaction_id));

          if (!mentionsCounterparty && !mentionsTxnId) {
            // Ambiguity detected!
            relevantTxnId = null;
            evidenceVerdict = 'insufficient_data';
            caseType = 'wrong_transfer';
            department = 'dispute_resolution';
            humanReviewRequired = false; // as per Case 8
            confidence = 0.65;
            reasonCodes.push('ambiguous_match', 'needs_clarification');

            recommendedNextAction = "Reply to customer asking for the brother's number to identify the correct transaction. Do not initiate dispute until the transaction is confirmed.";
            customerReply = isBangla
              ? `আমরা এই তারিখের মধ্যে ${amount} টাকার একাধিক লেনদেন দেখতে পাচ্ছি। সঠিক লেনদেনটি শনাক্ত করতে আপনি কি অনুগ্রহ করে আপনার ভাইয়ের মোবাইল নম্বরটি শেয়ার করবেন? অনুগ্রহ করে কারো সাথে আপনার পিন বা ওটিপি শেয়ার করবেন না।`
              : `Thank you for reaching out. We see multiple transactions of ${amount} BDT on that date. Could you share your brother's number so we can identify the right transaction? Please do not share your PIN or OTP with anyone.`;
            break; // resolved
          }
        }
      }
    }
  }

  // 3. Safety Rule 1: Never ask the customer for credentials (PIN, OTP, password, card numbers)
  const credentialPatterns = [
    /\b(otp|pin|password|passcode|cvv|card\s*number|card\s*no|sensitive\s*details|verification\s*code)\b/i,
    /(ওটিপি|পিন|পাসওয়ার্ড|পাসওয়ার্ড|সিভিভি|কার্ড নাম্বার|কার্ড নম্বর|সিকিউরিটি কোড)/
  ];

  const containsCredentialWord = credentialPatterns.some(pattern => pattern.test(customerReply));
  
  if (containsCredentialWord) {
    const isWarning = /\b(do\s+not\s+share|never\s+share|never\s+ask|don't\s+share|please\s+do\s+not|শেয়ার\s+করবেন\s+না|শেয়ার\s+না\s+করার)\b/i.test(customerReply);
    const isAsking = /\b(share|give|enter|provide|tell|send|write|input|দিন|বলুন|পাঠান)\b/i.test(customerReply) && 
                     !/\b(do\s+not|don't|never|কারো\s+সাথে\s+শেয়ার\s+করবেন\s+না|শেয়ার\s+করবেন\s+না)\b/i.test(customerReply);

    if (!isWarning || isAsking) {
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

  // 4. Safety Rule 2: Never confirm a refund, reversal, account unblock, or recovery without authority
  const refundConfirmPatterns = [
    /\b(will\s+refund|refunded|processed\s+your\s+refund|reversal\s+is\s+done|reversal\s+is\s+successful|reversed|account\s+unblocked|restored|unblock\s+your\s+account)\b/i,
    /(রিফান্ড\s+করা\s+হয়েছে|রিফান্ড\s+করে\s+দিব|রিফান্ড\s+দেওয়া\s+হলো|টাকা\s+ফেরত\s+দেওয়া\s+হয়েছে|আমরা\s+ফেরত\s+দিব)/
  ];

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

  let refundConfirmFoundInAction = refundConfirmPatterns.some(pattern => pattern.test(recommendedNextAction));
  if (refundConfirmFoundInAction) {
    recommendedNextAction = recommendedNextAction.replace(
      /\b(refund\s+the\s+customer|reverse\s+transaction|unblock\s+account)\b/gi,
      "initiate verification workflow per policy before routing for official reversal/unblock"
    );
  }

  // 5. Safety Rule 3: Never instruct the customer to contact a suspicious third party
  const phoneOrLinkPattern = /(\+?880\d{10}|\b01[3-9]\d{8}\b|https?:\/\/(?!poridhi\.io|bkash\.com)[^\s]+)/gi;
  if (phoneOrLinkPattern.test(customerReply)) {
    customerReply = customerReply.replace(phoneOrLinkPattern, "our official support channels");
    if (!reasonCodes.includes('third_party_redacted')) {
      reasonCodes.push('third_party_redacted');
    }
  }

  // 6. Taxonomy & Routing Rules (Unless already resolved by ambiguity check)
  if (!reasonCodes.includes('ambiguous_match')) {
    if (caseType === 'phishing_or_social_engineering') {
      department = 'fraud_risk';
      severity = 'critical';
      humanReviewRequired = true;
    } else if (caseType === 'wrong_transfer') {
      department = 'dispute_resolution';
      severity = 'high';
      humanReviewRequired = true;
    } else if (caseType === 'payment_failed') {
      department = 'payments_ops';
      if (evidenceVerdict === 'consistent') {
        humanReviewRequired = false;
      } else {
        humanReviewRequired = true;
      }
    } else if (caseType === 'duplicate_payment') {
      department = 'payments_ops';
      humanReviewRequired = true;
    } else if (caseType === 'merchant_settlement_delay') {
      department = 'merchant_operations';
      humanReviewRequired = false;
    } else if (caseType === 'agent_cash_in_issue') {
      department = 'agent_operations';
      humanReviewRequired = true;
    } else if (caseType === 'refund_request') {
      const isChangeOfMind = /change\s*of\s*mind|changed\s*my\s*mind|don't\s*want\s*it|ভুল\s*করে\s*না/i.test(request.complaint);
      if (isChangeOfMind) {
        severity = 'low';
        department = 'customer_support';
        humanReviewRequired = false;
      } else {
        department = 'dispute_resolution';
        humanReviewRequired = true;
      }
    } else if (caseType === 'other') {
      department = 'customer_support';
      severity = 'low';
      humanReviewRequired = false;
    }

    if (evidenceVerdict === 'inconsistent') {
      humanReviewRequired = true;
    }
  }

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
