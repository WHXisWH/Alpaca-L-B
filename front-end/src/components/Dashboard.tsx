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
        <div className="pasture-overview">
          <div className="pasture-header">
            <h2>Lending Protocol Dashboard</h2>
            <p>Decentralized lending and borrowing powered by Massa's Autonomous Smart Contracts.</p>
          </div>
          
          <div className="stats-grid-simplified" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <div className="stat-card alpaca-pasture">
              <img src="/icon-supply.webp" alt="Total Supply" className="dashboard-card-icon" />
              <div className="stat-content">
                <div className="stat-label">Total Supply</div>
                <div className="stat-value">{formatMAS(lending.totalDeposits)} MAS</div>
                <div className="stat-sublabel">
                  {formatMAS(BigInt(lending.totalDeposits) - BigInt(lending.totalBorrows))} MAS available
                </div>
              </div>
            </div>
            
            <div className="stat-card alpaca-herd">
              <img src="/icon-borrow.webp" alt="Total Borrows" className="dashboard-card-icon" />
              <div className="stat-content">
                <div className="stat-label">Total Borrows</div>
                <div className="stat-value">{formatMAS(lending.totalBorrows)} MAS</div>
                <div className="stat-sublabel">
                  {positions.userPositions.length} active loans
                </div>
              </div>
            </div>
            
            <div className="stat-card grazing-efficiency">
              <img src="/icon-utilization.webp" alt="Utilization Rate" className="dashboard-card-icon" />
              <div className="stat-content">
                <div className="stat-label">Utilization Rate</div>
                <div className="stat-value">{formatPercentage(Number(lending.utilizationRate))}</div>
                <div className="stat-sublabel">
                  {formatPercentage(Number(lending.currentInterestRate))} APY
                </div>
              </div>
            </div>
            
            <div className="stat-card your-herd">
              <img src="/icon-deposit.webp" alt="Your Deposits" className="dashboard-card-icon" />
              <div className="stat-content">
                <div className="stat-label">Your Deposits</div>
                <div className="stat-value">{formatMAS(lending.userDeposits)} MAS</div>
                <div className="stat-sublabel">
                  Earning interest
                </div>
              </div>
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
              className={`tab ${activeTab === TABS.BORROW ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.BORROW)}
            >
              Borrow
            </button>
            <button 
              className={`tab ${activeTab === TABS.POSITIONS ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.POSITIONS)}
            >
              Collateral
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

        <RiskMonitor provider={provider} addresses={addresses} />
      </div>
    </div>
  );
}