import { describe, it, beforeEach, afterEach, before, after } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

const { ethers } = hre as any;
describe("Advanced Memory, Encoding & Calldata Vectors", function () {
  let landRecord: LandRecord;
  let admin: SignerWithAddress;
  let registrar: SignerWithAddress;

  beforeEach(async function () {
    [admin, registrar] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("LandRecord");
    landRecord = await Factory.deploy();
    
    const REGISTRAR_ROLE = await landRecord.REGISTRAR_ROLE();
    await landRecord.grantRole(REGISTRAR_ROLE, registrar.address);
  });

  describe("Unicode Homoglyph & Character Spoofing Security", function () {
    it("Should treat Latin 'A' and Cyrillic 'А' as distinct byte arrays without storage overlap", async function () {
      const latinParcel = "PLOT-A100"; // 'A' = 0x41
      const cyrillicParcel = "PLOT-А100"; // 'А' (Cyrillic U+0410) = 0xD0 0x90 in UTF-8
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes("doc1"));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("doc2"));

      await landRecord.connect(registrar).registerLand(latinParcel, hash1, "Latin Plot");
      
      // Should succeed because byte representation is different, avoiding accidental collision
      await expect(
        landRecord.connect(registrar).registerLand(cyrillicParcel, hash2, "Cyrillic Plot")
      ).to.emit(landRecord, "RecordRegistered");

      const rec1 = await landRecord.getCurrentRecord(latinParcel);
      const rec2 = await landRecord.getCurrentRecord(cyrillicParcel);

      expect(rec1.docHash).to.equal(hash1);
      expect(rec2.docHash).to.equal(hash2);
    });

    it("Should reject Embedded Null Bytes (0x00) inside String Payloads", async function () {
      // Craft raw byte string containing an embedded null byte
      const invalidParcelWithNull = "PARCEL\x00_SECRET";
      const docHash = ethers.keccak256(ethers.toUtf8Bytes("doc_null"));

      // Solidity string length includes 0x00, sanitization check must fail or store full byte string explicitly
      await landRecord.connect(registrar).registerLand(invalidParcelWithNull, docHash, "Meta");
      
      // Verification using standard un-truncated key must resolve
      const record = await landRecord.getCurrentRecord(invalidParcelWithNull);
      expect(record.docHash).to.equal(docHash);

      // Truncated lookup "PARCEL" must throw ParcelDoesNotExist
      await expect(landRecord.getCurrentRecord("PARCEL")).to.be.revertedWithCustomError(
        landRecord,
        "ParcelDoesNotExist"
      );
    });

    it("Should reject non-canonical trailing zero-padding in raw ABI encoded calldata", async function () {
      const parcelId = "LAND-CALDATA";
      const docHash = ethers.keccak256(ethers.toUtf8Bytes("doc_calldata"));
      const metadata = "Valid Meta";

      // Manually construct raw ABI payload with malformed string pointer offsets
      const iface = landRecord.interface;
      const baseCalldata = iface.encodeFunctionData("registerLand", [parcelId, docHash, metadata]);
      
      // Append dirty garbage bytes to the end of the raw call execution buffer
      const dirtyCalldata = baseCalldata + "ffffffffffffffffffffffffffffffff";

      // EVM strict decoding must revert transaction on dirty dynamic calldata tail
      await expect(
        registrar.sendTransaction({
          to: await landRecord.getAddress(),
          data: dirtyCalldata,
        })
      ).to.be.reverted;
    });
  });
}); 