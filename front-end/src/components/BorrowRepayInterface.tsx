import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as massa from '@massalabs/massa-web3';
import { useContracts } from '../hooks/useContracts';
import { formatMAS, getErrorMessage, validateAmount, getRiskLevel, formatTimestamp } from '../utils/massa';
import { toast } from 'react-hot-toast';
import { TRANSACTION_STATES } from '../utils/constants';
import { RWA_CATEGORIES, AssetTemplate, getTemplateById, formatMASValue, formatRiskParams } from '../utils/rwaTemplates';

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
  assetType: string;
  status: 'Available' | 'Deposited' | 'In Use';
  pending?: boolean;
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
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletNfts, setWalletNfts] = useState<UnifiedNFT[]>([]);
  const [borrowAmount, setBorrowAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');

  const contracts = useContracts(provider, addresses);

  // Helper function for safe string parsing with retry
  const safeParseString = (result: any, fallbackValue: string = ''): string => {
    try {
      if (!result || !result.value || result.value.length === 0) {
        return fallbackValue;
      }
      return new massa.Args(result.value).nextString();
    } catch (error) {
      try {
        // Fallback to TextDecoder
        return new TextDecoder().decode(result.value) || fallbackValue;
      } catch (fallbackError) {
        console.warn('Both parsing methods failed, using fallback:', error, fallbackError);
        return fallbackValue;
      }
    }
  };

  // Retry wrapper for contract calls with longer timeout  
  const retryContractCall = async (contractCall: () => Promise<any>, maxRetries: number = 5): Promise<any> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await contractCall();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        console.warn(`BorrowRepay contract call attempt ${attempt} failed, retrying...`, error);
        // Progressive delay with longer waits
        await new Promise(resolve => setTimeout(resolve, Math.min(2000 * attempt, 10000)));
      }
    }
  };

  // NFT fetching: batch first, fallback to dynamic scan; also fetch assetType
  const fetchWalletNFTs = useCallback(async () => {
    if (!contracts.rwaNFT || !provider) return;

    console.log('🔍 fetchWalletNFTs started...');
    setWalletLoading(true);
    const userAddress = provider.address;
    console.log('👤 User address:', userAddress);
    const nfts: UnifiedNFT[] = [];

    // 1) Try batch fetch
    try {
      const batchResult = await retryContractCall(() =>
        contracts.rwaNFT!.read('getNftsOfOwner', new massa.Args().addString(userAddress).serialize())
      );
      const batchData = new TextDecoder().decode(batchResult.value || new Uint8Array());
      if (batchData && batchData !== '') {
        const entries = batchData.split('|');
        for (const e of entries) {
          if (!e) continue;
          const parts = e.split(':');
          if (parts.length < 4) continue;
          const tokenId = parseInt(parts[0]);
          const value = parts[1];
          const pd = parts[2];
          const lgd = parts[3];

          // asset type
          let assetType = 'unknown';
          try {
            const atRes = await retryContractCall(() =>
              contracts.rwaNFT!.read('getAssetType', new massa.Args().addU64(BigInt(tokenId)).serialize())
            );
            assetType = new TextDecoder().decode(atRes.value || new Uint8Array()) || 'unknown';
          } catch {}

          // deposit status
          let isDeposited = false;
          if (contracts.collateralVault) {
            try {
              const dRes = await retryContractCall(() =>
                contracts.collateralVault!.read('isNFTDeposited', new massa.Args().addU64(BigInt(tokenId)).serialize())
              );
              isDeposited = new TextDecoder().decode(dRes.value || new Uint8Array()) === 'true';
            } catch {}
          }

          nfts.push({
            id: tokenId,
            value,
            pd,
            lgd,
            assetType,
            status: isDeposited ? 'Deposited' : 'Available'
          });
        }
        // Merge to avoid flicker; if existing is pending, keep optimistic snapshot
        setWalletNfts(prev => {
          const map = new Map<number, UnifiedNFT>();
          prev.forEach(it => map.set(it.id, it));
          nfts.forEach(it => {
            const existing = map.get(it.id);
            if (existing && existing.pending) {
              map.set(it.id, { ...existing, status: it.status } as UnifiedNFT);
            } else {
              map.set(it.id, { ...existing, ...it, pending: false } as UnifiedNFT);
            }
          });
          return Array.from(map.values()).sort((a, b) => a.id - b.id);
        });
        setWalletLoading(false);
        return;
      }
    } catch (err) {
      console.warn('Batch fetch failed, falling back to scan:', err);
    }

    // 2) Fallback: dynamic scan up to NEXT_ID-1 (cap at 50)
    try {
      let maxId = 50;
      try {
        const nextIdRes = await retryContractCall(() => contracts.rwaNFT!.read('NEXT_ID'));
        const nextId = new massa.Args(nextIdRes.value).nextU64();
        const nextIdNum = Number(nextId);
        if (nextIdNum > 1) {
          maxId = Math.min(nextIdNum - 1, 50);
        }
      } catch {}

      for (let i = 1; i <= maxId; i++) {
        try {
          const ownerResult = await retryContractCall(() =>
            contracts.rwaNFT!.read('ownerOf', new massa.Args().addU64(BigInt(i)).serialize())
          );
          const owner = new TextDecoder().decode(ownerResult.value || new Uint8Array());
          if (!owner || owner !== userAddress) continue;

          const [valueResult, pdResult, lgdResult] = await Promise.all([
            retryContractCall(() => contracts.rwaNFT!.read('getNFTValuation', new massa.Args().addU64(BigInt(i)).serialize())),
            retryContractCall(() => contracts.rwaNFT!.read('getNFTPD', new massa.Args().addU64(BigInt(i)).serialize())),
            retryContractCall(() => contracts.rwaNFT!.read('getNFTLGD', new massa.Args().addU64(BigInt(i)).serialize())),
          ]);

          const value = new massa.Args(valueResult.value).nextU64();
          const pd = new massa.Args(pdResult.value).nextU64();
          const lgd = new massa.Args(lgdResult.value).nextU64();

          // asset type
          let assetType = 'unknown';
          try {
            const atRes = await retryContractCall(() =>
              contracts.rwaNFT!.read('getAssetType', new massa.Args().addU64(BigInt(i)).serialize())
            );
            assetType = new TextDecoder().decode(atRes.value || new Uint8Array()) || 'unknown';
          } catch {}

          // deposit status
          let isDeposited = false;
          if (contracts.collateralVault) {
            try {
              const dRes = await retryContractCall(() =>
                contracts.collateralVault!.read('isNFTDeposited', new massa.Args().addU64(BigInt(i)).serialize())
              );
              isDeposited = new TextDecoder().decode(dRes.value || new Uint8Array()) === 'true';
            } catch {}
          }

          nfts.push({
            id: i,
            value: value.toString(),
            pd: pd.toString(),
            lgd: lgd.toString(),
            assetType,
            status: isDeposited ? 'Deposited' : 'Available'
          });
        } catch {
          // ignore missing IDs
        }
      }

      setWalletNfts(prev => {
        const map = new Map<number, UnifiedNFT>();
        prev.forEach(it => map.set(it.id, it));
        nfts.forEach(it => {
          const existing = map.get(it.id);
          if (existing && existing.pending) {
            map.set(it.id, { ...existing, status: it.status } as UnifiedNFT);
          } else {
            map.set(it.id, { ...existing, ...it, pending: false } as UnifiedNFT);
          }
        });
        return Array.from(map.values()).sort((a, b) => a.id - b.id);
      });
    } catch (e) {
      console.error('Failed to fetch wallet NFTs via fallback scan', e);
    }
    setWalletLoading(false);
  }, [contracts.rwaNFT, contracts.collateralVault, provider]);

  // Combine deposited and wallet NFTs into a single list
  const unifiedNFTs = useMemo(() => {
    const allNFTs: UnifiedNFT[] = [];
    const seenIds = new Set<number>();

    if (positions.userCollaterals) {
      positions.userCollaterals.forEach((col: any) => {
        const isInUse = positions.userPositions.some((p: any) => p.tokenId === col.id && p.isActive);
        allNFTs.push({ 
          id: col.id, 
          value: col.value, 
          pd: col.pd, 
          lgd: col.lgd, 
          assetType: col.assetType || 'unknown',
          status: isInUse ? 'In Use' : 'Deposited' 
        });
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

  // Effects - start fetching immediately, don't wait for positions
  useEffect(() => {
    fetchWalletNFTs();
  }, [fetchWalletNFTs]);
  
  useEffect(() => {
    if (!positions.isLoading) {
      setIsLoading(false);
    }
  }, [positions.isLoading]);

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

  const handleMint = async (template: AssetTemplate) => {
    setTransactionState(TRANSACTION_STATES.PENDING);
    setShowMintModal(false);
    try {
      // Optimistic pending card using NEXT_ID
      try {
        if (contracts.rwaNFT) {
          const nextIdRes = await contracts.rwaNFT.read('NEXT_ID');
          const nextId = new massa.Args(nextIdRes.value).nextU64();
          const optimisticId = Number(nextId);
          setWalletNfts(prev => {
            if (prev.some(n => n.id === optimisticId)) return prev;
            return [
              ...prev,
              {
                id: optimisticId,
                value: '0',
                pd: '0',
                lgd: '0',
                assetType: template.id,
                status: 'Available' as 'Available',
                pending: true,
              } as UnifiedNFT,
            ].sort((a, b) => a.id - b.id);
          });
        }
      } catch {}

      const newId = await positions.mintNFT(template.name, template.id);
      handleSuccess(`${template.emoji} ${template.name} NFT #${newId} minted! Ready for appraisal.`);
      // Force refresh NFT data after successful mint
      setTimeout(() => {
        fetchWalletNFTs();
      }, 2000);
    } catch (err) { 
      console.error('Mint failed:', err);
      handleError(err); 
    }
  };

  const handleAppraise = async (nftId: number, assetType: string) => {
    console.log(`🎯 handleAppraise called for NFT #${nftId}, assetType: ${assetType}`);
    setTransactionState(TRANSACTION_STATES.PENDING);
    try {
      // Find the template for this asset type
      const template = getTemplateById(assetType);
      console.log('📋 Found template:', template);
      if (!template) throw new Error('Template not found for asset type: ' + assetType);

      console.log('🔥 About to call positions.appraiseNFT with:', {
        nftId,
        value: template.value.toString(),
        pd: template.pd,
        lgd: template.lgd
      });

      // Optimistic change of values and pending flag
      setWalletNfts(prev => prev.map(n => n.id === nftId ? { ...n, value: template.value.toString(), pd: template.pd.toString(), lgd: template.lgd.toString(), pending: true } : n));

      const opId = await positions.appraiseNFT(
        nftId,
        template.value.toString(),
        template.pd,
        template.lgd
      );
      handleSuccess(`🎯 NFT #${nftId} appraised successfully! ${template.emoji} Value: ${formatMASValue(template.value)} MAS${opId ? ` (op: ${opId})` : ''}`);
      setWalletNfts(prev => prev.map(n => n.id === nftId ? { ...n, pending: false } : n));
      // Light refresh without Oracle polling
      fetchWalletNFTs();
    } catch (err) {
      console.error('❌ handleAppraise error:', err);
      fetchWalletNFTs();
      handleError(err);
    }
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
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2 className="modal-title">🏦 Mint Real World Asset NFT</h2>
              <button className="close-btn" onClick={() => setShowMintModal(false)}>×</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Select an asset type to mint. After minting, you can appraise the asset with one click.
            </p>
            
            {RWA_CATEGORIES.map((category) => (
              <div key={category.id} className="category-section" style={{ marginBottom: '24px' }}>
                <h3 style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  marginBottom: '12px',
                  color: 'var(--primary)',
                  fontSize: '1.1em'
                }}>
                  <span style={{ fontSize: '1.2em' }}>{category.emoji}</span>
                  {category.name}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9em', marginBottom: '16px' }}>
                  {category.description}
                </p>
                
                <div className="nft-template-grid" style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '12px',
                  marginBottom: '16px'
                }}>
                  {category.templates.map((template) => (
                    <div key={template.id} className="nft-template-card" style={{
                      padding: '16px',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      backgroundColor: 'var(--surface-light)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '1.5em' }}>{template.emoji}</span>
                        <h4 style={{ margin: 0, fontSize: '1em' }}>{template.name}</h4>
                      </div>
                      <p style={{ 
                        color: 'var(--text-secondary)', 
                        fontSize: '0.85em', 
                        marginBottom: '12px',
                        lineHeight: '1.4'
                      }}>
                        {template.description}
                      </p>
                      <div className="template-details" style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '4px',
                        marginBottom: '12px',
                        fontSize: '0.85em'
                      }}>
                        <span style={{ fontWeight: '600', color: 'var(--primary)' }}>
                          💰 {formatMASValue(template.value)} MAS
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {formatRiskParams(template.pd, template.lgd)}
                        </span>
                      </div>
                      <button 
                        className="btn btn-primary btn-small" 
                        onClick={() => handleMint(template)} 
                        disabled={isTransacting}
                        style={{ width: '100%', fontSize: '0.85em' }}
                      >
                        {isTransacting ? 'Minting...' : `Mint ${template.emoji}`}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="borrow-repay-interface" style={{ display: 'grid', gridTemplateColumns: '40% 1fr', gap: '24px' }}>
        <div className="stat-card">
          <div className="section-title">My Collateral NFTs</div>
          <button className="btn btn-primary" style={{width: '100%', marginBottom: '16px'}} onClick={() => setShowMintModal(true)} disabled={isTransacting}>{isTransacting ? 'Processing...' : 'Mint New Demo NFT'}</button>
          {unifiedNFTs.length === 0 ? (
            <div className="empty-state"><span className="empty-state-icon">🖼️</span><h3>No RWA-NFTs Found</h3><p>Click the button above to mint a new demo NFT.</p>{walletLoading && <p style={{color:'var(--text-secondary)'}}>Refreshing…</p>}</div>
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
                      {nft.pending && <span className="position-status" style={{ marginLeft: 8 }}>Pending</span>}
                    </div>
                    <div className="position-details">
                      <div className="detail-item"><span className="detail-label">Value</span><span className="detail-value">{formatMAS(nft.value)} MAS</span></div>
                      <div className="detail-item"><span className="detail-label">PD / LGD</span><span className="detail-value">{(Number(nft.pd) / 100).toFixed(2)}% / {(Number(nft.lgd) / 100).toFixed(2)}%</span></div>
                    </div>
                    {nft.value === '0' ? (
                      <div style={{ marginTop: '12px' }}>
                        <button 
                          className="btn btn-primary btn-small"
                          style={{ width: '100%', fontSize: '0.85em' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAppraise(nft.id, nft.assetType);
                          }}
                          disabled={isTransacting || nft.pending}
                        >
                          {isTransacting ? 'Appraising...' : '🎯 Appraise Asset'}
                        </button>
                      </div>
                    ) : nft.status === 'In Use' ? (
                      <HealthFactorBar ltv={ltv} />
                    ) : null}
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
