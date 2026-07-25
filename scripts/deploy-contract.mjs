import fs from "node:fs";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";

const rpcUrl = process.env.MONAD_RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!rpcUrl || !privateKey) {
  throw new Error("Set MONAD_RPC_URL and DEPLOYER_PRIVATE_KEY before deploying.");
}

const artifact = JSON.parse(fs.readFileSync("artifacts/BuGe.json", "utf8"));
const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy();
await contract.waitForDeployment();
console.log(`BuGe deployed: ${await contract.getAddress()}`);
