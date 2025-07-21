import { useMemo } from 'react';
import * as massa from '@massalabs/massa-web3';

export function useContracts(provider: any, addresses: Record<string, string>) {
  return useMemo(() => {
    if (!provider || !addresses) {
      return {
        mockNFT: null,
        governance: null,
        oracle: null,
        collateralVault: null,
        riskManager: null,
        lendingPool: null,
        liquidationEngine: null
      };
    }

    return {
      mockNFT: addresses.mockNFT ? new massa.SmartContract(provider, addresses.mockNFT) : null,
      governance: addresses.governance ? new massa.SmartContract(provider, addresses.governance) : null,
      oracle: addresses.oracle ? new massa.SmartContract(provider, addresses.oracle) : null,
      collateralVault: addresses.collateralVault ? new massa.SmartContract(provider, addresses.collateralVault) : null,
      riskManager: addresses.riskManager ? new massa.SmartContract(provider, addresses.riskManager) : null,
      lendingPool: addresses.lendingPool ? new massa.SmartContract(provider, addresses.lendingPool) : null,
      liquidationEngine: addresses.liquidationEngine ? new massa.SmartContract(provider, addresses.liquidationEngine) : null
    };
  }, [provider, addresses]);
}