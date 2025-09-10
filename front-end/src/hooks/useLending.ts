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
        contracts.lendingPool.read('getTotalDeposits'),
        contracts.lendingPool.read('getTotalBorrows'),
        contracts.lendingPool.read('getCurrentInterestRate'),
        contracts.lendingPool.read('getUtilizationRate'),
        contracts.lendingPool.read('getUserDeposits', new massa.Args().addString(provider.address).serialize())
      ]);

      const totalDeposits = new massa.Args(totalDepositsResult.value).nextU64();
      const totalBorrows = new massa.Args(totalBorrowsResult.value).nextU64();
      const interestRate = new massa.Args(interestRateResult.value).nextU64();
      const utilization = new massa.Args(utilizationResult.value).nextU64();
      const userDeposits = new massa.Args(userDepositsResult.value).nextU64();

      setData({
        totalDeposits: totalDeposits.toString(),
        totalBorrows: totalBorrows.toString(),
        currentInterestRate: interestRate.toString(),
        utilizationRate: utilization.toString(),
        userDeposits: userDeposits.toString(),
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