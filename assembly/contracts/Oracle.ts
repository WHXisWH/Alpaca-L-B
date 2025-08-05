import { generateEvent, Storage, Context } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64, Args } from '@massalabs/as-types';

const OWNER_KEY = stringToBytes('OWNER');
const CURRENT_PRICE_KEY = stringToBytes('CURRENT_PRICE');
const LAST_UPDATE_KEY = stringToBytes('LAST_UPDATE');
const TWAP_WINDOW_KEY = stringToBytes('TWAP_WINDOW');
const PRICE_HISTORY_PREFIX = 'PRICE_';
const PRICE_COUNT_KEY = stringToBytes('PRICE_COUNT');

// NFT valuation and risk parameters
const NFT_VALUATION_PREFIX = 'NFT_VAL_';
const NFT_PD_PREFIX = 'NFT_PD_';
const NFT_LGD_PREFIX = 'NFT_LGD_';
const NFT_LAST_UPDATE_PREFIX = 'NFT_UPDATE_';
const AUTHORIZED_PROVIDERS_KEY = stringToBytes('AUTH_PROVIDERS');

export function constructor(_: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), "Constructor can only be called during deployment");
  
  const owner = Context.caller().toString();
  Storage.set(OWNER_KEY, stringToBytes(owner));
  Storage.set(CURRENT_PRICE_KEY, u64ToBytes(1000000));
  Storage.set(LAST_UPDATE_KEY, u64ToBytes(Context.timestamp()));
  Storage.set(TWAP_WINDOW_KEY, u64ToBytes(600));
  Storage.set(PRICE_COUNT_KEY, u64ToBytes(0));
  Storage.set(AUTHORIZED_PROVIDERS_KEY, stringToBytes(owner));
  
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

// NFT Valuation Functions
export function updateNFTValuation(argsData: StaticArray<u8>): void {
  const args = new Args(argsData);
  const tokenId = args.nextU64().expect('Invalid token ID');
  const value = args.nextU64().expect('Invalid valuation');
  
  const caller = Context.caller().toString();
  const authorizedProviders = bytesToString(Storage.get(AUTHORIZED_PROVIDERS_KEY));
  const providers = authorizedProviders.split(',');
  
  let isAuthorized = false;
  for (let i = 0; i < providers.length; i++) {
    if (providers[i] == caller) {
      isAuthorized = true;
      break;
    }
  }
  
  assert(isAuthorized, 'Not authorized to update NFT valuation');
  assert(value > 0, 'Valuation must be greater than 0');
  
  const valuationKey = stringToBytes(NFT_VALUATION_PREFIX + tokenId.toString());
  const updateKey = stringToBytes(NFT_LAST_UPDATE_PREFIX + tokenId.toString());
  
  Storage.set(valuationKey, u64ToBytes(value));
  Storage.set(updateKey, u64ToBytes(Context.timestamp()));
  
  generateEvent('NFT valuation updated for tokenId ' + tokenId.toString());
}

export function getNFTValuation(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const valuationKey = stringToBytes(NFT_VALUATION_PREFIX + tokenId.toString());
  
  if (!Storage.has(valuationKey)) {
    return u64ToBytes(0);
  }
  
  return Storage.get(valuationKey);
}

export function updateNFTRiskProfile(argsData: StaticArray<u8>): void {
  const args = new Args(argsData);
  const tokenId = args.nextU64().expect('Invalid token ID');
  const pd = args.nextU64().expect('Invalid PD');
  const lgd = args.nextU64().expect('Invalid LGD');
  
  const caller = Context.caller().toString();
  const authorizedProviders = bytesToString(Storage.get(AUTHORIZED_PROVIDERS_KEY));
  const providers = authorizedProviders.split(',');
  
  let isAuthorized = false;
  for (let i = 0; i < providers.length; i++) {
    if (providers[i] == caller) {
      isAuthorized = true;
      break;
    }
  }
  
  assert(isAuthorized, 'Not authorized to update NFT risk profile');
  assert(pd <= 10000, 'PD must be <= 10000 basis points');
  assert(lgd <= 10000, 'LGD must be <= 10000 basis points');
  
  const pdKey = stringToBytes(NFT_PD_PREFIX + tokenId.toString());
  const lgdKey = stringToBytes(NFT_LGD_PREFIX + tokenId.toString());
  const updateKey = stringToBytes(NFT_LAST_UPDATE_PREFIX + tokenId.toString());
  
  Storage.set(pdKey, u64ToBytes(pd));
  Storage.set(lgdKey, u64ToBytes(lgd));
  Storage.set(updateKey, u64ToBytes(Context.timestamp()));
  
  generateEvent('NFT risk profile updated for tokenId ' + tokenId.toString());
}

export function getNFTRiskProfile(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const pdKey = stringToBytes(NFT_PD_PREFIX + tokenId.toString());
  const lgdKey = stringToBytes(NFT_LGD_PREFIX + tokenId.toString());
  
  if (!Storage.has(pdKey) || !Storage.has(lgdKey)) {
    // Return default risk parameters: PD=500bp, LGD=5000bp
    const defaultRisk = '500:5000';
    return stringToBytes(defaultRisk);
  }
  
  const pd = bytesToU64(Storage.get(pdKey));
  const lgd = bytesToU64(Storage.get(lgdKey));
  const riskProfile = pd.toString() + ':' + lgd.toString();
  
  return stringToBytes(riskProfile);
}

export function getNFTPD(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const pdKey = stringToBytes(NFT_PD_PREFIX + tokenId.toString());
  
  if (!Storage.has(pdKey)) {
    return u64ToBytes(500); // Default 5% PD
  }
  
  return Storage.get(pdKey);
}

export function getNFTLGD(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const lgdKey = stringToBytes(NFT_LGD_PREFIX + tokenId.toString());
  
  if (!Storage.has(lgdKey)) {
    return u64ToBytes(5000); // Default 50% LGD
  }
  
  return Storage.get(lgdKey);
}

export function addAuthorizedProvider(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can add authorized providers");
  
  const newProvider = bytesToString(argsData);
  const currentProviders = bytesToString(Storage.get(AUTHORIZED_PROVIDERS_KEY));
  
  let updatedProviders: string;
  if (currentProviders == '') {
    updatedProviders = newProvider;
  } else {
    updatedProviders = currentProviders + ',' + newProvider;
  }
  
  Storage.set(AUTHORIZED_PROVIDERS_KEY, stringToBytes(updatedProviders));
  
  generateEvent('Authorized provider added: ' + newProvider);
}

export function removeAuthorizedProvider(argsData: StaticArray<u8>): void {
  const owner = bytesToString(Storage.get(OWNER_KEY));
  const caller = Context.caller().toString();
  assert(caller == owner, "Only owner can remove authorized providers");
  
  const providerToRemove = bytesToString(argsData);
  const currentProviders = bytesToString(Storage.get(AUTHORIZED_PROVIDERS_KEY));
  const providers = currentProviders.split(',');
  
  let newProviders: string[] = [];
  for (let i = 0; i < providers.length; i++) {
    if (providers[i] != providerToRemove) {
      newProviders.push(providers[i]);
    }
  }
  
  const updatedProviders = newProviders.join(',');
  Storage.set(AUTHORIZED_PROVIDERS_KEY, stringToBytes(updatedProviders));
  
  generateEvent('Authorized provider removed: ' + providerToRemove);
}