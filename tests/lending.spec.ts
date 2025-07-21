import { Args } from "@massalabs/as-types";
import { Storage, Context } from "@massalabs/massa-as-sdk";
import { 
  constructor,
  startAccrual,
  deposit,
  withdraw,
  borrow,
  repay,
  accrueInterest,
  getTotalDeposits,
  getTotalBorrows,
  getCurrentInterestRate,
  getUserDeposits,
  getPosition
} from "../assembly/contracts/LendingPool";

describe("LendingPool Contract", () => {
  beforeEach(() => {
    Storage.clear();
    
    const constructorArgs = new Args()
      .addString("AS1TestGovernance")
      .addString("AS1TestRiskManager")
      .addString("AS1TestVault");
    
    Context.setDeployingContract(true);
    constructor(constructorArgs.serialize());
    Context.setDeployingContract(false);
    
    Context.setCaller("AS1TestGovernance");
    startAccrual(new StaticArray<u8>(0));
  });
  
  it("should handle deposits correctly", () => {
    Context.setCaller("AS1TestUser");
    Context.setTransferredCoins(1000000);
    
    const result = deposit(new StaticArray<u8>(0));
    const depositedAmount = new Args(result).nextU64();
    
    expect(depositedAmount).toBe(1000000);
    
    const totalDepositsResult = getTotalDeposits(new StaticArray<u8>(0));
    const totalDeposits = new Args(totalDepositsResult).nextU64();
    expect(totalDeposits).toBe(1000000);
    
    const userDepositsResult = getUserDeposits(new Args().addString("AS1TestUser").serialize());
    const userDeposits = new Args(userDepositsResult).nextU64();
    expect(userDeposits).toBe(1000000);
  });
  
  it("should handle withdrawals correctly", () => {
    Context.setCaller("AS1TestUser");
    Context.setTransferredCoins(1000000);
    Context.setBalance(1000000);
    
    deposit(new StaticArray<u8>(0));
    
    const withdrawArgs = new Args().addU64(500000);
    withdraw(withdrawArgs.serialize());
    
    const totalDepositsResult = getTotalDeposits(new StaticArray<u8>(0));
    const totalDeposits = new Args(totalDepositsResult).nextU64();
    expect(totalDeposits).toBe(500000);
    
    const userDepositsResult = getUserDeposits(new Args().addString("AS1TestUser").serialize());
    const userDeposits = new Args(userDepositsResult).nextU64();
    expect(userDeposits).toBe(500000);
  });
  
  it("should handle borrowing correctly", () => {
    Context.setCaller("AS1TestLender");
    Context.setTransferredCoins(10000000);
    Context.setBalance(10000000);
    
    deposit(new StaticArray<u8>(0));
    
    Context.setCaller("AS1TestBorrower");
    Context.setBalance(0);
    
    const borrowArgs = new Args()
      .addU64(1)
      .addU64(1000000);
    
    const result = borrow(borrowArgs.serialize());
    const positionId = new Args(result).nextU64();
    
    expect(positionId).toBe(1);
    
    const totalBorrowsResult = getTotalBorrows(new StaticArray<u8>(0));
    const totalBorrows = new Args(totalBorrowsResult).nextU64();
    expect(totalBorrows).toBe(1000000);
    
    const positionResult = getPosition(new Args().addU64(1).serialize());
    const positionData = new Args(positionResult).nextString();
    
    expect(positionData).toContain("AS1TestBorrower");
    expect(positionData).toContain("1000000");
  });
  
  it("should handle repayment correctly", () => {
    Context.setCaller("AS1TestLender");
    Context.setTransferredCoins(10000000);
    Context.setBalance(10000000);
    
    deposit(new StaticArray<u8>(0));
    
    Context.setCaller("AS1TestBorrower");
    Context.setBalance(0);
    
    const borrowArgs = new Args()
      .addU64(1)
      .addU64(1000000);
    
    borrow(borrowArgs.serialize());
    
    Context.setTransferredCoins(1050000);
    Context.setBalance(1050000);
    
    const repayArgs = new Args().addU64(1);
    repay(repayArgs.serialize());
    
    const totalBorrowsResult = getTotalBorrows(new StaticArray<u8>(0));
    const totalBorrows = new Args(totalBorrowsResult).nextU64();
    expect(totalBorrows).toBe(0);
    
    const positionResult = getPosition(new Args().addU64(1).serialize());
    const positionData = new Args(positionResult).nextString();
    
    expect(positionData).toContain("false");
  });
  
  it("should accrue interest correctly", () => {
    Context.setCaller("AS1TestLender");
    Context.setTransferredCoins(10000000);
    
    deposit(new StaticArray<u8>(0));
    
    Context.setCaller("AS1TestBorrower");
    Context.setBalance(0);
    
    const borrowArgs = new Args()
      .addU64(1)
      .addU64(1000000);
    
    borrow(borrowArgs.serialize());
    
    Context.setTimestamp(Context.timestamp() + 1000);
    Context.setPeriod(Context.currentPeriod() + 100);
    
    accrueInterest(new StaticArray<u8>(0));
    
    const interestRateResult = getCurrentInterestRate(new StaticArray<u8>(0));
    const interestRate = new Args(interestRateResult).nextU64();
    
    expect(interestRate).toBeGreaterThan(200);
  });
  
  it("should prevent unauthorized access", () => {
    Context.setCaller("AS1UnauthorizedUser");
    
    expect(() => {
      startAccrual(new StaticArray<u8>(0));
    }).toThrow();
  });
  
  it("should prevent borrowing without sufficient collateral", () => {
    Context.setCaller("AS1TestBorrower");
    
    const borrowArgs = new Args()
      .addU64(999)
      .addU64(1000000);
    
    expect(() => {
      borrow(borrowArgs.serialize());
    }).toThrow();
  });
  
  it("should prevent withdrawing more than deposited", () => {
    Context.setCaller("AS1TestUser");
    Context.setTransferredCoins(1000000);
    Context.setBalance(1000000);
    
    deposit(new StaticArray<u8>(0));
    
    const withdrawArgs = new Args().addU64(2000000);
    
    expect(() => {
      withdraw(withdrawArgs.serialize());
    }).toThrow();
  });
  
  it("should calculate utilization rate correctly", () => {
    Context.setCaller("AS1TestLender");
    Context.setTransferredCoins(10000000);
    Context.setBalance(10000000);
    
    deposit(new StaticArray<u8>(0));
    
    Context.setCaller("AS1TestBorrower");
    Context.setBalance(0);
    
    const borrowArgs = new Args()
      .addU64(1)
      .addU64(2000000);
    
    borrow(borrowArgs.serialize());
    
    const utilizationResult = getUtilizationRate(new StaticArray<u8>(0));
    const utilization = new Args(utilizationResult).nextU64();
    
    expect(utilization).toBe(2000);
  });
});