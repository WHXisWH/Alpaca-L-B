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
      toast.success('Deposit successful!');
      setDepositAmount('');
      onSuccess();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
    setTransactionState(TRANSACTION_STATES.IDLE);
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

  const isTransacting = transactionState === TRANSACTION_STATES.PENDING;

  return (
    <div className="card-grid">
      <div className="stat-card">
        <div className="section-title">💰 Supply MAS</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Supply MAS tokens to the lending pool to earn interest from borrowers.
        </p>

        {error && <div className="error-message">{error}</div>}

        <div className="input-group">
          <label>Amount to Supply</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="Enter MAS amount to supply"
            disabled={isTransacting}
          />
          <div className="input-hint">
            Minimum supply: 1 MAS
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleDeposit}
          disabled={isTransacting || !depositAmount}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              Supplying...
            </>
          ) : (
            'Supply MAS'
          )}
        </button>
      </div>

      <div className="stat-card">
        <div className="section-title">💸 Withdraw MAS</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Withdraw your supplied MAS tokens plus earned interest from the lending pool.
        </p>

        <div className="input-group">
          <label>Amount to Withdraw</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="Enter MAS amount to withdraw"
            disabled={isTransacting}
          />
          <div className="input-hint">
            Available balance: {lending?.userDeposits ? formatMAS(lending.userDeposits) : '0'} MAS
          </div>
        </div>

        <button
          className="btn btn-secondary"
          onClick={handleWithdraw}
          disabled={isTransacting || !withdrawAmount}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              Withdrawing...
            </>
          ) : (
            'Withdraw MAS'
          )}
        </button>
      </div>
    </div>
  );
}