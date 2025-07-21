import { Args } from "@massalabs/as-types";
import { Storage, Context } from "@massalabs/massa-as-sdk";
import { 
  constructor,
  startEvaluation,
  stopEvaluation,
  evaluate,
  calculateLTV,
  getLiquidationThreshold,
  getPositionLTV,
  isEvaluationActive
} from "../assembly/contracts/RiskManager";

describe("RiskManager Contract", () => {
  beforeEach(() => {
    Storage.clear();
    
    const constructorArgs = new Args()
      .addString("AS1TestGovernance")
      .addString("AS1TestOracle")
      .addString("AS1TestVault")
      .addString("AS1TestLiquidation");
    
    Context.setDeployingContract(true);
    constructor(constructorArgs.serialize());
    Context.setDeployingContract(false);
  });
  
  it("should start and stop evaluation correctly", () => {
    Context.setCaller("AS1TestGovernance");
    Context.setPeriod(1000);
    Context.setThread(0);
    Context.setBalance(10000000);
    
    startEvaluation(new StaticArray<u8>(0));
    
    const isActiveResult = isEvaluationActive(new StaticArray<u8>(0));
    const isActive = new Args(isActiveResult).nextString();
    expect(isActive).toBe("true");
    
    stopEvaluation(new StaticArray<u8>(0));
    
    const isActiveResult2 = isEvaluationActive(new StaticArray<u8>(0));
    const isActive2 = new Args(isActiveResult2).nextString();
    expect(isActive2).toBe("false");
  });
  
  it("should calculate LTV correctly for low risk assets", () => {
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(10000000).serialize());
    Storage.setOf("AS1TestVault", "NFT_PD_1", new Args().addU64(50).serialize());
    Storage.setOf("AS1TestVault", "NFT_LGD_1", new Args().addU64(4000).serialize());
    
    const ltvArgs = new Args()
      .addU64(1)
      .addU64(7000000);
    
    const result = calculateLTV(ltvArgs.serialize());
    const ltv = new Args(result).nextU64();
    
    expect(ltv).toBe(7000);
    
    const positionLTVResult = getPositionLTV(new Args().addU64(1).serialize());
    const positionLTV = new Args(positionLTVResult).nextU64();
    expect(positionLTV).toBe(7000);
  });
  
  it("should calculate LTV correctly for high risk assets", () => {
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(10000000).serialize());
    Storage.setOf("AS1TestVault", "NFT_PD_1", new Args().addU64(2500).serialize());
    Storage.setOf("AS1TestVault", "NFT_LGD_1", new Args().addU64(6000).serialize());
    
    const ltvArgs = new Args()
      .addU64(1)
      .addU64(5000000);
    
    const result = calculateLTV(ltvArgs.serialize());
    const ltv = new Args(result).nextU64();
    
    expect(ltv).toBe(5000);
  });
  
  it("should calculate liquidation threshold correctly", () => {
    Storage.setOf("AS1TestVault", "NFT_PD_1", new Args().addU64(50).serialize());
    Storage.setOf("AS1TestVault", "NFT_LGD_1", new Args().addU64(4000).serialize());
    
    const thresholdResult = getLiquidationThreshold(new Args().addU64(1).serialize());
    const threshold = new Args(thresholdResult).nextU64();
    
    expect(threshold).toBeGreaterThan(8000);
    expect(threshold).toBeLessThanOrEqual(9000);
  });
  
  it("should handle different PD levels correctly", () => {
    const testCases = [
      { pd: 50, expectedBaseLTV: 8000 },
      { pd: 250, expectedBaseLTV: 7500 },
      { pd: 750, expectedBaseLTV: 7000 },
      { pd: 1500, expectedBaseLTV: 6500 },
      { pd: 3000, expectedBaseLTV: 6000 }
    ];
    
    testCases.forEach((testCase, index) => {
      const tokenId = index + 1;
      
      Storage.setOf("AS1TestVault", `NFT_VALUE_${tokenId}`, new Args().addU64(10000000).serialize());
      Storage.setOf("AS1TestVault", `NFT_PD_${tokenId}`, new Args().addU64(testCase.pd).serialize());
      Storage.setOf("AS1TestVault", `NFT_LGD_${tokenId}`, new Args().addU64(4000).serialize());
      
      const thresholdResult = getLiquidationThreshold(new Args().addU64(tokenId).serialize());
      const threshold = new Args(thresholdResult).nextU64();
      
      const expectedThreshold = (testCase.expectedBaseLTV * 11) / 10;
      expect(threshold).toBeCloseTo(expectedThreshold, 100);
    });
  });
  
  it("should adjust LTV based on LGD", () => {
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(10000000).serialize());
    Storage.setOf("AS1TestVault", "NFT_PD_1", new Args().addU64(100).serialize());
    Storage.setOf("AS1TestVault", "NFT_LGD_1", new Args().addU64(7000).serialize());
    
    const thresholdResult = getLiquidationThreshold(new Args().addU64(1).serialize());
    const threshold = new Args(thresholdResult).nextU64();
    
    const normalThresholdResult = getLiquidationThreshold(new Args().addU64(2).serialize());
    Storage.setOf("AS1TestVault", "NFT_VALUE_2", new Args().addU64(10000000).serialize());
    Storage.setOf("AS1TestVault", "NFT_PD_2", new Args().addU64(100).serialize());
    Storage.setOf("AS1TestVault", "NFT_LGD_2", new Args().addU64(4000).serialize());
    
    const normalThreshold = new Args(normalThresholdResult).nextU64();
    
    expect(threshold).toBeLessThan(normalThreshold);
  });
  
  it("should prevent unauthorized evaluation start", () => {
    Context.setCaller("AS1UnauthorizedUser");
    
    expect(() => {
      startEvaluation(new StaticArray<u8>(0));
    }).toThrow();
  });
  
  it("should handle evaluation execution correctly", () => {
    Context.setCaller("AS1TestGovernance");
    Context.setPeriod(1000);
    Context.setThread(0);
    Context.setBalance(10000000);
    
    startEvaluation(new StaticArray<u8>(0));
    
    Storage.setOf("AS1TestOracle", "CURRENT_PRICE", new Args().addU64(1100000).serialize());
    
    Context.setPeriod(Context.currentPeriod() + 100);
    evaluate(new StaticArray<u8>(0));
    
    const isActiveResult = isEvaluationActive(new StaticArray<u8>(0));
    const isActive = new Args(isActiveResult).nextString();
    expect(isActive).toBe("true");
  });
  
  it("should return zero LTV for zero collateral value", () => {
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(0).serialize());
    Storage.setOf("AS1TestVault", "NFT_PD_1", new Args().addU64(100).serialize());
    Storage.setOf("AS1TestVault", "NFT_LGD_1", new Args().addU64(4000).serialize());
    
    const ltvArgs = new Args()
      .addU64(1)
      .addU64(1000000);
    
    const result = calculateLTV(ltvArgs.serialize());
    const ltv = new Args(result).nextU64();
    
    expect(ltv).toBe(0);
  });
  
  it("should prevent borrowing above maximum LTV", () => {
    Storage.setOf("AS1TestVault", "NFT_VALUE_1", new Args().addU64(10000000).serialize());
    Storage.setOf("AS1TestVault", "NFT_PD_1", new Args().addU64(100).serialize());
    Storage.setOf("AS1TestVault", "NFT_LGD_1", new Args().addU64(4000).serialize());
    
    const ltvArgs = new Args()
      .addU64(1)
      .addU64(9000000);
    
    const result = calculateLTV(ltvArgs.serialize());
    const ltv = new Args(result).nextU64();
    
    expect(ltv).toBe(10000);
  });
});