import { generateEvent, Storage, Context, sendMessage, Address } from '@massalabs/massa-as-sdk';
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
  
  const args = new Args(argsData);
  const poolAddress = args.nextString().expect("Failed to decode LendingPool address.");
  
  Storage.set(LENDING_POOL_KEY, stringToBytes(poolAddress));
  
  generateEvent('Lending pool address updated');
}

export function setRiskManager(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can set risk manager");

  const args = new Args(argsData);
  const riskAddress = args.nextString().expect("Failed to decode RiskManager address.");

  Storage.set(RISK_MANAGER_KEY, stringToBytes(riskAddress));
  
  generateEvent('Risk manager address updated');
}

export function setLiquidationEngine(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can set liquidation engine");
  
  const args = new Args(argsData);
  const liquidationAddress = args.nextString().expect("Failed to decode LiquidationEngine address.");

  Storage.set(LIQUIDATION_ENGINE_KEY, stringToBytes(liquidationAddress));
  
  generateEvent('Liquidation engine address updated');
}

export function setOracle(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can set oracle");
  
  const args = new Args(argsData);
  const oracleAddress = args.nextString().expect("Failed to decode Oracle address.");

  Storage.set(ORACLE_KEY, stringToBytes(oracleAddress));
  
  generateEvent('Oracle address updated');
}

export function setCollateralVault(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can set collateral vault");
  
  const args = new Args(argsData);
  const vaultAddress = args.nextString().expect("Failed to decode CollateralVault address.");

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
  
  const args = new Args(argsData);
  const newOwner = args.nextString().expect("Failed to decode new owner address.");

  Storage.set(OWNER_KEY, stringToBytes(newOwner));
  
  generateEvent('Ownership transferred');
}

export function startLendingPoolAccrual(_: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can start lending pool accrual");
  
  const lendingPoolAddress = bytesToString(Storage.get(LENDING_POOL_KEY));
  assert(lendingPoolAddress != '', "Lending pool not set");
  
  const cur_period = Context.currentPeriod();
  const cur_thread = Context.currentThread();
  let next_thread: u8 = cur_thread + 1;
  let next_period = cur_period;
  if (next_thread >= 32) {
    ++next_period;
    next_thread = 0;
  }
  
  sendMessage(
    new Address(lendingPoolAddress),
    'startAccrual',
    next_period,
    next_thread,
    next_period + 5,
    next_thread,
    300_000,
    0,
    0,
    []
  );
  
  generateEvent('Lending pool accrual start triggered');
}

export function startRiskManagerEvaluation(_: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can start risk manager evaluation");
  
  const riskManagerAddress = bytesToString(Storage.get(RISK_MANAGER_KEY));
  assert(riskManagerAddress != '', "Risk manager not set");
  
  const cur_period = Context.currentPeriod();
  const cur_thread = Context.currentThread();
  let next_thread: u8 = cur_thread + 1;
  let next_period = cur_period;
  if (next_thread >= 32) {
    ++next_period;
    next_thread = 0;
  }
  
  sendMessage(
    new Address(riskManagerAddress),
    'startEvaluation',
    next_period,
    next_thread,
    next_period + 5,
    next_thread,
    500_000,
    0,
    0,
    []
  );
  
  generateEvent('Risk manager evaluation start triggered');
}