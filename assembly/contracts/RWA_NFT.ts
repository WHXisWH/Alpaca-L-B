import { generateEvent, Storage, Context, Address } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64, Args } from '@massalabs/as-types';

const NEXT_TOKEN_ID_KEY = stringToBytes('NEXT_ID');
const TOKEN_OWNER_PREFIX = 'OWNER_';
const TOKEN_METADATA_PREFIX = 'METADATA_';
const TOTAL_SUPPLY_KEY = stringToBytes('TOTAL_SUPPLY');
const ORACLE_ADDRESS_KEY = stringToBytes('ORACLE_ADDR');
const GOVERNANCE_KEY = stringToBytes('GOVERNANCE');

export function constructor(argsData: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), "Constructor can only be called during deployment");
  const args = new Args(argsData);
  const governanceAddress = args.nextString().unwrap();
  const oracleAddress = args.nextString().unwrap();

  Storage.set(GOVERNANCE_KEY, stringToBytes(governanceAddress));
  Storage.set(ORACLE_ADDRESS_KEY, stringToBytes(oracleAddress));
  Storage.set(NEXT_TOKEN_ID_KEY, u64ToBytes(1));
  Storage.set(TOTAL_SUPPLY_KEY, u64ToBytes(0));
  
  generateEvent('RWA_NFT deployed');
}

export function mint(argsData: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(argsData);
  const to = args.nextString().expect('Invalid recipient address');
  const metadata = args.nextString().expect('Invalid metadata');
  const value = args.nextU64().expect('Invalid valuation');
  const pd = args.nextU64().expect('Invalid PD');
  const lgd = args.nextU64().expect('Invalid LGD');
  
  const tokenId = bytesToU64(Storage.get(NEXT_TOKEN_ID_KEY));
  const totalSupply = bytesToU64(Storage.get(TOTAL_SUPPLY_KEY));
  
  Storage.set(stringToBytes(TOKEN_OWNER_PREFIX + tokenId.toString()), stringToBytes(to));
  Storage.set(stringToBytes(TOKEN_METADATA_PREFIX + tokenId.toString()), stringToBytes(metadata));
  
  Storage.set(NEXT_TOKEN_ID_KEY, u64ToBytes(tokenId + 1));
  Storage.set(TOTAL_SUPPLY_KEY, u64ToBytes(totalSupply + 1));
  
  generateEvent('RWA NFT minted to ' + to + ' with tokenId ' + tokenId.toString());
  
  // Directly set Oracle price data in Oracle contract storage
  const oracleAddress = new Address(bytesToString(Storage.get(ORACLE_ADDRESS_KEY)));
  const tokenIdStr = tokenId.toString();
  
  // Set Oracle storage directly (same keys as Oracle contract uses)
  Storage.setOf(oracleAddress, stringToBytes('NFT_VAL_' + tokenIdStr), u64ToBytes(value));
  Storage.setOf(oracleAddress, stringToBytes('NFT_PD_' + tokenIdStr), u64ToBytes(pd));
  Storage.setOf(oracleAddress, stringToBytes('NFT_LGD_' + tokenIdStr), u64ToBytes(lgd));
  Storage.setOf(oracleAddress, stringToBytes('NFT_UPDATE_' + tokenIdStr), u64ToBytes(Context.timestamp()));
  
  // Add to Oracle's priced NFT list
  const pricedNFTsKey = stringToBytes('PRICED_NFT_LIST');
  const existingNFTsData = Storage.hasOf(oracleAddress, pricedNFTsKey) ? 
    bytesToString(Storage.getOf(oracleAddress, pricedNFTsKey)) : '';
  
  if (!existingNFTsData.split(',').includes(tokenIdStr)) {
    const newNFTList = existingNFTsData == '' ? tokenIdStr : existingNFTsData + ',' + tokenIdStr;
    Storage.setOf(oracleAddress, pricedNFTsKey, stringToBytes(newNFTList));
  }
  
  generateEvent('Initial profile set for NFT ' + tokenId.toString());

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

export function getMetadata(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const metadataKey = stringToBytes(TOKEN_METADATA_PREFIX + tokenId.toString());
  
  if (!Storage.has(metadataKey)) {
    return stringToBytes('');
  }
  
  return Storage.get(metadataKey);
}

export function transferFrom(argsData: StaticArray<u8>): void {
  const args = new Args(argsData);
  const from = args.nextString().expect('Invalid from address');
  const to = args.nextString().expect('Invalid to address');
  const tokenId = args.nextU64().expect('Invalid token ID');
  
  const ownerKey = stringToBytes(TOKEN_OWNER_PREFIX + tokenId.toString());
  assert(Storage.has(ownerKey), 'Token does not exist');
  
  const currentOwner = bytesToString(Storage.get(ownerKey));
  assert(currentOwner == from, 'Not token owner');
  
  const caller = Context.caller().toString();
  assert(caller == from, 'Unauthorized transfer');
  
  Storage.set(ownerKey, stringToBytes(to));
  
  generateEvent('RWA NFT transferred from ' + from + ' to ' + to + ' tokenId ' + tokenId.toString());
}

export function approve(argsData: StaticArray<u8>): void {
  const args = new Args(argsData);
  const spender = args.nextString().expect('Invalid spender address');
  const tokenId = args.nextU64().expect('Invalid token ID');
  
  const ownerKey = stringToBytes(TOKEN_OWNER_PREFIX + tokenId.toString());
  assert(Storage.has(ownerKey), 'Token does not exist');
  
  const currentOwner = bytesToString(Storage.get(ownerKey));
  const caller = Context.caller().toString();
  assert(caller == currentOwner, 'Not token owner');
  
  const approveKey = stringToBytes('APPROVE_' + tokenId.toString());
  Storage.set(approveKey, stringToBytes(spender));
  
  generateEvent('RWA NFT approved for ' + spender + ' tokenId ' + tokenId.toString());
}

export function getApproved(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const approveKey = stringToBytes('APPROVE_' + tokenId.toString());
  
  if (!Storage.has(approveKey)) {
    return stringToBytes('');
  }
  
  return Storage.get(approveKey);
}

export function getTotalSupply(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(TOTAL_SUPPLY_KEY);
}

export function exists(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const ownerKey = stringToBytes(TOKEN_OWNER_PREFIX + tokenId.toString());
  
  if (Storage.has(ownerKey)) {
    return stringToBytes('true');
  } else {
    return stringToBytes('false');
  }
}

export function NEXT_ID(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(NEXT_TOKEN_ID_KEY);
}

export function setOracleAddress(argsData: StaticArray<u8>): void {
    const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
    assert(Context.caller().toString() == governanceAddress, "Only governance can set oracle address");
    const oracleAddr = bytesToString(argsData);
    Storage.set(ORACLE_ADDRESS_KEY, stringToBytes(oracleAddr));
    generateEvent('Oracle address updated in RWA_NFT');
}
