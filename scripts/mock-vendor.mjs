// Mock vendor API for end-to-end testing. Distinguishes sandbox vs live by
// URL path, echoes the auth header it received, and sets headers that the
// gateway should strip from responses.
//
// Also simulates identity-verification products (aadhaar-verify, pan-verify)
// using ONLY fake test numbers — never real identity data.
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 9100);

// Fake test numbers that always "verify" in the mock. Everything else fails.
const FAKE_AADHAAR = "1111-2222-3333";
const FAKE_PAN = "AAAAA0000A";

function respond(res, status, payload) {
  res.setHeader("Server", "mock-nginx-1.25.3");
  res.setHeader("X-Powered-By", "MockVendor/2.0");
  res.setHeader("X-Vendor", "mock-vendor-inc");
  res.setHeader("X-Vendor-Header", "mvid_987654321");
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function handleVerification(path, body, res, isLive) {
  if (path.endsWith("/aadhaar-verify")) {
    const number = body?.aadhaar_number ?? body?.number ?? "";
    const matches = number.replace(/\D/g, "") === FAKE_AADHAAR.replace(/\D/g, "");
    return respond(
      res,
      matches ? 200 : 422,
      {
        result: {
          status: matches ? "VERIFIED" : "NOT_FOUND",
          name_matched: matches ? "PARTIAL" : "NO_MATCH",
        },
        reference: matches ? "ref_aad_" + number.slice(-4) : null,
        message: matches ? "Aadhaar verified" : "Aadhaar not found",
      },
    );
  }
  if (path.endsWith("/pan-verify")) {
    const pan = (body?.pan_number ?? body?.pan ?? "").toUpperCase();
    const matches = pan === FAKE_PAN;
    return respond(
      res,
      matches ? 200 : 422,
      {
        result: {
          status: matches ? "VERIFIED" : "INVALID",
          pan_masked: pan ? pan.slice(0, 2) + "XXX" + pan.slice(-1) : null,
          name_matched: matches ? "YES" : "NO",
        },
        reference: matches ? "ref_pan_" + pan.slice(-1) : null,
        message: matches ? "PAN verified" : "PAN not found",
      },
    );
  }
  respond(res, 404, { error: "unknown mock verification endpoint" });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  const isLive = path.startsWith("/live");
  const isSandbox = path.startsWith("/sandbox");
  if (!isLive && !isSandbox) {
    respond(res, 404, { error: "unknown mock path" });
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let parsed = null;
    try {
      parsed = body ? JSON.parse(body) : null;
    } catch {
      parsed = null;
    }

    // Verification products (only reachable in sandbox/live via explicit path).
    if (path.includes("/aadhaar-verify") || path.includes("/pan-verify")) {
      handleVerification(path, parsed, res, isLive);
      return;
    }

    // Generic echo for the legacy vendor routes (sms/payments etc.).
    respond(res, 200, {
      ok: true,
      mode: isLive ? "LIVE" : "SANDBOX",
      path,
      search: url.search,
      fullUrl: path + url.search,
      method: req.method,
      authHeaderReceived: req.headers.authorization ?? null,
      xApiKeyReceived: req.headers["x-api-key"] ?? null,
      body: parsed,
    });
  });
});

server.listen(PORT, () => {
  console.log(`mock vendor listening on http://localhost:${PORT}`);
});