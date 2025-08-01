import React, { useState } from 'react';
import LendingInterface from './LendingInterface';
import BorrowingInterface from './BorrowingInterface';
import CollateralManager from './CollateralManager';
import RiskMonitor from './RiskMonitor';
import LiquidationPanel from './LiquidationPanel';
import { useLending } from '../hooks/useLending';
import { usePositions } from '../hooks/usePositions';
import { formatMAS, formatPercentage } from '../utils/massa';
import { TABS } from '../utils/constants';

interface DashboardProps {
  provider: any;
  addresses: Record<string, string>;
  onBalanceChange: () => void;
}

export default function Dashboard({ provider, addresses, onBalanceChange }: DashboardProps) {
  const [activeTab, setActiveTab] = useState(TABS.LEND);
  
  const lending = useLending(provider, addresses);
  const positions = usePositions(provider, addresses);

  const handleSuccess = () => {
    lending.refreshData();
    positions.refreshData();
    onBalanceChange();
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case TABS.LEND:
        return <LendingInterface lending={lending} onSuccess={handleSuccess} />;
      case TABS.BORROW:
        return <BorrowingInterface positions={positions} onSuccess={handleSuccess} />;
      case TABS.POSITIONS:
        return <CollateralManager positions={positions} provider={provider} addresses={addresses}  onSuccess={handleSuccess} />;
      case TABS.LIQUIDATIONS:
        return <LiquidationPanel provider={provider} addresses={addresses} />;
      default:
        return <LendingInterface lending={lending} onSuccess={handleSuccess} />;
    }
  };

  return (
    <div className="dashboard">
      <div className="container">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Value Locked</div>
            <div className="stat-value">{formatMAS(lending.totalDeposits)} MAS</div>
            <div className="stat-change positive">
              Available Liquidity
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-label">Total Borrows</div>
            <div className="stat-value">{formatMAS(lending.totalBorrows)} MAS</div>
            <div className="stat-change">
              Active Loans
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-label">Utilization Rate</div>
            <div className="stat-value">{formatPercentage(Number(lending.utilizationRate))}</div>
            <div className="stat-change">
              Capital Efficiency
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-label">Interest Rate</div>
            <div className="stat-value">{formatPercentage(Number(lending.currentInterestRate))}</div>
            <div className="stat-change">
              Current APY
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-label">Your Deposits</div>
            <div className="stat-value">{formatMAS(lending.userDeposits)} MAS</div>
            <div className="stat-change">
              Earning Interest
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-label">Your Positions</div>
            <div className="stat-value">{positions.userPositions.length}</div>
            <div className="stat-change">
              Active Borrows
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-tabs">
            <button 
              className={`tab ${activeTab === TABS.LEND ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.LEND)}
            >
              💰 Lend
            </button>
            <button 
              className={`tab ${activeTab === TABS.BORROW ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.BORROW)}
            >
              📈 Borrow
            </button>
            <button 
              className={`tab ${activeTab === TABS.POSITIONS ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.POSITIONS)}
            >
              🏛️ Collateral
            </button>
            <button 
              className={`tab ${activeTab === TABS.LIQUIDATIONS ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.LIQUIDATIONS)}
            >
              ⚡ Liquidations
            </button>
          </div>

          {renderTabContent()}
        </div>

        <RiskMonitor provider={provider} addresses={addresses} />
      </div>
    </div>
  );
}