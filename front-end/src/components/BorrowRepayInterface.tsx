import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as massa from '@massalabs/massa-web3';
import { useContracts } from '../hooks/useContracts';
import { formatMAS, getErrorMessage, validateAmount, getRiskLevel, formatTimestamp } from '../utils/massa';
import { toast } from 'react-hot-toast';
import { TRANSACTION_STATES } from '../utils/constants';
import { nftLibrary } from '../utils/nft-library';

// --- Reusable Health Factor Component ---
const HealthFactorBar = ({ ltv }: { ltv: number }) => {
  const riskLevel = getRiskLevel(ltv);
  const ltvPercentage = Math.min(ltv, 100);

  return (
    <div className="health-factor">
      <div className="health-factor-label">
        <span>Health Factor</span>
        <span className={`risk-indicator risk-${riskLevel.level}`}>{ltv.toFixed(2)}%</span>
      </div>
      <div className="health-factor-bar-container">
        <div 
          className={`health-factor-bar risk-${riskLevel.level}`}
          style={{ width: `${ltvPercentage}%` }}
        ></div>
      </div>
    </div>
  );
};

// Interfaces
interface BorrowRepayInterfaceProps {
  positions: any;
  provider?: any;
  addresses?: Record<string, string>;
  onSuccess: () => void;
}

interface UnifiedNFT {
  id: number;
  value: string;
  pd: string;
  lgd: string;
  status: 'Available' | 'Deposited' | 'In Use';
}

// Helper function to calculate max borrow based on LTV
const calculateMaxBorrow = (collateral: { value: string; pd: string; }) => {
  if (!collateral) return 0;
  const collateralValue = Number(formatMAS(collateral.value));
  const pd = Number(collateral.pd);
  const ltv = pd <= 100 ? 0.8 : pd <= 500 ? 0.75 : pd <= 1000 ? 0.7 : pd <= 2000 ? 0.65 : 0.6;
  return collateralValue * ltv;
};

export default function BorrowRepayInterface({ positions, provider, addresses, onSuccess }: BorrowRepayInterfaceProps) {
  // State
  const [selectedNftId, setSelectedNftId] = useState<number | null>(null);
  const [transactionState, setTransactionState] = useState(TRANSACTION_STATES.IDLE);
  const [error, setError] = useState('');
  const [showMintModal, setShowMintModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [walletNfts, setWalletNfts] = useState<UnifiedNFT[]>([]);
  const [borrowAmount, setBorrowAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');

  const contracts = useContracts(provider, addresses);

  // Fetch NFTs from the user's wallet
  const fetchWalletNFTs = useCallback(async () => {
    if (!contracts.rwaNFT || !provider) return;
    const userAddress = provider.address;
    const nfts: UnifiedNFT[] = [];
    try {
      const balanceStr = await contracts.rwaNFT.read('balanceOf', new massa.Args().addString(userAddress).serialize());
      const balance = new massa.Args(balanceStr.value).nextU64();

      for (let i = 0; i < balance; i++) {
        const tokenIdStr = await contracts.rwaNFT.read('tokenOfOwnerByIndex', new massa.Args().addString(userAddress).addU64(BigInt(i)).serialize());
        const tokenId = new massa.Args(tokenIdStr.value).nextU64();
        
        const [valueResult, pdResult, lgdResult] = await Promise.all([
            contracts.oracle.read('getNFTValuation', new massa.Args().addU64(tokenId).serialize()),
            contracts.oracle.read('getNFTPD', new massa.Args().addU64(tokenId).serialize()),
            contracts.oracle.read('getNFTLGD', new massa.Args().addU64(tokenId).serialize())
        ]);

        nfts.push({
            id: Number(tokenId),
            value: new massa.Args(valueResult.value).nextU64().toString(),
            pd: new massa.Args(pdResult.value).nextU64().toString(),
            lgd: new massa.Args(lgdResult.value).nextU64().toString(),
            status: 'Available'
        });
      }
      setWalletNfts(nfts);
    } catch (e) {
      console.error("Failed to fetch wallet NFTs", e);
    }
  }, [contracts.rwaNFT, contracts.oracle, provider]);

  // Combine deposited and wallet NFTs into a single list
  const unifiedNFTs = useMemo(() => {
    const allNFTs: UnifiedNFT[] = [];
    const seenIds = new Set<number>();

    if (positions.userCollaterals) {
      positions.userCollaterals.forEach((col: any) => {
        const isInUse = positions.userPositions.some((p: any) => p.tokenId === col.id && p.isActive);
        allNFTs.push({ id: col.id, value: col.value, pd: col.pd, lgd: col.lgd, status: isInUse ? 'In Use' : 'Deposited' });
        seenIds.add(col.id);
      });
    }

    walletNfts.forEach(nft => {
      if (!seenIds.has(nft.id)) {
        allNFTs.push(nft);
      }
    });

    return allNFTs.sort((a, b) => a.id - b.id);
  }, [positions.userCollaterals, positions.userPositions, walletNfts]);

  // Effects
  useEffect(() => {
    if (!positions.isLoading) {
      setIsLoading(false);
      fetchWalletNFTs();
    }
  }, [positions.isLoading, fetchWalletNFTs]);

  // Handlers
  const handleSuccess = (message: string) => {
    toast.success(message);
    onSuccess();
    fetchWalletNFTs();
    setBorrowAmount('');
    setRepayAmount('');
    setSelectedNftId(null);
    setTransactionState(TRANSACTION_STATES.IDLE);
  }

  const handleError = (err: any) => {
    toast.error(getErrorMessage(err));
    setTransactionState(TRANSACTION_STATES.IDLE);
  }

  const handleMint = async (template: typeof nftLibrary[0]) => {
    setTransactionState(TRANSACTION_STATES.PENDING);
    setShowMintModal(false);
    try {
      const newId = await positions.mintNFT(template.metadata, template.value, template.pd, template.lgd);
      handleSuccess(`NFT #${newId} minted!`);
    } catch (err) { handleError(err); }
  };

  const handleDepositAndBorrow = async () => {
    if (!selectedNft) return;
    setTransactionState(TRANSACTION_STATES.PENDING);
    try {
      await positions.depositAndBorrow(selectedNft.id, borrowAmount);
      handleSuccess('Deposit and borrow successful!');
    } catch (err) { handleError(err); }
  };

  const handleBorrow = async () => {
    if (!selectedNft) return;
    setTransactionState(TRANSACTION_STATES.PENDING);
    try {
      await positions.borrow(selectedNft.id, borrowAmount);
      handleSuccess('Borrow successful!');
    } catch (err) { handleError(err); }
  };

  const handleRepay = async () => {
    if (!selectedNft) return;
    const position = positions.userPositions.find((p: any) => p.tokenId === selectedNft.id && p.isActive);
    if (!position) return;
    setTransactionState(TRANSACTION_STATES.PENDING);
    try {
      await positions.repay(position.id, repayAmount);
      handleSuccess('Repay successful!');
    } catch (err) { handleError(err); }
  };

  const handleWithdraw = async () => {
    if (!selectedNft) return;
    setTransactionState(TRANSACTION_STATES.PENDING);
    try {
      await positions.withdrawNFT(selectedNft.id);
      handleSuccess('Withdraw successful!');
    } catch (err) { handleError(err); }
  };

  const selectedNft = useMemo(() => unifiedNFTs.find(nft => nft.id === selectedNftId) || null, [selectedNftId, unifiedNFTs]);
  const isTransacting = transactionState === TRANSACTION_STATES.PENDING;

  // Render logic
  const renderActionPanel = () => {
    if (!selectedNft) return <div className="empty-state"><span className="empty-state-icon">👈</span><h3>Select Collateral</h3><p>Select an NFT from the left to see actions.</p></div>;

    const maxBorrow = calculateMaxBorrow(selectedNft);
    const position = selectedNft.status === 'In Use' ? positions.userPositions.find((p: any) => p.tokenId === selectedNft.id && p.isActive) : null;
    const totalDebt = position ? Number(formatMAS(position.borrowedAmount)) + Number(formatMAS(position.accruedInterest)) : 0;
    const ltv = selectedNft.value !== '0' ? (totalDebt / Number(formatMAS(selectedNft.value))) * 100 : 0;

    switch (selectedNft.status) {
      case 'Available':
        return (
          <div>
            <div className="section-title">Deposit & Borrow</div>
            <p>Deposit this NFT to start borrowing against it.</p>
            <div className="input-group">
              <label>Borrow Amount (MAS)</label>
              <input type="number" value={borrowAmount} onChange={e => setBorrowAmount(e.target.value)} placeholder={`Max: ${maxBorrow.toFixed(4)}`} />
            </div>
            <button className="btn btn-primary" onClick={handleDepositAndBorrow} disabled={isTransacting || !selectedNftId}>
              {isTransacting ? 'Processing...' : 'Deposit & Borrow'}
            </button>
          </div>
        );
      case 'Deposited':
        return (
          <div>
            <div className="section-title">Borrow or Withdraw</div>
            <div className="input-group">
              <label>Borrow Amount (MAS)</label>
              <input type="number" value={borrowAmount} onChange={e => setBorrowAmount(e.target.value)} placeholder={`Max: ${maxBorrow.toFixed(4)}`} />
            </div>
            <button className="btn btn-primary" onClick={handleBorrow} disabled={isTransacting || !borrowAmount}>Borrow</button>
            <hr style={{margin: '20px 0'}}/>
            <button className="btn btn-secondary" onClick={handleWithdraw} disabled={isTransacting}>Withdraw NFT</button>
          </div>
        );
      case 'In Use':
        return (
          <div>
            <div className="section-title">Borrow More or Repay</div>
            <HealthFactorBar ltv={ltv} />
            <div className="input-group">
              <label>Borrow More (MAS)</label>
              <input type="number" value={borrowAmount} onChange={e => setBorrowAmount(e.target.value)} placeholder={`Max: ${(maxBorrow - totalDebt).toFixed(4)}`} />
            </div>
            <button className="btn btn-primary" onClick={handleBorrow} disabled={isTransacting || !borrowAmount}>Borrow More</button>
            <hr style={{margin: '20px 0'}}/>
            <div className="input-group">
              <label>Repay Amount (MAS)</label>
              <input type="number" value={repayAmount} onChange={e => setRepayAmount(e.target.value)} placeholder={`Total Debt: ${totalDebt.toFixed(4)}`} />
               <button className="btn btn-small btn-secondary" onClick={() => setRepayAmount(totalDebt.toString())}>MAX</button>
            </div>
            <button className="btn btn-warning" onClick={handleRepay} disabled={isTransacting || !repayAmount}>Repay</button>
          </div>
        );
      default: return null;
    }
  };

  return (
    <>
      {showMintModal && (
         <div className="modal-overlay" onClick={() => setShowMintModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">Mint a Demo RWA-NFT</h2><button className="close-btn" onClick={() => setShowMintModal(false)}>×</button></div>
            <div className="nft-template-grid">
              {nftLibrary.map((template) => (
                <div key={template.id} className="nft-template-card">
                  <h3>{template.name}</h3><p>{template.description}</p>
                  <div className="template-details">
                    <span>Value: {formatMAS(template.value)} MAS</span>
                    <span>PD: {(Number(template.pd) / 100).toFixed(2)}%</span>
                    <span>LGD: {(Number(template.lgd) / 100).toFixed(2)}%</span>
                  </div>
                  <button className="btn btn-primary btn-small" onClick={() => handleMint(template)} disabled={isTransacting}>{isTransacting ? 'Minting...' : 'Mint This NFT'}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="borrow-repay-interface" style={{ display: 'grid', gridTemplateColumns: '40% 1fr', gap: '24px' }}>
        <div className="stat-card">
          <div className="section-title">My Collateral NFTs</div>
          <button className="btn btn-primary" style={{width: '100%', marginBottom: '16px'}} onClick={() => setShowMintModal(true)} disabled={isTransacting}>{isTransacting ? 'Processing...' : 'Mint New Demo NFT'}</button>
          {isLoading ? <div className="loading-spinner"></div> : unifiedNFTs.length === 0 ? (
            <div className="empty-state"><span className="empty-state-icon">🖼️</span><h3>No RWA-NFTs Found</h3><p>Click the button above to mint a new demo NFT.</p></div>
          ) : (
            <div className="nft-list" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              {unifiedNFTs.map(nft => {
                const position = nft.status === 'In Use' ? positions.userPositions.find((p: any) => p.tokenId === nft.id && p.isActive) : null;
                const totalDebt = position ? Number(formatMAS(position.borrowedAmount)) + Number(formatMAS(position.accruedInterest)) : 0;
                const ltv = nft.value !== '0' ? (totalDebt / Number(formatMAS(nft.value))) * 100 : 0;

                return (
                  <div key={nft.id} className={`position-card nft-item ${selectedNftId === nft.id ? 'selected' : ''}`} onClick={() => setSelectedNftId(nft.id)}>
                    <div className="position-header">
                      <span className="position-id">NFT #{nft.id}</span>
                      <span className={`position-status status-${nft.status.toLowerCase()}`}>{nft.status}</span>
                    </div>
                    <div className="position-details">
                      <div className="detail-item"><span className="detail-label">Value</span><span className="detail-value">{formatMAS(nft.value)} MAS</span></div>
                      <div className="detail-item"><span className="detail-label">PD / LGD</span><span className="detail-value">{(Number(nft.pd) / 100).toFixed(2)}% / {(Number(nft.lgd) / 100).toFixed(2)}%</span></div>
                    </div>
                    {nft.status === 'In Use' && <HealthFactorBar ltv={ltv} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="stat-card">{renderActionPanel()}</div>
      </div>
    </>
  );
}
