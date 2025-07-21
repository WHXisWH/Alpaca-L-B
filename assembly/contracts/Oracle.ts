import { generateEvent, Storage, Context } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64, Args } from '@massalabs/as-types';

const OWNER_KEY = stringToBytes('OWNER');
const CURRENT_PRICE_KEY = stringToBytes('CURRENT_PRICE');
const LAST_UPDATE_KEY = stringToBytes('LAST_UPDATE');
const TWAP_WINDOW_KEY = stringToBytes('TWAP_WINDOW');
const PRICE_HISTORY_PREFIX = 'PRICE_';
const PRICE_COUNT_KEY = stringToBytes('PRICE_COUNT');

export function constructor(_: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), "Constructor can only be called during deployment");
  
  const owner = Context.caller().toString();
  Storage.set(OWNER_KEY, stringToBytes(owner));
  Storage.set(CURRENT_PRICE_KEY, u64ToBytes(1000000));
  Storage.set(LAST_UPDATE_KEY, u64ToBytes(Context.timestamp()));
  Storage.set(TWAP_WINDOW_KEY, u64ToBytes(600));
  Storage.set(PRICE_COUNT_KEY, u64ToBytes(0));
  
  generateEvent('Oracle deployed');
}

export function updatePrice(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can update price");
  
  const newPrice = bytesToU64(argsData);
  assert(newPrice > 0, "Price must be greater than 0");
  
  const timestamp = Context.timestamp();
  const priceCount = bytesToU64(Storage.get(PRICE_COUNT_KEY));
  
  Storage.set(CURRENT_PRICE_KEY, u64ToBytes(newPrice));
  Storage.set(LAST_UPDATE_KEY, u64ToBytes(timestamp));
  
  const historyKey = stringToBytes(PRICE_HISTORY_PREFIX + priceCount.toString());
  const priceData = newPrice.toString() + ":" + timestamp.toString();
  Storage.set(historyKey, stringToBytes(priceData));
  
  Storage.set(PRICE_COUNT_KEY, u64ToBytes(priceCount + 1));
  
  generateEvent('Price updated');
}

export function getPrice(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(CURRENT_PRICE_KEY);
}

export function getTwap(_: StaticArray<u8>): StaticArray<u8> {
  const currentTime = Context.timestamp();
  const twapWindow = bytesToU64(Storage.get(TWAP_WINDOW_KEY));
  const priceCount = bytesToU64(Storage.get(PRICE_COUNT_KEY));
  
  if (priceCount == 0) {
    return Storage.get(CURRENT_PRICE_KEY);
  }
  
  let totalPrice: u64 = 0;
  let validPrices: u64 = 0;
  
  for (let i: u64 = 0; i < priceCount; i++) {
    const historyKey = stringToBytes(PRICE_HISTORY_PREFIX + i.toString());
    if (!Storage.has(historyKey)) continue;
    
    const priceData = bytesToString(Storage.get(historyKey));
    const parts = priceData.split(':');
    
    if (parts.length != 2) continue;
    
    const price = U64.parseInt(parts[0]);
    const timestamp = U64.parseInt(parts[1]);
    
    if (currentTime - timestamp <= twapWindow) {
      totalPrice += price;
      validPrices++;
    }
  }
  
  if (validPrices == 0) {
    return Storage.get(CURRENT_PRICE_KEY);
  }
  
  const twapPrice = totalPrice / validPrices;
  return u64ToBytes(twapPrice);
}

export function getVolatility(_: StaticArray<u8>): StaticArray<u8> {
  const priceCount = bytesToU64(Storage.get(PRICE_COUNT_KEY));
  
  if (priceCount < 2) {
    return u64ToBytes(100);
  }
  
  const twapBytes = getTwap(new StaticArray<u8>(0));
  const twapPrice = bytesToU64(twapBytes);
  
  let variance: u64 = 0;
  let validPrices: u64 = 0;
  const currentTime = Context.timestamp();
  const twapWindow = bytesToU64(Storage.get(TWAP_WINDOW_KEY));
  
  for (let i: u64 = 0; i < priceCount; i++) {
    const historyKey = stringToBytes(PRICE_HISTORY_PREFIX + i.toString());
    if (!Storage.has(historyKey)) continue;
    
    const priceData = bytesToString(Storage.get(historyKey));
    const parts = priceData.split(':');
    
    if (parts.length != 2) continue;
    
    const price = U64.parseInt(parts[0]);
    const timestamp = U64.parseInt(parts[1]);
    
    if (currentTime - timestamp <= twapWindow) {
      const diff = price > twapPrice ? price - twapPrice : twapPrice - price;
      variance += (diff * diff) / 1000000;
      validPrices++;
    }
  }
  
  if (validPrices == 0) {
    return u64ToBytes(100);
  }
  
  const avgVariance = variance / validPrices;
  const volatility = avgVariance > 1000 ? 1000 : avgVariance;
  
  return u64ToBytes(volatility);
}

export function setTwapWindow(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can set TWAP window");
  
  const newWindow = bytesToU64(argsData);
  assert(newWindow >= 60, "TWAP window must be at least 60 seconds");
  
  Storage.set(TWAP_WINDOW_KEY, u64ToBytes(newWindow));
  
  generateEvent('TWAP window updated');
}

export function getLastUpdate(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(LAST_UPDATE_KEY);
}