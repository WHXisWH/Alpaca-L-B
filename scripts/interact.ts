import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  Account,
  SmartContract,
  JsonRpcProvider,
  Mas,
  Args,
  Operation,
} from '@massalabs/massa-web3';

// Helper function to convert bytes to u64
function bytesToU64(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < Math.min(bytes.length, 8); i++) {
    result |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return result;
}

async function main() {
  console.log('Alpaca LB Interaction Script');
  console.log('============================\n');

  const account = await Account.fromEnv();
  const provider = JsonRpcProvider.buildnet(account);

  const addressesFile = readFileSync(resolve(process.cwd(), 'addresses.json'), 'utf-8');
  const addresses = JSON.parse(addressesFile);

  const rwaNftContract = new SmartContract(provider, addresses.rwaNFT, account);
  const governanceContract = new SmartContract(provider, addresses.governance, account);
  const oracleContract = new SmartContract(provider, addresses.oracle, account);
  const vaultContract = new SmartContract(provider, addresses.collateralVault, account);
  const riskManagerContract = new SmartContract(provider, addresses.riskManager, account);
  const lendingPoolContract = new SmartContract(provider, addresses.lendingPool, account);
  const liquidationContract = new SmartContract(provider, addresses.liquidationEngine, account);

  const action = process.argv[2];

  const TX_GAS_LIMIT = { maxGas: BigInt(200_000_000) };

  const awaitOperationFinalization = async (op: Operation) => {
      console.log(`Waiting for operation ${op.id} to be final...`);
      await op.waitFinalExecution();
      console.log(`Operation ${op.id} is final.`);
      return op.id;
  };

  switch (action) {
    case 'startLendingAccrual': {
      console.log('Starting lending pool interest accrual via governance...');
      const op = await governanceContract.call('startLendingPoolAccrual', new Uint8Array(0), TX_GAS_LIMIT);
      await awaitOperationFinalization(op);
      console.log('✅ Lending pool accrual start message sent!');
      console.log('ℹ️ Note: The ASC will activate in the next block. Use "npm run interact checkStatus" to verify.');
      break;
    }

    case 'startRiskEvaluation': {
      console.log('Starting risk manager evaluation via governance...');
      const op = await governanceContract.call('startRiskManagerEvaluation', new Uint8Array(0), TX_GAS_LIMIT);
      await awaitOperationFinalization(op);
      console.log('✅ Risk manager evaluation start message sent!');
      console.log('ℹ️ Note: The ASC will activate in the next block. Use "npm run interact checkStatus" to verify.');
      break;
    }

    case 'startPriceUpdater': {
      console.log('Starting Oracle autonomous price updates...');
      const op = await oracleContract.call('startUpdates', new Args().serialize(), TX_GAS_LIMIT);
      await awaitOperationFinalization(op);
      console.log('✅ Oracle autonomous price updates started!');
      console.log('ℹ️ Note: The ASC will activate in the next block and update prices every 30 minutes.');
      break;
    }

    case 'diagnose': {
        console.log('🔬 Starting diagnosis: Configuring RiskManager via Governance...');
        const op = await governanceContract.call(
            'setLendingPoolInRiskManager',
            new Args().addString(addresses.lendingPool).serialize(),
            { maxGas: BigInt(400_000_000), fee: Mas.fromString('0.01') }
        );
        const opId = await awaitOperationFinalization(op);

        console.log(`\n🕵️‍♂️ Transaction ${opId} is final. Checking state change...`);
        
        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
            const riskManagerLendingPoolResult = await riskManagerContract.read('getLendingPool');
            const storedAddress = new Args(riskManagerLendingPoolResult.value).nextString();

            if(storedAddress === addresses.lendingPool) {
                console.log('\n✅ DIAGNOSIS: SUCCESS! The LendingPool address was correctly set in RiskManager.');
                console.log('   The issue should now be resolved. Please try starting the ASC normally.');
            } else {
                console.log('\n❌ DIAGNOSIS: FAILURE! The LendingPool address was NOT set in RiskManager.');
                console.log(`   Expected: ${addresses.lendingPool}`);
                console.log(`   Got: ${storedAddress || 'empty'}`);
                console.log('   This confirms the asynchronous message failed. The only remaining cause is the low gas limit in Governance.ts.');
            }

        } catch (e) {
          console.error('\n❌ An error occurred during diagnosis:', e);
        }
        break;
      }

    case 'checkStatus': {
      console.log('Checking ASC statuses directly from blockchain...');
      try {
        const rmStatusResult = await riskManagerContract.read('isEvaluationActive');
        if (rmStatusResult.value.length > 0) {
            const status = Buffer.from(rmStatusResult.value).toString();
            console.log(`- Risk Manager Evaluation Status: ${status === 'true' ? '🟢 Active' : '🔴 Inactive'}`);
        } else {
            console.log(`- Risk Manager Evaluation Status: 🔴 Inactive (State not set)`);
        }

        const lpStatusResult = await lendingPoolContract.read('isAccrualActive');
        if (lpStatusResult.value.length > 0) {
            const status = Buffer.from(lpStatusResult.value).toString();
            console.log(`- Lending Pool Accrual Status:  ${status === 'true' ? '🟢 Active' : '🔴 Inactive'}`);
        } else {
            console.log(`- Lending Pool Accrual Status:  🔴 Inactive (State not set)`);
        }
      } catch (error) {
        console.error('Error fetching statuses:', error);
      }
      break;
    }

    case 'mintFromTemplate': {
      const metadata = process.argv[3] || 'Test Real Estate NFT';
      const value = process.argv[4] || '10000000'; // 10k MAS
      const pd = process.argv[5] || '500'; // 5%
      const lgd = process.argv[6] || '4000'; // 40%
      
      console.log(`Minting NFT with metadata: "${metadata}", value: ${value}, PD: ${pd}, LGD: ${lgd}...`);

      // 1. Get the token ID that will be minted
      const nextIdResult = await rwaNftContract.read('NEXT_ID');
      const tokenId = bytesToU64(nextIdResult.value);

      // 2. Mint NFT
      const mintArgs = new Args()
        .addString(account.address.toString())
        .addString(metadata);
      const mintOp = await rwaNftContract.call('mint', mintArgs.serialize(), TX_GAS_LIMIT);
      await awaitOperationFinalization(mintOp);
      console.log(`✅ NFT Minted (Token ID: ${tokenId})`);

      // 3. Set initial NFT profile in Oracle
      console.log('Setting initial NFT profile in Oracle...');
      const profileArgs = new Args()
        .addU64(BigInt(tokenId))
        .addU64(BigInt(value))
        .addU64(BigInt(pd))
        .addU64(BigInt(lgd));
      const profileOp = await oracleContract.call('setInitialNFTProfile', profileArgs.serialize(), TX_GAS_LIMIT);
      await awaitOperationFinalization(profileOp);
      
      console.log('✅ Oracle updated successfully!');
      console.log(`
🎉 NFT ${tokenId} is ready to be used as collateral.`);
      break;
    }

    case 'depositNFT': {
      const tokenId = process.argv[3] || '1';
      console.log(`Depositing NFT ${tokenId} as collateral...`);
      const depositArgs = new Args().addU64(BigInt(tokenId));
      const op = await vaultContract.call('depositNFT', depositArgs.serialize(), TX_GAS_LIMIT);
      await awaitOperationFinalization(op);
      console.log('✅ NFT deposited successfully!');
      break;
    }

    case 'deposit': {
      const amount = Mas.fromString(process.argv[3] || '10');
      console.log(`Depositing ${Mas.toString(amount)} MAS to lending pool...`);
      const op = await lendingPoolContract.call('deposit', new Uint8Array(0), { coins: amount, maxGas: TX_GAS_LIMIT.maxGas });
      await awaitOperationFinalization(op);
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
      const op = await lendingPoolContract.call('borrow', borrowArgs.serialize(), TX_GAS_LIMIT);
      await awaitOperationFinalization(op);
      console.log('✅ Borrow successful!');
      break;
    }

    case 'repay': {
      const positionId = process.argv[3] || '1';
      const amount = Mas.fromString(process.argv[4] || '5');
      console.log(`Repaying position ${positionId} with ${Mas.toString(amount)} MAS...`);
      const repayArgs = new Args().addU64(BigInt(positionId));
      const op = await lendingPoolContract.call('repay', repayArgs.serialize(), { coins: amount, maxGas: TX_GAS_LIMIT.maxGas });
      await awaitOperationFinalization(op);
      console.log('✅ Repayment successful!');
      break;
    }

    case 'updatePrice': {
      const price = process.argv[3] || '1100000';
      console.log(`Updating oracle price to ${price}...`);
      const priceArgs = new Args().addU64(BigInt(price));
      const op = await oracleContract.call('updatePrice', priceArgs.serialize(), TX_GAS_LIMIT);
      await awaitOperationFinalization(op);
      console.log('✅ Price updated!');
      break;
    }

    case 'updateNFTPrice': {
      const tokenId = process.argv[3] || '1';
      const value = process.argv[4] || '50000000000000'; // 50k MAS in nanoMAS
      const pd = process.argv[5] || '300';    // 3%
      const lgd = process.argv[6] || '3000';  // 30%
      
      console.log(`Updating NFT ${tokenId} pricing...`);
      console.log(`Value: ${parseInt(value) / 1_000_000_000} MAS, PD: ${parseInt(pd)/100}%, LGD: ${parseInt(lgd)/100}%`);
      console.log(`Your account: ${account.address.toString()}`);
      
      // Check authorized providers first
      try {
        console.log('🔍 Checking authorized providers...');
        const authProvidersResult = await oracleContract.read('getAuthorizedProviders');
        const authProviders = Buffer.from(authProvidersResult.value).toString();
        console.log(`Authorized providers: ${authProviders}`);
        console.log(`Your account authorized: ${authProviders.includes(account.address.toString())}`);
      } catch (e) {
        console.warn('Could not check authorized providers:', e);
      }
      
      const updateArgs = new Args()
        .addU64(BigInt(tokenId))
        .addU64(BigInt(value))
        .addU64(BigInt(pd))
        .addU64(BigInt(lgd));
      
      try {
        const op = await oracleContract.call('setInitialNFTProfile', updateArgs.serialize(), TX_GAS_LIMIT);
        await awaitOperationFinalization(op);
        console.log('✅ NFT pricing updated!');
        
        // Verify the update
        console.log('🔍 Verifying update...');
        const valueCheck = await oracleContract.read('getNFTValuation', new Args().addU64(BigInt(tokenId)).serialize());
        const finalValue = new Args(valueCheck.value).nextU64();
        console.log(`✅ Final value: ${finalValue.toString()} nanoMAS (${Number(finalValue) / 1_000_000_000} MAS)`);
      } catch (error) {
        console.error('❌ Failed to update NFT pricing:', error);
        throw error;
      }
      break;
    }

    case 'addMeAsOracleProvider': {
      console.log('Adding your account as Oracle authorized provider...');
      console.log(`Your account: ${account.address.toString()}`);
      
      const addProviderArgs = new Args().addString(account.address.toString());
      const op = await oracleContract.call('addAuthorizedProvider', addProviderArgs.serialize(), TX_GAS_LIMIT);
      await awaitOperationFinalization(op);
      
      console.log('✅ You are now an authorized Oracle provider!');
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
      console.log('  diagnose                  - (NEW) Run diagnosis to find the async error reason');
      console.log('  startLendingAccrual       - Start automatic interest accrual');
      console.log('  startRiskEvaluation       - Start automatic risk evaluation');
      console.log('  startPriceUpdater         - Start Oracle autonomous price updates');
      console.log('  checkStatus               - Directly check if ASCs are active on the blockchain');
      console.log('  mintFromTemplate [metadata] [value] [pd] [lgd] - Mint a new RWA NFT with oracle data');
      console.log('  depositNFT <tokenId>      - Deposit NFT as collateral');
      console.log('  deposit <amount>          - Deposit MAS to lending pool');
      console.log('  borrow <tokenId> <amount> - Borrow MAS against collateral');
      console.log('  repay <positionId> <amount> - Repay borrowed amount');
      console.log('  updatePrice <price>       - Update oracle price');
      console.log('  updateNFTPrice <tokenId> [value] [pd] [lgd] - Update specific NFT pricing');
      console.log('  addMeAsOracleProvider     - Add your account as authorized Oracle provider');
      console.log('  info                      - Show protocol information');
      console.log('  positions [user]          - Show user positions');
      console.log('  auctions                  - Show active auctions');
    }
  }
}

main().catch(error => {
  console.error('❌ Interaction failed:', error);
  process.exit(1);
});
