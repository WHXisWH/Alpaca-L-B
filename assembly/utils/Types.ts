export class Position {
    constructor(
      public borrower: string = '',
      public collateralId: u64 = 0,
      public collateralValue: u64 = 0,
      public borrowedAmount: u64 = 0,
      public accruedInterest: u64 = 0,
      public ltv: u64 = 0,
      public lastUpdate: u64 = 0,
      public isActive: bool = false
    ) {}
  }
  
  export class CollateralInfo {
    constructor(
      public id: u64 = 0,
      public owner: string = '',
      public value: u64 = 0,
      public pd: u64 = 0,
      public lgd: u64 = 0,
      public maturity: u64 = 0,
      public isDeposited: bool = false
    ) {}
  }
  
  export class RiskParams {
    constructor(
      public pd: u64 = 0,
      public lgd: u64 = 0,
      public ltv: u64 = 0,
      public liquidationThreshold: u64 = 0
    ) {}
  }
  
  export class PoolStats {
    constructor(
      public totalDeposits: u64 = 0,
      public totalBorrows: u64 = 0,
      public totalReserves: u64 = 0,
      public utilizationRate: u64 = 0,
      public currentInterestRate: u64 = 0,
      public lastAccrual: u64 = 0
    ) {}
  }