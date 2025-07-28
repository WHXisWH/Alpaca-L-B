import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  Account,
  SmartContract,
  JsonRpcProvider,
  Mas,
  Args
} from '@massalabs/massa-web3';

async function main() {
  console.log('Alpaca LB Interaction Script');
  console.log('============================\n');
  
  const account = await Account.fromEnv();
  const provider = JsonRpcProvider.buildnet(account);
  
  const addressesFile = readFileSync(resolve(process.cwd(), 'addresses.json'), 'utf-8');
  const addresses = JSON.parse(addressesFile);
  
  const mockNFTContract = new SmartContract(provider, addresses.mockNFT);
  const governanceContract = new SmartContract(provider, addresses.governance);
  const oracleContract = new SmartContract(provider, addresses.oracle);
  const vaultContract = new SmartContract(provider, addresses.collateralVault);
  const riskManagerContract = new SmartContract(provider, addresses.riskManager);
  const lendingPoolContract = new SmartContract(provider, addresses.lendingPool);
  const liquidationContract = new SmartContract(provider, addresses.liquidationEngine);
  
  const action = process.argv[2];
  
  const TX_GAS_LIMIT = { maxGas: BigInt(200_000_000) };

  switch (action) {
    case 'startLendingAccrual': {
      console.log('Starting lending pool interest accrual via governance...');
      
      const op = await governanceContract.call(
        'startLendingPoolAccrual',
        new Uint8Array(0),
        TX_GAS_LIMIT
      );
      
      await op.waitFinalExecution();
      console.log('✅ Lending pool accrual started!');
      break;
    }
    
    case 'startRiskEvaluation': {
      console.log('Starting risk manager evaluation via governance...');
      
      const op = await governanceContract.call(
        'startRiskManagerEvaluation',
        new Uint8Array(0),
        TX_GAS_LIMIT
      );
      
      await op.waitFinalExecution();
      console.log('✅ Risk manager evaluation started!');
      break;
    }

    case 'startAccrual': {
      console.log('Starting interest accrual...');
      
      const op = await lendingPoolContract.call(
        'startAccrual',
        new Uint8Array(0),
        TX_GAS_LIMIT
      );
      
      await op.waitFinalExecution();
      console.log('✅ Interest accrual started!');
      break;
    }
    
    case 'startEvaluation': {
      console.log('Starting risk evaluation...');
      
      const op = await riskManagerContract.call(
        'startEvaluation',
        new Uint8Array(0),
        TX_GAS_LIMIT
      );
      
      await op.waitFinalExecution();
      console.log('✅ Risk evaluation started!');
      break;
    }
    
    case 'mintNFT': {
      const value = process.argv[3] || '10000000';
      const pd = process.argv[4] || '500';
      const lgd = process.argv[5] || '4000';
      const maturity = process.argv[6] || Math.floor(Date.now() / 1000 + 365 * 24 * 3600).toString();
      
      console.log(`Minting NFT with value: ${value}, PD: ${pd}, LGD: ${lgd}...`);
      
      const mintArgs = new Args()
        .addString(account.address.toString())
        .addU64(BigInt(value))
        .addU64(BigInt(pd))
        .addU64(BigInt(lgd))
        .addU64(BigInt(maturity));
      
      const op = await mockNFTContract.call(
        'mint',
        mintArgs.serialize(),
        TX_GAS_LIMIT
      );
      
      await op.waitFinalExecution();
      console.log('✅ NFT minted successfully!');
      break;
    }
    
    case 'depositNFT': {
      const tokenId = process.argv[3] || '1';
      console.log(`Depositing NFT ${tokenId} as collateral...`);
      
      const depositArgs = new Args().addU64(BigInt(tokenId));
      
      const op = await vaultContract.call(
        'depositNFT',
        depositArgs.serialize(),
        TX_GAS_LIMIT
      );
      
      await op.waitFinalExecution();
      console.log('✅ NFT deposited successfully!');
      break;
    }
    
    case 'deposit': {
      const amount = Mas.fromString(process.argv[3] || '10');
      console.log(`Depositing ${Mas.toString(amount)} MAS to lending pool...`);
      
      const op = await lendingPoolContract.call(
        'deposit',
        new Uint8Array(0),
        { coins: amount, maxGas: TX_GAS_LIMIT.maxGas }
      );
      
      await op.waitFinalExecution();
      console.log('✅ Deposit successful!');
      break;
    }
    
    case 'borrow': {
      const tokenId = process.argv[3] || '1';
      const amount = process.argv[4] || '5000000';
      console.log(`Borrowing ${amount} MAS against NFT ${tokenId}...`);
      
      const borrowArgs = new Args()
        .addU64(BigInt(tokenId))
        .addU64(BigInt(amount));
      
      const op = await lendingPoolContract.call(
        'borrow',
        borrowArgs.serialize(),
        TX_GAS_LIMIT
      );
      
      await op.waitFinalExecution();
      console.log('✅ Borrow successful!');
      break;
    }
    
    case 'repay': {
      const positionId = process.argv[3] || '1';
      const amount = Mas.fromString(process.argv[4] || '5');
      console.log(`Repaying position ${positionId} with ${Mas.toString(amount)} MAS...`);
      
      const repayArgs = new Args().addU64(BigInt(positionId));
      
      const op = await lendingPoolContract.call(
        'repay',
        repayArgs.serialize(),
        { coins: amount, maxGas: TX_GAS_LIMIT.maxGas }
      );
      
      await op.waitFinalExecution();
      console.log('✅ Repayment successful!');
      break;
    }
    
    case 'updatePrice': {
      const price = process.argv[3] || '1100000';
      console.log(`Updating oracle price to ${price}...`);
      
      const priceArgs = new Args().addU64(BigInt(price));
      
      const op = await oracleContract.call(
        'updatePrice',
        priceArgs.serialize(),
        TX_GAS_LIMIT
      );
      
      await op.waitFinalExecution();
      console.log('✅ Price updated!');
      break;
    }
    
    case 'info': {
      console.log('Fetching protocol information...\n');
      
      try {
        const totalDepositsResult = await lendingPoolContract.read('getTotalDeposits');
        const totalDeposits = new Args(totalDepositsResult.value).nextU64();
        
        const totalBorrowsResult = await lendingPoolContract.read('getTotalBorrows');
        const totalBorrows = new Args(totalBorrowsResult.value).nextU64();
        
        const interestRateResult = await lendingPoolContract.read('getCurrentInterestRate');
        const interestRate = new Args(interestRateResult.value).nextU64();
        
        const utilizationResult = await lendingPoolContract.read('getUtilizationRate');
        const utilization = new Args(utilizationResult.value).nextU64();
        
        const priceResult = await oracleContract.read('getPrice');
        const currentPrice = new Args(priceResult.value).nextU64();
        
        const twapResult = await oracleContract.read('getTwap');
        const twapPrice = new Args(twapResult.value).nextU64();
        
        console.log('=== Protocol Statistics ===');
        console.log(`💰 Total Deposits: ${Mas.toString(totalDeposits)} MAS`);
        console.log(`📊 Total Borrows: ${Mas.toString(totalBorrows)} MAS`);
        console.log(`📈 Current Interest Rate: ${Number(interestRate) / 100}%`);
        console.log(`⚡ Utilization Rate: ${Number(utilization) / 100}%`);
        console.log(`🔮 Current Price: ${Number(currentPrice) / 1_000_000}`);
        console.log(`📊 TWAP Price: ${Number(twapPrice) / 1_000_000}`);
        
        const userDepositsResult = await lendingPoolContract.read('getUserDeposits', new Args().addString(account.address.toString()).serialize());
        const userDeposits = new Args(userDepositsResult.value).nextU64();
        console.log(`👤 Your Deposits: ${Mas.toString(userDeposits)} MAS`);
        
      } catch (error) {
        console.error('Error fetching info:', error);
      }
      
      console.log('\n=== Contract Addresses ===');
      Object.entries(addresses).forEach(([name, addr]) => {
        console.log(`${name}: ${addr}`);
      });
      break;
    }
    
    case 'positions': {
      const user = process.argv[3] || account.address.toString();
      console.log(`Fetching positions for ${user}...\n`);
      
      try {
        for (let i = 1; i <= 10; i++) {
          const positionResult = await lendingPoolContract.read('getPosition', new Args().addU64(BigInt(i)).serialize());
          const positionData = new Args(positionResult.value).nextString();
          
          if (positionData && positionData !== '') {
            const parts = positionData.split(':');
            if (parts.length >= 6 && parts[0] === user) {
              console.log(`Position ${i}:`);
              console.log(`  Borrower: ${parts[0]}`);
              console.log(`  Token ID: ${parts[1]}`);
              console.log(`  Borrowed: ${Mas.toString(BigInt(parts[2]))} MAS`);
              console.log(`  Interest: ${Mas.toString(BigInt(parts[3]))} MAS`);
              console.log(`  Last Update: ${new Date(Number(parts[4])).toLocaleString()}`);
              console.log(`  Active: ${parts[5]}`);
              console.log('');
            }
          }
        }
      } catch (error) {
      }
      break;
    }
    
    case 'auctions': {
      console.log('Fetching active auctions...\n');
      
      try {
        const activeAuctionsResult = await liquidationContract.read('getActiveAuctions');
        const activeAuctions = new Args(activeAuctionsResult.value).nextString();
        
        if (activeAuctions && activeAuctions !== '') {
          const auctionIds = activeAuctions.split(',');
          
          for (const auctionId of auctionIds) {
            const auctionResult = await liquidationContract.read('getAuction', new Args().addU64(BigInt(auctionId)).serialize());
            const auctionData = new Args(auctionResult.value).nextString();
            
            if (auctionData && auctionData !== '') {
              const parts = auctionData.split(':');
              if (parts.length >= 6) {
                console.log(`Auction ${auctionId}:`);
                console.log(`  Token ID: ${parts[0]}`);
                console.log(`  Starting Price: ${Mas.toString(BigInt(parts[1]))} MAS`);
                console.log(`  End Time: ${new Date(Number(parts[2])).toLocaleString()}`);
                console.log(`  Highest Bid: ${Mas.toString(BigInt(parts[3]))} MAS`);
                console.log(`  Active: ${parts[5]}`);
                console.log('');
              }
            }
          }
        } else {
          console.log('No active auctions found.');
        }
      } catch (error) {
        console.error('Error fetching auctions:', error);
      }
      break;
    }
    
    default: {
      console.log('Usage: npm run interact <command> [args]');
      console.log('\nCommands:');
      console.log('  startAccrual              - Start automatic interest accrual');
      console.log('  startEvaluation           - Start automatic risk evaluation');
      console.log('  mintNFT [value] [pd] [lgd] - Mint test NFT');
      console.log('  depositNFT <tokenId>      - Deposit NFT as collateral');
      console.log('  deposit <amount>          - Deposit MAS to lending pool');
      console.log('  borrow <tokenId> <amount> - Borrow MAS against collateral');
      console.log('  repay <positionId> <amount> - Repay borrowed amount');
      console.log('  updatePrice <price>       - Update oracle price');
      console.log('  info                      - Show protocol information');
      console.log('  positions [user]          - Show user positions');
      console.log('  auctions                  - Show active auctions');
      console.log('  startLendingAccrual       - Start automatic interest accrual');
      console.log('  startRiskEvaluation       - Start automatic risk evaluation');
      console.log('  checkGov                  - Check addresses in Governance');
    }
  }
}

main().catch(error => {
  console.error('❌ Interaction failed:', error);
  process.exit(1);
});