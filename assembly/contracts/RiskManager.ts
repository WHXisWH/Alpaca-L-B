import { generateEvent, Storage, Context, sendMessage, Address } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64, Args } from '@massalabs/as-types';
import { RISK_EVALUATION_INTERVAL, DEFAULT_LTV, MAX_LTV, MIN_LTV, BASIS_POINTS, DEFAULT_ORACLE_STALENESS } from '../utils/Constants';

const GOVERNANCE_KEY = stringToBytes('GOVERNANCE');
const ORACLE_KEY = stringToBytes('ORACLE');
const COLLATERAL_VAULT_KEY = stringToBytes('COLLATERAL_VAULT');
const LIQUIDATION_ENGINE_KEY = stringToBytes('LIQUIDATION_ENGINE');
const LENDING_POOL_KEY = stringToBytes('LENDING_POOL');
const POSITION_LTV_PREFIX = 'LTV_';
const HIGH_RISK_POSITIONS_KEY = stringToBytes('HIGH_RISK_POSITIONS');
const EVALUATION_ACTIVE_KEY = stringToBytes('EVALUATION_ACTIVE');
const LIQUIDATION_THRESHOLD_KEY = stringToBytes('LIQUIDATION_THRESHOLD');
const EVALUATION_INTERVAL_KEY = stringToBytes('EVALUATION_INTERVAL');
const ORACLE_STALENESS_WINDOW_KEY = stringToBytes('ORACLE_STALENESS_WINDOW');

export function constructor(argsData: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), "Constructor can only be called during deployment");

  const args = new Args(argsData);
  const governanceAddress = args.nextString().unwrap();
  const oracleAddress = args.nextString().unwrap();
  const vaultAddress = args.nextString().unwrap();

  Storage.set(GOVERNANCE_KEY, stringToBytes(governanceAddress));
  Storage.set(ORACLE_KEY, stringToBytes(oracleAddress));
  Storage.set(COLLATERAL_VAULT_KEY, stringToBytes(vaultAddress));
  Storage.set(EVALUATION_ACTIVE_KEY, stringToBytes('false'));
  Storage.set(HIGH_RISK_POSITIONS_KEY, stringToBytes(''));
  Storage.set(LIQUIDATION_THRESHOLD_KEY, u64ToBytes(8500));
  Storage.set(EVALUATION_INTERVAL_KEY, u64ToBytes(RISK_EVALUATION_INTERVAL));
  Storage.set(ORACLE_STALENESS_WINDOW_KEY, u64ToBytes(DEFAULT_ORACLE_STALENESS));

  generateEvent('RiskManager deployed');
}

export function setLendingPool(argsData: StaticArray<u8>): void {
    const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
    const caller = Context.caller().toString();
    assert(caller == governanceAddress, "Only governance can set lending pool");
    const lendingPoolAddress = bytesToString(argsData);
    Storage.set(LENDING_POOL_KEY, stringToBytes(lendingPoolAddress));
    generateEvent('Lending pool address updated in RiskManager');
}

export function setLiquidationEngine(argsData: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  const caller = Context.caller().toString();
  assert(caller == governanceAddress, "Only owner can set liquidation engine");
  const liquidationAddress = bytesToString(argsData);
  Storage.set(LIQUIDATION_ENGINE_KEY, stringToBytes(liquidationAddress));
  generateEvent('Liquidation engine address updated in RiskManager');
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
    200_000_000,
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

  const lendingPoolAddress = new Address(bytesToString(Storage.get(LENDING_POOL_KEY)));
  const vaultAddress = new Address(bytesToString(Storage.get(COLLATERAL_VAULT_KEY)));
  const oracleAddress = new Address(bytesToString(Storage.get(ORACLE_KEY)));
  const stalenessWindow = bytesToU64(Storage.get(ORACLE_STALENESS_WINDOW_KEY));

  let highRiskPositionsList: string[] = [];

  const activePositionsKey = stringToBytes('ACTIVE_POSITIONS');
  if (Storage.hasOf(lendingPoolAddress, activePositionsKey)) {
    const activePositionsData = bytesToString(Storage.getOf(lendingPoolAddress, activePositionsKey));
    
    if (activePositionsData != '') {
      const activePositions = activePositionsData.split(',');
      
      for (let i = 0; i < activePositions.length; i++) {
        const positionId = activePositions[i];
        if (positionId == '') continue;
        
        const positionKey = stringToBytes('POSITION_' + positionId);
        if (Storage.hasOf(lendingPoolAddress, positionKey)) {
          const positionData = bytesToString(Storage.getOf(lendingPoolAddress, positionKey));
          const parts = positionData.split(':');

          if (parts.length >= 6 && parts[5] == 'true') {
            const tokenId = U64.parseInt(parts[1]);
            const borrowedAmount = U64.parseInt(parts[2]);
            const accruedInterest = U64.parseInt(parts[3]);
            const totalDebt = borrowedAmount + accruedInterest;

            const valueKey = stringToBytes('NFT_VALUE_' + tokenId.toString());
            if (Storage.hasOf(vaultAddress, valueKey)) {
              const collateralValue = bytesToU64(Storage.getOf(vaultAddress, valueKey));
              const lastUpdateKey = stringToBytes('NFT_UPDATE_' + tokenId.toString());
              let isStale = true;
              if (Storage.hasOf(oracleAddress, lastUpdateKey)) {
                const lastUpdate = bytesToU64(Storage.getOf(oracleAddress, lastUpdateKey));
                const now = Context.timestamp();
                isStale = now - lastUpdate > stalenessWindow;
              }
              if (isStale) {
                continue;
              }
              if (collateralValue > 0) {
                const currentLTV = (totalDebt * BASIS_POINTS) / collateralValue;
                const liquidationThreshold = bytesToU64(Storage.get(LIQUIDATION_THRESHOLD_KEY));
                if (currentLTV > liquidationThreshold) {
                  highRiskPositionsList.push(positionId);
                }
              }
            }
          }
        }
      }
    }
  }

  const highRiskPositions = highRiskPositionsList.join(',');
  Storage.set(HIGH_RISK_POSITIONS_KEY, stringToBytes(highRiskPositions));
  
  const cur_period = Context.currentPeriod();
  const cur_thread = Context.currentThread();

  const liquidationAddress = new Address(bytesToString(Storage.get(LIQUIDATION_ENGINE_KEY)));
  if (liquidationAddress.toString() != '' && highRiskPositions != '') {
    let next_thread_liq: u8 = cur_thread + 1;
    let next_period_liq = cur_period;
    if (next_thread_liq >= 32) {
        ++next_period_liq;
        next_thread_liq = 0;
    }
    sendMessage(
        liquidationAddress,
        'checkAndLiquidate',
        next_period_liq,
        next_thread_liq,
        next_period_liq + 5,
        next_thread_liq,
        200_000_000,
        0,
        0,
        stringToBytes(highRiskPositions)
    );
  }

  const eval_slots = bytesToU64(Storage.get(EVALUATION_INTERVAL_KEY));
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
    200_000_000,
    0,
    0,
    []
  );

  generateEvent('Risk evaluation completed. High risk positions: ' + highRiskPositions);
}

export function calculateLTV(argsData: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(argsData);
  const tokenId = args.nextU64().unwrap();
  const borrowAmount = args.nextU64().unwrap();
  
  const vaultAddress = new Address(bytesToString(Storage.get(COLLATERAL_VAULT_KEY)));
  const oracleAddress = new Address(bytesToString(Storage.get(ORACLE_KEY)));
  const stalenessWindow = bytesToU64(Storage.get(ORACLE_STALENESS_WINDOW_KEY));
  
  const valueResult = Storage.getOf(vaultAddress, stringToBytes('NFT_VALUE_' + tokenId.toString()));
  const pdResult = Storage.getOf(vaultAddress, stringToBytes('NFT_PD_' + tokenId.toString()));
  const lgdResult = Storage.getOf(vaultAddress, stringToBytes('NFT_LGD_' + tokenId.toString()));
  const lastUpdateKey = stringToBytes('NFT_UPDATE_' + tokenId.toString());
  if (!Storage.hasOf(oracleAddress, lastUpdateKey)) {
    return u64ToBytes(0);
  }
  const lastUpdate = bytesToU64(Storage.getOf(oracleAddress, lastUpdateKey));
  const now = Context.timestamp();
  if (now - lastUpdate > stalenessWindow) {
    return u64ToBytes(0);
  }
  
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

export function getLendingPool(_: StaticArray<u8>): StaticArray<u8> {
    if (!Storage.has(LENDING_POOL_KEY)) {
        return stringToBytes('');
    }
  return Storage.get(LENDING_POOL_KEY);
}

export function setLiquidationThreshold(argsData: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  const caller = Context.caller().toString();
  assert(caller == governanceAddress, 'Only governance');
  const v = bytesToU64(argsData);
  Storage.set(LIQUIDATION_THRESHOLD_KEY, u64ToBytes(v));
  generateEvent('Liquidation threshold updated');
}

export function setEvaluationInterval(argsData: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  const caller = Context.caller().toString();
  assert(caller == governanceAddress, 'Only governance');
  const v = bytesToU64(argsData);
  Storage.set(EVALUATION_INTERVAL_KEY, u64ToBytes(v));
  generateEvent('Evaluation interval updated');
}

export function setOracleStalenessWindow(argsData: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  const caller = Context.caller().toString();
  assert(caller == governanceAddress, 'Only governance');
  const v = bytesToU64(argsData);
  Storage.set(ORACLE_STALENESS_WINDOW_KEY, u64ToBytes(v));
  generateEvent('Oracle staleness window updated');
}
