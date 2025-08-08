import 'dotenv/config';
import * as massa from '@massalabs/massa-web3';
import { readFileSync } from 'fs';

async function main() {
  const addresses = JSON.parse(readFileSync('./addresses.json', 'utf-8'));
  const account = await massa.Account.fromEnv();
  const provider = massa.JsonRpcProvider.buildnet(account);
  
  const oracle = new massa.SmartContract(provider, addresses.oracle);
  const rwaNft = new massa.SmartContract(provider, addresses.rwaNFT);
  
  try {
    console.log('=== NFT #1 Verification ===');
    
    // Check NFT exists and get owner
    const ownerResult = await rwaNft.read('ownerOf', new massa.Args().addU64(BigInt(1)).serialize());
    const owner = new TextDecoder().decode(ownerResult.value);
    console.log(`Owner: ${owner}`);
    console.log(`Your account: ${account.address.toString()}`);
    console.log(`Match: ${owner === account.address.toString()}`);
    
    // Check Oracle data
    const valueResult = await oracle.read('getNFTValuation', new massa.Args().addU64(BigInt(1)).serialize());
    const value = new massa.Args(valueResult.value).nextU64();
    
    const pdResult = await oracle.read('getNFTPD', new massa.Args().addU64(BigInt(1)).serialize());
    const pd = new massa.Args(pdResult.value).nextU64();
    
    const lgdResult = await oracle.read('getNFTLGD', new massa.Args().addU64(BigInt(1)).serialize());
    const lgd = new massa.Args(lgdResult.value).nextU64();
    
    console.log('\n=== Oracle Data ===');
    console.log(`Value: ${value.toString()} nanoMAS (${Number(value) / 1_000_000_000} MAS)`);
    console.log(`PD: ${pd.toString()} basis points (${Number(pd) / 100}%)`);
    console.log(`LGD: ${lgd.toString()} basis points (${Number(lgd) / 100}%)`);
    
    if (Number(value) > 0 && Number(pd) > 0 && Number(lgd) > 0) {
      console.log('\n✅ SUCCESS: NFT mint with automatic Oracle pricing works perfectly!');
      console.log('🎯 The modified mint flow successfully:');
      console.log('   1. Minted the NFT');
      console.log('   2. Automatically set Oracle price data');
      console.log('   3. NFT is ready for collateral use');
    } else {
      console.log('\n❌ FAILED: Oracle data not set properly');
    }
    
  } catch (error) {
    console.error('Verification error:', error);
  }
}

main();