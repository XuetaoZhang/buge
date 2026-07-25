import { Contract, JsonRpcProvider, Wallet } from "ethers";
import artifact from "../artifacts/BuGe.json" with { type: "json" };

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });

  const { eventId, attendee, tapToken } = request.body ?? {};
  if (!eventId || !attendee) return response.status(400).json({ error: "Missing eventId or attendee" });
  if (!process.env.NFC_TAP_TOKEN || tapToken !== process.env.NFC_TAP_TOKEN) {
    return response.status(401).json({ error: "Invalid venue tap" });
  }

  try {
    const provider = new JsonRpcProvider(process.env.MONAD_RPC_URL);
    const rawKey = process.env.ATTESTOR_PRIVATE_KEY;
    const attestor = new Wallet(rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`, provider);
    const contract = new Contract(process.env.BUGE_CONTRACT_ADDRESS, artifact.abi, attestor);
    const participant = await contract.participantDetails(eventId, attendee);
    if (!participant.registered) return response.status(400).json({ error: "This wallet is not registered" });
    if (participant.present) return response.status(200).json({ alreadyCheckedIn: true });

    const request = await contract.attestCheckIn.populateTransaction(eventId, attendee);
    const [network, feeData, nonce, estimatedGas] = await Promise.all([
      provider.getNetwork(),
      provider.getFeeData(),
      provider.getTransactionCount(attestor.address, "pending"),
      provider.estimateGas({ ...request, from: attestor.address })
    ]);
    // Monad charges the submitted gas limit. Estimate accurately and add only a small buffer.
    const gasLimit = estimatedGas + (estimatedGas / 10n);
    const signed = await attestor.signTransaction({
      ...request,
      chainId: network.chainId,
      nonce,
      gasLimit,
      type: 2,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
    });
    const receipt = await provider.send("eth_sendRawTransactionSync", [signed]);
    const transactionHash = receipt.transactionHash || receipt.hash;
    const receiptBlock = Number(receipt.blockNumber);

    // A receipt means inclusion. Prefer Monad's finalized block before turning the gate green.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const finalized = await provider.getBlock("finalized");
      if (finalized?.number >= receiptBlock) {
        return response.status(200).json({ hash: transactionHash, finalized: true });
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return response.status(200).json({ hash: transactionHash, finalized: false });
  } catch (error) {
    return response.status(500).json({ error: error.shortMessage || error.message || "Check-in failed" });
  }
}
