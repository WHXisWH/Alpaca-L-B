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
    <div className="card-grid">
      <div className="stat-card">
        <div className="section-title">💰 Deposit MAS</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Earn interest by providing liquidity to the lending pool. Your deposits help fund loans backed by RWA collateral.
        </p>

        {error && <div className="error-message">{error}</div>}
        
        {transactionState === TRANSACTION_STATES.SUCCESS && (
          <div className="success-message">
            ✅ Transaction successful! Your deposit has been processed.
          </div>
        )}

        <div className="input-group">
          <label>Amount (MAS)</label>
          <input
            type="number"
            min="0"
            step="0.000001"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="Enter amount to deposit"
            disabled={isTransacting}
          />
          <div className="input-hint">
            Minimum deposit: 1 MAS
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleDeposit}
          disabled={isTransacting || !depositAmount || lending.isLoading}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              Processing...
            </>
          ) : (
            'Deposit'
          )}
        </button>
      </div>

      <div className="stat-card">
        <div className="section-title">💸 Withdraw MAS</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Withdraw your deposited MAS plus accrued interest. Withdrawals are subject to available liquidity.
        </p>

        <div className="input-group">
          <label>
            Amount (MAS)
            <button
              className="btn btn-small btn-secondary"
              onClick={setMaxWithdraw}
              disabled={isTransacting}
              style={{ marginLeft: '10px', padding: '4px 8px' }}
            >
              MAX
            </button>
          </label>
          <input
            type="number"
            min="0"
            step="0.000001"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="Enter amount to withdraw"
            disabled={isTransacting}
          />
          <div className="input-hint">
            Available: {userBalance} MAS
          </div>
        </div>

        <button
          className="btn btn-secondary"
          onClick={handleWithdraw}
          disabled={isTransacting || !withdrawAmount || lending.isLoading || parseFloat(userBalance) === 0}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              Processing...
            </>
          ) : (
            'Withdraw'
          )}
        </button>
      </div>

      <div className="stat-card">
        <div className="section-title">📊 Pool Information</div>
        
        <div className="position-details">
          <div className="detail-item">
            <span className="detail-label">Total Deposits</span>
            <span className="detail-value">{formatMAS(lending.totalDeposits)} MAS</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Total Borrows</span>
            <span className="detail-value">{formatMAS(lending.totalBorrows)} MAS</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Utilization</span>
            <span className="detail-value">{(Number(lending.utilizationRate) / 100).toFixed(2)}%</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Current APY</span>
            <span className="detail-value">{(Number(lending.currentInterestRate) / 100).toFixed(2)}%</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Your Deposits</span>
            <span className="detail-value">{userBalance} MAS</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Available Liquidity</span>
            <span className="detail-value">
              {formatMAS((BigInt(lending.totalDeposits) - BigInt(lending.totalBorrows)).toString())} MAS
            </span>
          </div>
        </div>

        <div style={{ marginTop: '20px', padding: '15px', background: 'var(--surface-light)', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '10px', color: 'var(--primary)' }}>How it works:</h4>
          <ul style={{ fontSize: '14px', color: 'var(--text-secondary)', paddingLeft: '20px' }}>
            <li>Deposit MAS to earn interest from borrowers</li>
            <li>Interest rates adjust automatically based on utilization</li>
            <li>Funds are secured by RWA NFT collateral</li>
            <li>Autonomous liquidations protect your deposits</li>
          </ul>
        </div>
      </div>
    </div>
  );
}