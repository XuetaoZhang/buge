export default function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const code = url.searchParams.get("code");
  if (!code) return response.status(400).json({ error: "Missing tap code" });

  let mapping;
  try {
    mapping = JSON.parse(process.env.TAP_CODES || "{}");
  } catch {
    return response.status(500).json({ error: "Invalid TAP_CODES config" });
  }

  const entry = mapping[code];
  if (!entry) return response.status(404).json({ error: "Unknown tap code" });

  return response.status(200).json({
    contract: process.env.BUGE_CONTRACT_ADDRESS,
    eventId: entry.eventId,
    token: entry.token
  });
}
