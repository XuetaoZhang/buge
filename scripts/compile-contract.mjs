import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = process.cwd();
const sourcePath = path.join(root, "contracts", "BuGe.sol");
const source = fs.readFileSync(sourcePath, "utf8");
const input = {
  language: "Solidity",
  sources: { "BuGe.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } }
  }
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = output.errors?.filter((entry) => entry.severity === "error") ?? [];
if (errors.length) {
  throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
}
const compiled = output.contracts["BuGe.sol"].BuGe;
const artifact = { abi: compiled.abi, bytecode: `0x${compiled.evm.bytecode.object}` };
fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
fs.writeFileSync(path.join(root, "artifacts", "BuGe.json"), JSON.stringify(artifact, null, 2));
console.log("Compiled contracts/BuGe.sol -> artifacts/BuGe.json");
