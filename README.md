# Alpaca LB - Autonomous Lending Protocol

A Pure-On-Chain Lending Platform built on Massa blockchain, leveraging Autonomous Smart Contracts (ASC) and Real World Assets (RWA) as collateral.

## Features

- **Autonomous Interest Accrual**: Self-executing interest calculations every 15 minutes
- **Dynamic Risk Management**: Continuous LTV adjustments based on PD/LGD models
- **Automated Liquidations**: ASC-powered liquidation engine with guaranteed execution
- **RWA Collateral**: Support for enterprise NFTs representing receivables and bills
- **DeWeb Frontend**: Unstoppable interface hosted on Massa's decentralized web

## Architecture

```
CollateralVault ← Enterprise NFT deposits
    ↓
RiskManager (self-awakening) → Dynamic LTV calculation
    ↓
LendingPool (self-awakening) → Interest accrual & lending
    ↓
LiquidationEngine (self-awakening) → Automated liquidations
```

## Quick Start

### Prerequisites

- Node.js 18+
- Massa wallet with testnet MAS
- Git

### Installation

```bash
git clone https://github.com/your-repo/alpaca-lb
cd alpaca-lb
npm install
```

### Configuration

1. Copy `.env.example` to `.env`
2. Add your private key

### Build & Deploy

```bash
npm run build
npm run deploy
```

### Run Frontend

```bash
cd front-end
npm install
npm run dev
```

## Smart Contracts

### CollateralVault.ts
Manages enterprise NFT collateral deposits and share minting.

### LendingPool.ts
Core lending engine with autonomous interest calculation.

### RiskManager.ts
Dynamic LTV calculation based on PD/LGD risk models.

### LiquidationEngine.ts
Automated liquidation and auction system.

### Oracle.ts
TWAP price feed and RWA discount curve provider.

### Governance.ts
Protocol parameter governance and emergency controls.

## User Roles

- **Lenders**: Deposit MAS, receive interest-bearing tokens
- **Borrowers**: Deposit RWA NFT collateral, borrow MAS
- **System**: Autonomous operation via ASC

## Security

- Reentrancy protection
- TWAP manipulation resistance
- Multi-signature governance
- Emergency pause mechanisms
- Automated risk monitoring

## License

MIT License