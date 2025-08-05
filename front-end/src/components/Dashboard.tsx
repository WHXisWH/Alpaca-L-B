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
            <h2>🌾 Welcome to the Alpaca Pasture</h2>
            <p>Where grass grows green and alpacas roam free in the world of decentralized finance</p>
          </div>
          
          <div className="stats-grid-simplified">
            <div className="stat-card alpaca-pasture">
              <div className="stat-icon">🌾</div>
              <div className="stat-content">
                <div className="stat-label">The Pasture</div>
                <div className="stat-value">{formatMAS(lending.totalDeposits)} MAS</div>
                <div className="stat-sublabel">
                  {formatMAS(BigInt(lending.totalDeposits) - BigInt(lending.totalBorrows))} MAS available grass
                </div>
              </div>
            </div>
            
            <div className="stat-card alpaca-herd">
              <div className="stat-icon">🦙</div>
              <div className="stat-content">
                <div className="stat-label">Active Alpacas</div>
                <div className="stat-value">{formatMAS(lending.totalBorrows)} MAS</div>
                <div className="stat-sublabel">
                  {positions.userPositions.length} alpacas in your care
                </div>
              </div>
            </div>
            
            <div className="stat-card grazing-efficiency">
              <div className="stat-icon">📈</div>
              <div className="stat-content">
                <div className="stat-label">Grazing Efficiency</div>
                <div className="stat-value">{formatPercentage(Number(lending.utilizationRate))}</div>
                <div className="stat-sublabel">
                  {formatPercentage(Number(lending.currentInterestRate))} grass growth rate
                </div>
              </div>
            </div>
            
            <div className="stat-card your-herd">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <div className="stat-label">Your Contribution</div>
                <div className="stat-value">{formatMAS(lending.userDeposits)} MAS</div>
                <div className="stat-sublabel">
                  Growing grass, earning rewards
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-tabs alpaca-themed">
            <button 
              className={`tab alpaca-tab ${activeTab === TABS.LEND ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.LEND)}
            >
              🌱 Plant Grass <span className="traditional">(Lend)</span>
            </button>
            <button 
              className={`tab alpaca-tab ${activeTab === TABS.BORROW ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.BORROW)}
            >
              🦙 Lead Alpacas <span className="traditional">(Borrow)</span>
            </button>
            <button 
              className={`tab alpaca-tab ${activeTab === TABS.POSITIONS ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.POSITIONS)}
            >
              🐑 Your Herd <span className="traditional">(Collateral)</span>
            </button>
            <button 
              className={`tab alpaca-tab ${activeTab === TABS.LIQUIDATIONS ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.LIQUIDATIONS)}
            >
              🤠 Roundup <span className="traditional">(Liquidations)</span>
            </button>
          </div>

          {renderTabContent()}
        </div>

        <RiskMonitor provider={provider} addresses={addresses} />
      </div>
    </div>
  );
}