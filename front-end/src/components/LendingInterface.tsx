import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
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
      toast.success('Withdrawal successful!');
      setWithdrawAmount('');
      onSuccess();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
    setTransactionState(TRANSACTION_STATES.IDLE);
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
        <div className="section-title">Deposit Funds</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Deposit MAS into the lending pool to earn interest.
        </p>

        {error && <div className="error-message">{error}</div>}
        
        {transactionState === TRANSACTION_STATES.SUCCESS && (
          <div className="success-message">
            ✅ Deposit successful!
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
            placeholder="Enter deposit amount"
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
              Depositing...
            </>
          ) : (
            'Deposit'
          )}
        </button>
      </div>

      <div className="stat-card">
        <div className="section-title">Withdraw Funds</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Withdraw your deposited MAS plus accrued interest.
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
            placeholder="Enter withdraw amount"
            disabled={isTransacting}
          />
          <div className="input-hint">
            Your deposits: {userBalance} MAS
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
              Withdrawing...
            </>
          ) : (
            'Withdraw'
          )}
        </button>
      </div>

      <div className="stat-card">
        <div className="section-title">Protocol Stats</div>
        
        <div className="position-details">
          <div className="detail-item">
            <span className="detail-label">Total Supply</span>
            <span className="detail-value">{formatMAS(lending.totalDeposits)} MAS</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Total Borrows</span>
            <span className="detail-value">{formatMAS(lending.totalBorrows)} MAS</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Utilization Rate</span>
            <span className="detail-value">{(Number(lending.utilizationRate) / 100).toFixed(2)}%</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Lending APY</span>
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
          <h4 style={{ marginBottom: '10px', color: 'var(--primary)' }}>How Lending Works:</h4>
          <ul style={{ fontSize: '14px', color: 'var(--text-secondary)', paddingLeft: '20px' }}>
            <li>Deposit MAS to provide liquidity to the protocol.</li>
            <li>Earn interest from borrowers.</li>
            <li>Interest rates are determined by the utilization rate.</li>
            <li>Your deposits are secured by RWA NFT collateral.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}