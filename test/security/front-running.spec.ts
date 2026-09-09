import { describe, it, beforeEach, afterEach, before, after } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

const { ethers } = hre as any;

describe("Mempool Transaction Reordering & Front-Running Mechanics", function () {
  let landRecord: LandRecord;
  let admin: SignerWithAddress;
  let registrar: SignerWithAddress;
  let attacker: SignerWithAddress;

  beforeEach(async function () {
    [admin, registrar, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("LandRecord");
    landRecord = await Factory.deploy();

    await landRecord.grantRole(await landRecord.REGISTRAR_ROLE(), registrar.address);
    // Maliciously grant role or simulate compromised key
    await landRecord.grantRole(await landRecord.REGISTRAR_ROLE(), attacker.address);
  });

  afterEach(async function () {
    // Restore default automining behavior
    await network.provider.send("evm_setAutomine", [true]);
  });

  it("Should deterministically handle same-block execution order during registration collisions", async function () {
    // Disable automining to simulate block mempool aggregation
    await network.provider.send("evm_setAutomine", [false]);

    const targetParcel = "PARCEL-FRONT-RUN-01";
    const honestHash = ethers.keccak256(ethers.toUtf8Bytes("HONEST_DEED"));
    const attackerHash = ethers.keccak256(ethers.toUtf8Bytes("ATTACKER_DEED"));

    // Attacker submits with higher priority gas fee
    const txAttacker = await landRecord.connect(attacker).registerLand(targetParcel, attackerHash, "Attacker", {
      maxPriorityFeePerGas: ethers.parseUnits("10", "gwei"),
    });

    // Honest user submits with lower gas fee
    const txHonest = await landRecord.connect(registrar).registerLand(targetParcel, honestHash, "Honest", {
      maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
    });

    // Mine both transactions simultaneously in a single block
    await network.provider.send("evm_mine");

    const receiptAttacker = await txAttacker.wait();
    expect(receiptAttacker?.status).to.equal(1); // Front-runner succeeds

    // Honest transaction must fail due to state collision inside the same block
    await expect(txHonest.wait()).to.be.reverted;

    // Verify state reflects front-runner payload
    const record = await landRecord.getCurrentRecord(targetParcel);
    expect(record.docHash).to.equal(attackerHash);
  });
});