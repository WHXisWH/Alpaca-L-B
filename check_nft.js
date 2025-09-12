import 'dotenv/config';
import * as massa from '@massalabs/massa-web3';
import { readFileSync } from 'fs';

async function main() {
  const addresses = JSON.parse(readFileSync('./addresses.json', 'utf-8'));
  const account = await massa.Account.fromEnv();
  const provider = massa.JsonRpcProvider.buildnet(account);
  
  console.log(`Checking NFTs for account: ${account.address.toString()}`);
  
  const rwaNft = new massa.SmartContract(provider, addresses.rwaNFT);
  const oracle = new massa.SmartContract(provider, addresses.oracle);
  
  try {
    // Check NEXT_ID
    const nextIdResult = await rwaNft.read('NEXT_ID');
    const nextId = new massa.Args(nextIdResult.value).nextU64();
    console.log(`Next NFT ID will be: ${nextId}`);
    console.log(`This means ${nextId - 1n} NFTs have been minted so far`);
    
    // Check each NFT from 1 to nextId-1
    for (let i = 1; i < Number(nextId); i++) {
      console.log(`\n=== Checking NFT #${i} ===`);
      
      try {
        // Check owner
        const ownerResult = await rwaNft.read('ownerOf', new massa.Args().addU64(BigInt(i)).serialize());
        const owner = new TextDecoder().decode(ownerResult.value);
        console.log(`Owner: ${owner}`);
        console.log(`Is yours: ${owner === account.address.toString()}`);
        
        // Check Oracle data
        const valueResult = await oracle.read('getNFTValuation', new massa.Args().addU64(BigInt(i)).serialize());
        const value = new massa.Args(valueResult.value).nextU64();
        
        const pdResult = await oracle.read('getNFTPD', new massa.Args().addU64(BigInt(i)).serialize());
        const pd = new massa.Args(pdResult.value).nextU64();
        
        const lgdResult = await oracle.read('getNFTLGD', new massa.Args().addU64(BigInt(i)).serialize());
        const lgd = new massa.Args(lgdResult.value).nextU64();
        
        console.log(`Oracle - Value: ${Number(value) / 1_000_000_000} MAS, PD: ${Number(pd) / 100}%, LGD: ${Number(lgd) / 100}%`);
        
      } catch (error) {
        console.log(`Error checking NFT #${i}:`, error.message);
      }
    }
    
    // Test batch fetch
    console.log(`\n=== Testing Batch Fetch ===`);
    try {
      const batchResult = await rwaNft.read('getNftsOfOwner', new massa.Args().addString(account.address.toString()).serialize());
      const batchData = new TextDecoder().decode(batchResult.value);
      console.log(`Batch result: "${batchData}"`);
      
      if (batchData && batchData !== '') {
        const nftEntries = batchData.split('|');
        console.log(`Found ${nftEntries.length} NFTs in batch:`);
        nftEntries.forEach((entry, index) => {
          console.log(`  ${index + 1}: ${entry}`);
        });
      } else {
        console.log('❌ Batch fetch returned empty result');
      }
      
    } catch (error) {
      console.log(`❌ Batch fetch failed:`, error.message);
    }
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

main();