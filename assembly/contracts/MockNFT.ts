import { generateEvent, Storage, Context } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64, Args } from '@massalabs/as-types';

const NEXT_TOKEN_ID_KEY = stringToBytes('NEXT_ID');
const TOKEN_OWNER_PREFIX = 'OWNER_';
const TOKEN_VALUE_PREFIX = 'VALUE_';
const TOKEN_PD_PREFIX = 'PD_';
const TOKEN_LGD_PREFIX = 'LGD_';
const TOKEN_MATURITY_PREFIX = 'MATURITY_';

export function constructor(_: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), "Constructor can only be called during deployment");
  
  Storage.set(NEXT_TOKEN_ID_KEY, u64ToBytes(1));
  
  generateEvent('MockNFT deployed');
}

export function mint(argsData: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(argsData);
  const to = args.nextString().expect('Invalid recipient address');
  const value = args.nextU64().expect('Invalid token value');
  const pd = args.nextU64().expect('Invalid PD');
  const lgd = args.nextU64().expect('Invalid LGD');
  const maturity = args.nextU64().expect('Invalid maturity');
  
  const tokenId = bytesToU64(Storage.get(NEXT_TOKEN_ID_KEY));
  
  Storage.set(stringToBytes(TOKEN_OWNER_PREFIX + tokenId.toString()), stringToBytes(to));
  Storage.set(stringToBytes(TOKEN_VALUE_PREFIX + tokenId.toString()), u64ToBytes(value));
  Storage.set(stringToBytes(TOKEN_PD_PREFIX + tokenId.toString()), u64ToBytes(pd));
  Storage.set(stringToBytes(TOKEN_LGD_PREFIX + tokenId.toString()), u64ToBytes(lgd));
  Storage.set(stringToBytes(TOKEN_MATURITY_PREFIX + tokenId.toString()), u64ToBytes(maturity));
  
  Storage.set(NEXT_TOKEN_ID_KEY, u64ToBytes(tokenId + 1));
  
  generateEvent('NFT minted');
  
  return u64ToBytes(tokenId);
}

export function ownerOf(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const ownerKey = stringToBytes(TOKEN_OWNER_PREFIX + tokenId.toString());
  
  if (!Storage.has(ownerKey)) {
    return stringToBytes('');
  }
  
  return Storage.get(ownerKey);
}

export function getTokenValue(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const valueKey = stringToBytes(TOKEN_VALUE_PREFIX + tokenId.toString());
  
  if (!Storage.has(valueKey)) {
    return u64ToBytes(0);
  }
  
  return Storage.get(valueKey);
}

export function getTokenPD(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const pdKey = stringToBytes(TOKEN_PD_PREFIX + tokenId.toString());
  
  if (!Storage.has(pdKey)) {
    return u64ToBytes(0);
  }
  
  return Storage.get(pdKey);
}

export function getTokenLGD(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const lgdKey = stringToBytes(TOKEN_LGD_PREFIX + tokenId.toString());
  
  if (!Storage.has(lgdKey)) {
    return u64ToBytes(0);
  }
  
  return Storage.get(lgdKey);
}

export function getTokenMaturity(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const maturityKey = stringToBytes(TOKEN_MATURITY_PREFIX + tokenId.toString());
  
  if (!Storage.has(maturityKey)) {
    return u64ToBytes(0);
  }
  
  return Storage.get(maturityKey);
}

export function transferFrom(argsData: StaticArray<u8>): void {
  const args = new Args(argsData);
  const from = args.nextString().expect('Invalid from address');
  const to = args.nextString().expect('Invalid to address');
  const tokenId = args.nextU64().expect('Invalid token ID');
  
  const ownerKey = stringToBytes(TOKEN_OWNER_PREFIX + tokenId.toString());
  const currentOwner = bytesToString(Storage.get(ownerKey));
  
  assert(currentOwner == from, 'Not token owner');
  
  const caller = Context.caller().toString();
  assert(caller == from, 'Unauthorized transfer');
  
  Storage.set(ownerKey, stringToBytes(to));
  
  generateEvent('NFT transferred');
}