import React, { useState, useMemo } from 'react';
import LendingInterface from './LendingInterface';
import BorrowRepayInterface from './BorrowRepayInterface'; // Import the new component
import RiskMonitor from './RiskMonitor';
import LiquidationPanel from './LiquidationPanel';
import { useLending } from '../hooks/useLending';
import { usePositions } from '../hooks/usePositions';
import { formatMAS, formatPercentage, getRiskLevel } from '../utils/massa';
import { TABS } from '../utils/constants';

interface DashboardProps {
  provider: any;
  addresses: Record<string, string>;
  onBalanceChange: () => void;
}

export default function Dashboard({ provider, addresses, onBalanceChange }: DashboardProps) {
  const [activeTab, setActiveTab] = useState(TABS.BORROW_REPAY); // Default to new tab
  
  const lending = useLending(provider, addresses);
  const positions = usePositions(provider, addresses);

  const handleSuccess = () => {
    lending.refreshData();
    positions.refreshData();
    onBalanceChange();
  };

  const userSummary = useMemo(() => {
    const totalUserBorrows = positions.userPositions
      .filter(p => p.isActive)
      .reduce((sum, p) => sum + Number(formatMAS(p.borrowedAmount)) + Number(formatMAS(p.accruedInterest)), 0);

    const totalCollateralValue = positions.userCollaterals
      .reduce((sum, c) => sum + Number(formatMAS(c.value)), 0);

    const overallLtv = totalCollateralValue > 0 ? (totalUserBorrows / totalCollateralValue) * 100 : 0;
    const riskLevel = getRiskLevel(overallLtv);

    return { totalUserBorrows, totalCollateralValue, overallLtv, riskLevel };
  }, [positions]);

  const renderTabContent = () => {
    switch (activeTab) {
      case TABS.LEND:
        return <LendingInterface lending={lending} onSuccess={handleSuccess} />;
      case TABS.BORROW_REPAY: // New case for the combined interface
        return <BorrowRepayInterface positions={positions} provider={provider} addresses={addresses} onSuccess={handleSuccess} />;
      case TABS.LIQUIDATIONS:
        return <LiquidationPanel provider={provider} addresses={addresses} />;
      default:
        return <BorrowRepayInterface positions={positions} provider={provider} addresses={addresses} onSuccess={handleSuccess} />;
    }
  };

  return (
    <div className="dashboard">
      <div className="container">
        <div className="section user-summary">
            <h3 className="section-title">Protocol Stats</h3>
            <div className="stats-grid-simplified" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                <div className="stat-card">
                  <img src="/icon-supply.webp" alt="Total Supply" className="dashboard-card-icon" />
                  <div className="stat-label">Total Supply</div>
                  <div className="stat-value">{formatMAS(lending.totalDeposits)} MAS</div>
                </div>
                <div className="stat-card">
                  <img src="/icon-borrow.webp" alt="Total Borrows" className="dashboard-card-icon" />
                  <div className="stat-label">Total Borrows</div>
                  <div className="stat-value">{formatMAS(lending.totalBorrows)} MAS</div>
                </div>
                <div className="stat-card">
                  <img src="/icon-utilization.webp" alt="Utilization" className="dashboard-card-icon" />
                  <div className="stat-label">Utilization</div>
                  <div className="stat-value">{formatPercentage(Number(lending.utilizationRate))}</div>
                </div>
                <div className="stat-card">
                  <img src="/icon-asc.webp" alt="Current APY" className="dashboard-card-icon" />
                  <div className="stat-label">Current APY</div>
                  <div className="stat-value">{formatPercentage(Number(lending.currentInterestRate))}</div>
                </div>
            </div>

            <h3 className="section-title" style={{marginTop: '24px'}}>My Position</h3>
            <div className="stats-grid-simplified">
                <div className="stat-card">
                    <img src="/icon-deposit.webp" alt="My Deposits" className="dashboard-card-icon" />
                    <div className="stat-label">My Deposits</div>
                    <div className="stat-value">{formatMAS(lending.userDeposits)} MAS</div>
                </div>
                <div className="stat-card">
                    <img src="/icon-borrow.webp" alt="My Borrows" className="dashboard-card-icon" />
                    <div className="stat-label">My Borrows</div>
                    <div className="stat-value">{userSummary.totalUserBorrows.toFixed(2)} MAS</div>
                </div>
                <div className="stat-card">
                    <img src="/icon-rwa.webp" alt="My Collateral" className="dashboard-card-icon" />
                    <div className="stat-label">My Collateral</div>
                    <div className="stat-value">{userSummary.totalCollateralValue.toFixed(2)} MAS</div>
                </div>
                <div className="stat-card">
                    <img src="/icon-risk.webp" alt="Health Factor" className="dashboard-card-icon" />
                    <div className="stat-label">Health Factor</div>
                    <div className={`stat-value risk-${userSummary.riskLevel.level}`}>{userSummary.overallLtv.toFixed(2)}%</div>
                </div>
            </div>
        </div>

        <div className="section">
          <div className="section-tabs">
            <button 
              className={`tab ${activeTab === TABS.LEND ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.LEND)}
            >
              Lend
            </button>
            <button 
              className={`tab ${activeTab === TABS.BORROW_REPAY ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.BORROW_REPAY)}
            >
              Borrow & Repay
            </button>
            <button 
              className={`tab ${activeTab === TABS.LIQUIDATIONS ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.LIQUIDATIONS)}
            >
              Liquidations
            </button>
          </div>

          {renderTabContent()}
        </div>

        {/* NFT Price Monitor (uses ASC updates via Vault). Picks first collateral if any. */}
        <div className="section">
          <div className="section-title">Price Monitor</div>
          <RiskMonitor 
            provider={provider} 
            addresses={addresses} 
            tokenId={positions.userCollaterals && positions.userCollaterals.length > 0 ? positions.userCollaterals[0].id : undefined}
          />
        </div>
      </div>
    </div>
  );
}
