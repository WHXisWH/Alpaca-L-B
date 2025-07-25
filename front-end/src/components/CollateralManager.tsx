import React, { useState } from 'react';
import { formatMAS, getErrorMessage, validateAmount } from '../utils/massa';
import { TRANSACTION_STATES } from '../utils/constants';

interface CollateralManagerProps {
  positions: any;
  onSuccess: () => void;
}

export default function CollateralManager({ positions, onSuccess }: CollateralManagerProps) {
  const [nftValue, setNftValue] = useState('');
  const [nftPD, setNftPD] = useState('');
  const [nftLGD, setNftLGD] = useState('');
  const [depositTokenId, setDepositTokenId] = useState('');
  const [withdrawTokenId, setWithdrawTokenId] = useState('');
  const [transactionState, setTransactionState] = useState(TRANSACTION_STATES.IDLE);
  const [error, setError] = useState('');
  const [newlyMintedId, setNewlyMintedId] = useState<bigint | null>(null);

  const handleMintNFT = async () => {
    if (!validateAmount(nftValue) || !validateAmount(nftPD) || !validateAmount(nftLGD)) {
      setError('Please enter valid values for all fields');
      return;
    }

    if (Number(nftPD) > 10000 || Number(nftLGD) > 10000) {
      setError('PD and LGD values must be in basis points (0-10000)');
      return;
    }

    setTransactionState(TRANSACTION_STATES.PENDING);
    setError('');
    setNewlyMintedId(null);

    try {
      const valueInNanoMAS = (parseFloat(nftValue) * 1_000_000_000).toString();
      const newId = await positions.mintNFT(valueInNanoMAS, nftPD, nftLGD);
      setNewlyMintedId(newId);
      setTransactionState(TRANSACTION_STATES.SUCCESS);
      setNftValue('');
      setNftPD('');
      setNftLGD('');
      onSuccess();
      
      setTimeout(() => {
        setTransactionState(TRANSACTION_STATES.IDLE);
      }, 5000);
    } catch (err) {
      setError(getErrorMessage(err));
      setTransactionState(TRANSACTION_STATES.ERROR);
      
      setTimeout(() => {
        setTransactionState(TRANSACTION_STATES.IDLE);
      }, 5000);
    }
  };

  const handleDepositNFT = async () => {
    if (!depositTokenId) {
      setError('Please enter a token ID');
      return;
    }

    setTransactionState(TRANSACTION_STATES.PENDING);
    setError('');

    try {
      await positions.depositNFT(parseInt(depositTokenId));
      setTransactionState(TRANSACTION_STATES.SUCCESS);
      setDepositTokenId('');
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

  const handleWithdrawNFT = async () => {
    if (!withdrawTokenId) {
      setError('Please select a token to withdraw');
      return;
    }

    setTransactionState(TRANSACTION_STATES.PENDING);
    setError('');

    try {
      await positions.withdrawNFT(parseInt(withdrawTokenId));
      setTransactionState(TRANSACTION_STATES.SUCCESS);
      setWithdrawTokenId('');
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

  const isTransacting = transactionState === TRANSACTION_STATES.PENDING;

  return (
    <div className="card-grid">
      <div className="stat-card">
        <div className="section-title">🏭 Mint RWA NFT</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Create a new RWA NFT representing enterprise receivables, bills, or other real-world assets.
        </p>

        {error && <div className="error-message">{error}</div>}
        
        {transactionState === TRANSACTION_STATES.SUCCESS && (
          <div className="success-message">
            ✅ Transaction Successful!
            {newlyMintedId !== null && ` Your new NFT ID is: ${newlyMintedId.toString()}`}
          </div>
        )}

        <div className="input-group">
          <label>Asset Value (MAS)</label>
          <input
            type="number"
            min="0"
            step="0.000001"
            value={nftValue}
            onChange={(e) => setNftValue(e.target.value)}
            placeholder="Enter asset value"
            disabled={isTransacting}
          />
          <div className="input-hint">
            The total value of the underlying asset
          </div>
        </div>

        <div className="input-group">
          <label>PD - Probability of Default (basis points)</label>
          <input
            type="number"
            min="0"
            max="10000"
            value={nftPD}
            onChange={(e) => setNftPD(e.target.value)}
            placeholder="Enter PD (0-10000)"
            disabled={isTransacting}
          />
          <div className="input-hint">
            100 = 1%, 500 = 5%, 1000 = 10%
          </div>
        </div>

        <div className="input-group">
          <label>LGD - Loss Given Default (basis points)</label>
          <input
            type="number"
            min="0"
            max="10000"
            value={nftLGD}
            onChange={(e) => setNftLGD(e.target.value)}
            placeholder="Enter LGD (0-10000)"
            disabled={isTransacting}
          />
          <div className="input-hint">
            Expected loss percentage if default occurs
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleMintNFT}
          disabled={isTransacting || !nftValue || !nftPD || !nftLGD}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              Minting...
            </>
          ) : (
            'Mint NFT'
          )}
        </button>
      </div>

      <div className="stat-card">
        <div className="section-title">📥 Deposit Collateral</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Deposit your RWA NFT as collateral to enable borrowing against it.
        </p>

        <div className="input-group">
          <label>Token ID to Deposit</label>
          <input
            type="number"
            min="1"
            value={depositTokenId}
            onChange={(e) => setDepositTokenId(e.target.value)}
            placeholder="Enter NFT token ID"
            disabled={isTransacting}
          />
          <div className="input-hint">
            The ID of the NFT you want to deposit as collateral
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleDepositNFT}
          disabled={isTransacting || !depositTokenId}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              Depositing...
            </>
          ) : (
            'Deposit NFT'
          )}
        </button>
      </div>

      <div className="stat-card">
        <div className="section-title">📤 Withdraw Collateral</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Withdraw your deposited NFT collateral. Only available for NFTs without active loans.
        </p>

        <div className="input-group">
          <label>Select NFT to Withdraw</label>
          <select
            value={withdrawTokenId}
            onChange={(e) => setWithdrawTokenId(e.target.value)}
            disabled={isTransacting}
          >
            <option value="">Choose NFT...</option>
            {positions.userCollaterals.map((collateral: any) => (
              <option key={collateral.id} value={collateral.id}>
                NFT #{collateral.id} - {formatMAS(collateral.value)} MAS
              </option>
            ))}
          </select>
        </div>

        <button
          className="btn btn-secondary"
          onClick={handleWithdrawNFT}
          disabled={isTransacting || !withdrawTokenId}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              Withdrawing...
            </>
          ) : (
            'Withdraw NFT'
          )}
        </button>
      </div>

      <div className="stat-card">
        <div className="section-title">🏛️ Your Collateral Portfolio</div>
        
        {positions.userCollaterals.length === 0 ? (
          <div className="empty-state">
            <h3>No Collateral Assets</h3>
            <p>You haven't deposited any NFT collateral yet.</p>
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {positions.userCollaterals.map((collateral: any) => {
              const pdPercent = Number(collateral.pd) / 100;
              const lgdPercent = Number(collateral.lgd) / 100;
              const riskScore = pdPercent * lgdPercent;
              const riskLevel = riskScore < 5 ? 'low' : riskScore < 15 ? 'medium' : 'high';
              
              return (
                <div key={collateral.id} className="position-card" style={{ marginBottom: '15px' }}>
                  <div className="position-header">
                    <span className="position-id">NFT #{collateral.id}</span>
                    <span className={`risk-indicator risk-${riskLevel}`}>
                      {riskLevel.toUpperCase()} RISK
                    </span>
                  </div>
                  
                  <div className="position-details">
                    <div className="detail-item">
                      <span className="detail-label">Asset Value</span>
                      <span className="detail-value">{formatMAS(collateral.value)} MAS</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">PD (Probability of Default)</span>
                      <span className="detail-value">{pdPercent.toFixed(2)}%</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">LGD (Loss Given Default)</span>
                      <span className="detail-value">{lgdPercent.toFixed(2)}%</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Expected LTV</span>
                      <span className="detail-value">
                        {pdPercent <= 1 ? '80%' : 
                         pdPercent <= 5 ? '75%' :
                         pdPercent <= 10 ? '70%' :
                         pdPercent <= 20 ? '65%' : '60%'}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Status</span>
                      <span className="detail-value">
                        {collateral.isDeposited ? 
                          <span className="status-active">Deposited</span> :
                          <span className="status-inactive">Available</span>
                        }
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: '20px', padding: '15px', background: 'var(--surface-light)', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '10px', color: 'var(--primary)' }}>Risk Assessment:</h4>
          <ul style={{ fontSize: '14px', color: 'var(--text-secondary)', paddingLeft: '20px' }}>
            <li><strong>PD:</strong> Probability that the borrower will default</li>
            <li><strong>LGD:</strong> Expected loss percentage if default occurs</li>
            <li><strong>LTV:</strong> Maximum loan-to-value ratio based on risk</li>
            <li>Lower risk assets enable higher borrowing capacity</li>
          </ul>
        </div>
      </div>
    </div>
  );
}