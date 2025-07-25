import { PRECISION } from './constants';

export async function loadAddresses(): Promise<Record<string, string>> {
  const envAddresses = {
    collateralVault: (import.meta as any).env?.VITE_COLLATERAL_VAULT_ADDRESS || '',
    lendingPool: (import.meta as any).env?.VITE_LENDING_POOL_ADDRESS || '',
    riskManager: (import.meta as any).env?.VITE_RISK_MANAGER_ADDRESS || '',
    liquidationEngine: (import.meta as any).env?.VITE_LIQUIDATION_ENGINE_ADDRESS || '',
    oracle: (import.meta as any).env?.VITE_ORACLE_ADDRESS || '',
    governance: (import.meta as any).env?.VITE_GOVERNANCE_ADDRESS || '',
    mockNFT: (import.meta as any).env?.VITE_MOCK_NFT_ADDRESS || ''
  };

  const hasEnvAddresses = Object.values(envAddresses).some(addr => addr !== '');
  if (hasEnvAddresses) {
    console.log('Loading addresses from environment variables');
    return envAddresses;
  }

  try {
    const response = await fetch('/addresses.json');
    if (!response.ok) {
      console.warn('addresses.json not found, using empty addresses');
      return envAddresses;
    }
    const fileAddresses = await response.json();
    console.log('Loading addresses from addresses.json');
    return fileAddresses;
  } catch (error) {
    console.error('Failed to load addresses:', error);
    return envAddresses;
  }
}

export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatAmount(amount: bigint | string, decimals: number = 9): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount;
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  
  if (remainder === 0n) {
    return whole.toString();
  }
  
  const decimal = remainder.toString().padStart(decimals, '0');
  const trimmed = decimal.replace(/0+$/, '');
  
  return `${whole}.${trimmed}`;
}

export function parseAmount(amount: string, decimals: number = 9): bigint {
  const [whole, decimal = ''] = amount.split('.');
  const paddedDecimal = decimal.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedDecimal);
}

export function formatMAS(amount: bigint | string): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount;
  return formatAmount(value, 9);
}

export function formatPercentage(value: number, decimals: number = 2): string {
  return `${(value / 100).toFixed(decimals)}%`;
}

export function formatBasisPoints(value: bigint | number): string {
  const num = typeof value === 'bigint' ? Number(value) : value;
  return formatPercentage(num, 2);
}

export function calculateLTV(borrowAmount: bigint, collateralValue: bigint): number {
  if (collateralValue === 0n) return 0;
  return Number((borrowAmount * 10000n) / collateralValue) / 100;
}

export function calculateUtilization(totalBorrows: bigint, totalDeposits: bigint): number {
  if (totalDeposits === 0n) return 0;
  return Number((totalBorrows * 10000n) / totalDeposits) / 100;
}

export function calculateAPY(rate: bigint): number {
  return Number(rate) / 100;
}

export function getRiskLevel(ltv: number) {
  if (ltv < 60) return { level: 'low', color: '#00ff88', label: 'Low Risk' };
  if (ltv < 80) return { level: 'medium', color: '#ffaa00', label: 'Medium Risk' };
  return { level: 'high', color: '#ff4444', label: 'High Risk' };
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

export function shortenHash(hash: string, length: number = 8): string {
  if (!hash || hash.length <= length * 2) return hash;
  return `${hash.slice(0, length)}...${hash.slice(-length)}`;
}

export function validateAddress(address: string): boolean {
  return address.startsWith('AS') && address.length === 52;
}

export function validateAmount(amount: string): boolean {
  if (!amount || amount === '') return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
}

export function getErrorMessage(error: any): string {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.error?.message) return error.error.message;
  return 'An unknown error occurred';
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}