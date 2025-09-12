import 'dotenv/config';
import * as massa from '@massalabs/massa-web3';
import { readFileSync } from 'fs';

async function main() {
  const addresses = JSON.parse(readFileSync('./addresses.json', 'utf-8'));
  const account = await massa.Account.fromEnv();
  const provider = massa.JsonRpcProvider.buildnet(account);

  const rwaNft = new massa.SmartContract(provider, addresses.rwaNFT);
  const oracle = new massa.SmartContract(provider, addresses.oracle);
  const vault = new massa.SmartContract(provider, addresses.collateralVault);

  console.log('Using account:', account.address.toString());
  console.log('Contracts:', addresses);

  // Determine range
  let nextId = 6n;
  try {
    const nextIdRes = await rwaNft.read('NEXT_ID');
    nextId = new massa.Args(nextIdRes.value).nextU64();
  } catch {}

  const maxId = Number(nextId > 1n ? nextId - 1n : 5n);
  const upper = Math.min(maxId, 10);

  for (let i = 1; i <= upper; i++) {
    console.log(`\n=== NFT #${i} ===`);
    try {
      const ownerRes = await rwaNft.read('ownerOf', new massa.Args().addU64(BigInt(i)).serialize());
      const owner = new TextDecoder().decode(ownerRes.value || new Uint8Array());
      console.log('ownerOf(RWA_NFT):', owner || '(none)');
    } catch (e) {
      console.log('ownerOf error:', e.message || e);
    }

    try {
      const atRes = await rwaNft.read('getAssetType', new massa.Args().addU64(BigInt(i)).serialize());
      const assetType = new TextDecoder().decode(atRes.value || new Uint8Array());
      console.log('assetType:', assetType);
    } catch {}

    try {
      const vRes = await rwaNft.read('getNFTValuation', new massa.Args().addU64(BigInt(i)).serialize());
      const v = new massa.Args(vRes.value).nextU64();
      console.log('RWA_NFT valuation:', v.toString());
    } catch (e) {
      console.log('RWA_NFT valuation error:', e.message || e);
    }

    try {
      const vRes = await oracle.read('getNFTValuation', new massa.Args().addU64(BigInt(i)).serialize());
      const v = new massa.Args(vRes.value).nextU64();
      console.log('Oracle valuation:', v.toString());
    } catch (e) {
      console.log('Oracle valuation error:', e.message || e);
    }

    try {
      const depRes = await vault.read('isNFTDeposited', new massa.Args().addU64(BigInt(i)).serialize());
      const deposited = new TextDecoder().decode(depRes.value || new Uint8Array());
      console.log('Vault isNFTDeposited:', deposited);
    } catch (e) {
      console.log('Vault isNFTDeposited error:', e.message || e);
    }

    try {
      const ownRes = await vault.read('getNFTOwner', new massa.Args().addU64(BigInt(i)).serialize());
      const vOwner = new TextDecoder().decode(ownRes.value || new Uint8Array());
      console.log('Vault NFTOwner:', vOwner || '(none)');
    } catch (e) {
      console.log('Vault getNFTOwner error:', e.message || e);
    }
  }
}

main().catch(err => {
  console.error('diagnose_read failed:', err);
});

