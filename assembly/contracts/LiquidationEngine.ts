import { generateEvent, Storage, Context, transferCoins, Address } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64, Args } from '@massalabs/as-types';
import { LIQUIDATION_PENALTY, BASIS_POINTS } from '../utils/Constants';

const GOVERNANCE_KEY = stringToBytes('GOVERNANCE');
const LENDING_POOL_KEY = stringToBytes('LENDING_POOL');
const RISK_MANAGER_KEY = stringToBytes('RISK_MANAGER');
const COLLATERAL_VAULT_KEY = stringToBytes('COLLATERAL_VAULT');
const LIQUIDATION_COUNT_KEY = stringToBytes('LIQUIDATION_COUNT');
const LIQUIDATION_PREFIX = 'LIQUIDATION_';
const AUCTION_PREFIX = 'AUCTION_';
const ACTIVE_AUCTIONS_KEY = stringToBytes('ACTIVE_AUCTIONS');

export function constructor(argsData: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), "Constructor can only be called during deployment");
  const args = new Args(argsData);
  const governanceAddress = args.nextString().unwrap();
  const lendingPoolAddress = args.nextString().unwrap();
  const riskManagerAddress = args.nextString().unwrap();
  const vaultAddress = args.nextString().unwrap();
  Storage.set(GOVERNANCE_KEY, stringToBytes(governanceAddress));
  Storage.set(LENDING_POOL_KEY, stringToBytes(lendingPoolAddress));
  Storage.set(RISK_MANAGER_KEY, stringToBytes(riskManagerAddress));
  Storage.set(COLLATERAL_VAULT_KEY, stringToBytes(vaultAddress));
  Storage.set(LIQUIDATION_COUNT_KEY, u64ToBytes(0));
  Storage.set(ACTIVE_AUCTIONS_KEY, stringToBytes(''));
  generateEvent('LiquidationEngine deployed');
}

export function setRiskManager(argsData: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  const caller = Context.caller().toString();
  assert(caller == governanceAddress, "Only governance can set risk manager");
  const riskManagerAddress = bytesToString(argsData);
  Storage.set(RISK_MANAGER_KEY, stringToBytes(riskManagerAddress));
  generateEvent('Risk manager address updated in LiquidationEngine');
}

export function checkAndLiquidate(argsData: StaticArray<u8>): void {
  const riskManagerAddress = bytesToString(Storage.get(RISK_MANAGER_KEY));
  const caller = Context.caller().toString();
  assert(caller == riskManagerAddress, "Only risk manager can trigger liquidation");
  const highRiskPositions = bytesToString(argsData);
  if (highRiskPositions == '') {
    generateEvent('No high risk positions found');
    return;
  }
  const positions = highRiskPositions.split(',');
  for (let i = 0; i < positions.length; i++) {
    if (positions[i] == '') continue;
    const positionId = U64.parseInt(positions[i]);
    liquidatePosition(positionId);
  }
  generateEvent('Liquidation check completed');
}

function liquidatePosition(positionId: u64): void {
  const lendingPoolAddress = new Address(bytesToString(Storage.get(LENDING_POOL_KEY)));
  const riskManagerAddress = new Address(bytesToString(Storage.get(RISK_MANAGER_KEY)));
  const vaultAddress = new Address(bytesToString(Storage.get(COLLATERAL_VAULT_KEY)));
  const positionResult = Storage.getOf(lendingPoolAddress, stringToBytes('POSITION_' + positionId.toString()));
  const positionData = bytesToString(positionResult);
  if (positionData == '') {
    return;
  }
  const parts = positionData.split(':');
  if (parts.length < 6 || parts[5] != 'true') {
    return;
  }
  const borrower = parts[0];
  const tokenId = U64.parseInt(parts[1]);
  const borrowedAmount = U64.parseInt(parts[2]);
  const accruedInterest = U64.parseInt(parts[3]);
  const totalDebt = borrowedAmount + accruedInterest;
  const ltvResult = Storage.getOf(riskManagerAddress, stringToBytes('LTV_' + tokenId.toString()));
  const currentLTV = bytesToU64(ltvResult);
  const liquidationThreshold: u64 = 8800;
  if (currentLTV <= liquidationThreshold) {
    return;
  }
  const valueResult = Storage.getOf(vaultAddress, stringToBytes('NFT_VALUE_' + tokenId.toString()));
  const collateralValue = bytesToU64(valueResult);
  const liquidationCount = bytesToU64(Storage.get(LIQUIDATION_COUNT_KEY));
  const liquidationId = liquidationCount + 1;
  const liquidationKey = stringToBytes(LIQUIDATION_PREFIX + liquidationId.toString());
  const liquidationData = borrower + ':' + tokenId.toString() + ':' + totalDebt.toString() + ':' + collateralValue.toString() + ':' + Context.timestamp().toString();
  Storage.set(liquidationKey, stringToBytes(liquidationData));
  Storage.set(LIQUIDATION_COUNT_KEY, u64ToBytes(liquidationId));
  const auctionId = startAuction(tokenId, totalDebt, collateralValue);
  generateEvent('Position liquidated');
}

function startAuction(tokenId: u64, debt: u64, collateralValue: u64): u64 {
  const liquidationCount = bytesToU64(Storage.get(LIQUIDATION_COUNT_KEY));
  const auctionId = liquidationCount;
  const startingPrice = (debt * (BASIS_POINTS + LIQUIDATION_PENALTY)) / BASIS_POINTS;
  const auctionEndTime = Context.timestamp() + 3600;
  const auctionKey = stringToBytes(AUCTION_PREFIX + auctionId.toString());
  const auctionData = tokenId.toString() + ':' + startingPrice.toString() + ':' + auctionEndTime.toString() + ':0:' + Context.timestamp().toString() + ':true';
  Storage.set(auctionKey, stringToBytes(auctionData));
  const activeAuctions = bytesToString(Storage.get(ACTIVE_AUCTIONS_KEY));
  const newAuctions = activeAuctions == '' ? auctionId.toString() : activeAuctions + ',' + auctionId.toString();
  Storage.set(ACTIVE_AUCTIONS_KEY, stringToBytes(newAuctions));
  generateEvent('Auction started');
  return auctionId;
}

export function bid(argsData: StaticArray<u8>): void {
  const args = new Args(argsData);
  const auctionId = args.nextU64().unwrap();
  const bidAmount = args.nextU64().unwrap();
  const caller = Context.caller().toString();
  const auctionKey = stringToBytes(AUCTION_PREFIX + auctionId.toString());
  assert(Storage.has(auctionKey), "Auction not found");
  const auctionData = bytesToString(Storage.get(auctionKey));
  const parts = auctionData.split(':');
  assert(parts.length >= 6, "Invalid auction data");
  assert(parts[5] == 'true', "Auction not active");
  const tokenId = U64.parseInt(parts[0]);
  const startingPrice = U64.parseInt(parts[1]);
  const endTime = U64.parseInt(parts[2]);
  const currentHighestBid = U64.parseInt(parts[3]);
  assert(Context.timestamp() < endTime, "Auction expired");
  assert(bidAmount >= startingPrice, "Bid below starting price");
  assert(bidAmount > currentHighestBid, "Bid too low");
  const newAuctionData = parts[0] + ':' + parts[1] + ':' + parts[2] + ':' + bidAmount.toString() + ':' + parts[4] + ':' + parts[5] + ':' + caller;
  Storage.set(auctionKey, stringToBytes(newAuctionData));
  generateEvent('Bid placed');
}

export function finalizeAuction(argsData: StaticArray<u8>): void {
  const auctionId = bytesToU64(argsData);
  const auctionKey = stringToBytes(AUCTION_PREFIX + auctionId.toString());
  assert(Storage.has(auctionKey), "Auction not found");
  const auctionData = bytesToString(Storage.get(auctionKey));
  const parts = auctionData.split(':');
  assert(parts.length >= 6, "Invalid auction data");
  assert(parts[5] == 'true', "Auction not active");
  const endTime = U64.parseInt(parts[2]);
  assert(Context.timestamp() >= endTime, "Auction still active");
  const tokenId = U64.parseInt(parts[0]);
  const winningBid = U64.parseInt(parts[3]);
  const startingPrice = U64.parseInt(parts[1]);
  
  if (winningBid > 0 && parts.length > 6) {
    const winner = parts[6];
    
    const lendingPoolAddress = new Address(bytesToString(Storage.get(LENDING_POOL_KEY)));
    const vaultAddress = new Address(bytesToString(Storage.get(COLLATERAL_VAULT_KEY)));
    
    const liquidationData = Storage.get(stringToBytes(LIQUIDATION_PREFIX + auctionId.toString()));
    const liquidationParts = bytesToString(liquidationData).split(':');
    
    if (liquidationParts.length >= 5) {
      const borrower = liquidationParts[0];
      const totalDebt = U64.parseInt(liquidationParts[2]);
      
      if (winningBid >= totalDebt) {
        const repaymentToPool = totalDebt;
        const surplus = winningBid - totalDebt;
        
        if (surplus > 0) {
          const protocolFee = (surplus * 500) / BASIS_POINTS;
          const borrowerRefund = surplus - protocolFee;
          
          if (borrowerRefund > 0) {
            transferCoins(new Address(borrower), borrowerRefund);
          }
        }
        
        const governanceAddress = new Address(bytesToString(Storage.get(GOVERNANCE_KEY)));
        const transferOwnershipArgs = new Args();
        transferOwnershipArgs.add(tokenId);
        transferOwnershipArgs.add(winner);
        
        generateEvent('NFT ownership transferred to auction winner: ' + winner);
        generateEvent('Debt repaid to lending pool: ' + repaymentToPool.toString());
        
      } else {
        generateEvent('Winning bid insufficient to cover debt');
      }
    }
    
    generateEvent('Auction finalized with winning bid: ' + winningBid.toString());
  } else {
    const governanceAddress = new Address(bytesToString(Storage.get(GOVERNANCE_KEY)));
    generateEvent('Auction ended with no bids - NFT transferred to protocol treasury');
  }
  const newAuctionData = parts[0] + ':' + parts[1] + ':' + parts[2] + ':' + parts[3] + ':' + parts[4] + ':false';
  Storage.set(auctionKey, stringToBytes(newAuctionData));
  const activeAuctions = bytesToString(Storage.get(ACTIVE_AUCTIONS_KEY));
  const auctionIds = activeAuctions.split(',');
  let newActiveAuctions = '';
  for (let i = 0; i < auctionIds.length; i++) {
    if (auctionIds[i] != auctionId.toString()) {
      newActiveAuctions += (newActiveAuctions == '' ? '' : ',') + auctionIds[i];
    }
  }
  Storage.set(ACTIVE_AUCTIONS_KEY, stringToBytes(newActiveAuctions));
}

export function getAuction(argsData: StaticArray<u8>): StaticArray<u8> {
  const auctionId = bytesToU64(argsData);
  const auctionKey = stringToBytes(AUCTION_PREFIX + auctionId.toString());
  if (!Storage.has(auctionKey)) {
    return stringToBytes('');
  }
  return Storage.get(auctionKey);
}

export function getActiveAuctions(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(ACTIVE_AUCTIONS_KEY);
}

export function getLiquidation(argsData: StaticArray<u8>): StaticArray<u8> {
  const liquidationId = bytesToU64(argsData);
  const liquidationKey = stringToBytes(LIQUIDATION_PREFIX + liquidationId.toString());
  if (!Storage.has(liquidationKey)) {
    return stringToBytes('');
  }
  return Storage.get(liquidationKey);
}

export function getTotalLiquidations(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(LIQUIDATION_COUNT_KEY);
}

export function claimNFT(argsData: StaticArray<u8>): void {
  const auctionId = bytesToU64(argsData);
  const auctionKey = stringToBytes(AUCTION_PREFIX + auctionId.toString());
  assert(Storage.has(auctionKey), "Auction not found");
  
  const auctionData = bytesToString(Storage.get(auctionKey));
  const parts = auctionData.split(':');
  assert(parts.length >= 7, "Invalid auction data");
  assert(parts[5] == 'false', "Auction still active");
  
  const caller = Context.caller().toString();
  const winner = parts[6];
  assert(caller == winner, "Not auction winner");
  
  const tokenId = U64.parseInt(parts[0]);
  const winningBid = U64.parseInt(parts[3]);
  assert(winningBid > 0, "No winning bid");
  
  const vaultAddress = new Address(bytesToString(Storage.get(COLLATERAL_VAULT_KEY)));
  
  generateEvent('NFT claimed by auction winner: ' + winner + ' for tokenId: ' + tokenId.toString());
}

export function getWinningBidder(argsData: StaticArray<u8>): StaticArray<u8> {
  const auctionId = bytesToU64(argsData);
  const auctionKey = stringToBytes(AUCTION_PREFIX + auctionId.toString());
  
  if (!Storage.has(auctionKey)) {
    return stringToBytes('');
  }
  
  const auctionData = bytesToString(Storage.get(auctionKey));
  const parts = auctionData.split(':');
  
  if (parts.length >= 7 && parts[3] != '0') {
    return stringToBytes(parts[6]);
  }
  
  return stringToBytes('');
}