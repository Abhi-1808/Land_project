import { network } from "hardhat";
import { writeFile } from "node:fs/promises";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  const INITIAL_ADMIN_DELAY = 172800n; // 2 days

  console.log("----------------------------------------------------");
  console.log("Deploying LandRecord Smart Contract");
  console.log("Deployer Address:", deployer.account.address);
  console.log("Network Name:", network.name);
  console.log("----------------------------------------------------");

  const { contract: landRecord, deploymentTransaction } =
    await viem.sendDeploymentTransaction("LandRecord", [INITIAL_ADMIN_DELAY]);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: deploymentTransaction.hash,
  });

  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

  console.log("LandRecord Address:", landRecord.address);
  console.log("Deployment Block:", receipt.blockNumber.toString());
  console.log("Deployment Block Timestamp:", block.timestamp.toString());

  const deploymentData = {
    contract: "LandRecord",
    address: landRecord.address,
    deploymentTxHash: deploymentTransaction.hash,
    deploymentBlock: receipt.blockNumber.toString(),
    deploymentBlockTimestamp: block.timestamp.toString(),
    chainId: network.config.chainId ?? 31337,
    recordedAtUtc: new Date().toISOString(),
    initialAdminDelaySeconds: INITIAL_ADMIN_DELAY.toString(),
    deployerAddress: deployer.account.address,
  };

  await writeFile("deployment.json", JSON.stringify(deploymentData, null, 2));
  console.log("Deployment manifest saved to deployment.json");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});