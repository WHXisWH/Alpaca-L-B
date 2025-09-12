import 'dotenv/config';
import * as massa from '@massalabs/massa-web3';
import { readFileSync } from 'fs';

async function main() {
  const addresses = JSON.parse(readFileSync('./addresses.json', 'utf-8'));
  const account = await massa.Account.fromEnv();
  const provider = massa.JsonRpcProvider.buildnet(account);
  
  console.log(`Minting NFT for: ${account.address.toString()}`);
  
  const rwaNft = new massa.SmartContract(provider, addresses.rwaNFT);
  const oracle = new massa.SmartContract(provider, addresses.oracle);
  
  try {
    // Step 1: Mint NFT
    console.log('Step 1: Minting NFT...');
    const mintArgs = new massa.Args()
      .addString(account.address.toString())
      .addString("Test Real Estate NFT")
      .addU64(BigInt(10_000_000_000)) // 10 MAS
      .addU64(BigInt(500))  // 5% PD
      .addU64(BigInt(4000)); // 40% LGD

    const mintOp = await rwaNft.call('mint', mintArgs.serialize(), {
      maxGas: BigInt(500_000_000),
      fee: massa.Mas.fromString('0.02')
    });
    
    console.log('Waiting for mint to complete...');
    await mintOp.waitFinalExecution();
    console.log('✅ Mint completed');
    
    // Step 2: Check what was minted
    const nextIdResult = await rwaNft.read('NEXT_ID');
    const nextId = new massa.Args(nextIdResult.value).nextU64();
    const mintedId = nextId - 1n;
    
    console.log(`Minted NFT ID: ${mintedId}`);
    
    // Step 3: Verify owner
    const ownerResult = await rwaNft.read('ownerOf', new massa.Args().addU64(mintedId).serialize());
    const owner = new TextDecoder().decode(ownerResult.value);
    console.log(`Owner: ${owner}`);
    console.log(`Match: ${owner === account.address.toString()}`);
    
    // Step 4: Check Oracle data
    console.log('Checking Oracle data...');
    const valueResult = await oracle.read('getNFTValuation', new massa.Args().addU64(mintedId).serialize());
    const value = new massa.Args(valueResult.value).nextU64();
    
    console.log(`Oracle Value: ${Number(value) / 1_000_000_000} MAS`);
    
    if (Number(value) === 0) {
      console.log('⚠️ Oracle value is 0, manually setting...');
      
      const setArgs = new massa.Args()
        .addU64(mintedId)
        .addU64(BigInt(10_000_000_000))
        .addU64(BigInt(500))
        .addU64(BigInt(4000));
        
      const setOp = await oracle.call('setInitialNFTProfile', setArgs.serialize(), {
        maxGas: BigInt(200_000_000),
        fee: massa.Mas.fromString('0.01')
      });
      
      await setOp.waitFinalExecution();
      console.log('✅ Oracle profile set manually');
    }
    
    // Step 5: Test batch fetch
    console.log('Testing batch fetch...');
    const batchResult = await rwaNft.read('getNftsOfOwner', new massa.Args().addString(account.address.toString()).serialize());
    const batchData = new TextDecoder().decode(batchResult.value);
    console.log(`Batch result: "${batchData}"`);
    
    if (batchData && batchData !== '') {
      console.log('✅ SUCCESS! NFT should now appear in frontend');
    } else {
      console.log('❌ Still not working, batch fetch failed');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();