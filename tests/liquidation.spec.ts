import { Args } from "@massalabs/as-types";
import { Storage, Context } from "@massalabs/massa-as-sdk";
import { 
  constructor,
  checkAndLiquidate,
  bid,
  finalizeAuction,
  getAuction,
  getActiveAuctions,
  getLiquidation,
  getTotalLiquidations
} from "../assembly/contracts/LiquidationEngine";

describe("LiquidationEngine Contract", () => {
  beforeEach(() => {
    Storage.clear();
    
    const constructorArgs = new Args()
      .addString("AS1TestGovernance")
      .addString("AS1TestLendingPool")
      .addString("AS1TestRiskManager")
      .addString("AS1TestVault");
    
    Context.setDeployingContract(true);
    constructor(constructorArgs.serialize());
    Context.setDeployingContract(false);
  });
  
  it("should handle liquidation trigger correctly", () => {
    Context.setCaller("AS1TestRiskManager");
    
    Storage.setOf("AS1TestLendingPool", "POSITION_1", 
      new Args().addString("AS1TestBorrower:1:1000000:50000:1000:true").serialize());
    Storage.setOf("AS1TestRiskManager", "LTV_1", new Args().addU64(9000).serialize());
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(1000000).serialize());
    
    const highRiskPositions = "1";
    checkAndLiquidate(new Args().addString(highRiskPositions).serialize());
    
    const totalLiquidationsResult = getTotalLiquidations(new StaticArray<u8>(0));
    const totalLiquidations = new Args(totalLiquidationsResult).nextU64();
    expect(totalLiquidations).toBe(1);
    
    const liquidationResult = getLiquidation(new Args().addU64(1).serialize());
    const liquidationData = new Args(liquidationResult).nextString();
    expect(liquidationData).toContain("AS1TestBorrower");
    expect(liquidationData).toContain("1050000");
  });
  
  it("should create auction when liquidating", () => {
    Context.setCaller("AS1TestRiskManager");
    Context.setTimestamp(1000000);
    
    Storage.setOf("AS1TestLendingPool", "POSITION_1", 
      new Args().addString("AS1TestBorrower:1:1000000:50000:1000:true").serialize());
    Storage.setOf("AS1TestRiskManager", "LTV_1", new Args().addU64(9000).serialize());
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(1000000).serialize());
    
    const highRiskPositions = "1";
    checkAndLiquidate(new Args().addString(highRiskPositions).serialize());
    
    const activeAuctionsResult = getActiveAuctions(new StaticArray<u8>(0));
    const activeAuctions = new Args(activeAuctionsResult).nextString();
    expect(activeAuctions).toBe("1");
    
    const auctionResult = getAuction(new Args().addU64(1).serialize());
    const auctionData = new Args(auctionResult).nextString();
    const parts = auctionData.split(":");
    
    expect(parts[0]).toBe("1");
    expect(parseInt(parts[1])).toBeGreaterThan(1050000);
    expect(parts[5]).toBe("true");
  });
  
  it("should handle bidding correctly", () => {
    Context.setCaller("AS1TestRiskManager");
    Context.setTimestamp(1000000);
    
    Storage.setOf("AS1TestLendingPool", "POSITION_1", 
      new Args().addString("AS1TestBorrower:1:1000000:50000:1000:true").serialize());
    Storage.setOf("AS1TestRiskManager", "LTV_1", new Args().addU64(9000).serialize());
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(1000000).serialize());
    
    checkAndLiquidate(new Args().addString("1").serialize());
    
    Context.setCaller("AS1TestBidder");
    Context.setTimestamp(1001000);
    
    const bidArgs = new Args()
      .addU64(1)
      .addU64(1200000);
    
    bid(bidArgs.serialize());
    
    const auctionResult = getAuction(new Args().addU64(1).serialize());
    const auctionData = new Args(auctionResult).nextString();
    const parts = auctionData.split(":");
    
    expect(parts[3]).toBe("1200000");
    expect(parts[6]).toBe("AS1TestBidder");
  });
  
  it("should prevent bid below starting price", () => {
    Context.setCaller("AS1TestRiskManager");
    Context.setTimestamp(1000000);
    
    Storage.setOf("AS1TestLendingPool", "POSITION_1", 
      new Args().addString("AS1TestBorrower:1:1000000:50000:1000:true").serialize());
    Storage.setOf("AS1TestRiskManager", "LTV_1", new Args().addU64(9000).serialize());
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(1000000).serialize());
    
    checkAndLiquidate(new Args().addString("1").serialize());
    
    Context.setCaller("AS1TestBidder");
    Context.setTimestamp(1001000);
    
    const bidArgs = new Args()
      .addU64(1)
      .addU64(900000);
    
    expect(() => {
      bid(bidArgs.serialize());
    }).toThrow();
  });
  
  it("should prevent bid on expired auction", () => {
    Context.setCaller("AS1TestRiskManager");
    Context.setTimestamp(1000000);
    
    Storage.setOf("AS1TestLendingPool", "POSITION_1", 
      new Args().addString("AS1TestBorrower:1:1000000:50000:1000:true").serialize());
    Storage.setOf("AS1TestRiskManager", "LTV_1", new Args().addU64(9000).serialize());
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(1000000).serialize());
    
    checkAndLiquidate(new Args().addString("1").serialize());
    
    Context.setCaller("AS1TestBidder");
    Context.setTimestamp(1004000);
    
    const bidArgs = new Args()
      .addU64(1)
      .addU64(1200000);
    
    expect(() => {
      bid(bidArgs.serialize());
    }).toThrow();
  });
  
  it("should finalize auction correctly", () => {
    Context.setCaller("AS1TestRiskManager");
    Context.setTimestamp(1000000);
    
    Storage.setOf("AS1TestLendingPool", "POSITION_1", 
      new Args().addString("AS1TestBorrower:1:1000000:50000:1000:true").serialize());
    Storage.setOf("AS1TestRiskManager", "LTV_1", new Args().addU64(9000).serialize());
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(1000000).serialize());
    
    checkAndLiquidate(new Args().addString("1").serialize());
    
    Context.setCaller("AS1TestBidder");
    Context.setTimestamp(1001000);
    Context.setBalance(2000000);
    
    const bidArgs = new Args()
      .addU64(1)
      .addU64(1200000);
    
    bid(bidArgs.serialize());
    
    Context.setTimestamp(1004000);
    
    finalizeAuction(new Args().addU64(1).serialize());
    
    const auctionResult = getAuction(new Args().addU64(1).serialize());
    const auctionData = new Args(auctionResult).nextString();
    const parts = auctionData.split(":");
    
    expect(parts[5]).toBe("false");
    
    const activeAuctionsResult = getActiveAuctions(new StaticArray<u8>(0));
    const activeAuctions = new Args(activeAuctionsResult).nextString();
    expect(activeAuctions).toBe("");
  });
  
  it("should prevent finalizing active auction", () => {
    Context.setCaller("AS1TestRiskManager");
    Context.setTimestamp(1000000);
    
    Storage.setOf("AS1TestLendingPool", "POSITION_1", 
      new Args().addString("AS1TestBorrower:1:1000000:50000:1000:true").serialize());
    Storage.setOf("AS1TestRiskManager", "LTV_1", new Args().addU64(9000).serialize());
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(1000000).serialize());
    
    checkAndLiquidate(new Args().addString("1").serialize());
    
    Context.setTimestamp(1001000);
    
    expect(() => {
      finalizeAuction(new Args().addU64(1).serialize());
    }).toThrow();
  });
  
  it("should handle multiple auctions correctly", () => {
    Context.setCaller("AS1TestRiskManager");
    Context.setTimestamp(1000000);
    
    Storage.setOf("AS1TestLendingPool", "POSITION_1", 
      new Args().addString("AS1TestBorrower1:1:1000000:50000:1000:true").serialize());
    Storage.setOf("AS1TestLendingPool", "POSITION_2", 
      new Args().addString("AS1TestBorrower2:2:2000000:100000:1000:true").serialize());
    
    Storage.setOf("AS1TestRiskManager", "LTV_1", new Args().addU64(9000).serialize());
    Storage.setOf("AS1TestRiskManager", "LTV_2", new Args().addU64(9200).serialize());
    
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(1000000).serialize());
    Storage.setOf("AS1TestVault", "NFT_VALUE_2", new Args().addU64(2000000).serialize());
    
    checkAndLiquidate(new Args().addString("1,2").serialize());
    
    const totalLiquidationsResult = getTotalLiquidations(new StaticArray<u8>(0));
    const totalLiquidations = new Args(totalLiquidationsResult).nextU64();
    expect(totalLiquidations).toBe(2);
    
    const activeAuctionsResult = getActiveAuctions(new StaticArray<u8>(0));
    const activeAuctions = new Args(activeAuctionsResult).nextString();
    expect(activeAuctions).toContain("1");
    expect(activeAuctions).toContain("2");
  });
  
  it("should prevent unauthorized liquidation trigger", () => {
    Context.setCaller("AS1UnauthorizedUser");
    
    expect(() => {
      checkAndLiquidate(new Args().addString("1").serialize());
    }).toThrow();
  });
  
  it("should handle no high risk positions", () => {
    Context.setCaller("AS1TestRiskManager");
    
    checkAndLiquidate(new Args().addString("").serialize());
    
    const totalLiquidationsResult = getTotalLiquidations(new StaticArray<u8>(0));
    const totalLiquidations = new Args(totalLiquidationsResult).nextU64();
    expect(totalLiquidations).toBe(0);
  });
});