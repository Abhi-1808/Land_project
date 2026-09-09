import { describe, it, beforeEach, afterEach, before, after } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

const { ethers } = hre as any;
describe("Maximum Execution Payload & Gas Ceiling Benchmarks", function () {
  let landRecord: LandRecord;
  let registrar: SignerWithAddress;

  beforeEach(async function () {
    const [admin, reg] = await ethers.getSigners();
    registrar = reg;
    const Factory = await ethers.getContractFactory("LandRecord");
    landRecord = await Factory.deploy();
    
    await landRecord.grantRole(await landRecord.REGISTRAR_ROLE(), registrar.address);
  });

  it("Should execute 50-item batch with maximum bounds under 4,500,000 gas limit", async function () {
    const batchSize = 50;
    const parcelIds: string[] = [];
    const owners: string[] = [];
    const hashes: string[] = [];
    const metadatas: string[] = [];

    // Max 64-char String
    const maxCharParcelBase = "MAX_BOUND_PARCEL_IDENTIFIER_STRING_64_CHARACTERS_EXACT_LENGTH_";
    // Max 512-char Metadata Payload
    const maxMetadata = "M".repeat(512);

    for (let i = 0; i < batchSize; i++) {
      const pad = i.toString().padStart(2, "0");
      parcelIds.push(`${maxCharParcelBase}${pad}`);
      owners.push(ethers.Wallet.createRandom().address);
      hashes.push(ethers.keccak256(ethers.toUtf8Bytes(`UNIQUE_HASH_BATCH_${i}`)));
      metadatas.push(maxMetadata);
    }

    const tx = await landRecord
      .connect(registrar)
      .registerBatch(parcelIds, owners, hashes, metadatas);
    
    const receipt = await tx.wait();
    expect(receipt).to.not.be.null;
    
    const gasUsed = receipt!.gasUsed;
    
    // Hard Ceiling Assertions
    expect(gasUsed).to.be.lt(4500000n, "Gas limit exceeded maximum production tolerance threshold");
    
    // Average cost per record calculation check
    const averageGasPerRecord = gasUsed / BigInt(batchSize);
    expect(averageGasPerRecord).to.be.lt(90000n);
  });
});