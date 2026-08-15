import express from "express";
import cors from "cors";
import { nodes } from "./data/nodes.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 1. GET /api/nodes - List all available compute nodes
app.get("/api/nodes", (req, res) => {
  res.json({
    success: true,
    nodes
  });
});

// 2. POST /api/checkout/x402 - EIP-712 Payment Challenge (HTTP 402)
app.post("/api/checkout/x402", (req, res) => {
  const { nodeId, agentWallet } = req.body;

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    return res.status(404).json({
      success: false,
      error: `Node with id '${nodeId}' not found.`
    });
  }

  // Generate EIP-712 challenge for Avalanche C-Chain XSGD settlement
  const challengeNonce =
    "0x" +
    Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");

  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity
  const merchantAddress = "0xAff172F0ca953261b964Dda53641b7A8ceA2d65b";
  const xsgdContract = "0xDC3326e71D45186F113a2F448984CA0e8D201995"; // XSGD on Avalanche C-Chain

  const responsePayload = {
    status: "payment_required",
    protocol: "x402",
    message: "HTTP 402 Payment Required: EIP-712 Authorization Signature Required",
    node: {
      id: node.id,
      name: node.name,
      type: node.type,
      price: node.price,
      currency: node.currency || "XSGD",
      description: node.description,
      hidden_metadata: node.hidden_metadata
    },
    paymentDetails: {
      recipient: merchantAddress,
      amount: node.price,
      currency: "XSGD",
      network: "Avalanche C-Chain",
      chainId: 43114,
      tokenAddress: xsgdContract,
      agentWallet: agentWallet || "0x0000000000000000000000000000000000000000",
      deadline,
      nonce: challengeNonce
    },
    eip712Challenge: {
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" }
        ],
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" }
        ]
      },
      primaryType: "TransferWithAuthorization",
      domain: {
        name: "StraitsX XSGD Token",
        version: "1",
        chainId: 43114,
        verifyingContract: xsgdContract
      },
      message: {
        from: agentWallet || "0x0000000000000000000000000000000000000000",
        to: merchantAddress,
        value: (node.price * 1_000_000).toString(), // XSGD 6 decimals
        validAfter: 0,
        validBefore: deadline,
        nonce: challengeNonce
      }
    }
  };

  return res.status(402).json(responsePayload);
});

// 3. POST /api/checkout/mcp - StraitsX Virtual Card Checkout Simulation
app.post("/api/checkout/mcp", (req, res) => {
  const { nodeId, cardDetails } = req.body;

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    return res.status(404).json({
      success: false,
      error: `Node with id '${nodeId}' not found.`
    });
  }

  const txId = "mcp_tx_" + Math.random().toString(36).substring(2, 12);

  return res.status(200).json({
    success: true,
    status: "authorized",
    protocol: "straitsx_mcp",
    transactionId: txId,
    timestamp: new Date().toISOString(),
    node: {
      id: node.id,
      name: node.name,
      type: node.type,
      description: node.description
    },
    payment: {
      method: "straitsx_virtual_card",
      amountCharged: node.price,
      currency: "XSGD",
      cardLast4: cardDetails?.cardNumber ? String(cardDetails.cardNumber).slice(-4) : "8842",
      cardholder: cardDetails?.cardholderName || "Agentic Autonomous Procurement",
      authCode: "AUTH-" + Math.floor(100000 + Math.random() * 900000)
    },
    message: `Successfully processed deposit of ${node.price} XSGD via StraitsX Virtual Card for ${node.name}.`
  });
});

// Health / root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Mock B2B Ecosystem",
    status: "healthy",
    port: PORT,
    endpoints: [
      "GET /api/nodes",
      "POST /api/checkout/x402",
      "POST /api/checkout/mcp"
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Mock B2B Ecosystem running on port ${PORT}`);
});
