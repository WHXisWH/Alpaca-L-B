import { useState, useEffect, useCallback } from 'react';
import * as massa from '@massalabs/massa-web3';
import { useContracts } from './useContracts';
import { REFRESH_INTERVALS } from '../utils/constants';

interface Position {
  id: number;
  borrower: string;
  tokenId: number;
  borrowedAmount: string;
  accruedInterest: string;
  lastUpdate: number;
  isActive: boolean;
  ltv?: number;
  collateralValue?: string;
}

interface NFTCollateral {
  id: number;
  owner: string;
  value: string;
  pd: string;
  lgd: string;
  isDeposited: boolean;
}

interface PositionsData {
  userPositions: Position[];
  userCollaterals: NFTCollateral[];
  isLoading: boolean;
  error: string | null;
}

export function usePositions(provider: any, addresses: Record<string, string>) {
  const contracts = useContracts(provider, addresses);
  
  const [data, setData] = useState<PositionsData>({
    userPositions: [],
    userCollaterals: [],
    isLoading: true,
    error: null
  });

  const refreshData = useCallback(async () => {
    if (!contracts.lendingPool || !contracts.collateralVault || !provider) {
      setData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      setData(prev => ({ ...prev, isLoading: true, error: null }));

      const userAddress = provider.address;
      const positions: Position[] = [];
      const collaterals: NFTCollateral[] = [];
      const textDecoder = new TextDecoder();

      for (let i = 1; i <= 50; i++) {
        try {
          const positionResult = await contracts.lendingPool.read(
            'getPosition', 
            new massa.Args().addU64(BigInt(i)).serialize()
          );
          const positionData = textDecoder.decode(positionResult.value);

          if (positionData && positionData !== '') {
            const parts = positionData.split(':');
            if (parts.length >= 6 && parts[0] === userAddress) {
              positions.push({
                id: i,
                borrower: parts[0],
                tokenId: parseInt(parts[1]),
                borrowedAmount: parts[2],
                accruedInterest: parts[3],
                lastUpdate: parseInt(parts[4]),
                isActive: parts[5] === 'true'
              });
            }
          }
        } catch (error) {
          break;
        }
      }

      for (let i = 1; i <= 50; i++) {
        try {
          const isDepositedResult = await contracts.collateralVault.read(
            'isNFTDeposited', 
            new massa.Args().addU64(BigInt(i)).serialize()
          );
          const isDeposited = textDecoder.decode(isDepositedResult.value) === 'true';

          if (isDeposited) {
            const ownerResult = await contracts.collateralVault.read(
              'getNFTOwner', 
              new massa.Args().addU64(BigInt(i)).serialize()
            );
            const owner = textDecoder.decode(ownerResult.value);

            if (owner === userAddress) {
              const [valueResult, pdResult, lgdResult] = await Promise.all([
                contracts.collateralVault.read('getNFTValue', new massa.Args().addU64(BigInt(i)).serialize()),
                contracts.collateralVault.read('getNFTPD', new massa.Args().addU64(BigInt(i)).serialize()),
                contracts.collateralVault.read('getNFTLGD', new massa.Args().addU64(BigInt(i)).serialize())
              ]);

              const value = new massa.Args(valueResult.value).nextU64();
              const pd = new massa.Args(pdResult.value).nextU64();
              const lgd = new massa.Args(lgdResult.value).nextU64();

              collaterals.push({
                id: i,
                owner,
                value: value.toString(),
                pd: pd.toString(),
                lgd: lgd.toString(),
                isDeposited: true
              });
            }
          }
        } catch (error) {
          break;
        }
      }

      setData({
        userPositions: positions,
        userCollaterals: collaterals,
        isLoading: false,
        error: null
      });

    } catch (error) {
      console.error('Failed to fetch positions data:', error);
      setData(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to fetch positions data'
      }));
    }
  }, [contracts.lendingPool, contracts.collateralVault, provider]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, REFRESH_INTERVALS.NORMAL);
    return () => clearInterval(interval);
  }, [refreshData]);

  const mintNFT = useCallback(async (value: string, pd: string, lgd: string): Promise<bigint> => {
    if (!contracts.mockNFT || !provider) throw new Error('MockNFT contract not available');
  
    const maturity = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    
    const operation = await contracts.mockNFT.call(
      'mint',
      new massa.Args()
        .addString(provider.address)
        .addU64(BigInt(value))
        .addU64(BigInt(pd))
        .addU64(BigInt(lgd))
        .addU64(BigInt(maturity))
        .serialize()
    );
  
    await operation.waitFinalExecution();

    const nextIdResult = await contracts.mockNFT.read('getNextTokenId');
    const nextId = new massa.Args(nextIdResult.value).nextU64();
    const mintedId = nextId - BigInt(1);

    await refreshData();
    return mintedId;

  }, [contracts.mockNFT, provider, refreshData]);

  const depositNFT = useCallback(async (tokenId: number): Promise<void> => {
    if (!contracts.collateralVault) throw new Error('Collateral vault contract not available');

    const operation = await contracts.collateralVault.call(
      'depositNFT',
      new massa.Args().addU64(BigInt(tokenId)).serialize()
    );

    await operation.waitFinalExecution();
    await refreshData();
  }, [contracts.collateralVault, refreshData]);

  const withdrawNFT = useCallback(async (tokenId: number): Promise<void> => {
    if (!contracts.collateralVault) throw new Error('Collateral vault contract not available');

    const operation = await contracts.collateralVault.call(
      'withdrawNFT',
      new massa.Args().addU64(BigInt(tokenId)).serialize()
    );

    await operation.waitFinalExecution();
    await refreshData();
  }, [contracts.collateralVault, refreshData]);

  const borrow = useCallback(async (tokenId: number, amount: string): Promise<void> => {
    if (!contracts.lendingPool) throw new Error('Lending pool contract not available');

    const borrowAmount = BigInt(Math.floor(parseFloat(amount) * 1_000_000_000));
    
    const operation = await contracts.lendingPool.call(
      'borrow',
      new massa.Args()
        .addU64(BigInt(tokenId))
        .addU64(borrowAmount)
        .serialize()
    );

    await operation.waitFinalExecution();
    await refreshData();
  }, [contracts.lendingPool, refreshData]);

  const repay = useCallback(async (positionId: number, amount: string): Promise<void> => {
    if (!contracts.lendingPool) throw new Error('Lending pool contract not available');

    const coins = massa.Mas.fromString(amount);
    
    const operation = await contracts.lendingPool.call(
      'repay',
      new massa.Args().addU64(BigInt(positionId)).serialize(),
      { coins }
    );

    await operation.waitFinalExecution();
    await refreshData();
  }, [contracts.lendingPool, refreshData]);

  return {
    ...data,
    refreshData,
    mintNFT,
    depositNFT,
    withdrawNFT,
    borrow,
    repay
  };
}