import { Storage, generateEvent, Context } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64 } from '@massalabs/as-types';
import { PRECISION, BASIS_POINTS } from './Constants';

export function requireAuth(requiredAddress: string): void {
  const caller = Context.caller().toString();
  assert(caller == requiredAddress, "Unauthorized access");
}

export function requireNotPaused(governanceAddress: string): void {
  const pausedKey = stringToBytes('PAUSED');
  const paused = Storage.hasOf(governanceAddress, pausedKey);
  assert(!paused, "System is paused");
}

export function getU64(key: string, defaultValue: u64 = 0): u64 {
  const keyBytes = stringToBytes(key);
  if (!Storage.has(keyBytes)) {
    return defaultValue;
  }
  return bytesToU64(Storage.get(keyBytes));
}

export function setU64(key: string, value: u64): void {
  Storage.set(stringToBytes(key), u64ToBytes(value));
}

export function getString(key: string, defaultValue: string = ""): string {
  const keyBytes = stringToBytes(key);
  if (!Storage.has(keyBytes)) {
    return defaultValue;
  }
  return bytesToString(Storage.get(keyBytes));
}

export function setString(key: string, value: string): void {
  Storage.set(stringToBytes(key), stringToBytes(value));
}

export function min(a: u64, b: u64): u64 {
  return a < b ? a : b;
}

export function max(a: u64, b: u64): u64 {
  return a > b ? a : b;
}

export function calculateInterest(principal: u64, rate: u64, timeElapsed: u64): u64 {
  return (principal * rate * timeElapsed) / (BASIS_POINTS * 365 * 24 * 60 * 60);
}

export function calculateUtilization(totalBorrows: u64, totalDeposits: u64): u64 {
  if (totalDeposits == 0) return 0;
  return (totalBorrows * BASIS_POINTS) / totalDeposits;
}

export function calculateInterestRate(utilization: u64, baseRate: u64, slope: u64): u64 {
  return baseRate + (utilization * slope) / BASIS_POINTS;
}

export function calculateLTV(borrowAmount: u64, collateralValue: u64): u64 {
  if (collateralValue == 0) return 0;
  return (borrowAmount * BASIS_POINTS) / collateralValue;
}

export function emitEvent(eventName: string, data: string): void {
  generateEvent(eventName + ":" + data);
}