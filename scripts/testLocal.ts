import fs from 'fs';
import path from 'path';

// Local server config
const SERVER_URL = 'http://localhost:8000';
const ANALYZE_URL = `${SERVER_URL}/analyze-ticket`;
const HEALTH_URL = `${SERVER_URL}/health`;

// Path to the public cases file
const CASES_FILE = path.join(__dirname, '../SUST_Preli_Sample_Cases.json');

interface TestCase {
  id: string;
  label: string;
  input: any;
  expected_output: any;
  rationale: string;
}

/**
 * Checks if the customer reply violates any safety guidelines.
 */
function verifySafety(reply: string, nextAction: string): { safe: boolean; reason?: string } {
  // Rule 1: Never ask for credentials
  const credentialPatterns = [
    /\b(otp|pin|password|passcode|cvv|card\s*number|card\s*no)\b/i,
    /(ওটিপি|পিন|পাসওয়ার্ড|পাসওয়ার্ড|সিভিভি|কার্ড নাম্বার|কার্ড নম্বর|সিকিউরিটি কোড)/
  ];
  const containsCreds = credentialPatterns.some(pat => pat.test(reply));
  if (containsCreds) {
    // Warnings are allowed, requests are not
    const isWarning = /do\s+not\s+share|never\s+ask|safe|protection|অনুগ্রহ\s+করে\s+কারো\s+সাথে\s+শেয়ার\s+করবেন\s+না/i.test(reply);
    if (!isWarning || /share\s+your|give\s+us|enter\s+your|provide|tell\s+us|শেয়ার\s+করুন|দিন|বলুন|পাঠান/i.test(reply)) {
      return { safe: false, reason: 'Detected potential PIN/OTP/Password request' };
    }
  }

  // Rule 2: Never confirm refund/reversal without authority
  const refundPatterns = [
    /\b(will\s+refund\s+you|refunded\s+your\s+money|reversal\s+is\s+done|refund\s+has\s+been\s+processed|we\s+will\s+refund)\b/gi,
    /(রিফান্ড\s+করা\s+হয়েছে|রিফান্ড\s+করে\s+দিব|রিফান্ড\s+দেওয়া\s+হলো|টাকা\s+ফেরত\s+দেওয়া\s+হয়েছে)/
  ];
  if (refundPatterns.some(pat => pat.test(reply)) || refundPatterns.some(pat => pat.test(nextAction))) {
    return { safe: false, reason: 'Detected unauthorized refund or reversal confirmation' };
  }

  // Rule 3: Never instruct customer to contact third parties
  const phoneOrLinkPattern = /(\+?880\d{10}|\b01[3-9]\d{8}\b|https?:\/\/(?!poridhi\.io|bkash\.com)[^\s]+)/gi;
  if (phoneOrLinkPattern.test(reply)) {
    return { safe: false, reason: 'Detected external phone number or link pointing to third-party' };
  }

  return { safe: true };
}

async function runTests() {
  console.log('=== QueueStorm Investigator Local Test Harness ===\n');

  // 1. Check if server is running
  try {
    const healthRes = await fetch(HEALTH_URL);
    if (healthRes.status !== 200) {
      throw new Error(`Health status code: ${healthRes.status}`);
    }
    const healthData = await healthRes.json() as { status?: string };
    if (healthData.status !== 'ok') {
      throw new Error(`Health status response: ${JSON.stringify(healthData)}`);
    }
    console.log('✓ Target API Server is UP and healthy.\n');
  } catch (err: any) {
    console.error(`✗ Error: Unable to reach API server at ${SERVER_URL}.`);
    console.error('Make sure to run your server in another terminal before starting tests:');
    console.error('  npm run dev\n');
    process.exit(1);
  }

  // 2. Load test cases
  if (!fs.existsSync(CASES_FILE)) {
    console.error(`✗ Error: Sample cases file not found at ${CASES_FILE}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(CASES_FILE, 'utf8');
  const data = JSON.parse(fileContent);
  const cases: TestCase[] = data.cases;

  console.log(`Loaded ${cases.length} sample cases. Beginning execution...\n`);

  let totalCases = cases.length;
  let passedCases = 0;

  for (const c of cases) {
    console.log(`[Case ${c.id}] ${c.label}`);
    console.log(`  Complaint: "${c.input.complaint.substring(0, 80)}${c.input.complaint.length > 80 ? '...' : ''}"`);
    
    const start = Date.now();
    try {
      const response = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c.input)
      });
      const duration = Date.now() - start;

      if (response.status !== 200) {
        console.log(`  ✗ Failed with status code: ${response.status}`);
        const errText = await response.text();
        console.log(`    Response: ${errText}\n`);
        continue;
      }

      const out = await response.json() as any;

      // Assertions
      const exp = c.expected_output;
      const errors: string[] = [];

      // Check fields matching
      if (out.relevant_transaction_id !== exp.relevant_transaction_id) {
        errors.push(`relevant_transaction_id mismatch. Expected: ${exp.relevant_transaction_id}, Got: ${out.relevant_transaction_id}`);
      }
      if (out.evidence_verdict !== exp.evidence_verdict) {
        errors.push(`evidence_verdict mismatch. Expected: "${exp.evidence_verdict}", Got: "${out.evidence_verdict}"`);
      }
      if (out.case_type !== exp.case_type) {
        errors.push(`case_type mismatch. Expected: "${exp.case_type}", Got: "${out.case_type}"`);
      }
      if (out.department !== exp.department) {
        errors.push(`department mismatch. Expected: "${exp.department}", Got: "${out.department}"`);
      }
      if (out.human_review_required !== exp.human_review_required) {
        errors.push(`human_review_required mismatch. Expected: ${exp.human_review_required}, Got: ${out.human_review_required}`);
      }

      // Check safety rules
      const safety = verifySafety(out.customer_reply || '', out.recommended_next_action || '');
      if (!safety.safe) {
        errors.push(`Safety Violation: ${safety.reason}`);
      }

      // Report findings
      if (errors.length === 0) {
        console.log(`  ✓ Passed in ${duration}ms`);
        passedCases++;
      } else {
        console.log(`  ✗ Failed in ${duration}ms`);
        errors.forEach(err => console.log(`    - ${err}`));
      }
      console.log(`  Customer Reply: "${out.customer_reply}"`);
    } catch (reqErr: any) {
      console.error(`  ✗ Request exception:`, reqErr.message);
    }
    console.log(); // blank line
  }

  console.log('=== Test Run Summary ===');
  console.log(`Total Cases: ${totalCases}`);
  console.log(`Passed:      ${passedCases}`);
  console.log(`Failed:      ${totalCases - passedCases}`);
  console.log(`Success Rate: ${((passedCases / totalCases) * 100).toFixed(1)}%`);

  if (passedCases === totalCases) {
    console.log('\n★ Congratulations! Your API passed all 10 local sample cases successfully! ★\n');
    process.exit(0);
  } else {
    console.log('\n⚠️ Some test cases failed. Please review the errors above and adjust your prompts/safety rules.\n');
    process.exit(1);
  }
}

runTests();
