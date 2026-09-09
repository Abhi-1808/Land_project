import { describe, it, beforeEach, afterEach, before, after } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

const { ethers } = hre as any;

describe("Cross-Chain Signature Replay & EIP-712 Malleability Vector", function () {
  let landRecord: LandRecord;
  let signer: SignerWithAddress;
  let attacker: SignerWithAddress;

  // EIP-712 Type Definitions
  const DOMAIN_NAME = "LandRecordRegistry";
  const VERSION = "1";

  beforeEach(async function () {
    [signer, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("LandRecord");
    landRecord = await Factory.deploy();
  });

  it("Should reject off-chain signatures replayed across different Chain IDs", async function () {
    const chainIdMainnet = 1;
    const chainIdL2 = 42161; // Arbitrum

    const parcelId = "PARCEL-REPLAY-99";
    const docHash = ethers.keccak256(ethers.toUtf8Bytes("REPLAY_DOC"));
    const nonce = 0;

    // 1. Construct Domain Separator for Mainnet (Chain ID 1)
    const domainMainnet = {
      name: DOMAIN_NAME,
      version: VERSION,
      chainId: chainIdMainnet,
      verifyingContract: await landRecord.getAddress(),
    };

    const types = {
      RegisterPermission: [
        { name: "parcelId", type: "string" },
        { name: "docHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
      ],
    };

    const value = { parcelId, docHash, nonce };

    // Sign payload targeting Chain ID 1
    const signature = await signer.signTypedData(domainMainnet, types, value);

    // 2. Simulate replay attempt on a chain running under Chain ID 42161
    await network.provider.send("hardhat_setChainId", [chainIdL2]);

    // Re-deploy or simulate contract state on new Chain ID
    const Factory = await ethers.getContractFactory("LandRecord");
    const landRecordL2 = await Factory.deploy();

    // Verification on L2 must fail because block.chainid changed, invalidating the EIP-712 digest
    // Assuming custom verifySignature function on contract:
    await expect(
      landRecordL2.verifyMetaRegistration(parcelId, docHash, nonce, signature)
    ).to.be.revertedWithCustomError(landRecordL2, "InvalidSignatureOrChainId");
  });

  it("Should reject malleable ECDSA signatures (s-value malleability / EIP-2)", async function () {
    const messageHash = ethers.keccak256(ethers.toUtf8Bytes("MALLEABILITY_TEST"));
    const sig = await signer.signMessage(ethers.getBytes(messageHash));
    
    const parsedSig = ethers.Signature.from(sig);

    // Compute manipulated 's' value (secp256k1 curve order n - s)
    const n = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
    const malleableS = ethers.toBeHex(n - BigInt(parsedSig.s), 32);
    
    // Flip 'v' byte (27 <-> 28)
    const malleableV = parsedSig.v === 27 ? 28 : 27;

    // Construct high-S signature
    const malleableSig = ethers.concat([parsedSig.r, malleableS, ethers.toBeHex(malleableV, 1)]);

    // Contract must enforce OpenZeppelin ECDSA library checks (rejecting s > n/2)
    await expect(
      landRecord.verifyRawSignature(messageHash, malleableSig)
    ).to.be.revertedWith("ECDSA: invalid signature 's' value");
  });
});