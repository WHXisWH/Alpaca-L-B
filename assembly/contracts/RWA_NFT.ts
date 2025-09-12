import { generateEvent, Storage, Context, sendMessage, Address } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64, Args } from '@massalabs/as-types';

const NEXT_TOKEN_ID_KEY = stringToBytes('NEXT_ID');
const TOKEN_OWNER_PREFIX = 'OWNER_';
const TOKEN_METADATA_PREFIX = 'METADATA_';
const TOTAL_SUPPLY_KEY = stringToBytes('TOTAL_SUPPLY');
const ORACLE_ADDRESS_KEY = stringToBytes('ORACLE_ADDR');
const GOVERNANCE_KEY = stringToBytes('GOVERNANCE');

// Direct price data storage (bypassing Oracle)
const NFT_VALUE_PREFIX = 'NFT_VAL_';
const NFT_PD_PREFIX = 'NFT_PD_';
const NFT_LGD_PREFIX = 'NFT_LGD_';

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
  const assetType = args.nextString().expect('Invalid asset type');
  
  const tokenId = bytesToU64(Storage.get(NEXT_TOKEN_ID_KEY));
  const totalSupply = bytesToU64(Storage.get(TOTAL_SUPPLY_KEY));
  
  Storage.set(stringToBytes(TOKEN_OWNER_PREFIX + tokenId.toString()), stringToBytes(to));
  Storage.set(stringToBytes(TOKEN_METADATA_PREFIX + tokenId.toString()), stringToBytes(metadata));
  
  // Store asset type for later appraisal
  const tokenIdStr = tokenId.toString();
  Storage.set(stringToBytes('ASSET_TYPE_' + tokenIdStr), stringToBytes(assetType));
  
  // Initialize as unappraised (value = 0)
  Storage.set(stringToBytes(NFT_VALUE_PREFIX + tokenIdStr), u64ToBytes(0));
  Storage.set(stringToBytes(NFT_PD_PREFIX + tokenIdStr), u64ToBytes(0));
  Storage.set(stringToBytes(NFT_LGD_PREFIX + tokenIdStr), u64ToBytes(0));
  
  Storage.set(NEXT_TOKEN_ID_KEY, u64ToBytes(tokenId + 1));
  Storage.set(TOTAL_SUPPLY_KEY, u64ToBytes(totalSupply + 1));
  
  generateEvent('RWA NFT minted to ' + to + ' with tokenId ' + tokenId.toString() + ' - awaiting appraisal');

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

// Appraisal function - can be called by owner or authorized appraiser
export function appraiseAsset(argsData: StaticArray<u8>): void {
  const args = new Args(argsData);
  const tokenId = args.nextU64().expect('Invalid token ID');
  const value = args.nextU64().expect('Invalid valuation');
  const pd = args.nextU64().expect('Invalid PD');
  const lgd = args.nextU64().expect('Invalid LGD');
  
  const tokenIdStr = tokenId.toString();
  const ownerKey = stringToBytes(TOKEN_OWNER_PREFIX + tokenIdStr);
  
  // Check if NFT exists
  assert(Storage.has(ownerKey), 'NFT does not exist');
  
  // Check if caller is owner or authorized (for now, anyone can appraise their own NFTs)
  const owner = bytesToString(Storage.get(ownerKey));
  const caller = Context.caller().toString();
  assert(caller == owner, 'Only NFT owner can appraise');
  
  // Validate parameters
  assert(value > 0, 'Valuation must be greater than 0');
  assert(pd <= 10000, 'PD must be <= 100%');
  assert(lgd <= 10000, 'LGD must be <= 100%');
  
  // Store appraisal data
  Storage.set(stringToBytes(NFT_VALUE_PREFIX + tokenIdStr), u64ToBytes(value));
  Storage.set(stringToBytes(NFT_PD_PREFIX + tokenIdStr), u64ToBytes(pd));
  Storage.set(stringToBytes(NFT_LGD_PREFIX + tokenIdStr), u64ToBytes(lgd));
  
  generateEvent('NFT ' + tokenIdStr + ' appraised with value ' + value.toString());

  // Sync appraisal to Oracle so downstream contracts (e.g., Vault) can read consistent values
  // Build packed string: "tokenId:value:pd:lgd"
  const packed: string = tokenIdStr + ':' + value.toString() + ':' + pd.toString() + ':' + lgd.toString();
  const oracleAddr = bytesToString(Storage.get(ORACLE_ADDRESS_KEY));
  if (oracleAddr != '') {
    // Schedule message for the next slot to ensure execution (pattern used across other modules)
    const cur_period = Context.currentPeriod();
    const cur_thread = Context.currentThread();
    let next_thread: u8 = cur_thread + 1;
    let next_period = cur_period;
    if (next_thread >= 32) {
      ++next_period;
      next_thread = 0;
    }
    // Provide sufficient gas for the oracle update; no coins transfer, no extra fee
    sendMessage(
      new Address(oracleAddr),
      'setInitialNFTProfileFromString',
      next_period,
      next_thread,
      next_period + 5,
      next_thread,
      300_000_000,
      0,
      0,
      stringToBytes(packed)
    );
  }
}

// Get asset type for a token
export function getAssetType(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const assetTypeKey = stringToBytes('ASSET_TYPE_' + tokenId.toString());
  
  if (Storage.has(assetTypeKey)) {
    return Storage.get(assetTypeKey);
  }
  return stringToBytes('unknown');
}

// Check if NFT is appraised
export function isAppraised(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const valueKey = stringToBytes(NFT_VALUE_PREFIX + tokenId.toString());
  
  if (Storage.has(valueKey)) {
    const value = bytesToU64(Storage.get(valueKey));
    if (value > 0) {
      return stringToBytes('true');
    }
  }
  return stringToBytes('false');
}

// Price data getters (compatible with Oracle interface)
export function getNFTValuation(argsData: StaticArray<u8>): StaticArray<u8> {
    const tokenId = bytesToU64(argsData);
    const valueKey = stringToBytes(NFT_VALUE_PREFIX + tokenId.toString());
    
    if (Storage.has(valueKey)) {
        return Storage.get(valueKey);
    }
    return u64ToBytes(0);
}

export function getNFTPD(argsData: StaticArray<u8>): StaticArray<u8> {
    const tokenId = bytesToU64(argsData);
    const pdKey = stringToBytes(NFT_PD_PREFIX + tokenId.toString());
    
    if (Storage.has(pdKey)) {
        return Storage.get(pdKey);
    }
    return u64ToBytes(500); // 5% default
}

export function getNFTLGD(argsData: StaticArray<u8>): StaticArray<u8> {
    const tokenId = bytesToU64(argsData);
    const lgdKey = stringToBytes(NFT_LGD_PREFIX + tokenId.toString());
    
    if (Storage.has(lgdKey)) {
        return Storage.get(lgdKey);
    }
    return u64ToBytes(5000); // 50% default
}

export function getNftsOfOwner(argsData: StaticArray<u8>): StaticArray<u8> {
    const args: Args = new Args(argsData);
    const ownerAddress: string = args.nextString().unwrap();

    const nextId: u64 = bytesToU64(Storage.get(NEXT_TOKEN_ID_KEY));
    
    let ownedNfts: string[] = [];

    for (let i: u64 = 1; i < nextId; i++) {
        const ownerKey = stringToBytes(TOKEN_OWNER_PREFIX + i.toString());
        if (Storage.has(ownerKey) && bytesToString(Storage.get(ownerKey)) == ownerAddress) {
            const tokenIdStr = i.toString();
            
            // Read price data from local storage instead of Oracle
            const valueKey = stringToBytes(NFT_VALUE_PREFIX + tokenIdStr);
            const pdKey = stringToBytes(NFT_PD_PREFIX + tokenIdStr);
            const lgdKey = stringToBytes(NFT_LGD_PREFIX + tokenIdStr);
            
            let value: u64 = 0;
            let pd: u64 = 500; // 5% default
            let lgd: u64 = 5000; // 50% default
            
            if (Storage.has(valueKey)) {
                value = bytesToU64(Storage.get(valueKey));
            }
            if (Storage.has(pdKey)) {
                pd = bytesToU64(Storage.get(pdKey));
            }
            if (Storage.has(lgdKey)) {
                lgd = bytesToU64(Storage.get(lgdKey));
            }

            const nftData: string = i.toString() + ":" + value.toString() + ":" + pd.toString() + ":" + lgd.toString();
            ownedNfts.push(nftData);
        }
    }

    const result = ownedNfts.join('|');
    return stringToBytes(result);
}
