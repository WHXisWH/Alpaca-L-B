import { generateEvent, Storage, Context, sendMessage, Address } from '@massalabs/massa-as-sdk';
import { stringToBytes, bytesToString, u64ToBytes, bytesToU64, Args } from '@massalabs/as-types';
import { ORACLE_UPDATE_INTERVAL } from '../utils/Constants';

const GOVERNANCE_KEY = stringToBytes('GOVERNANCE');
const COLLATERAL_VAULT_KEY = stringToBytes('COLLATERAL_VAULT');
const RWA_NFT_KEY = stringToBytes('RWA_NFT');

// NFT valuation and risk parameters
const NFT_VALUATION_PREFIX = 'NFT_VAL_';
const NFT_PD_PREFIX = 'NFT_PD_';
const NFT_LGD_PREFIX = 'NFT_LGD_';
const NFT_LAST_UPDATE_PREFIX = 'NFT_UPDATE_';
const AUTHORIZED_PROVIDERS_KEY = stringToBytes('AUTH_PROVIDERS');

// Autonomous update functionality
const UPDATE_ACTIVE_KEY = stringToBytes('UPDATE_ACTIVE');
const PRICED_NFT_LIST_KEY = stringToBytes('PRICED_NFT_LIST');

export function constructor(argsData: StaticArray<u8>): void {
  assert(Context.isDeployingContract(), "Constructor can only be called during deployment");
  
  const args = new Args(argsData);
  const governanceAddress = args.nextString().unwrap();
  const vaultAddress = args.nextString().unwrap();
  const rwaNftAddress = args.nextString().unwrap();

  Storage.set(GOVERNANCE_KEY, stringToBytes(governanceAddress));
  Storage.set(COLLATERAL_VAULT_KEY, stringToBytes(vaultAddress));
  Storage.set(RWA_NFT_KEY, stringToBytes(rwaNftAddress));
  Storage.set(AUTHORIZED_PROVIDERS_KEY, stringToBytes(governanceAddress));
  Storage.set(UPDATE_ACTIVE_KEY, stringToBytes('false'));
  Storage.set(PRICED_NFT_LIST_KEY, stringToBytes(''));
  
  generateEvent('Oracle deployed');
}

// New function to be called by RWA_NFT contract
export function setInitialNFTProfileFromString(argsData: StaticArray<u8>): void {
  // Permission check: RWA_NFT or authorized providers can call this
  const caller = Context.caller().toString();
  const rwaNftAddress = bytesToString(Storage.get(RWA_NFT_KEY));
  const authorizedProviders = bytesToString(Storage.get(AUTHORIZED_PROVIDERS_KEY));
  assert(caller == rwaNftAddress || authorizedProviders.includes(caller), "Not authorized to set initial profile");

  const packedData = bytesToString(argsData);
  const parts = packedData.split(':');
  assert(parts.length == 4, "Invalid packed data for profile");

  const tokenId = U64.parseInt(parts[0]);
  const value = U64.parseInt(parts[1]);
  const pd = U64.parseInt(parts[2]);
  const lgd = U64.parseInt(parts[3]);

  assert(value > 0, 'Valuation must be greater than 0');
  assert(pd <= 10000, 'PD must be <= 10000 basis points');
  assert(lgd <= 10000, 'LGD must be <= 10000 basis points');
  
  const tokenIdStr = tokenId.toString();
  const valuationKey = stringToBytes(NFT_VALUATION_PREFIX + tokenIdStr);
  const pdKey = stringToBytes(NFT_PD_PREFIX + tokenIdStr);
  const lgdKey = stringToBytes(NFT_LGD_PREFIX + tokenIdStr);
  const updateKey = stringToBytes(NFT_LAST_UPDATE_PREFIX + tokenIdStr);
  
  Storage.set(valuationKey, u64ToBytes(value));
  Storage.set(pdKey, u64ToBytes(pd));
  Storage.set(lgdKey, u64ToBytes(lgd));
  Storage.set(updateKey, u64ToBytes(Context.timestamp()));

  const pricedNFTsData = bytesToString(Storage.get(PRICED_NFT_LIST_KEY));
  if (!pricedNFTsData.split(',').includes(tokenIdStr)) {
    const newNFTList = pricedNFTsData == '' ? tokenIdStr : pricedNFTsData + ',' + tokenIdStr;
    Storage.set(PRICED_NFT_LIST_KEY, stringToBytes(newNFTList));
  }
  
  generateEvent('Initial profile set for NFT ' + tokenIdStr);
}

// This function is now an internal helper, but can still be called by authorized providers if needed
export function setInitialNFTProfile(argsData: StaticArray<u8>): void {
  const args = new Args(argsData);
  const tokenId = args.nextU64().expect('Invalid token ID');
  const value = args.nextU64().expect('Invalid valuation');
  const pd = args.nextU64().expect('Invalid PD');
  const lgd = args.nextU64().expect('Invalid LGD');
  
  const caller = Context.caller().toString();
  const authorizedProviders = bytesToString(Storage.get(AUTHORIZED_PROVIDERS_KEY));
  const rwaNftAddress = bytesToString(Storage.get(RWA_NFT_KEY));
  assert(authorizedProviders.includes(caller) || caller == rwaNftAddress, 'Not authorized to set initial NFT profile');
  
  assert(value > 0, 'Valuation must be greater than 0');
  assert(pd <= 10000, 'PD must be <= 10000 basis points');
  assert(lgd <= 10000, 'LGD must be <= 10000 basis points');
  
  const tokenIdStr = tokenId.toString();
  const valuationKey = stringToBytes(NFT_VALUATION_PREFIX + tokenIdStr);
  const pdKey = stringToBytes(NFT_PD_PREFIX + tokenIdStr);
  const lgdKey = stringToBytes(NFT_LGD_PREFIX + tokenIdStr);
  const updateKey = stringToBytes(NFT_LAST_UPDATE_PREFIX + tokenIdStr);
  
  Storage.set(valuationKey, u64ToBytes(value));
  Storage.set(pdKey, u64ToBytes(pd));
  Storage.set(lgdKey, u64ToBytes(lgd));
  Storage.set(updateKey, u64ToBytes(Context.timestamp()));

  const pricedNFTsData = bytesToString(Storage.get(PRICED_NFT_LIST_KEY));
  if (!pricedNFTsData.split(',').includes(tokenIdStr)) {
    const newNFTList = pricedNFTsData == '' ? tokenIdStr : pricedNFTsData + ',' + tokenIdStr;
    Storage.set(PRICED_NFT_LIST_KEY, stringToBytes(newNFTList));
  }
  
  generateEvent('Initial profile set for NFT ' + tokenIdStr);
}

// ==================================================
// =========== AUTONOMOUS UPDATE LOGIC ==============
// ==================================================

export function startUpdates(_: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  assert(Context.caller().toString() == governanceAddress, "Only governance can start updates");
  assert(bytesToString(Storage.get(UPDATE_ACTIVE_KEY)) == 'false', "Updates are already active");

  Storage.set(UPDATE_ACTIVE_KEY, stringToBytes('true'));

  const period = Context.currentPeriod();
  const thread = Context.currentThread();
  sendMessage(Context.callee(), 'autonomousUpdate', period + 1, thread, period + 10, thread, 1_000_000_000, 0, 0, []);

  generateEvent('Oracle autonomous updates started.');
}

export function stopUpdates(_: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  assert(Context.caller().toString() == governanceAddress, "Only governance can stop updates");

  Storage.set(UPDATE_ACTIVE_KEY, stringToBytes('false'));
  generateEvent('Oracle autonomous updates stopped.');
}

export function autonomousUpdate(_: StaticArray<u8>): void {
  if (bytesToString(Storage.get(UPDATE_ACTIVE_KEY)) != 'true') {
    return;
  }

  const pricedNFTsData = bytesToString(Storage.get(PRICED_NFT_LIST_KEY));
  if (pricedNFTsData == '') {
    rescheduleNextUpdate();
    return;
  }
  
  const pricedNFTs = pricedNFTsData.split(',');
  const vaultAddress = new Address(bytesToString(Storage.get(COLLATERAL_VAULT_KEY)));

  for (let i = 0; i < pricedNFTs.length; i++) {
    const tokenIdStr = pricedNFTs[i];
    if (tokenIdStr == '') continue;
    
    const tokenId = U64.parseInt(tokenIdStr);
    
    const valueKey = stringToBytes(NFT_VALUATION_PREFIX + tokenIdStr);
    const pdKey = stringToBytes(NFT_PD_PREFIX + tokenIdStr);
    const lgdKey = stringToBytes(NFT_LGD_PREFIX + tokenIdStr);

    let currentValue = bytesToU64(Storage.get(valueKey));
    let currentPD = bytesToU64(Storage.get(pdKey));
    let currentLGD = bytesToU64(Storage.get(lgdKey));

    const randomSeed = Context.timestamp() + tokenId;
    
    const valueChange = (randomSeed % 400) - 200;
    let newValue = currentValue + (currentValue * valueChange) / 10000;
    if (newValue < 1000) newValue = 1000;

    const pdChange = (randomSeed % 1000) - 500;
    let newPD = currentPD + (currentPD * pdChange) / 10000;
    if (newPD < 50) newPD = 50;
    if (newPD > 9000) newPD = 9000;

    const lgdChange = (randomSeed % 200) - 100;
    let newLGD = currentLGD + (currentLGD * lgdChange) / 10000;
    if (newLGD < 1000) newLGD = 1000;
    if (newLGD > 9500) newLGD = 9500;

    Storage.set(valueKey, u64ToBytes(newValue));
    Storage.set(pdKey, u64ToBytes(newPD));
    Storage.set(lgdKey, u64ToBytes(newLGD));
    Storage.set(stringToBytes(NFT_LAST_UPDATE_PREFIX + tokenIdStr), u64ToBytes(Context.timestamp()));

    const period = Context.currentPeriod();
    const thread = Context.currentThread();
    sendMessage(vaultAddress, 'refreshNFTData', period, thread, period + 5, thread, 200_000_000, 0, 0, u64ToBytes(tokenId));
  }

  generateEvent('Oracle autonomously updated ' + pricedNFTs.length.toString() + ' NFTs.');

  rescheduleNextUpdate();
}

function rescheduleNextUpdate(): void {
  const cur_period = Context.currentPeriod();
  const cur_thread = Context.currentThread();

  const eval_slots = ORACLE_UPDATE_INTERVAL;
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
    'autonomousUpdate',
    eval_period,
    eval_thread,
    eval_period + 5,
    eval_thread,
    1_000_000_000,
    0,
    0,
    []
  );
}

// ==================================================
// ======== NFT GETTERS =============================
// ==================================================

export function getNFTValuation(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const valuationKey = stringToBytes(NFT_VALUATION_PREFIX + tokenId.toString());
  
  if (!Storage.has(valuationKey)) {
    return u64ToBytes(0);
  }
  
  return Storage.get(valuationKey);
}

export function getNFTRiskProfile(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const pdKey = stringToBytes(NFT_PD_PREFIX + tokenId.toString());
  const lgdKey = stringToBytes(NFT_LGD_PREFIX + tokenId.toString());
  
  if (!Storage.has(pdKey) || !Storage.has(lgdKey)) {
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
    return u64ToBytes(500);
  }
  
  return Storage.get(pdKey);
}

export function getNFTLGD(argsData: StaticArray<u8>): StaticArray<u8> {
  const tokenId = bytesToU64(argsData);
  const lgdKey = stringToBytes(NFT_LGD_PREFIX + tokenId.toString());
  
  if (!Storage.has(lgdKey)) {
    return u64ToBytes(5000);
  }
  
  return Storage.get(lgdKey);
}


// ==================================================
// ============ GOVERNANCE FUNCTIONS ================
// ==================================================

export function addAuthorizedProvider(argsData: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  assert(Context.caller().toString() == governanceAddress, "Only governance can add providers");
  
  const newProvider = bytesToString(argsData);
  const currentProviders = bytesToString(Storage.get(AUTHORIZED_PROVIDERS_KEY));
  
  if (currentProviders.includes(newProvider)) {
    return;
  }

  const updatedProviders = currentProviders == '' ? newProvider : currentProviders + ',' + newProvider;
  Storage.set(AUTHORIZED_PROVIDERS_KEY, stringToBytes(updatedProviders));
  
  generateEvent('Authorized provider added: ' + newProvider);
}

export function removeAuthorizedProvider(argsData: StaticArray<u8>): void {
  const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
  assert(Context.caller().toString() == governanceAddress, "Only governance can remove providers");
  
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

export function getAuthorizedProviders(_: StaticArray<u8>): StaticArray<u8> {
  return Storage.get(AUTHORIZED_PROVIDERS_KEY);
}

export function setCollateralVault(argsData: StaticArray<u8>): void {
    const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
    assert(Context.caller().toString() == governanceAddress, "Only governance can set vault address");
    const vaultAddress = bytesToString(argsData);
    Storage.set(COLLATERAL_VAULT_KEY, stringToBytes(vaultAddress));
    generateEvent('Collateral Vault address updated in Oracle');
}

export function setRwaNftAddress(argsData: StaticArray<u8>): void {
    const governanceAddress = bytesToString(Storage.get(GOVERNANCE_KEY));
    assert(Context.caller().toString() == governanceAddress, "Only governance can set RWA NFT address");
    const rwaNftAddress = bytesToString(argsData);
    Storage.set(RWA_NFT_KEY, stringToBytes(rwaNftAddress));
    generateEvent('RWA NFT address updated in Oracle');
}
