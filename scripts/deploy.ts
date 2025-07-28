import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as massa from '@massalabs/massa-web3';

async function main() {
  console.log('Alpaca Bridge Deployment Script');
  console.log('===========================');

  const account = await massa.Account.fromEnv();
  const provider = massa.JsonRpcProvider.buildnet(account);

  console.log(`Deploying from account: ${account.address.toString()}`);

  const balance = await provider.balance(true);
  console.log(`Account balance: ${massa.Mas.toString(balance)} MAS`);

  const addresses: Record<string, string> = {};

  const TX_OPTIONS = {
    coins: massa.Mas.fromString('1'),
    maxGas: BigInt(3_000_000_000),
    fee: massa.Mas.fromString('0.01')
  };

  const CALL_OPTIONS = {
    maxGas: BigInt(200_000_000),
    fee: massa.Mas.fromString('0.01')
  };

  let nftContract: massa.SmartContract;
  let governanceContract: massa.SmartContract;
  let oracleContract: massa.SmartContract;
  let vaultContract: massa.SmartContract;
  let riskManagerContract: massa.SmartContract;
  let lendingPoolContract: massa.SmartContract;
  let liquidationContract: massa.SmartContract;

  console.log('\nStep 1: Deploying MockNFT contract...');
  const nftBytecode = readFileSync('./build/MockNFT.wasm');
  try {
    nftContract = await massa.SmartContract.deploy(
      provider,
      nftBytecode,
      new Uint8Array(0),
      TX_OPTIONS
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
    governanceContract = await massa.SmartContract.deploy(
      provider,
      governanceBytecode,
      new Uint8Array(0),
      TX_OPTIONS
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
    oracleContract = await massa.SmartContract.deploy(
      provider,
      oracleBytecode,
      new Uint8Array(0),
      TX_OPTIONS
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
    const vaultConstructorArgs = new massa.Args()
      .addString(addresses.governance)
      .addString(addresses.mockNFT);
    vaultContract = await massa.SmartContract.deploy(
      provider,
      vaultBytecode,
      vaultConstructorArgs.serialize(),
      TX_OPTIONS
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
    const riskConstructorArgs = new massa.Args()
      .addString(addresses.governance)
      .addString(addresses.oracle)
      .addString(addresses.collateralVault);
    riskManagerContract = await massa.SmartContract.deploy(
      provider,
      riskManagerBytecode,
      riskConstructorArgs.serialize(),
      TX_OPTIONS
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
    const poolConstructorArgs = new massa.Args()
      .addString(addresses.governance)
      .addString(addresses.riskManager)
      .addString(addresses.collateralVault);
    lendingPoolContract = await massa.SmartContract.deploy(
      provider,
      lendingPoolBytecode,
      poolConstructorArgs.serialize(),
      TX_OPTIONS
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
    const liquidationConstructorArgs = new massa.Args()
      .addString(addresses.governance)
      .addString(addresses.lendingPool)
      .addString(addresses.riskManager)
      .addString(addresses.collateralVault);
    liquidationContract = await massa.SmartContract.deploy(
      provider,
      liquidationBytecode,
      liquidationConstructorArgs.serialize(),
      TX_OPTIONS
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
    const setVaultOp = await governanceContract.call('setCollateralVault', new massa.Args().addString(addresses.collateralVault).serialize(), CALL_OPTIONS);
    await setVaultOp.waitFinalExecution();

    console.log('Setting LendingPool address in Governance...');
    const setPoolOp = await governanceContract.call('setLendingPool', new massa.Args().addString(addresses.lendingPool).serialize(), CALL_OPTIONS);
    await setPoolOp.waitFinalExecution();

    console.log('Setting RiskManager address in Governance...');
    const setRiskOp = await governanceContract.call('setRiskManager', new massa.Args().addString(addresses.riskManager).serialize(), CALL_OPTIONS);
    await setRiskOp.waitFinalExecution();

    console.log('Setting LiquidationEngine address in Governance...');
    const setLiquidationOp = await governanceContract.call('setLiquidationEngine', new massa.Args().addString(addresses.liquidationEngine).serialize(), CALL_OPTIONS);
    await setLiquidationOp.waitFinalExecution();

    console.log('Setting Oracle address in Governance...');
    const setOracleOp = await governanceContract.call('setOracle', new massa.Args().addString(addresses.oracle).serialize(), CALL_OPTIONS);
    await setOracleOp.waitFinalExecution();
    
    console.log('Setting LendingPool address in RiskManager...');
    const setLendingPoolInRiskOp = await governanceContract.call('setLendingPoolInRiskManager', new massa.Args().addString(addresses.lendingPool).serialize(), CALL_OPTIONS);
    await setLendingPoolInRiskOp.waitFinalExecution();

    console.log('Setting LiquidationEngine address in RiskManager...');
    const setLiqInRiskOp = await governanceContract.call('setLiquidationEngineInRiskManager', new massa.Args().addString(addresses.liquidationEngine).serialize(), CALL_OPTIONS);
    await setLiqInRiskOp.waitFinalExecution();
    
    console.log('✅ Contract connections configured');
  } catch (error) {
    console.error('Failed to configure contracts:', error);
    throw error;
  }

  try {
    writeFileSync(resolve(process.cwd(), 'addresses.json'), JSON.stringify(addresses, null, 2));
    try {
      writeFileSync(resolve(process.cwd(), 'front-end/public/addresses.json'), JSON.stringify(addresses, null, 2));
    } catch (frontendError) {
      console.log('Note: front-end directory not found, skipping frontend addresses.json');
    }
  } catch (error) {
    console.error('Failed to write addresses file:', error);
  }

  console.log('\n✅ Deployment complete!');
  console.log('\nContract addresses saved to addresses.json:');
  console.log(JSON.stringify(addresses, null, 2));

  console.log('\n📝 Next steps:');
  console.log('1. Start interest accrual: npm run interact startLendingAccrual');
  console.log('2. Start risk evaluation: npm run interact startRiskEvaluation');
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