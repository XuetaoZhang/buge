import fs from "node:fs";
import { ContractFactory, JsonRpcProvider, Wallet, formatEther } from "ethers";

// Local deployment reads the ignored .env file; shell variables still take precedence.
try {
  process.loadEnvFile(".env");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const rpcUrl = process.env.MONAD_RPC_URL;
// A dedicated deployer is preferred. For this hackathon MVP, the funded relayer
// key can also deploy the contract when no separate deployer key is configured.
const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.ATTESTOR_PRIVATE_KEY;
if (!rpcUrl || !privateKey) {
  throw new Error("Set MONAD_RPC_URL and DEPLOYER_PRIVATE_KEY (or ATTESTOR_PRIVATE_KEY) before deploying.");
}

const artifact = JSON.parse(fs.readFileSync("artifacts/BuGe.json", "utf8"));
const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);
const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
const [network, balance, deployment] = await Promise.all([
  provider.getNetwork(),
  provider.getBalance(wallet.address),
  factory.getDeployTransaction()
]);
if (balance === 0n) {
  throw new Error(`Deployment wallet ${wallet.address} has 0 MON on chain ${network.chainId}. Fund this wallet before deploying.`);
}

// Monad charges the submitted gas limit, so estimate tightly and keep the buffer small.
const estimate = await provider.estimateGas({ ...deployment, from: wallet.address });
const gasLimit = estimate + (estimate / 10n);
const contract = await factory.deploy({ gasLimit });
await contract.waitForDeployment();
console.log(`BuGe deployed: ${await contract.getAddress()} on chain ${network.chainId}`);
console.log(`Deployer: ${wallet.address}; remaining balance: ${formatEther(await provider.getBalance(wallet.address))} MON`);
