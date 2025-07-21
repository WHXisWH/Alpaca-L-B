import { generateEvent, Storage, Context, sendMessage, Address } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64, Args } from '@massalabs/as-types';
import { RISK_EVALUATION_INTERVAL, DEFAULT_LTV, MAX_LTV, MIN_LTV, BASIS_POINTS } from '../utils/Constants';

const GOVERNANCE_KEY = stringToBytes('GOVERNANCE');
const ORACLE_KEY = stringToBytes('ORACLE');
const COLLATERAL_VAULT_KEY = stringToBytes('COLLATERAL_VAULT');
const LIQUIDATION_ENGINE_KEY = stringToBytes('LIQUIDATION_ENGINE');
const NEXT_EVALUATION_KEY = stringToBytes('NEXT_EVALUATION');
const POSITION_LTV_PREFIX = 'LTV_';
const HIGH_RISK_POSITIONS_KEY = stringToBytes('HIGH_RISK_POSITIONS');
const EVALUATION_ACTIVE_KEY = stringToBytes('EVALUATION_ACTIVE');

export function constructor(argsData: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), "Constructor can only be called during deployment");
  
  const args = new Args(argsData);
  const governanceAddress = args.nextString().unwrap();
  const oracleAddress = args.nextString().unwrap();
  const vaultAddress = args.nextString().unwrap();
  const liquidationAddress = args.nextString().unwrap();
  
  Storage.set(GOVERNANCE_KEY, stringToBytes(governanceAddress));
  Storage.set(ORACLE_KEY, stringToBytes(oracleAddress));
  Storage.set(COLLATERAL_VAULT_KEY, stringToBytes(vaultAddress));
  Storage.set(LIQUIDATION_ENGINE_KEY, stringToBytes(liquidationAddress));
  Storage.set(EVALUATION_ACTIVE_KEY, stringToBytes('false'));
  Storage.set(HIGH_RISK_POSITIONS_KEY, stringToBytes(''));
  
  generateEvent('RiskManager deployed');
}

export function startEvaluation(_: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  const caller = Context.caller().toString();
  assert(caller == governanceAddress, "Only governance can start evaluation");
  
  Storage.set(EVALUATION_ACTIVE_KEY, stringToBytes('true'));
  
  const cur_period = Context.currentPeriod();
  const cur_thread = Context.currentThread();
  let next_thread: u8 = cur_thread + 1;
  let next_period = cur_period;
  if (next_thread >= 32) {
    ++next_period;
    next_thread = 0;
  }
  
  sendMessage(
    Context.callee(),
    'evaluate',
    next_period,
    next_thread,
    next_period + 5,
    next_thread,
    500_000,
    0,
    0,
    []
  );
  
  generateEvent('Risk evaluation started');
}

export function stopEvaluation(_: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  const caller = Context.caller().toString();
  assert(caller == governanceAddress, "Only governance can stop evaluation");
  
  Storage.set(EVALUATION_ACTIVE_KEY, stringToBytes('false'));
  
  generateEvent('Risk evaluation stopped');
}

export function evaluate(_: StaticArray<u8>): void {
  const isActive = bytesToString(Storage.get(EVALUATION_ACTIVE_KEY));
  if (isActive != 'true') {
    return;
  }
  
  const oracleAddress = new Address(bytesToString(Storage.get(ORACLE_KEY)));
  const vaultAddress = new Address(bytesToString(Storage.get(COLLATERAL_VAULT_KEY)));
  const liquidationAddress = new Address(bytesToString(Storage.get(LIQUIDATION_ENGINE_KEY)));
  
  const twapResult = Storage.getOf(oracleAddress, stringToBytes('CURRENT_PRICE'));
  const currentPrice = bytesToU64(twapResult);
  
  let highRiskPositions = '';
  
  generateEvent('Risk evaluation completed');
  
  Storage.set(HIGH_RISK_POSITIONS_KEY, stringToBytes(highRiskPositions));
  
  const liquidationCall = new Args().add(highRiskPositions);
  
  const cur_period = Context.currentPeriod();
  const cur_thread = Context.currentThread();
  let next_thread: u8 = cur_thread + 1;
  let next_period = cur_period;
  if (next_thread >= 32) {
    ++next_period;
    next_thread = 0;
  }
  
  sendMessage(
    liquidationAddress,
    'checkAndLiquidate',
    next_period,
    next_thread,
    next_period + 5,
    next_thread,
    200_000,
    0,
    0,
    liquidationCall.serialize()
  );
  
  const eval_slots = RISK_EVALUATION_INTERVAL;
  const eval_periods_to_add = eval_slots / 32;
  const eval_thread_offset = eval_slots % 32;
  let eval_period = cur_period + eval_periods_to_add;
  let eval_thread: u8 = u8(cur_thread + eval_thread_offset);
  if (eval_thread >= 32) {
    eval_period += 1;
    eval_thread = eval_thread - 32;
  }
  
  sendMessage(
    Context.callee(),
    'evaluate',
    eval_period,
    eval_thread,
    eval_period + 5,
    eval_thread,
    500_000,
    0,
    0,
    []
  );
}

export function calculateLTV(argsData: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(argsData);
  const tokenId = args.nextU64().unwrap();
  const borrowAmount = args.nextU64().unwrap();
  
  const vaultAddress = new Address(bytesToString(Storage.get(COLLATERAL_VAULT_KEY)));
  
  const valueResult = Storage.getOf(vaultAddress, stringToBytes('NFT_VALUE_' + tokenId.toString()));
  const pdResult = Storage.getOf(vaultAddress, stringToBytes('NFT_PD_' + tokenId.toString()));
  const lgdResult = Storage.getOf(vaultAddress, stringToBytes('NFT_LGD_' + tokenId.toString()));
  
  const collateralValue = bytesToU64(valueResult);
  const pd = bytesToU64(pdResult);
  const lgd = bytesToU64(lgdResult);
  
  if (collateralValue == 0) {
    return u64ToBytes(0);
  }
  
  let baseLTV = DEFAULT_LTV;
  
  if (pd <= 100) {
    baseLTV = 8000;
  } else if (pd <= 500) {
    baseLTV = 7500;
  } else if (pd <= 1000) {
    baseLTV = 7000;
  } else if (pd <= 2000) {
    baseLTV = 6500;
  } else {
    baseLTV = 6000;
  }
  
  if (lgd > 5000) {
    baseLTV = baseLTV - (baseLTV * (lgd - 5000)) / BASIS_POINTS;
  }
  
  baseLTV = baseLTV > MAX_LTV ? MAX_LTV : baseLTV;
  baseLTV = baseLTV < MIN_LTV ? MIN_LTV : baseLTV;
  
  const maxBorrow = (collateralValue * baseLTV) / BASIS_POINTS;
  
  if (borrowAmount > maxBorrow) {
    return u64ToBytes(BASIS_POINTS);
  }
  
  const currentLTV = (borrowAmount * BASIS_POINTS) / collateralValue;
  
  Storage.set(stringToBytes(POSITION_LTV_PREFIX + tokenId.toString()), u64ToBytes(currentLTV));
  
  return u64ToBytes(currentLTV);
}

export function getLiquidationThreshold(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const vaultAddress = new Address(bytesToString(Storage.get(COLLATERAL_VAULT_KEY)));
  
  const pdResult = Storage.getOf(vaultAddress, stringToBytes('NFT_PD_' + tokenId.toString()));
  const lgdResult = Storage.getOf(vaultAddress, stringToBytes('NFT_LGD_' + tokenId.toString()));
  
  const pd = bytesToU64(pdResult);
  const lgd = bytesToU64(lgdResult);
  
  let baseLTV = DEFAULT_LTV;
  
  if (pd <= 100) {
    baseLTV = 8000;
  } else if (pd <= 500) {
    baseLTV = 7500;
  } else if (pd <= 1000) {
    baseLTV = 7000;
  } else if (pd <= 2000) {
    baseLTV = 6500;
  } else {
    baseLTV = 6000;
  }
  
  if (lgd > 5000) {
    baseLTV = baseLTV - (baseLTV * (lgd - 5000)) / BASIS_POINTS;
  }
  
  baseLTV = baseLTV > MAX_LTV ? MAX_LTV : baseLTV;
  baseLTV = baseLTV < MIN_LTV ? MIN_LTV : baseLTV;
  
  const liquidationThreshold = (baseLTV * 11) / 10;
  
  return u64ToBytes(liquidationThreshold);
}

export function getPositionLTV(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const ltvKey = stringToBytes(POSITION_LTV_PREFIX + tokenId.toString());
  
  if (!Storage.has(ltvKey)) {
    return u64ToBytes(0);
  }
  
  return Storage.get(ltvKey);
}

export function getHighRiskPositions(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(HIGH_RISK_POSITIONS_KEY);
}

export function isEvaluationActive(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(EVALUATION_ACTIVE_KEY);
}