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
    <div className="card-grid">
      <div className="stat-card">
        <div className="section-title">📈 Borrow Against Collateral</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Borrow MAS by depositing RWA NFT collateral. Loan-to-value ratios are calculated based on PD/LGD risk models.
        </p>

        {error && <div className="error-message">{error}</div>}
        
        {transactionState === TRANSACTION_STATES.SUCCESS && (
          <div className="success-message">
            ✅ Transaction successful!
          </div>
        )}

        <div className="input-group">
          <label>Select Collateral NFT</label>
          <select
            value={selectedCollateral}
            onChange={(e) => setSelectedCollateral(e.target.value)}
            disabled={isTransacting}
          >
            <option value="">Choose collateral...</option>
            {positions.userCollaterals.map((collateral: any) => (
              <option key={collateral.id} value={collateral.id}>
                NFT #{collateral.id} - {formatMAS(collateral.value)} MAS value
              </option>
            ))}
          </select>
        </div>

        {selectedCollateralData && (
          <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--surface-light)', borderRadius: '8px' }}>
            <div className="position-details">
              <div className="detail-item">
                <span className="detail-label">Collateral Value</span>
                <span className="detail-value">{formatMAS(selectedCollateralData.value)} MAS</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">PD (Probability of Default)</span>
                <span className="detail-value">{(Number(selectedCollateralData.pd) / 100).toFixed(2)}%</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">LGD (Loss Given Default)</span>
                <span className="detail-value">{(Number(selectedCollateralData.lgd) / 100).toFixed(2)}%</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Max Borrow</span>
                <span className="detail-value">{maxBorrowAmount.toFixed(6)} MAS</span>
              </div>
            </div>
          </div>
        )}

        <div className="input-group">
          <label>Borrow Amount (MAS)</label>
          <input
            type="number"
            min="0"
            step="0.000001"
            value={borrowAmount}
            onChange={(e) => setBorrowAmount(e.target.value)}
            placeholder="Enter amount to borrow"
            disabled={isTransacting || !selectedCollateral}
          />
          <div className="input-hint">
            {selectedCollateralData ? `Maximum: ${maxBorrowAmount.toFixed(6)} MAS` : 'Select collateral first'}
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleBorrow}
          disabled={isTransacting || !selectedCollateral || !borrowAmount}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              Processing...
            </>
          ) : (
            'Borrow'
          )}
        </button>
      </div>

      <div className="stat-card">
        <div className="section-title">💸 Repay Loan</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Repay your active loans to unlock collateral. Include accrued interest in your repayment.
        </p>

        <div className="input-group">
          <label>Select Position to Repay</label>
          <select
            value={repayPositionId}
            onChange={(e) => setRepayPositionId(e.target.value)}
            disabled={isTransacting}
          >
            <option value="">Choose position...</option>
            {positions.userPositions.filter((p: any) => p.isActive).map((position: any) => (
              <option key={position.id} value={position.id}>
                Position #{position.id} - NFT #{position.tokenId} ({formatMAS(position.borrowedAmount)} MAS)
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
                    <span className="detail-label">Principal</span>
                    <span className="detail-value">{formatMAS(position.borrowedAmount)} MAS</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Accrued Interest</span>
                    <span className="detail-value">{formatMAS(position.accruedInterest)} MAS</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Total Debt</span>
                    <span className="detail-value">{totalDebt.toFixed(6)} MAS</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Last Update</span>
                    <span className="detail-value">{formatTimestamp(position.lastUpdate)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div className="input-group">
          <label>
            Repay Amount (MAS)
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
                FULL
              </button>
            )}
          </label>
          <input
            type="number"
            min="0"
            step="0.000001"
            value={repayAmount}
            onChange={(e) => setRepayAmount(e.target.value)}
            placeholder="Enter amount to repay"
            disabled={isTransacting || !repayPositionId}
          />
        </div>

        <button
          className="btn btn-warning"
          onClick={handleRepay}
          disabled={isTransacting || !repayPositionId || !repayAmount}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              Processing...
            </>
          ) : (
            'Repay'
          )}
        </button>
      </div>

      <div className="stat-card">
        <div className="section-title">📋 Active Positions</div>
        
        {positions.userPositions.length === 0 ? (
          <div className="empty-state">
            <h3>No Active Positions</h3>
            <p>You don't have any active borrow positions yet.</p>
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {positions.userPositions.map((position: any) => {
              const totalDebt = Number(formatMAS(position.borrowedAmount)) + Number(formatMAS(position.accruedInterest));
              const collateral = positions.userCollaterals.find((c: any) => c.id === position.tokenId);
              const ltv = collateral ? (Number(formatMAS(position.borrowedAmount)) / Number(formatMAS(collateral.value))) * 100 : 0;
              const riskLevel = getRiskLevel(ltv);
              
              return (
                <div key={position.id} className="position-card" style={{ marginBottom: '15px' }}>
                  <div className="position-header">
                    <span className="position-id">Position #{position.id}</span>
                    <span className={`position-status ${position.isActive ? 'status-active' : 'status-inactive'}`}>
                      {position.isActive ? 'Active' : 'Closed'}
                    </span>
                  </div>
                  
                  <div className="position-details">
                    <div className="detail-item">
                      <span className="detail-label">Collateral NFT</span>
                      <span className="detail-value">#{position.tokenId}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Borrowed</span>
                      <span className="detail-value">{formatMAS(position.borrowedAmount)} MAS</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Interest</span>
                      <span className="detail-value">{formatMAS(position.accruedInterest)} MAS</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Total Debt</span>
                      <span className="detail-value">{totalDebt.toFixed(6)} MAS</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">LTV</span>
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