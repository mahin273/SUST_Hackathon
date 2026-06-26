# QueueStorm Investigator API Copilot
### AI/API SupportOps Challenge for Digital Finance

QueueStorm Investigator is a production-grade SupportOps Copilot API built for the **SUST CSE Carnival 2026 Codex Community Hackathon**. It helps customer support agents analyze customer tickets, cross-reference complaints against transaction histories to find matches, evaluate evidence consistency, determine department routing, assess severity, and generate safe, compliant customer replies in English and Bangla.

---

## 🚀 Setup & Runbook

This service exposes `GET /health` and `POST /analyze-ticket` as specified in the hackathon API contract.

### Prerequisites
- Node.js (version 18 or 20)
- npm

### Local Installation
1. **Clone the repository and enter the project directory:**
   ```bash
   cd QueueStorm
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure Environment Variables:**
   Copy the example environment file and open `.env` to input your API key:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and configure:
   ```env
   PORT=8000
   GEMINI_API_KEY=your_free_gemini_api_key_here
   GEMINI_MODEL=gemini-2.5-flash
   ```
   *Note: Get your 100% free Gemini API key in 30 seconds at [Google AI Studio](https://aistudio.google.com/). No billing details required.*

### Running the Server
- **Development Mode (Hot Reloading):**
  ```bash
  npm run dev
  ```
- **Production Build and Start:**
  ```bash
  npm run build
  npm start
  ```

### Running Local Validation tests
Make sure the server is running on `http://localhost:8000` in another terminal, then run the test harness:
```bash
npm run test:local
```
This script runs our API against the 10 sample cases in `SUST_Preli_Sample_Cases.json`, checking schema conformance, logic matching, latency, and safety violations.

---

## 🐳 Docker Deployment

The service is fully containerized using an optimized multi-stage build.

1. **Build the Docker Image:**
   ```bash
   docker build -t queuestorm-investigator .
   ```
2. **Run the Container (runs on port 8000, automatically cleans up on exit/Ctrl+C):**
   - **Using environment file:**
     ```bash
     docker run --rm -p 8000:8000 --env-file .env queuestorm-investigator
     ```
   - **Or passing the API key directly:**
     ```bash
     docker run --rm -p 8000:8000 -e GEMINI_API_KEY=your_api_key_here queuestorm-investigator
     ```

3. **Verify Health:**
   ```bash
   curl http://localhost:8000/health
   ```
   Response: `{"status": "ok"}`

---

## 🛠️ Tech Stack & Architecture

- **Core**: TypeScript + Node.js (Express)
- **Validation**: Zod (100% schema enforcement at request and response boundaries)
- **LLM SDK**: Official `@google/genai` Node.js client
- **Environment**: Dotenv
- **Dockerization**: Multi-stage lightweight `node:20-slim` container

---

## 🧠 AI Approach & Evidence Reasoning

The copilot operates on an **Investigator Pattern**:
1. **Schema Check**: Incoming requests are immediately parsed by Zod. Empty complaints are rejected with `422`, and malformed payloads with `400`.
2. **LLM Context Injection**: The dynamic ticket details and the transaction list are passed as user content alongside strict static `systemInstruction` parameters (defined in `src/prompts.ts`).
3. **Cross-Referencing**: The LLM matches transaction attributes (amounts, timestamps, types) with the user's textual descriptions to locate the `relevant_transaction_id`.
4. **Consistency Assessment**: 
   - **Consistent**: The transaction history status/type aligns with the claim (e.g. money sent to a wrong number matches a completed transfer in history).
   - **Inconsistent**: The history contradicts the claim (e.g., user claims a wrong transfer, but has made 3 successful transfers to that exact counterparty in the last 9 days, indicating an established payment pattern).
   - **Insufficient Data**: The user's description is vague, or multiple transactions match ambiguously.
5. **Self-Healing Fallback**: If the LLM generates a JSON that fails output validation, our Express router intercepts the parse error and returns a compliant fallback payload to prevent endpoint failures.

---

## 🛡️ Safety Logic & Guardrail Firewall

We enforce a zero-tolerance post-processing pipeline (`src/safetyGuardrails.ts`) that intercepts the LLM output:
- **PIN/OTP Protection**: Programmatically scans the reply for keyword patterns asking for credentials (in English & Bangla). If detected, it immediately redacts the request and forces a standard warning: *"Please do not share your PIN or OTP with anyone."* 
- **Refund & Action Sanity**: Replaces any unauthorized refund promises (like "we will refund you") with conditional phrases (*"any eligible amount will be returned through official channels"*).
- **Phishing Escalation**: Forces `human_review_required = true` and `severity = "critical"` for any suspected phishing or credentials-related cases.
- **Third-Party Sanitization**: Automatically strips external phone numbers or non-whitelisted URLs from customer replies.

---

## 🤖 MODELS Section

Our application uses the following models:

| Model Name | Host Provider | Rationale | Cost |
|---|---|---|---|
| **`gemini-2.5-flash`** | Google AI Studio | Chosen as the primary model due to its high speed (sub-second generation), large context window, native support for JSON schema enforcement, and superb multilingual capabilities for Bangla/Banglish. | Free Tier ($0) |
| **`gemini-1.5-flash`** | Google AI Studio | Fallback model configured if `gemini-2.5-flash` is throttled or times out. | Free Tier ($0) |

---

## 📝 Assumptions & Limitations

1. **Transaction Snippet Scope**: It is assumed that the transaction history provided in the request contains all transactions relevant to the ticket analysis.
2. **Language Boundaries**: Customer replies are generated in the language detected in the complaint (English or Bangla). Banglish complaints default to polite Bangla replies.
