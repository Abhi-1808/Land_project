import { describe, it, beforeEach, afterEach, before, after } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

const { ethers } = hre as any;

describe("Read-Only Reentrancy & Transient State Inspection Vector", function () {
  let landRecord: LandRecord;
  let attackerContract: MaliciousReentrantReceiver;
  let registrar: SignerWithAddress;

  beforeEach(async function () {
    const [admin, reg] = await ethers.getSigners();
    registrar = reg;

    const LandFactory = await ethers.getContractFactory("LandRecord");
    landRecord = await LandFactory.deploy();

    await landRecord.grantRole(await landRecord.REGISTRAR_ROLE(), registrar.address);

    const AttackerFactory = await ethers.getContractFactory("MaliciousReentrantReceiver");
    attackerContract = await AttackerFactory.deploy(await landRecord.getAddress());
  });

  it("Should prevent read-only reentrancy state leakage during batch processing", async function () {
    const parcelIds = ["PARCEL-REENTRANT-1", "PARCEL-REENTRANT-2"];
    const owners = [await attackerContract.getAddress(), registrar.address];
    const hashes = [
      ethers.keccak256(ethers.toUtf8Bytes("H1")),
      ethers.keccak256(ethers.toUtf8Bytes("H2")),
    ];
    const metadatas = ["Meta1", "Meta2"];

    // Execute batch registration containing callback to attacker contract
    await landRecord.connect(registrar).registerBatch(parcelIds, owners, hashes, metadatas);

    // Ensure attacker was unable to observe transient invalid state
    const corrupted = await attackerContract.viewStateCorrupted();
    expect(corrupted).to.be.false;
  });
});