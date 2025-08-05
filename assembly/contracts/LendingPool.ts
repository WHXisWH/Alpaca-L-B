import { generateEvent, Storage, Context, transferredCoins, transferCoins, sendMessage, Address } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64, Args } from '@massalabs/as-types';
import { INTEREST_ACCRUAL_INTERVAL, BASE_INTEREST_RATE, INTEREST_RATE_SLOPE, BASIS_POINTS, MIN_BORROW_AMOUNT } from '../utils/Constants';

const GOVERNANCE_KEY = stringToBytes('GOVERNANCE');
const RISK_MANAGER_KEY = stringToBytes('RISK_MANAGER');
const COLLATERAL_VAULT_KEY = stringToBytes('COLLATERAL_VAULT');
const TOTAL_DEPOSITS_KEY = stringToBytes('TOTAL_DEPOSITS');
const TOTAL_BORROWS_KEY = stringToBytes('TOTAL_BORROWS');
const TOTAL_RESERVES_KEY = stringToBytes('TOTAL_RESERVES');
const LAST_ACCRUAL_KEY = stringToBytes('LAST_ACCRUAL');
const CURRENT_INTEREST_RATE_KEY = stringToBytes('CURRENT_RATE');
const USER_DEPOSITS_PREFIX = 'DEPOSIT_';
const POSITION_PREFIX = 'POSITION_';
const POSITION_COUNT_KEY = stringToBytes('POSITION_COUNT');
const ACCRUAL_ACTIVE_KEY = stringToBytes('ACCRUAL_ACTIVE');
const ACTIVE_POSITIONS_KEY = stringToBytes('ACTIVE_POSITIONS');
const LAST_INTEREST_UPDATE_PREFIX = 'LAST_UPDATE_';

export function constructor(argsData: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), "Constructor can only be called during deployment");

  const args = new Args(argsData);
  const governanceAddress = args.nextString().unwrap();
  const riskManagerAddress = args.nextString().unwrap();
  const vaultAddress = args.nextString().unwrap();

  Storage.set(GOVERNANCE_KEY, stringToBytes(governanceAddress));
  Storage.set(RISK_MANAGER_KEY, stringToBytes(riskManagerAddress));
  Storage.set(COLLATERAL_VAULT_KEY, stringToBytes(vaultAddress));
  Storage.set(TOTAL_DEPOSITS_KEY, u64ToBytes(0));
  Storage.set(TOTAL_BORROWS_KEY, u64ToBytes(0));
  Storage.set(TOTAL_RESERVES_KEY, u64ToBytes(0));
  Storage.set(LAST_ACCRUAL_KEY, u64ToBytes(Context.timestamp()));
  Storage.set(CURRENT_INTEREST_RATE_KEY, u64ToBytes(BASE_INTEREST_RATE));
  Storage.set(POSITION_COUNT_KEY, u64ToBytes(0));
  Storage.set(ACCRUAL_ACTIVE_KEY, stringToBytes('false'));
  Storage.set(ACTIVE_POSITIONS_KEY, stringToBytes(''));

  generateEvent('LendingPool deployed');
}

export function startAccrual(_: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  const caller = Context.caller().toString();
  assert(caller == governanceAddress, "Only governance can start accrual");

  Storage.set(ACCRUAL_ACTIVE_KEY, stringToBytes('true'));

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
    'accrueInterest',
    next_period,
    next_thread,
    next_period + 5,
    next_thread,
    200_000_000,
    0,
    0,
    []
  );

  generateEvent('Interest accrual started');
}

export function stopAccrual(_: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  const caller = Context.caller().toString();
  assert(caller == governanceAddress, "Only governance can stop accrual");

  Storage.set(ACCRUAL_ACTIVE_KEY, stringToBytes('false'));

  generateEvent('Interest accrual stopped');
}

export function deposit(_: StaticArray<u8>): StaticArray<u8> {
  const governanceAddress = new Address(bytesToString(Storage.get(GOVERNANCE_KEY)));
  const pausedKey = stringToBytes('PAUSED');
  assert(!Storage.hasOf(governanceAddress, pausedKey), "System is paused");

  const amount = transferredCoins();
  assert(amount > 0, "Invalid deposit amount");

  const caller = Context.caller().toString();
  const userDepositKey = stringToBytes(USER_DEPOSITS_PREFIX + caller);
  const currentDeposit = Storage.has(userDepositKey) ? bytesToU64(Storage.get(userDepositKey)) : 0;
  const totalDeposits = bytesToU64(Storage.get(TOTAL_DEPOSITS_KEY));

  Storage.set(userDepositKey, u64ToBytes(currentDeposit + amount));
  Storage.set(TOTAL_DEPOSITS_KEY, u64ToBytes(totalDeposits + amount));

  generateEvent('Deposit completed');

  return u64ToBytes(amount);
}

export function withdraw(argsData: StaticArray<u8>): void {
  const governanceAddress = new Address(bytesToString(Storage.get(GOVERNANCE_KEY)));
  const pausedKey = stringToBytes('PAUSED');
  assert(!Storage.hasOf(governanceAddress, pausedKey), "System is paused");

  const amount = bytesToU64(argsData);
  const caller = Context.caller().toString();
  const userDepositKey = stringToBytes(USER_DEPOSITS_PREFIX + caller);

  assert(Storage.has(userDepositKey), "No deposits found");

  const currentDeposit = bytesToU64(Storage.get(userDepositKey));
  assert(currentDeposit >= amount, "Insufficient balance");

  const totalDeposits = bytesToU64(Storage.get(TOTAL_DEPOSITS_KEY));
  const totalBorrows = bytesToU64(Storage.get(TOTAL_BORROWS_KEY));

  assert(totalDeposits - amount >= totalBorrows, "Insufficient liquidity");

  Storage.set(userDepositKey, u64ToBytes(currentDeposit - amount));
  Storage.set(TOTAL_DEPOSITS_KEY, u64ToBytes(totalDeposits - amount));

  transferCoins(new Address(caller), amount);

  generateEvent('Withdrawal completed');
}

export function borrow(argsData: StaticArray<u8>): StaticArray<u8> {
  const governanceAddress = new Address(bytesToString(Storage.get(GOVERNANCE_KEY)));
  const pausedKey = stringToBytes('PAUSED');
  assert(!Storage.hasOf(governanceAddress, pausedKey), "System is paused");

  const args = new Args(argsData);
  const tokenId = args.nextU64().unwrap();
  const amount = args.nextU64().unwrap();

  assert(amount >= MIN_BORROW_AMOUNT, "Amount below minimum");

  const caller = Context.caller().toString();
  const vaultAddress = new Address(bytesToString(Storage.get(COLLATERAL_VAULT_KEY)));
  const riskManagerAddress = new Address(bytesToString(Storage.get(RISK_MANAGER_KEY)));

  const isDepositedResult = Storage.getOf(vaultAddress, stringToBytes('DEPOSITED_' + tokenId.toString()));
  assert(bytesToString(isDepositedResult) == 'true', "NFT not deposited");

  const ownerResult = Storage.getOf(vaultAddress, stringToBytes('NFT_OWNER_' + tokenId.toString()));
  assert(bytesToString(ownerResult) == caller, "Not NFT owner");

  const positionCount = bytesToU64(Storage.get(POSITION_COUNT_KEY));
  const positionId = positionCount + 1;

  const positionKey = stringToBytes(POSITION_PREFIX + positionId.toString());
  const positionData = caller + ':' + tokenId.toString() + ':' + amount.toString() + ':0:' + Context.timestamp().toString() + ':true';
  Storage.set(positionKey, stringToBytes(positionData));

  Storage.set(POSITION_COUNT_KEY, u64ToBytes(positionId));
  
  const activePositions = bytesToString(Storage.get(ACTIVE_POSITIONS_KEY));
  let updatedActivePositions: string;
  if (activePositions == '') {
    updatedActivePositions = positionId.toString();
  } else {
    updatedActivePositions = activePositions + ',' + positionId.toString();
  }
  Storage.set(ACTIVE_POSITIONS_KEY, stringToBytes(updatedActivePositions));
  
  const lastUpdateKey = stringToBytes(LAST_INTEREST_UPDATE_PREFIX + positionId.toString());
  Storage.set(lastUpdateKey, u64ToBytes(Context.timestamp()));

  const totalBorrows = bytesToU64(Storage.get(TOTAL_BORROWS_KEY));
  Storage.set(TOTAL_BORROWS_KEY, u64ToBytes(totalBorrows + amount));

  transferCoins(new Address(caller), amount);

  generateEvent('Borrow completed');

  return u64ToBytes(positionId);
}

export function repay(argsData: StaticArray<u8>): void {
  const governanceAddress = new Address(bytesToString(Storage.get(GOVERNANCE_KEY)));
  const pausedKey = stringToBytes('PAUSED');
  assert(!Storage.hasOf(governanceAddress, pausedKey), "System is paused");

  const positionId = bytesToU64(argsData);
  const repayAmount = transferredCoins();

  const caller = Context.caller().toString();
  const positionKey = stringToBytes(POSITION_PREFIX + positionId.toString());

  assert(Storage.has(positionKey), "Position not found");

  const positionData = bytesToString(Storage.get(positionKey));
  const parts = positionData.split(':');

  assert(parts.length >= 6, "Invalid position data");
  assert(parts[0] == caller, "Not position owner");
  assert(parts[5] == 'true', "Position not active");

  const borrowedAmount = U64.parseInt(parts[2]);
  const accruedInterest = U64.parseInt(parts[3]);
  const totalDebt = borrowedAmount + accruedInterest;

  assert(repayAmount >= totalDebt, "Insufficient repayment");

  const tokenId = U64.parseInt(parts[1]);

  Storage.set(positionKey, stringToBytes(parts[0] + ':' + parts[1] + ':0:0:' + parts[4] + ':false'));

  const totalBorrows = bytesToU64(Storage.get(TOTAL_BORROWS_KEY));
  Storage.set(TOTAL_BORROWS_KEY, u64ToBytes(totalBorrows - borrowedAmount));
  
  const activePositions = bytesToString(Storage.get(ACTIVE_POSITIONS_KEY));
  const positionList = activePositions.split(',');
  let newActivePositions: string[] = [];
  
  for (let i = 0; i < positionList.length; i++) {
    if (positionList[i] != positionId.toString()) {
      newActivePositions.push(positionList[i]);
    }
  }
  
  const updatedActivePositions = newActivePositions.join(',');
  Storage.set(ACTIVE_POSITIONS_KEY, stringToBytes(updatedActivePositions));

  if (repayAmount > totalDebt) {
    transferCoins(new Address(caller), repayAmount - totalDebt);
  }

  generateEvent('Repayment completed');
}

export function accrueInterest(_: StaticArray<u8>): void {
  const isActive = bytesToString(Storage.get(ACCRUAL_ACTIVE_KEY));
  if (isActive != 'true') {
    return;
  }

  const currentTime = Context.timestamp();
  const lastAccrual = bytesToU64(Storage.get(LAST_ACCRUAL_KEY));
  const timeElapsed = currentTime - lastAccrual;

  const totalDeposits = bytesToU64(Storage.get(TOTAL_DEPOSITS_KEY));
  const totalBorrows = bytesToU64(Storage.get(TOTAL_BORROWS_KEY));

  if (totalBorrows == 0) {
    Storage.set(LAST_ACCRUAL_KEY, u64ToBytes(currentTime));

    const cur_period = Context.currentPeriod();
    const cur_thread = Context.currentThread();

    const accrual_slots = INTEREST_ACCRUAL_INTERVAL;
    const accrual_periods_to_add = accrual_slots / 32;
    const accrual_thread_offset = accrual_slots % 32;
    let next_period = cur_period + accrual_periods_to_add;
    let next_thread: u8 = u8(cur_thread + accrual_thread_offset);
    if (next_thread >= 32) {
      next_period += 1;
      next_thread = next_thread - 32;
    }

    sendMessage(
      Context.callee(),
      'accrueInterest',
      next_period,
      next_thread,
      next_period + 5,
      next_thread,
      200_000_000,
      0,
      0,
      []
    );
    return;
  }

  const utilization = totalDeposits > 0 ? (totalBorrows * BASIS_POINTS) / totalDeposits : 0;
  const interestRate = BASE_INTEREST_RATE + (utilization * INTEREST_RATE_SLOPE) / BASIS_POINTS;

  Storage.set(CURRENT_INTEREST_RATE_KEY, u64ToBytes(interestRate));
  Storage.set(LAST_ACCRUAL_KEY, u64ToBytes(currentTime));

  const activePositions = bytesToString(Storage.get(ACTIVE_POSITIONS_KEY));
  if (activePositions != '') {
    const positionList = activePositions.split(',');
    
    for (let i = 0; i < positionList.length; i++) {
      const positionId = positionList[i];
      if (positionId == '') continue;
      
      const positionKey = stringToBytes(POSITION_PREFIX + positionId);
      if (!Storage.has(positionKey)) continue;
      
      const positionData = bytesToString(Storage.get(positionKey));
      const parts = positionData.split(':');
      
      if (parts.length < 6 || parts[5] != 'true') continue;
      
      const borrowedAmount = U64.parseInt(parts[2]);
      const currentAccruedInterest = U64.parseInt(parts[3]);
      const lastUpdateKey = stringToBytes(LAST_INTEREST_UPDATE_PREFIX + positionId);
      
      let lastUpdate = currentTime;
      if (Storage.has(lastUpdateKey)) {
        lastUpdate = bytesToU64(Storage.get(lastUpdateKey));
      }
      
      const timeElapsedForPosition = currentTime - lastUpdate;
      if (timeElapsedForPosition > 0 && borrowedAmount > 0) {
        const interestAccrued = (borrowedAmount * interestRate * timeElapsedForPosition) / (BASIS_POINTS * 31536000);
        const newAccruedInterest = currentAccruedInterest + interestAccrued;
        
        const updatedPositionData = parts[0] + ':' + parts[1] + ':' + parts[2] + ':' + newAccruedInterest.toString() + ':' + parts[4] + ':' + parts[5];
        Storage.set(positionKey, stringToBytes(updatedPositionData));
        Storage.set(lastUpdateKey, u64ToBytes(currentTime));
      }
    }
  }

  generateEvent('Interest accrued for all positions');

  const cur_period = Context.currentPeriod();
  const cur_thread = Context.currentThread();

  const accrual_slots = INTEREST_ACCRUAL_INTERVAL;
  const accrual_periods_to_add = accrual_slots / 32;
  const accrual_thread_offset = accrual_slots % 32;
  let next_period = cur_period + accrual_periods_to_add;
  let next_thread: u8 = u8(cur_thread + accrual_thread_offset);
  if (next_thread >= 32) {
    next_period += 1;
    next_thread = next_thread - 32;
  }

  sendMessage(
    Context.callee(),
    'accrueInterest',
    next_period,
    next_thread,
    next_period + 5,
    next_thread,
    300_000,
    0,
    0,
    []
  );
}

export function getUserDeposits(argsData: StaticArray<u8>): StaticArray<u8> {
  const user = bytesToString(argsData);
  const userDepositKey = stringToBytes(USER_DEPOSITS_PREFIX + user);

  if (!Storage.has(userDepositKey)) {
    return u64ToBytes(0);
  }

  return Storage.get(userDepositKey);
}

export function getPosition(argsData: StaticArray<u8>): StaticArray<u8> {
  const positionId = bytesToU64(argsData);
  const positionKey = stringToBytes(POSITION_PREFIX + positionId.toString());

  if (!Storage.has(positionKey)) {
    return stringToBytes('');
  }

  return Storage.get(positionKey);
}

export function getTotalDeposits(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(TOTAL_DEPOSITS_KEY);
}

export function getTotalBorrows(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(TOTAL_BORROWS_KEY);
}

export function getCurrentInterestRate(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(CURRENT_INTEREST_RATE_KEY);
}

export function getUtilizationRate(_: StaticArray<u8>): StaticArray<u8> {
  const totalDeposits = bytesToU64(Storage.get(TOTAL_DEPOSITS_KEY));
  const totalBorrows = bytesToU64(Storage.get(TOTAL_BORROWS_KEY));

  if (totalDeposits == 0) {
    return u64ToBytes(0);
  }

  const utilization = (totalBorrows * BASIS_POINTS) / totalDeposits;
  return u64ToBytes(utilization);
}

export function isAccrualActive(_: StaticArray<u8>): StaticArray<u8> {
    return Storage.get(ACCRUAL_ACTIVE_KEY);
}

export function getActivePositions(_: StaticArray<u8>): StaticArray<u8> {
    return Storage.get(ACTIVE_POSITIONS_KEY);
}

export function getPositionCount(_: StaticArray<u8>): StaticArray<u8> {
    return Storage.get(POSITION_COUNT_KEY);
}