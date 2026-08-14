// Mock vendor API for end-to-end testing. Distinguishes sandbox vs live by
// URL path, echoes the auth header it received, and sets headers that the
// gateway should strip from responses.
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 9100);

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  const isLive = path.startsWith("/live");
  const isSandbox = path.startsWith("/sandbox");
  if (!isLive && !isSandbox) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unknown mock path" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    // Vendor-identifying headers the gateway should strip:
    res.setHeader("Server", "mock-nginx-1.25.3");
    res.setHeader("X-Powered-By", "MockVendor/2.0");
    res.setHeader("X-Vendor", "mock-vendor-inc");
    // A vendor-specific id header the gateway keeps (not on the strip list):
    res.setHeader("X-Vendor-Header", "mvid_987654321");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        mode: isLive ? "LIVE" : "SANDBOX",
        path,
        search: url.search,
        fullUrl: path + url.search,
        method: req.method,
        authHeaderReceived: req.headers.authorization ?? null,
        xApiKeyReceived: req.headers["x-api-key"] ?? null,
        body: body ? JSON.parse(body) : null,
      }),
    );
  });
});

server.listen(PORT, () => {
  console.log(`mock vendor listening on http://localhost:${PORT}`);
});
