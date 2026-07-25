import { Wallet } from "ethers";

export default function handler(_request, response) {
  if (!process.env.ATTESTOR_PRIVATE_KEY) {
    return response.status(503).json({ error: "Relayer is not configured" });
  }
  return response.status(200).json({ attestorAddress: new Wallet(process.env.ATTESTOR_PRIVATE_KEY).address });
}
