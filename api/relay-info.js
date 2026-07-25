import { Wallet } from "ethers";

export default function handler(_request, response) {
  if (!process.env.ATTESTOR_PRIVATE_KEY) {
    return response.status(503).json({ error: "Relayer is not configured" });
  }
  const rawKey = process.env.ATTESTOR_PRIVATE_KEY;
  return response.status(200).json({ attestorAddress: new Wallet(rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`).address });
}
