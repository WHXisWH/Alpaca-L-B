import React, { useState } from 'react';
import { formatMAS, getErrorMessage, validateAmount } from '../utils/massa';
import { TRANSACTION_STATES } from '../utils/constants';

interface LendingInterfaceProps {
  lending: any;
  onSuccess: () => void;
}

export default function LendingInterface({ lending, onSuccess }: LendingInterfaceProps) {
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [transactionState, setTransactionState] = useState(TRANSACTION_STATES.IDLE);
  const [error, setError] = useState('');

  const handleDeposit = async () => {
    if (!validateAmount(depositAmount)) {
      setError('Please enter a valid amount');
      return;
    }

    setTransactionState(TRANSACTION_STATES.PENDING);
    setError('');

    try {
      await lending.deposit(depositAmount);
      setTransactionState(TRANSACTION_STATES.SUCCESS);
      setDepositAmount('');
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

  const handleWithdraw = async () => {
    if (!validateAmount(withdrawAmount)) {
      setError('Please enter a valid amount');
      return;
    }

    const maxWithdraw = Number(formatMAS(lending.userDeposits));
    if (parseFloat(withdrawAmount) > maxWithdraw) {
      setError(`Insufficient balance. Maximum: ${maxWithdraw} MAS`);
      return;
    }

    setTransactionState(TRANSACTION_STATES.PENDING);
    setError('');

    try {
      await lending.withdraw(withdrawAmount);
      setTransactionState(TRANSACTION_STATES.SUCCESS);
      setWithdrawAmount('');
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

  const setMaxWithdraw = () => {
    const maxAmount = formatMAS(lending.userDeposits);
    setWithdrawAmount(maxAmount);
  };

  const isTransacting = transactionState === TRANSACTION_STATES.PENDING;
  const userBalance = formatMAS(lending.userDeposits);

  return (
    <div className="card-grid alpaca-grassland">
      <div className="stat-card grass-planting">
        <div className="section-title">🌱 Plant Grass in the Pasture</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Grow lush grass to feed the alpacas! Your grass provides nourishment for alpacas and earns you rewards as they graze.
        </p>

        {error && <div className="error-message">{error}</div>}
        
        {transactionState === TRANSACTION_STATES.SUCCESS && (
          <div className="success-message">
            🌱 Great! Your grass seeds have been planted and are already sprouting!
          </div>
        )}

        <div className="input-group">
          <label>Grass Seeds (MAS)</label>
          <input
            type="number"
            min="0"
            step="0.000001"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="How much grass do you want to plant?"
            disabled={isTransacting}
          />
          <div className="input-hint">
            🌾 Minimum planting: 1 MAS worth of seeds
          </div>
        </div>

        <button
          className="btn btn-primary grass-btn"
          onClick={handleDeposit}
          disabled={isTransacting || !depositAmount || lending.isLoading}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              🌱 Planting seeds...
            </>
          ) : (
            <>🌱 Plant Grass <span className="traditional">(Deposit)</span></>
          )}
        </button>
      </div>

      <div className="stat-card grass-harvesting">
        <div className="section-title">🌾 Harvest Your Grass</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Harvest your grown grass plus the rewards from happy alpacas. Your harvest depends on how much grass is available in the pasture.
        </p>

        <div className="input-group">
          <label>
            Harvest Amount (MAS)
            <button
              className="btn btn-small btn-secondary"
              onClick={setMaxWithdraw}
              disabled={isTransacting}
              style={{ marginLeft: '10px', padding: '4px 8px' }}
            >
              ALL
            </button>
          </label>
          <input
            type="number"
            min="0"
            step="0.000001"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="How much grass to harvest?"
            disabled={isTransacting}
          />
          <div className="input-hint">
            🌱 Your grass field: {userBalance} MAS
          </div>
        </div>

        <button
          className="btn btn-secondary harvest-btn"
          onClick={handleWithdraw}
          disabled={isTransacting || !withdrawAmount || lending.isLoading || parseFloat(userBalance) === 0}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              🌾 Harvesting...
            </>
          ) : (
            <>🌾 Harvest Grass <span className="traditional">(Withdraw)</span></>
          )}
        </button>
      </div>

      <div className="stat-card pasture-status">
        <div className="section-title">🌾 Pasture Status</div>
        
        <div className="position-details">
          <div className="detail-item">
            <span className="detail-label">🌱 Total Grass Planted</span>
            <span className="detail-value">{formatMAS(lending.totalDeposits)} MAS</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">🦙 Grass Being Grazed</span>
            <span className="detail-value">{formatMAS(lending.totalBorrows)} MAS</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">📈 Grazing Activity</span>
            <span className="detail-value">{(Number(lending.utilizationRate) / 100).toFixed(2)}%</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">🌿 Grass Growth Rate</span>
            <span className="detail-value">{(Number(lending.currentInterestRate) / 100).toFixed(2)}%</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">🌾 Your Grass Field</span>
            <span className="detail-value">{userBalance} MAS</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">🟢 Fresh Grass Available</span>
            <span className="detail-value">
              {formatMAS((BigInt(lending.totalDeposits) - BigInt(lending.totalBorrows)).toString())} MAS
            </span>
          </div>
        </div>

        <div style={{ marginTop: '20px', padding: '15px', background: 'var(--surface-light)', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '10px', color: 'var(--primary)' }}>🦙 How the Alpaca Pasture Works:</h4>
          <ul style={{ fontSize: '14px', color: 'var(--text-secondary)', paddingLeft: '20px' }}>
            <li>🌱 Plant grass seeds (MAS) to create lush pastures</li>
            <li>🦙 Happy alpacas graze your grass and pay you rewards</li>
            <li>📈 More grazing activity = higher grass growth rates</li>
            <li>🛡️ Your grass is protected by alpaca collateral (RWA NFTs)</li>
            <li>🤖 Autonomous shepherds ensure safe grazing</li>
          </ul>
        </div>
      </div>
    </div>
  );
}