import React, { useState } from 'react';
import { formatMAS, getErrorMessage, validateAmount, getRiskLevel, formatTimestamp } from '../utils/massa';
import { TRANSACTION_STATES } from '../utils/constants';

interface BorrowingInterfaceProps {
  positions: any;
  onSuccess: () => void;
}

export default function BorrowingInterface({ positions, onSuccess }: BorrowingInterfaceProps) {
  const [selectedCollateral, setSelectedCollateral] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('');
  const [repayPositionId, setRepayPositionId] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [transactionState, setTransactionState] = useState(TRANSACTION_STATES.IDLE);
  const [error, setError] = useState('');

  const handleBorrow = async () => {
    if (!selectedCollateral) {
      setError('Please select collateral');
      return;
    }
    
    if (!validateAmount(borrowAmount)) {
      setError('Please enter a valid borrow amount');
      return;
    }

    setTransactionState(TRANSACTION_STATES.PENDING);
    setError('');

    try {
      await positions.borrow(parseInt(selectedCollateral), borrowAmount);
      setTransactionState(TRANSACTION_STATES.SUCCESS);
      setSelectedCollateral('');
      setBorrowAmount('');
      onSuccess();
      
      setTimeout(() => {
        setTransactionState(TRANSACTION_STATES.IDLE);
      }, 3000);
    } catch (err) {
      setError(getErrorMessage(err));
      setTransactionState(TRANSACTION_STATES.ERROR);
      
      setTimeout(() => {
        setTransactionState(TRANSACTION_STATES.IDLE);
      }, 5000);
    }
  };

  const handleRepay = async () => {
    if (!repayPositionId) {
      setError('Please select a position to repay');
      return;
    }
    
    if (!validateAmount(repayAmount)) {
      setError('Please enter a valid repay amount');
      return;
    }

    setTransactionState(TRANSACTION_STATES.PENDING);
    setError('');

    try {
      await positions.repay(parseInt(repayPositionId), repayAmount);
      setTransactionState(TRANSACTION_STATES.SUCCESS);
      setRepayPositionId('');
      setRepayAmount('');
      onSuccess();
      
      setTimeout(() => {
        setTransactionState(TRANSACTION_STATES.IDLE);
      }, 3000);
    } catch (err) {
      setError(getErrorMessage(err));
      setTransactionState(TRANSACTION_STATES.ERROR);
      
      setTimeout(() => {
        setTransactionState(TRANSACTION_STATES.IDLE);
      }, 5000);
    }
  };

  const calculateMaxBorrow = (collateral: any) => {
    if (!collateral) return 0;
    const collateralValue = Number(formatMAS(collateral.value));
    const ltv = Number(collateral.pd) <= 100 ? 0.8 : 
               Number(collateral.pd) <= 500 ? 0.75 :
               Number(collateral.pd) <= 1000 ? 0.7 :
               Number(collateral.pd) <= 2000 ? 0.65 : 0.6;
    return collateralValue * ltv;
  };

  const setMaxRepay = (position: any) => {
    const totalDebt = Number(formatMAS(position.borrowedAmount)) + Number(formatMAS(position.accruedInterest));
    setRepayAmount(totalDebt.toString());
  };

  const selectedCollateralData = positions.userCollaterals.find((c: any) => c.id.toString() === selectedCollateral);
  const maxBorrowAmount = selectedCollateralData ? calculateMaxBorrow(selectedCollateralData) : 0;
  const isTransacting = transactionState === TRANSACTION_STATES.PENDING;

  return (
    <div className="card-grid alpaca-borrowing">
      <div className="stat-card alpaca-adoption">
        <div className="section-title">🦙 Lead an Alpaca to Pasture</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Use your trusted alpaca as a guide to lead new alpacas to the pasture. Each alpaca has different grazing capabilities based on their health and temperament.
        </p>

        {error && <div className="error-message">{error}</div>}
        
        {transactionState === TRANSACTION_STATES.SUCCESS && (
          <div className="success-message">
            🦙 Success! Your guide alpaca has led new friends to the pasture!
          </div>
        )}

        <div className="input-group">
          <label>Choose Your Guide Alpaca</label>
          <select
            value={selectedCollateral}
            onChange={(e) => setSelectedCollateral(e.target.value)}
            disabled={isTransacting}
          >
            <option value="">Pick your trusted alpaca...</option>
            {positions.userCollaterals.map((collateral: any) => (
              <option key={collateral.id} value={collateral.id}>
                Alpaca #{collateral.id} - {formatMAS(collateral.value)} MAS grazing power
              </option>
            ))}
          </select>
        </div>

        {selectedCollateralData && (
          <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--surface-light)', borderRadius: '8px' }}>
            <h4 style={{ marginBottom: '15px', color: 'var(--primary)' }}>🦙 Your Selected Alpaca Profile</h4>
            <div className="position-details">
              <div className="detail-item">
                <span className="detail-label">🌟 Grazing Power</span>
                <span className="detail-value">{formatMAS(selectedCollateralData.value)} MAS</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">😴 Sleepiness Level</span>
                <span className="detail-value">{(Number(selectedCollateralData.pd) / 100).toFixed(2)}%</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">🤒 Stubbornness Factor</span>
                <span className="detail-value">{(Number(selectedCollateralData.lgd) / 100).toFixed(2)}%</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">🦙 Max Alpacas to Lead</span>
                <span className="detail-value">{maxBorrowAmount.toFixed(6)} MAS worth</span>
              </div>
            </div>
          </div>
        )}

        <div className="input-group">
          <label>New Alpacas to Lead (MAS worth)</label>
          <input
            type="number"
            min="0"
            step="0.000001"
            value={borrowAmount}
            onChange={(e) => setBorrowAmount(e.target.value)}
            placeholder="How many alpacas to lead to pasture?"
            disabled={isTransacting || !selectedCollateral}
          />
          <div className="input-hint">
            {selectedCollateralData ? `🦙 Your guide can lead up to: ${maxBorrowAmount.toFixed(6)} MAS worth` : 'Choose your guide alpaca first'}
          </div>
        </div>

        <button
          className="btn btn-primary alpaca-lead-btn"
          onClick={handleBorrow}
          disabled={isTransacting || !selectedCollateral || !borrowAmount}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              🦙 Leading alpacas...
            </>
          ) : (
            <>🦙 Lead Alpacas <span className="traditional">(Borrow)</span></>
          )}
        </button>
      </div>

      <div className="stat-card alpaca-care">
        <div className="section-title">🍃 Feed & Care for Alpacas</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Provide food and care for your alpacas to maintain their health. Well-fed alpacas can return to graze freely in the pasture.
        </p>

        <div className="input-group">
          <label>Select Alpaca Group to Care For</label>
          <select
            value={repayPositionId}
            onChange={(e) => setRepayPositionId(e.target.value)}
            disabled={isTransacting}
          >
            <option value="">Choose your alpaca group...</option>
            {positions.userPositions.filter((p: any) => p.isActive).map((position: any) => (
              <option key={position.id} value={position.id}>
                Group #{position.id} - Led by Alpaca #{position.tokenId} ({formatMAS(position.borrowedAmount)} MAS worth)
              </option>
            ))}
          </select>
        </div>

        {repayPositionId && (
          <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--surface-light)', borderRadius: '8px' }}>
            {(() => {
              const position = positions.userPositions.find((p: any) => p.id.toString() === repayPositionId);
              if (!position) return null;
              
              const totalDebt = Number(formatMAS(position.borrowedAmount)) + Number(formatMAS(position.accruedInterest));
              
              return (
                <div className="position-details">
                  <div className="detail-item">
                    <span className="detail-label">🦙 Alpacas Led</span>
                    <span className="detail-value">{formatMAS(position.borrowedAmount)} MAS worth</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">🍃 Care & Feeding Costs</span>
                    <span className="detail-value">{formatMAS(position.accruedInterest)} MAS</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">💰 Total Care Required</span>
                    <span className="detail-value">{totalDebt.toFixed(6)} MAS</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">🕐 Last Care Given</span>
                    <span className="detail-value">{formatTimestamp(position.lastUpdate)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div className="input-group">
          <label>
            Care & Feeding Amount (MAS)
            {repayPositionId && (
              <button
                className="btn btn-small btn-secondary"
                onClick={() => {
                  const position = positions.userPositions.find((p: any) => p.id.toString() === repayPositionId);
                  if (position) setMaxRepay(position);
                }}
                disabled={isTransacting}
                style={{ marginLeft: '10px', padding: '4px 8px' }}
              >
                FULL CARE
              </button>
            )}
          </label>
          <input
            type="number"
            min="0"
            step="0.000001"
            value={repayAmount}
            onChange={(e) => setRepayAmount(e.target.value)}
            placeholder="How much care to provide?"
            disabled={isTransacting || !repayPositionId}
          />
        </div>

        <button
          className="btn btn-warning alpaca-care-btn"
          onClick={handleRepay}
          disabled={isTransacting || !repayPositionId || !repayAmount}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              🍃 Caring for alpacas...
            </>
          ) : (
            <>🍃 Care & Feed <span className="traditional">(Repay)</span></>
          )}
        </button>
      </div>

      <div className="stat-card alpaca-herds">
        <div className="section-title">🦙 Your Alpaca Herds</div>
        
        {positions.userPositions.length === 0 ? (
          <div className="empty-state">
            <h3>🌄 No Active Herds</h3>
            <p>You haven't led any alpacas to the pasture yet. Start by selecting a guide alpaca above!</p>
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {positions.userPositions.map((position: any) => {
              const totalDebt = Number(formatMAS(position.borrowedAmount)) + Number(formatMAS(position.accruedInterest));
              const collateral = positions.userCollaterals.find((c: any) => c.id === position.tokenId);
              const ltv = collateral ? (Number(formatMAS(position.borrowedAmount)) / Number(formatMAS(collateral.value))) * 100 : 0;
              const riskLevel = getRiskLevel(ltv);
              
              return (
                <div key={position.id} className="position-card alpaca-herd-card" style={{ marginBottom: '15px' }}>
                  <div className="position-header">
                    <span className="position-id">🦙 Herd #{position.id}</span>
                    <span className={`position-status ${position.isActive ? 'status-active' : 'status-inactive'}`}>
                      {position.isActive ? '🌟 Grazing' : '😴 Resting'}
                    </span>
                  </div>
                  
                  <div className="position-details">
                    <div className="detail-item">
                      <span className="detail-label">🦙 Guide Alpaca</span>
                      <span className="detail-value">#{position.tokenId}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">🌿 Alpacas Led</span>
                      <span className="detail-value">{formatMAS(position.borrowedAmount)} MAS worth</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">🍃 Care Costs</span>
                      <span className="detail-value">{formatMAS(position.accruedInterest)} MAS</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">💰 Total Care Needed</span>
                      <span className="detail-value">{totalDebt.toFixed(6)} MAS</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">📊 Herd Health</span>
                      <span className="detail-value">
                        <span className={`risk-indicator risk-${riskLevel.level}`}>
                          {ltv.toFixed(1)}%
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}