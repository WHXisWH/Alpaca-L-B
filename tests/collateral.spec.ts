import { Args, bytesToString, stringToBytes, u64ToBytes } from "@massalabs/as-types";
import { Storage, Context, Address } from "@massalabs/massa-as-sdk";
import {
  constructor,
  depositNFT,
  withdrawNFT,
  getNFTValue,
  isNFTDeposited,
  getNFTOwner
} from "../assembly/contracts/CollateralVault";

const MOCK_NFT_ADDRESS = "AS1MockNFTAddress";
const MOCK_ORACLE_ADDRESS = "AS1MockOracleAddress";
const MOCK_GOVERNANCE_ADDRESS = "AS1MockGovernanceAddress";
const MOCK_USER_ADDRESS = "AS1MockUserAddress";

describe("CollateralVault Contract", () => {
  beforeEach(() => {
    Storage.clear();
    Context.setDeployingContract(true);
    const constructorArgs = new Args()
      .addString(MOCK_GOVERNANCE_ADDRESS)
      .addString(MOCK_NFT_ADDRESS)
      .addString(MOCK_ORACLE_ADDRESS);
    constructor(constructorArgs.serialize());
    Context.setDeployingContract(false);
  });

  it("should deposit an NFT correctly", () => {
    // Mocking external contract states
    const nftContract = new Address(MOCK_NFT_ADDRESS);
    const oracleContract = new Address(MOCK_ORACLE_ADDRESS);
    const tokenId: u64 = 1;

    // Mock NFT ownership
    Storage.setOf(nftContract, stringToBytes('OWNER_' + tokenId.toString()), stringToBytes(MOCK_USER_ADDRESS));
    // Mock NFT valuation in Oracle
    Storage.setOf(oracleContract, stringToBytes('NFT_VAL_' + tokenId.toString()), u64ToBytes(5000)); // Value: 5000
    Storage.setOf(oracleContract, stringToBytes('NFT_PD_' + tokenId.toString()), u64ToBytes(10)); // PD: 10%
    Storage.setOf(oracleContract, stringToBytes('NFT_LGD_' + tokenId.toString()), u64ToBytes(50)); // LGD: 50%

    Context.setCaller(new Address(MOCK_USER_ADDRESS));
    
    const depositArgs = new Args().addU64(tokenId);
    depositNFT(depositArgs.serialize());

    // Verify internal state
    const isDepositedResult = isNFTDeposited(depositArgs.serialize());
    expect(bytesToString(isDepositedResult)).toBe("true");

    const ownerResult = getNFTOwner(depositArgs.serialize());
    expect(bytesToString(ownerResult)).toBe(MOCK_USER_ADDRESS);

    const valueResult = getNFTValue(depositArgs.serialize());
    expect(new Args(valueResult).nextU64()).toBe(5000);
  });

  it("should withdraw an NFT correctly", () => {
    // First, deposit an NFT
    const nftContract = new Address(MOCK_NFT_ADDRESS);
    const oracleContract = new Address(MOCK_ORACLE_ADDRESS);
    const tokenId: u64 = 1;
    Storage.setOf(nftContract, stringToBytes('OWNER_' + tokenId.toString()), stringToBytes(MOCK_USER_ADDRESS));
    Storage.setOf(oracleContract, stringToBytes('NFT_VAL_' + tokenId.toString()), u64ToBytes(5000));
    Storage.setOf(oracleContract, stringToBytes('NFT_PD_' + tokenId.toString()), u64ToBytes(10));
    Storage.setOf(oracleContract, stringToBytes('NFT_LGD_' + tokenId.toString()), u64ToBytes(50));
    Context.setCaller(new Address(MOCK_USER_ADDRESS));
    const depositArgs = new Args().addU64(tokenId);
    depositNFT(depositArgs.serialize());

    // Now, withdraw it
    const withdrawArgs = new Args().addU64(tokenId);
    withdrawNFT(withdrawArgs.serialize());

    // Verify it's gone
    const isDepositedResult = isNFTDeposited(withdrawArgs.serialize());
    expect(bytesToString(isDepositedResult)).toBe("false");
  });

  it("should prevent non-owner from depositing", () => {
    const nftContract = new Address(MOCK_NFT_ADDRESS);
    const tokenId: u64 = 1;
    // Set owner to someone else
    Storage.setOf(nftContract, stringToBytes('OWNER_' + tokenId.toString()), stringToBytes("AS1AnotherAddress"));

    Context.setCaller(new Address(MOCK_USER_ADDRESS));
    const depositArgs = new Args().addU64(tokenId);
    
    expect(() => {
      depositNFT(depositArgs.serialize());
    }).toThrow("Not NFT owner");
  });
});
