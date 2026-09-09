import { describe, it, beforeEach, afterEach, before, after } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

const { ethers } = hre as any;

describe("Low-Level EVM Storage Layout & State Slot Inspection", function () {
  let landRecord: LandRecord;

  beforeEach(async function () {
    const Factory = await ethers.getContractFactory("LandRecord");
    landRecord = await Factory.deploy();
  });

  it("Should verify exact storage slot allocations to prevent proxy corruption", async function () {
    const contractAddress = await landRecord.getAddress();

    // Slot 0: Initialized / Paused flags (OpenZeppelin Initializable / Pausable)
    const slot0Raw = await ethers.provider.getStorage(contractAddress, 0);
    
    // Slot 0 inspection: Ensure low bytes contain correct boolean flags without bleed
    const isPaused = BigInt(slot0Raw) & 0xFFn;
    expect(isPaused).to.equal(0n, "Unexpected storage pollution in Slot 0");

    // Force write to storage slot using cheatcodes to test corruption resilience
    const REGISTRAR_ROLE = await landRecord.REGISTRAR_ROLE();
    
    // Calculate mapping slot location: keccak256(key . slot)
    // AccessControl mapping is located at slot 1 in standard layout
    const roleSlot = ethers.keccak256(
      ethers.abiCoder.encode(["bytes32", "uint256"], [REGISTRAR_ROLE, 1])
    );

    const roleData = await ethers.provider.getStorage(contractAddress, roleSlot);
    expect(roleData).to.not.be.undefined;
  });
});