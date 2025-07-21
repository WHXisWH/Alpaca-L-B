import { generateEvent, Storage, Context } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64, Args } from '@massalabs/as-types';

const OWNER_KEY = stringToBytes('OWNER');
const PAUSED_KEY = stringToBytes('PAUSED');
const LENDING_POOL_KEY = stringToBytes('LENDING_POOL');
const RISK_MANAGER_KEY = stringToBytes('RISK_MANAGER');
const LIQUIDATION_ENGINE_KEY = stringToBytes('LIQUIDATION_ENGINE');
const ORACLE_KEY = stringToBytes('ORACLE');
const COLLATERAL_VAULT_KEY = stringToBytes('COLLATERAL_VAULT');

export function constructor(_: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), "Constructor can only be called during deployment");
  
  const owner = Context.caller().toString();
  Storage.set(OWNER_KEY, stringToBytes(owner));
  
  generateEvent('Governance deployed');
}

export function setLendingPool(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can set lending pool");
  
  const poolAddress = bytesToString(argsData);
  Storage.set(LENDING_POOL_KEY, stringToBytes(poolAddress));
  
  generateEvent('Lending pool address updated');
}

export function setRiskManager(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can set risk manager");
  
  const riskAddress = bytesToString(argsData);
  Storage.set(RISK_MANAGER_KEY, stringToBytes(riskAddress));
  
  generateEvent('Risk manager address updated');
}

export function setLiquidationEngine(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can set liquidation engine");
  
  const liquidationAddress = bytesToString(argsData);
  Storage.set(LIQUIDATION_ENGINE_KEY, stringToBytes(liquidationAddress));
  
  generateEvent('Liquidation engine address updated');
}

export function setOracle(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can set oracle");
  
  const oracleAddress = bytesToString(argsData);
  Storage.set(ORACLE_KEY, stringToBytes(oracleAddress));
  
  generateEvent('Oracle address updated');
}

export function setCollateralVault(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can set collateral vault");
  
  const vaultAddress = bytesToString(argsData);
  Storage.set(COLLATERAL_VAULT_KEY, stringToBytes(vaultAddress));
  
  generateEvent('Collateral vault address updated');
}

export function pause(_: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can pause");
  
  Storage.set(PAUSED_KEY, stringToBytes('true'));
  
  generateEvent('System paused');
}

export function unpause(_: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can unpause");
  
  Storage.del(PAUSED_KEY);
  
  generateEvent('System unpaused');
}

export function isPaused(_: StaticArray<u8>): StaticArray<u8> {
  const paused = Storage.has(PAUSED_KEY);
  
  if (paused) {
    return stringToBytes('true');
  } else {
    return stringToBytes('false');
  }
}

export function getOwner(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(OWNER_KEY);
}

export function getLendingPool(_: StaticArray<u8>): StaticArray<u8> {
  if (!Storage.has(LENDING_POOL_KEY)) {
    return stringToBytes('');
  }
  return Storage.get(LENDING_POOL_KEY);
}

export function getRiskManager(_: StaticArray<u8>): StaticArray<u8> {
  if (!Storage.has(RISK_MANAGER_KEY)) {
    return stringToBytes('');
  }
  return Storage.get(RISK_MANAGER_KEY);
}

export function getLiquidationEngine(_: StaticArray<u8>): StaticArray<u8> {
  if (!Storage.has(LIQUIDATION_ENGINE_KEY)) {
    return stringToBytes('');
  }
  return Storage.get(LIQUIDATION_ENGINE_KEY);
}

export function getOracle(_: StaticArray<u8>): StaticArray<u8> {
  if (!Storage.has(ORACLE_KEY)) {
    return stringToBytes('');
  }
  return Storage.get(ORACLE_KEY);
}

export function getCollateralVault(_: StaticArray<u8>): StaticArray<u8> {
  if (!Storage.has(COLLATERAL_VAULT_KEY)) {
    return stringToBytes('');
  }
  return Storage.get(COLLATERAL_VAULT_KEY);
}

export function transferOwnership(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can transfer ownership");
  
  const newOwner = bytesToString(argsData);
  Storage.set(OWNER_KEY, stringToBytes(newOwner));
  
  generateEvent('Ownership transferred');
}