import { useState, useEffect, useCallback } from 'react';
import * as massa from '@massalabs/massa-web3';
import { useContracts } from './useContracts';
import { REFRESH_INTERVALS } from '../utils/constants';

interface LendingData {
  totalDeposits: string;
  totalBorrows: string;
  currentInterestRate: string;
  utilizationRate: string;
  userDeposits: string;
  isLoading: boolean;
  error: string | null;
}

export function useLending(provider: any, addresses: Record<string, string>) {
  const contracts = useContracts(provider, addresses);
  
  const [data, setData] = useState<LendingData>({
    totalDeposits: '0',
    totalBorrows: '0',
    currentInterestRate: '0',
    utilizationRate: '0',
    userDeposits: '0',
    isLoading: true,
    error: null
  });

  // Helper function for safe U64 parsing
  const safeParseU64 = (result: any, fallbackValue: string = '0'): string => {
    try {
      if (!result || !result.value || result.value.length === 0) {
        return fallbackValue;
      }
      return new massa.Args(result.value).nextU64().toString();
    } catch (error) {
      console.warn('Failed to parse U64 in useLending, using fallback:', error);
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
        console.warn(`Lending contract call attempt ${attempt} failed, retrying...`, error);
        // Progressive delay with longer waits
        await new Promise(resolve => setTimeout(resolve, Math.min(2000 * attempt, 10000)));
      }
    }
  };

  const refreshData = useCallback(async () => {
    if (!contracts.lendingPool || !provider) {
      setData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      setData(prev => ({ ...prev, isLoading: true, error: null }));

      const [
        totalDepositsResult,
        totalBorrowsResult,
        interestRateResult,
        utilizationResult,
        userDepositsResult
      ] = await Promise.all([
        retryContractCall(() => contracts.lendingPool.read('getTotalDeposits')),
        retryContractCall(() => contracts.lendingPool.read('getTotalBorrows')),
        retryContractCall(() => contracts.lendingPool.read('getCurrentInterestRate')),
        retryContractCall(() => contracts.lendingPool.read('getUtilizationRate')),
        retryContractCall(() => contracts.lendingPool.read('getUserDeposits', new massa.Args().addString(provider.address).serialize()))
      ]);

      const totalDeposits = safeParseU64(totalDepositsResult);
      const totalBorrows = safeParseU64(totalBorrowsResult);
      const interestRate = safeParseU64(interestRateResult);
      const utilization = safeParseU64(utilizationResult);
      const userDeposits = safeParseU64(userDepositsResult);

      setData({
        totalDeposits: totalDeposits,
        totalBorrows: totalBorrows,
        currentInterestRate: interestRate,
        utilizationRate: utilization,
        userDeposits: userDeposits,
        isLoading: false,
        error: null
      });

    } catch (error) {
      console.error('Failed to fetch lending data:', error);
      setData(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to fetch lending data'
      }));
    }
  }, [contracts.lendingPool, provider]);

  useEffect(() => {
    refreshData();
    
    const interval = setInterval(refreshData, REFRESH_INTERVALS.NORMAL);
    return () => clearInterval(interval);
  }, [refreshData]);

  const deposit = useCallback(async (amount: string): Promise<void> => {
    if (!contracts.lendingPool) throw new Error('Lending pool contract not available');

    const coins = massa.Mas.fromString(amount);
    
    const operation = await contracts.lendingPool.call(
      'deposit',
      new Uint8Array(0),
      { coins }
    );

    // 立即刷新数据，不等待最终确认
    refreshData();
    
    // 在后台等待最终确认，然后再次刷新
    operation.waitFinalExecution().then(() => {
      setTimeout(() => refreshData(), 1000);
    }).catch(() => {
      // 如果失败，也要刷新数据以反映真实状态
      setTimeout(() => refreshData(), 2000);
    });
  }, [contracts.lendingPool, refreshData]);

  const withdraw = useCallback(async (amount: string): Promise<void> => {
    if (!contracts.lendingPool) throw new Error('Lending pool contract not available');

    const withdrawAmount = BigInt(Math.floor(parseFloat(amount) * 1_000_000_000));
    
    const operation = await contracts.lendingPool.call(
      'withdraw',
      new massa.Args().addU64(withdrawAmount).serialize()
    );

    // 立即刷新数据，不等待最终确认
    refreshData();
    
    // 在后台等待最终确认，然后再次刷新
    operation.waitFinalExecution().then(() => {
      setTimeout(() => refreshData(), 1000);
    }).catch(() => {
      // 如果失败，也要刷新数据以反映真实状态
      setTimeout(() => refreshData(), 2000);
    });
  }, [contracts.lendingPool, refreshData]);

  return {
    ...data,
    refreshData,
    deposit,
    withdraw
  };
}