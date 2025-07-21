import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  Account,
  SmartContract,
  JsonRpcProvider,
  Mas,
  Args
} from '@massalabs/massa-web3';

async function main() {
  console.log('Alpaca LB Deployment Script');
  console.log('===========================');
  
  const account = await Account.fromEnv();
  const provider = JsonRpcProvider.buildnet(account);
  
  console.log(`Deploying from account: ${account.address.toString()}`);
  
  const balance = await provider.balance(true);
  console.log(`Account balance: ${Mas.toString(balance)} MAS`);
  
  const addresses: Record<string, string> = {};
  
  console.log('\nStep 1: Deploying MockNFT contract...');
  const nftBytecode = readFileSync('./build/MockNFT.wasm');
  
  try {
    const nftContract = await SmartContract.deploy(
      provider,
      nftBytecode,
      new Uint8Array(0),
      {
        coins: Mas.fromString('1'),
        fee: Mas.fromString('0.01')
      }
    );
    
    addresses.mockNFT = nftContract.address;
    console.log(`✅ MockNFT deployed at: ${addresses.mockNFT}`);
  } catch (error) {
    console.error('Failed to deploy MockNFT:', error);
    throw error;
  }
  
  console.log('\nStep 2: Deploying Governance contract...');
  const governanceBytecode = readFileSync('./build/Governance.wasm');
  
  try {
    const governanceContract = await SmartContract.deploy(
      provider,
      governanceBytecode,
      new Uint8Array(0),
      {
        coins: Mas.fromString('1'),
        fee: Mas.fromString('0.01')
      }
    );
    
    addresses.governance = governanceContract.address;
    console.log(`✅ Governance deployed at: ${addresses.governance}`);
  } catch (error) {
    console.error('Failed to deploy Governance:', error);
    throw error;
  }
  
  console.log('\nStep 3: Deploying Oracle contract...');
  const oracleBytecode = readFileSync('./build/Oracle.wasm');
  
  try {
    const oracleContract = await SmartContract.deploy(
      provider,
      oracleBytecode,
      new Uint8Array(0),
      {
        coins: Mas.fromString('1'),
        fee: Mas.fromString('0.01')
      }
    );
    
    addresses.oracle = oracleContract.address;
    console.log(`✅ Oracle deployed at: ${addresses.oracle}`);
  } catch (error) {
    console.error('Failed to deploy Oracle:', error);
    throw error;
  }
  
  console.log('\nStep 4: Deploying CollateralVault contract...');
  const vaultBytecode = readFileSync('./build/CollateralVault.wasm');
  
  try {
    const vaultConstructorArgs = new Args()
      .addString(addresses.governance)
      .addString(addresses.mockNFT);
    
    const vaultContract = await SmartContract.deploy(
      provider,
      vaultBytecode,
      vaultConstructorArgs.serialize(),
      {
        coins: Mas.fromString('1'),
        fee: Mas.fromString('0.01')
      }
    );
    
    addresses.collateralVault = vaultContract.address;
    console.log(`✅ CollateralVault deployed at: ${addresses.collateralVault}`);
  } catch (error) {
    console.error('Failed to deploy CollateralVault:', error);
    throw error;
  }
  
  console.log('\nStep 5: Deploying RiskManager contract...');
  const riskManagerBytecode = readFileSync('./build/RiskManager.wasm');
  
  try {
    const riskConstructorArgs = new Args()
      .addString(addresses.governance)
      .addString(addresses.oracle)
      .addString(addresses.collateralVault)
      .addString('PLACEHOLDER_LIQUIDATION');
    
    const riskManagerContract = await SmartContract.deploy(
      provider,
      riskManagerBytecode,
      riskConstructorArgs.serialize(),
      {
        coins: Mas.fromString('1'),
        fee: Mas.fromString('0.01')
      }
    );
    
    addresses.riskManager = riskManagerContract.address;
    console.log(`✅ RiskManager deployed at: ${addresses.riskManager}`);
  } catch (error) {
    console.error('Failed to deploy RiskManager:', error);
    throw error;
  }
  
  console.log('\nStep 6: Deploying LendingPool contract...');
  const lendingPoolBytecode = readFileSync('./build/LendingPool.wasm');
  
  try {
    const poolConstructorArgs = new Args()
      .addString(addresses.governance)
      .addString(addresses.riskManager)
      .addString(addresses.collateralVault);
    
    const lendingPoolContract = await SmartContract.deploy(
      provider,
      lendingPoolBytecode,
      poolConstructorArgs.serialize(),
      {
        coins: Mas.fromString('1'),
        fee: Mas.fromString('0.01')
      }
    );
    
    addresses.lendingPool = lendingPoolContract.address;
    console.log(`✅ LendingPool deployed at: ${addresses.lendingPool}`);
  } catch (error) {
    console.error('Failed to deploy LendingPool:', error);
    throw error;
  }
  
  console.log('\nStep 7: Deploying LiquidationEngine contract...');
  const liquidationBytecode = readFileSync('./build/LiquidationEngine.wasm');
  
  try {
    const liquidationConstructorArgs = new Args()
      .addString(addresses.governance)
      .addString(addresses.lendingPool)
      .addString(addresses.riskManager)
      .addString(addresses.collateralVault);
    
    const liquidationContract = await SmartContract.deploy(
      provider,
      liquidationBytecode,
      liquidationConstructorArgs.serialize(),
      {
        coins: Mas.fromString('1'),
        fee: Mas.fromString('0.01')
      }
    );
    
    addresses.liquidationEngine = liquidationContract.address;
    console.log(`✅ LiquidationEngine deployed at: ${addresses.liquidationEngine}`);
  } catch (error) {
    console.error('Failed to deploy LiquidationEngine:', error);
    throw error;
  }
  
  console.log('\nStep 8: Configuring contract connections...');
  
  try {
    console.log('Setting CollateralVault address in Governance...');
    const setVaultOp = await governanceContract.call(
      'setCollateralVault',
      new Args().addString(addresses.collateralVault).serialize()
    );
    await setVaultOp.waitFinalExecution();
    
    console.log('Setting LendingPool address in Governance...');
    const setPoolOp = await governanceContract.call(
      'setLendingPool',
      new Args().addString(addresses.lendingPool).serialize()
    );
    await setPoolOp.waitFinalExecution();
    
    console.log('Setting RiskManager address in Governance...');
    const setRiskOp = await governanceContract.call(
      'setRiskManager',
      new Args().addString(addresses.riskManager).serialize()
    );
    await setRiskOp.waitFinalExecution();
    
    console.log('Setting LiquidationEngine address in Governance...');
    const setLiquidationOp = await governanceContract.call(
      'setLiquidationEngine',
      new Args().addString(addresses.liquidationEngine).serialize()
    );
    await setLiquidationOp.waitFinalExecution();
    
    console.log('Setting Oracle address in Governance...');
    const setOracleOp = await governanceContract.call(
      'setOracle',
      new Args().addString(addresses.oracle).serialize()
    );
    await setOracleOp.waitFinalExecution();
    
    console.log('✅ Contract connections configured');
  } catch (error) {
    console.error('Failed to configure contracts:', error);
    throw error;
  }
  
  writeFileSync(
    resolve(process.cwd(), 'addresses.json'),
    JSON.stringify(addresses, null, 2)
  );
  
  writeFileSync(
    resolve(process.cwd(), 'front-end/public/addresses.json'),
    JSON.stringify(addresses, null, 2)
  );
  
  console.log('\n✅ Deployment complete!');
  console.log('\nContract addresses saved to addresses.json:');
  console.log(JSON.stringify(addresses, null, 2));
  
  console.log('\n📝 Next steps:');
  console.log('1. Start interest accrual: npm run interact startAccrual');
  console.log('2. Start risk evaluation: npm run interact startEvaluation');
  console.log('3. Mint test NFTs: npm run interact mintNFT');
  console.log('4. Test deposit: npm run interact deposit 10');
}

main().catch(error => {
  console.error('❌ Deployment failed:', error);
  console.error('\n💡 Troubleshooting tips:');
  console.error('1. Check if your PRIVATE_KEY is correct in .env file');
  console.error('2. Make sure you have enough MAS for deployment fees');
  console.error('3. Check the contract bytecode exists in build/ directory');
  process.exit(1);
});