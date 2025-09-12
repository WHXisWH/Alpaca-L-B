import { generateEvent, Storage, Context, Address, sendMessage } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64, Args } from '@massalabs/as-types';

const GOVERNANCE_KEY = stringToBytes('GOVERNANCE');
const NFT_CONTRACT_KEY = stringToBytes('NFT_CONTRACT');
const ORACLE_CONTRACT_KEY = stringToBytes('ORACLE_CONTRACT');
const DEPOSITED_NFT_PREFIX = 'DEPOSITED_';
const NFT_OWNER_PREFIX = 'NFT_OWNER_';
const NFT_VALUE_PREFIX = 'NFT_VALUE_';
const NFT_PD_PREFIX = 'NFT_PD_';
const NFT_LGD_PREFIX = 'NFT_LGD_';
const SHARE_TOKEN_PREFIX = 'SHARE_';
const TOTAL_SHARES_KEY = stringToBytes('TOTAL_SHARES');

export function constructor(argsData: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), "Constructor can only be called during deployment");
  
  const args = new Args(argsData);
  const governanceAddress = args.nextString().unwrap();
  const nftContractAddress = args.nextString().unwrap();
  const oracleContractAddress = args.nextString().unwrap();
  
  Storage.set(GOVERNANCE_KEY, stringToBytes(governanceAddress));
  Storage.set(NFT_CONTRACT_KEY, stringToBytes(nftContractAddress));
  Storage.set(ORACLE_CONTRACT_KEY, stringToBytes(oracleContractAddress));
  Storage.set(TOTAL_SHARES_KEY, u64ToBytes(0));
  
  generateEvent('CollateralVault deployed');
}

export function depositNFT(argsData: StaticArray<u8>): StaticArray<u8> {
  const governanceAddress = new Address(bytesToString(Storage.get(GOVERNANCE_KEY)));
  const pausedKey = stringToBytes('PAUSED');
  assert(!Storage.hasOf(governanceAddress, pausedKey), "System is paused");
  
  const tokenId = bytesToU64(argsData);
  const caller = Context.caller().toString();
  const nftContract = new Address(bytesToString(Storage.get(NFT_CONTRACT_KEY)));
  const oracleContract = new Address(bytesToString(Storage.get(ORACLE_CONTRACT_KEY)));
  
  const ownerResult = Storage.getOf(nftContract, stringToBytes('OWNER_' + tokenId.toString()));
  const owner = bytesToString(ownerResult);
  assert(owner == caller, "Not NFT owner");
  
  const depositedKey = stringToBytes(DEPOSITED_NFT_PREFIX + tokenId.toString());
  assert(!Storage.has(depositedKey), "NFT already deposited");
  
  // Try Oracle first
  const oracleValKey = stringToBytes('NFT_VAL_' + tokenId.toString());
  const oraclePdKey = stringToBytes('NFT_PD_' + tokenId.toString());
  const oracleLgdKey = stringToBytes('NFT_LGD_' + tokenId.toString());

  let value: u64 = 0;
  let pd: u64 = 0;
  let lgd: u64 = 0;

  if (Storage.hasOf(oracleContract, oracleValKey)) {
    value = bytesToU64(Storage.getOf(oracleContract, oracleValKey));
  }
  if (Storage.hasOf(oracleContract, oraclePdKey)) {
    pd = bytesToU64(Storage.getOf(oracleContract, oraclePdKey));
  }
  if (Storage.hasOf(oracleContract, oracleLgdKey)) {
    lgd = bytesToU64(Storage.getOf(oracleContract, oracleLgdKey));
  }

  // Fallback to RWA_NFT local storage if Oracle missing/uninitialized
  if (value == 0) {
    const nftValKey = stringToBytes('NFT_VAL_' + tokenId.toString());
    const nftPdKey = stringToBytes('NFT_PD_' + tokenId.toString());
    const nftLgdKey = stringToBytes('NFT_LGD_' + tokenId.toString());

    if (Storage.hasOf(nftContract, nftValKey)) {
      value = bytesToU64(Storage.getOf(nftContract, nftValKey));
    }
    if (Storage.hasOf(nftContract, nftPdKey)) {
      pd = bytesToU64(Storage.getOf(nftContract, nftPdKey));
    }
    if (Storage.hasOf(nftContract, nftLgdKey)) {
      lgd = bytesToU64(Storage.getOf(nftContract, nftLgdKey));
    }

    // If we obtained a valid value from NFT storage, initialize Oracle profile (Vault is an authorized provider)
    if (value > 0) {
      const packed = tokenId.toString() + ':' + value.toString() + ':' + pd.toString() + ':' + lgd.toString();
      const cur_period = Context.currentPeriod();
      const cur_thread = Context.currentThread();
      let next_thread: u8 = cur_thread + 1;
      let next_period = cur_period;
      if (next_thread >= 32) {
        ++next_period;
        next_thread = 0;
      }
      sendMessage(oracleContract, 'setInitialNFTProfileFromString', next_period, next_thread, next_period + 5, next_thread, 200_000_000, 0, 0, stringToBytes(packed));
    }
  }

  assert(value > 0, "Invalid NFT value");
  
  Storage.set(depositedKey, stringToBytes('true'));
  Storage.set(stringToBytes(NFT_OWNER_PREFIX + tokenId.toString()), stringToBytes(caller));
  Storage.set(stringToBytes(NFT_VALUE_PREFIX + tokenId.toString()), u64ToBytes(value));
  Storage.set(stringToBytes(NFT_PD_PREFIX + tokenId.toString()), u64ToBytes(pd));
  Storage.set(stringToBytes(NFT_LGD_PREFIX + tokenId.toString()), u64ToBytes(lgd));
  
  const shares = value;
  const totalShares = bytesToU64(Storage.get(TOTAL_SHARES_KEY));
  
  Storage.set(stringToBytes(SHARE_TOKEN_PREFIX + caller + '_' + tokenId.toString()), u64ToBytes(shares));
  Storage.set(TOTAL_SHARES_KEY, u64ToBytes(totalShares + shares));
  
  generateEvent('NFT deposited');
  
  return u64ToBytes(shares);
}

export function withdrawNFT(argsData: StaticArray<u8>): void {
  const governanceAddress = new Address(bytesToString(Storage.get(GOVERNANCE_KEY)));
  const pausedKey = stringToBytes('PAUSED');
  assert(!Storage.hasOf(governanceAddress, pausedKey), "System is paused");
  
  const tokenId = bytesToU64(argsData);
  const caller = Context.caller().toString();
  
  const ownerKey = stringToBytes(NFT_OWNER_PREFIX + tokenId.toString());
  assert(Storage.has(ownerKey), "NFT not found in vault");
  
  const owner = bytesToString(Storage.get(ownerKey));
  assert(owner == caller, "Not NFT owner");
  
  const depositedKey = stringToBytes(DEPOSITED_NFT_PREFIX + tokenId.toString());
  assert(Storage.has(depositedKey), "NFT not deposited");
  
  const shareKey = stringToBytes(SHARE_TOKEN_PREFIX + caller + '_' + tokenId.toString());
  const shares = bytesToU64(Storage.get(shareKey));
  const totalShares = bytesToU64(Storage.get(TOTAL_SHARES_KEY));
  
  Storage.del(depositedKey);
  Storage.del(ownerKey);
  Storage.del(stringToBytes(NFT_VALUE_PREFIX + tokenId.toString()));
  Storage.del(stringToBytes(NFT_PD_PREFIX + tokenId.toString()));
  Storage.del(stringToBytes(NFT_LGD_PREFIX + tokenId.toString()));
  Storage.del(shareKey);
  
  Storage.set(TOTAL_SHARES_KEY, u64ToBytes(totalShares - shares));
  
  generateEvent('NFT withdrawn');
}

export function getNFTValue(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const valueKey = stringToBytes(NFT_VALUE_PREFIX + tokenId.toString());
  
  if (!Storage.has(valueKey)) {
    return u64ToBytes(0);
  }
  
  return Storage.get(valueKey);
}

export function getNFTPD(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const pdKey = stringToBytes(NFT_PD_PREFIX + tokenId.toString());
  
  if (!Storage.has(pdKey)) {
    return u64ToBytes(0);
  }
  
  return Storage.get(pdKey);
}

export function getNFTLGD(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const lgdKey = stringToBytes(NFT_LGD_PREFIX + tokenId.toString());
  
  if (!Storage.has(lgdKey)) {
    return u64ToBytes(0);
  }
  
  return Storage.get(lgdKey);
}

export function isNFTDeposited(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const depositedKey = stringToBytes(DEPOSITED_NFT_PREFIX + tokenId.toString());
  
  if (Storage.has(depositedKey)) {
    return stringToBytes('true');
  } else {
    return stringToBytes('false');
  }
}

export function getNFTOwner(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const ownerKey = stringToBytes(NFT_OWNER_PREFIX + tokenId.toString());
  
  if (!Storage.has(ownerKey)) {
    return stringToBytes('');
  }
  
  return Storage.get(ownerKey);
}

export function getUserShares(argsData: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(argsData);
  const user = args.nextString().unwrap();
  const tokenId = args.nextU64().unwrap();
  
  const shareKey = stringToBytes(SHARE_TOKEN_PREFIX + user + '_' + tokenId.toString());
  
  if (!Storage.has(shareKey)) {
    return u64ToBytes(0);
  }
  
  return Storage.get(shareKey);
}

export function getTotalShares(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(TOTAL_SHARES_KEY);
}

export function setOracleContract(argsData: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  const caller = Context.caller().toString();
  assert(caller == governanceAddress, "Only governance can set oracle contract");
  
  const oracleAddress = bytesToString(argsData);
  Storage.set(ORACLE_CONTRACT_KEY, stringToBytes(oracleAddress));
  
  generateEvent('Oracle contract address updated');
}

export function refreshNFTData(argsData: StaticArray<u8>): void {
  const tokenId = bytesToU64(argsData);
  const depositedKey = stringToBytes(DEPOSITED_NFT_PREFIX + tokenId.toString());
  
  // Only refresh data for NFTs that are actually deposited in the vault.
  // The Oracle will call this for all priced NFTs, so we need this check.
  if (!Storage.has(depositedKey)) {
    return;
  }
  
  const oracleContract = new Address(bytesToString(Storage.get(ORACLE_CONTRACT_KEY)));
  
  const valueResult = Storage.getOf(oracleContract, stringToBytes('NFT_VAL_' + tokenId.toString()));
  const pdResult = Storage.getOf(oracleContract, stringToBytes('NFT_PD_' + tokenId.toString()));
  const lgdResult = Storage.getOf(oracleContract, stringToBytes('NFT_LGD_' + tokenId.toString()));
  
  const value = bytesToU64(valueResult);
  const pd = bytesToU64(pdResult);
  const lgd = bytesToU64(lgdResult);
  
  if (value > 0) {
    Storage.set(stringToBytes(NFT_VALUE_PREFIX + tokenId.toString()), u64ToBytes(value));
    Storage.set(stringToBytes(NFT_PD_PREFIX + tokenId.toString()), u64ToBytes(pd));
    Storage.set(stringToBytes(NFT_LGD_PREFIX + tokenId.toString()), u64ToBytes(lgd));
    
    generateEvent('NFT data refreshed for tokenId ' + tokenId.toString());
  }
}

export function transferOwnership(argsData: StaticArray<u8>): void {
  const liquidationEngineAddress = new Address(bytesToString(Storage.get(stringToBytes("LIQUIDATION_ENGINE"))));
  assert(Context.caller() == liquidationEngineAddress, "Only liquidation engine can transfer ownership");

  const args = new Args(argsData);
  const tokenId = args.nextU64().unwrap();
  const newOwner = args.nextString().unwrap();

  const ownerKey = stringToBytes(NFT_OWNER_PREFIX + tokenId.toString());
  assert(Storage.has(ownerKey), "NFT not found in vault");
  const oldOwner = bytesToString(Storage.get(ownerKey));

  const shareKey = stringToBytes(SHARE_TOKEN_PREFIX + oldOwner + '_' + tokenId.toString());
  assert(Storage.has(shareKey), "Share token not found for old owner");
  const shares = bytesToU64(Storage.get(shareKey));

  // Remove shares from old owner
  Storage.del(shareKey);

  // Set new owner
  Storage.set(ownerKey, stringToBytes(newOwner));

  // Add shares to new owner
  const newShareKey = stringToBytes(SHARE_TOKEN_PREFIX + newOwner + '_' + tokenId.toString());
  Storage.set(newShareKey, u64ToBytes(shares));

  generateEvent('NFT ownership transferred');
}
