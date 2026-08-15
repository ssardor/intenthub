import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import { checkHardLimits, evaluateSecurity } from "./gateway/policyEngine.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;
const MOCK_SERVER_URL = process.env.MOCK_SERVER_URL || "http://localhost:3001";

app.use(cors());
app.use(express.json());

// Global Gateway State
let defaultWalletBalance = 30.0;

// Health and Status Endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Zero-Trust Agentic Policy Gateway",
    port: PORT,
    mockServerUrl: MOCK_SERVER_URL,
    defaultBalance: defaultWalletBalance,
    endpoints: [
      "POST /api/gateway/request_payment",
      "GET /api/gateway/status"
    ]
  });
});

/**
 * Main Gateway Payment Intermediary Endpoint
 * Flow:
 *  1. Available Balance & Amount Verification
 *  2. Semantic Security / Prompt Injection LLM-as-a-Judge Evaluation (Gemini 2.5 Flash)
 *  3. External Compute Ecosystem Proxy Checkout (x402 or StraitsX MCP)
 */
app.post("/api/gateway/request_payment", async (req, res) => {
  const {
    intent,
    nodeId,
    amount,
    metadata,
    protocol,
    agentWallet,
    walletBalance,
    cardDetails
  } = req.body;

  const currentBalance = typeof walletBalance === "number" ? walletBalance : defaultWalletBalance;

  console.log(`\n[Gateway] Payment Request: Node=${nodeId}, Amount=${amount} XSGD, Available Balance=${currentBalance} XSGD, Protocol=${protocol}`);

  // Step A: Balance Verification
  const balanceCheck = checkHardLimits(amount, currentBalance, protocol);
  if (!balanceCheck.allowed) {
    console.warn(`[Gateway] Balance/Policy Rejection: ${balanceCheck.reason}`);
    return res.status(403).json({
      success: false,
      code: "INSUFFICIENT_FUNDS",
      error: "Transaction Rejected: Insufficient Funds",
      reason: balanceCheck.reason,
      availableBalance: currentBalance,
      requestedAmount: amount
    });
  }

  // Step B: Semantic Security & Prompt Injection Analysis
  const securityResult = await evaluateSecurity(intent, metadata);
  if (!securityResult.safe) {
    console.error(`[Gateway] SECURITY BREACH DETECTED: ${securityResult.reason}`);
    return res.status(403).json({
      success: false,
      code: "SECURITY_BREACH",
      error: "Prompt Injection / Malicious Override Detected by Smart Firewall",
      reason: securityResult.reason,
      flaggedMetadata: metadata
    });
  }
  console.log(`[Gateway] Security clearance granted: ${securityResult.reason}`);

  // Step C: Proxy to External Mock Server
  try {
    const normalizedProtocol = (protocol || "").toLowerCase();

    if (normalizedProtocol.includes("mcp") || normalizedProtocol === "straitsx_mcp") {
      // Proxy to StraitsX MCP Virtual Card Checkout
      const mockResponse = await axios.post(
        `${MOCK_SERVER_URL}/api/checkout/mcp`,
        { nodeId, cardDetails },
        { headers: { "Content-Type": "application/json" } }
      );

      return res.status(mockResponse.status).json({
        success: true,
        gatewayStatus: "AUTHORIZED_AND_SETTLED",
        gatewayNote: "Transaction passed balance and security checks.",
        ...mockResponse.data
      });
    } else {
      // Default: Proxy to x402 EIP-712 Payment Challenge
      const mockResponse = await axios.post(
        `${MOCK_SERVER_URL}/api/checkout/x402`,
        { nodeId, agentWallet },
        {
          headers: { "Content-Type": "application/json" },
          validateStatus: (status) => status < 500
        }
      );

      return res.status(mockResponse.status).json({
        gatewayStatus: "CHALLENGE_ISSUED",
        gatewayNote: "Transaction authorized. Awaiting on-chain settlement signature.",
        ...mockResponse.data
      });
    }
  } catch (error) {
    console.error(`[Gateway] Target ecosystem communication error: ${error.message}`);
    return res.status(502).json({
      success: false,
      code: "TARGET_COMMUNICATION_ERROR",
      error: "Failed to communicate with external compute ecosystem.",
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Policy Gateway & Smart Firewall running on port ${PORT}`);
});
