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

  // Helper function for safe string parsing
  const safeParseString = (result: any, fallbackValue: string = ''): string => {
    try {
      if (!result || !result.value || result.value.length === 0) {
        return fallbackValue;
      }
      return new TextDecoder().decode(result.value);
    } catch (error) {
      try {
        // Fallback to massa Args parsing
        return new massa.Args(result.value).nextString() || fallbackValue;
      } catch (fallbackError) {
        console.warn('Both parsing methods failed for string, using fallback:', error, fallbackError);
        return fallbackValue;
      }
    }
  };

  // Helper function for safe U64 parsing
  const safeParseU64 = (result: any, fallbackValue: string = '0'): string => {
    try {
      if (!result || !result.value || result.value.length === 0) {
        return fallbackValue;
      }
      return new massa.Args(result.value).nextU64().toString();
    } catch (error) {
      console.warn('Failed to parse U64, using fallback:', error);
      return fallbackValue;
    }
  };

  // Retry wrapper for contract calls with longer timeout
  const retryContractCall = async (contractCall: () => Promise<any>, maxRetries: number = 5): Promise<any> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await contractCall();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        console.warn(`Positions contract call attempt ${attempt} failed, retrying...`, error);
        // Progressive delay with longer waits
        await new Promise(resolve => setTimeout(resolve, Math.min(2000 * attempt, 10000)));
      }
    }
  };

  const refreshData = useCallback(async () => {
    console.log('🚀 usePositions refreshData started');
    if (!contracts.lendingPool || !contracts.collateralVault || !provider) {
      console.log('❌ Missing contracts or provider');
      setData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      console.log('✅ Starting data fetch...');
      setData(prev => ({ ...prev, isLoading: true, error: null }));

      const userAddress = provider.address || provider.getAddress?.() || provider.account?.address;
      const positions: Position[] = [];
      const collaterals: NFTCollateral[] = [];
      const textDecoder = new TextDecoder();

      for (let i = 1; i <= 50; i++) {
        try {
          const positionResult = await retryContractCall(
            () => contracts.lendingPool.read(
              'getPosition', 
              new massa.Args().addU64(BigInt(i)).serialize()
            )
          );
          const positionData = safeParseString(positionResult);

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
          // Continue scanning on intermittent read errors
          continue;
        }
      }

      // 使用新的批量获取函数来提高性能
      try {
        const nftsResult = await retryContractCall(
          () => contracts.rwaNFT.read(
            'getNftsOfOwner',
            new massa.Args().addString(userAddress).serialize()
          )
        );
        const nftsData = safeParseString(nftsResult);
        
        if (nftsData && nftsData !== '') {
          const nftEntries = nftsData.split('|');
          
          for (const entry of nftEntries) {
            if (entry.trim() === '') continue;
            
            const parts = entry.split(':');
            if (parts.length >= 4) {
              const tokenId = parseInt(parts[0]);
              const value = parts[1];
              const pd = parts[2];
              const lgd = parts[3];
              
              // 检查此NFT是否已存入Vault
              try {
                const isDepositedResult = await retryContractCall(
                  () => contracts.collateralVault.read(
                    'isNFTDeposited', 
                    new massa.Args().addU64(BigInt(tokenId)).serialize()
                  )
                );
                const isDeposited = safeParseString(isDepositedResult) === 'true';
                
                if (isDeposited) {
                  collaterals.push({
                    id: tokenId,
                    owner: userAddress,
                    value,
                    pd,
                    lgd,
                    isDeposited: true
                  });
                }
              } catch (error) {
                console.error(`Failed to check if NFT ${tokenId} is deposited:`, error);
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch user NFTs using batch method, falling back to old method:', error);
        
        // 如果新方法失败，回退到原来的逐个查询方法
        for (let i = 1; i <= 50; i++) {
          try {
            const isDepositedResult = await retryContractCall(
              () => contracts.collateralVault.read(
                'isNFTDeposited', 
                new massa.Args().addU64(BigInt(i)).serialize()
              )
            );
            const isDeposited = safeParseString(isDepositedResult) === 'true';

            if (isDeposited) {
              const ownerResult = await retryContractCall(
                () => contracts.collateralVault.read(
                  'getNFTOwner', 
                  new massa.Args().addU64(BigInt(i)).serialize()
                )
              );
              const owner = safeParseString(ownerResult);

              if (owner === userAddress) {
                const [valueResult, pdResult, lgdResult] = await Promise.all([
                  retryContractCall(() => contracts.oracle.read('getNFTValuation', new massa.Args().addU64(BigInt(i)).serialize())),
                  retryContractCall(() => contracts.oracle.read('getNFTPD', new massa.Args().addU64(BigInt(i)).serialize())),
                  retryContractCall(() => contracts.oracle.read('getNFTLGD', new massa.Args().addU64(BigInt(i)).serialize()))
                ]);

                const value = safeParseU64(valueResult);
                const pd = safeParseU64(pdResult);
                const lgd = safeParseU64(lgdResult);

                collaterals.push({
                  id: i,
                  owner,
                  value: value,
                  pd: pd,
                  lgd: lgd,
                  isDeposited: true
                });
              }
            }
          } catch (error) {
            continue;
          }
        }
      }

      setData(prev => ({
        userPositions: positions.length > 0 ? positions : prev.userPositions,
        userCollaterals: collaterals.length > 0 ? collaterals : prev.userCollaterals,
        isLoading: false,
        error: null
      }));

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

  const depositNFT = useCallback(async (tokenId: number): Promise<void> => {
    if (!contracts.collateralVault) throw new Error('Collateral vault contract not available');

    // Guard: prefer Oracle; if zero, fallback to RWA_NFT to allow proceed
    if (contracts.oracle && contracts.rwaNFT) {
      try {
        const vRes = await contracts.oracle.read('getNFTValuation', new massa.Args().addU64(BigInt(tokenId)).serialize());
        const v = new massa.Args(vRes.value).nextU64();
        if (v === 0n) {
          const nvRes = await contracts.rwaNFT.read('getNFTValuation', new massa.Args().addU64(BigInt(tokenId)).serialize());
          const nv = new massa.Args(nvRes.value).nextU64();
          if (nv === 0n) throw new Error('Appraisal not available yet. Please retry shortly.');
        }
      } catch (e) {
        // If any read fails, continue to attempt deposit; contract has own guards
      }
    }

    const operation = await contracts.collateralVault.call(
      'depositNFT',
      new massa.Args().addU64(BigInt(tokenId)).serialize()
    );

    // 立即刷新数据，不等待最终确认
    refreshData();
    
    // 在后台等待最终确认，然后再次刷新
    operation.waitFinalExecution().then(() => {
      setTimeout(() => refreshData(), 1000);
    });
  }, [contracts.collateralVault, refreshData]);

  const withdrawNFT = useCallback(async (tokenId: number): Promise<void> => {
    if (!contracts.collateralVault) throw new Error('Collateral vault contract not available');

    const operation = await contracts.collateralVault.call(
      'withdrawNFT',
      new massa.Args().addU64(BigInt(tokenId)).serialize()
    );

    // 立即刷新数据，不等待最终确认
    refreshData();
    
    // 在后台等待最终确认，然后再次刷新
    operation.waitFinalExecution().then(() => {
      setTimeout(() => refreshData(), 1000);
    });
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

    // 立即刷新数据，不等待最终确认
    refreshData();
    
    // 在后台等待最终确认，然后再次刷新
    operation.waitFinalExecution().then(() => {
      setTimeout(() => refreshData(), 1000);
    });
  }, [contracts.lendingPool, refreshData]);

  const repay = useCallback(async (positionId: number, amount: string): Promise<void> => {
    if (!contracts.lendingPool) throw new Error('Lending pool contract not available');

    const coins = massa.Mas.fromString(amount);
    
    const operation = await contracts.lendingPool.call(
      'repay',
      new massa.Args().addU64(BigInt(positionId)).serialize(),
      { coins }
    );

    // 立即刷新数据，不等待最终确认
    refreshData();
    
    // 在后台等待最终确认，然后再次刷新
    operation.waitFinalExecution().then(() => {
      setTimeout(() => refreshData(), 1000);
    });
  }, [contracts.lendingPool, refreshData]);

  const mintNFT = useCallback(async (metadata: string, assetType: string): Promise<bigint> => {
    if (!contracts.rwaNFT || !provider) throw new Error('NFT Contract or provider not available');

    const userAddress = provider.address || provider.getAddress?.() || provider.account?.address;

    // Get the token ID that will be minted
    const nextIdResult = await contracts.rwaNFT.read('NEXT_ID');
    const tokenId = new massa.Args(nextIdResult.value).nextU64();

    console.log(`Minting NFT with ID ${tokenId}...`);

    const mintArgs = new massa.Args()
      .addString(userAddress)
      .addString(metadata)
      .addString(assetType);

    // Mint the basic NFT (no pricing data yet)
    const mintOperation = await contracts.rwaNFT.call('mint', mintArgs.serialize(), {
      maxGas: BigInt(200_000_000),
      fee: massa.Mas.fromString('0.01')
    });

    await mintOperation.waitFinalExecution();
    console.log(`NFT ${tokenId} minted successfully - ready for appraisal`);

    // Refresh data to show the new NFT
    setTimeout(() => refreshData(), 1000);
    return tokenId;

  }, [contracts.rwaNFT, provider, refreshData]);

  const appraiseNFT = useCallback(async (tokenId: number, value: string, pd: number, lgd: number): Promise<string> => {
    if (!contracts.rwaNFT) throw new Error('NFT Contract not available');

    console.log(`Appraising NFT ${tokenId} with value: ${value}, PD: ${pd}, LGD: ${lgd}`);

    // Pre-check ownership to avoid on-chain assert failures
    try {
      const ownerResult = await contracts.rwaNFT.read('ownerOf', new massa.Args().addU64(BigInt(tokenId)).serialize());
      const owner = new TextDecoder().decode(ownerResult.value || new Uint8Array());
      const userAddress = (provider as any)?.address || (provider as any)?.getAddress?.() || (provider as any)?.account?.address;
      if (!owner || owner !== userAddress) {
        throw new Error(`You are not the owner of NFT #${tokenId}`);
      }
    } catch (e) {
      throw new Error(`Failed to verify NFT ownership: ${(e as any)?.message || e}`);
    }

    const appraiseArgs = new massa.Args()
      .addU64(BigInt(tokenId))
      .addU64(BigInt(value))
      .addU64(BigInt(pd))
      .addU64(BigInt(lgd));

    const appraiseOperation = await contracts.rwaNFT.call('appraiseAsset', appraiseArgs.serialize(), {
      // Increase gas headroom to reduce pending/pruning risk and allow oracle sync message
      maxGas: BigInt(300_000_000),
      fee: massa.Mas.fromString('0.01')
    });

    await appraiseOperation.waitFinalExecution();
    console.log(`NFT ${tokenId} appraised successfully`);

    // Verify on-chain value updated (RWA_NFT stores values directly)
    try {
      const valueResult = await contracts.rwaNFT.read('getNFTValuation', new massa.Args().addU64(BigInt(tokenId)).serialize());
      const onChainValue = new massa.Args(valueResult.value).nextU64();
      if (onChainValue === 0n) {
        console.warn('Appraisal executed but on-chain value remains 0');
        throw new Error('Appraisal pending or failed to update. Please try again later.');
      }
    } catch (verifyErr) {
      console.error('Failed to verify appraisal result:', verifyErr);
      throw verifyErr;
    }

    // Refresh data to show updated values
    setTimeout(() => refreshData(), 1000);

    // Return operation id for UI display if available
    try {
      // @ts-ignore - operation id depends on massa-web3 version
      const opId: string = appraiseOperation.operationId || appraiseOperation.id || '';
      return opId;
    } catch {
      return '';
    }

  }, [contracts.rwaNFT, refreshData]);

  const depositAndBorrow = useCallback(async (tokenId: number, amount: string): Promise<void> => {
    if (!contracts.collateralVault || !contracts.lendingPool) throw new Error('Contracts not available');

    // Guard: prefer Oracle; if zero, fallback to RWA_NFT to allow proceed
    if (contracts.oracle && contracts.rwaNFT) {
      try {
        const vRes = await contracts.oracle.read('getNFTValuation', new massa.Args().addU64(BigInt(tokenId)).serialize());
        const v = new massa.Args(vRes.value).nextU64();
        if (v === 0n) {
          const nvRes = await contracts.rwaNFT.read('getNFTValuation', new massa.Args().addU64(BigInt(tokenId)).serialize());
          const nv = new massa.Args(nvRes.value).nextU64();
          if (nv === 0n) throw new Error('Appraisal not available yet. Please retry shortly.');
        }
      } catch (e) {
        // Continue and let contract guards handle
      }
    }

    // Step 1: Deposit NFT
    const depositOp = await contracts.collateralVault.call(
      'depositNFT',
      new massa.Args().addU64(BigInt(tokenId)).serialize()
    );
    await depositOp.waitFinalExecution();

    // Refresh data to ensure borrow conditions are met
    await refreshData();

    if (amount && parseFloat(amount) > 0) {
        const borrowAmount = BigInt(Math.floor(parseFloat(amount) * 1_000_000_000));
        if (contracts.riskManager) {
          try {
            const ltvRes = await contracts.riskManager.read(
              'calculateLTV',
              new massa.Args().addU64(BigInt(tokenId)).addU64(borrowAmount).serialize()
            );
            const ltv = new massa.Args(ltvRes.value).nextU64();
            if (ltv === 0n || ltv === 10000n) {
              throw new Error('Borrow exceeds allowed LTV or price is stale');
            }
          } catch (e) {
            throw e;
          }
        }
        const borrowOp = await contracts.lendingPool.call(
          'borrow',
          new massa.Args()
            .addU64(BigInt(tokenId))
            .addU64(borrowAmount)
            .serialize()
        );
        await borrowOp.waitFinalExecution();
    }

    // Final refresh
    setTimeout(() => refreshData(), 1000);

  }, [contracts.collateralVault, contracts.lendingPool, refreshData]);

  return {
    ...data,
    refreshData,
    depositNFT,
    withdrawNFT,
    borrow,
    repay,
    mintNFT,
    appraiseNFT,
    depositAndBorrow
  };
}
