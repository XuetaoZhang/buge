import artifact from "../artifacts/BuGe.json";
import { BrowserProvider, Contract, ContractFactory, formatEther, parseEther } from "ethers";

export const monad = {
  chainId: Number(import.meta.env.VITE_MONAD_CHAIN_ID || 143),
  rpcUrl: import.meta.env.VITE_MONAD_RPC_URL || "https://rpc.monad.xyz",
  name: import.meta.env.VITE_MONAD_NETWORK_NAME || "Monad",
  explorer: import.meta.env.VITE_MONAD_EXPLORER || "https://explorer.monad.xyz"
};

export const contractAddress = import.meta.env.VITE_BUGE_CONTRACT_ADDRESS || "";
export const eventId = Number(import.meta.env.VITE_BUGE_EVENT_ID || 1);

export const abi = [
  "function createEvent(address attestor,uint96 stake,uint40 registrationDeadline,uint40 checkInDeadline,uint40 claimDeadline) returns (uint256 eventId)",
  "function register(uint256 eventId) payable",
  "function checkInSelf(uint256 eventId)",
  "function finalize(uint256 eventId)",
  "function claim(uint256 eventId)",
  "function eventDetails(uint256 eventId) view returns (tuple(address organizer,address attestor,uint96 stake,uint40 registrationDeadline,uint40 checkInDeadline,uint40 claimDeadline,uint32 registered,uint32 present,bool finalized,uint128 payoutPerAttendee))",
  "function participantDetails(uint256 eventId,address attendee) view returns (tuple(bool registered,bool present,bool claimed))"
];

export function shortAddress(value = "") {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "未连接";
}

export async function connectMonadWallet() {
  if (!window.ethereum) throw new Error("未检测到浏览器钱包。请使用 MetaMask 或 Rabby 打开。");
  const chainIdHex = `0x${monad.chainId.toString(16)}`;
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chainIdHex,
        chainName: monad.name,
        nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
        rpcUrls: [monad.rpcUrl],
        blockExplorerUrls: [monad.explorer]
      }]
    });
  }
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

// No wallet prompt: this only returns an account that has already approved this origin.
export async function recoverMonadWallet() {
  if (!window.ethereum) return null;
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  if (!accounts?.length) return null;
  const provider = new BrowserProvider(window.ethereum);
  return { provider, address: accounts[0] };
}

export function getContract(signer, address = contractAddress) {
  if (!address) throw new Error("尚未配置不鸽合约地址。");
  return new Contract(address, abi, signer);
}

export async function deployBuGe(signer) {
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  return contract;
}

export async function loadEvent(provider, address = contractAddress, id = eventId) {
  if (!address) return null;
  const contract = new Contract(address, abi, provider);
  const item = await contract.eventDetails(id);
  return {
    organizer: item.organizer,
    attestor: item.attestor,
    stake: formatEther(item.stake),
    registrationDeadline: Number(item.registrationDeadline),
    checkInDeadline: Number(item.checkInDeadline),
    claimDeadline: Number(item.claimDeadline),
    registered: Number(item.registered),
    present: Number(item.present),
    finalized: item.finalized,
    payout: formatEther(item.payoutPerAttendee)
  };
}

export async function loadParticipant(provider, address = contractAddress, id = eventId, attendee) {
  if (!address || !attendee) return null;
  const contract = new Contract(address, abi, provider);
  const item = await contract.participantDetails(id, attendee);
  return { registered: item.registered, present: item.present, claimed: item.claimed };
}

export { parseEther };
