export const PRECISION = 1_000_000_000;
export const BASIS_POINTS = 10_000;

export const RISK_LEVELS = {
  LOW: { threshold: 6000, label: 'Low Risk', color: '#00ff88' },
  MEDIUM: { threshold: 8000, label: 'Medium Risk', color: '#ffaa00' },
  HIGH: { threshold: 10000, label: 'High Risk', color: '#ff4444' }
};

export const CONTRACT_NAMES = {
  collateralVault: 'Collateral Vault',
  lendingPool: 'Lending Pool',
  riskManager: 'Risk Manager',
  liquidationEngine: 'Liquidation Engine',
  oracle: 'Oracle',
  governance: 'Governance',
  mockNFT: 'Mock NFT'
};

export const TRANSACTION_STATES = {
  IDLE: 'idle',
  PENDING: 'pending',
  SUCCESS: 'success',
  ERROR: 'error'
};

export const TABS = {
  LEND: 'lend',
  BORROW: 'borrow',
  POSITIONS: 'positions',
  LIQUIDATIONS: 'liquidations'
};

export const DEFAULT_GAS_LIMIT = 500_000;
export const DEFAULT_FEE = '0.01';

export const NETWORK_CONFIG = {
  BUILDNET: {
    name: 'Massa Buildnet',
    rpcUrl: 'https://buildnet.massa.net/api/v2',
    explorerUrl: 'https://explorer.buildnet.massa.net'
  }
};

export const REFRESH_INTERVALS = {
  FAST: 5_000,
  NORMAL: 10_000,
  SLOW: 30_000
};