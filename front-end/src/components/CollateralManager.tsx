import React, { useState, useEffect } from 'react';
import * as massa from '@massalabs/massa-web3';
import { useContracts } from '../hooks/useContracts';
import { formatMAS, getErrorMessage, validateAmount } from '../utils/massa';
import { toast } from 'react-hot-toast';
import { TRANSACTION_STATES } from '../utils/constants';
import { nftLibrary } from '../utils/nft-library';

interface CollateralManagerProps {
  positions: any;
  provider?: any;
  addresses?: Record<string, string>;
  onSuccess: () => void;
}

interface MyNFT {
  id: number;
  value: string;
  pd: string;
  lgd: string;
  isDeposited: boolean;
}

export default function CollateralManager({ positions, provider, addresses, onSuccess }: CollateralManagerProps) {
  const [depositTokenId, setDepositTokenId] = useState('');
  const [withdrawTokenId, setWithdrawTokenId] = useState('');
  const [transactionState, setTransactionState] = useState(TRANSACTION_STATES.IDLE);
  const [error, setError] = useState('');
  const [newlyMintedId, setNewlyMintedId] = useState<bigint | null>(null);
  const [myNFTs, setMyNFTs] = useState<MyNFT[]>([]);
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(false);
  const [showMintModal, setShowMintModal] = useState(false);
  
  const actualProvider = provider || positions.provider || (positions as any).provider;
  const actualAddresses = addresses || positions.addresses || (positions as any).addresses;
  const contracts = useContracts(actualProvider, actualAddresses);

  const areNFTsEqual = (nfts1: MyNFT[], nfts2: MyNFT[]): boolean => {
    if (nfts1.length !== nfts2.length) return false;
    return nfts1.every(nft1 => {
      const nft2 = nfts2.find(n => n.id === nft1.id);
      return nft2 && 
        nft1.value === nft2.value && 
        nft1.pd === nft2.pd && 
        nft1.lgd === nft2.lgd && 
        nft1.isDeposited === nft2.isDeposited;
    });
  };

  const fetchMyNFTs = async (showLoading: boolean = true): Promise<void> => {
    if (!contracts.rwaNFT || !actualProvider) {
      console.log('Missing contracts or provider:', { rwaNFT: !!contracts.rwaNFT, provider: !!actualProvider });
      return;
    }
    
    if (showLoading) {
      setIsLoadingNFTs(true);
    }
    
    const userAddress = actualProvider.address;
    const nfts: MyNFT[] = [];
    
    console.log('Fetching NFTs for user:', userAddress);
    
    try {
      // First, get the next ID to know the range
      let maxTokenId = 10; // Default fallback
      try {
        const nextIdResult = await contracts.rwaNFT.read('NEXT_ID');
        if (nextIdResult.value && nextIdResult.value.length > 0) {
          const nextIdBytes = new Uint8Array(nextIdResult.value);
          let result = 0;
          for (let i = 0; i < Math.min(nextIdBytes.length, 8); i++) {
            result |= nextIdBytes[i] << (i * 8);
          }
          maxTokenId = Math.max(result - 1, 1);
          console.log('NEXT_ID from contract:', result, 'Max token ID:', maxTokenId);
        }
      } catch (error) {
        console.warn('Could not read NEXT_ID, using fallback range:', error);
      }
      
      // Iterate through token IDs to find user's NFTs
      for (let i = 1; i <= Math.min(maxTokenId, 50); i++) { 
        try {
          console.log(`Checking NFT ${i}...`);
          
          const ownerResult = await contracts.rwaNFT.read(
            'ownerOf', 
            new massa.Args().addU64(BigInt(i)).serialize()
          );
          
          if (!ownerResult.value || ownerResult.value.length === 0) {
            console.log(`NFT ${i} has no owner`);
            continue;
          }
          
          const owner = new TextDecoder().decode(ownerResult.value);
          console.log(`NFT ${i} owner:`, owner, 'User:', userAddress, 'Match:', owner === userAddress);
          
          if (owner === userAddress) {
            console.log(`Found user NFT ${i}, fetching oracle data...`);
            
            // Fetch value, PD, LGD from Oracle
            const [valueResult, pdResult, lgdResult] = await Promise.all([
              contracts.oracle.read('getNFTValuation', new massa.Args().addU64(BigInt(i)).serialize()).catch(e => {
                console.warn(`Failed to get valuation for NFT ${i}:`, e);
                return null;
              }),
              contracts.oracle.read('getNFTPD', new massa.Args().addU64(BigInt(i)).serialize()).catch(e => {
                console.warn(`Failed to get PD for NFT ${i}:`, e);
                return null;
              }),
              contracts.oracle.read('getNFTLGD', new massa.Args().addU64(BigInt(i)).serialize()).catch(e => {
                console.warn(`Failed to get LGD for NFT ${i}:`, e);
                return null;
              })
            ]);
            
            if (!valueResult?.value || valueResult.value.length === 0 ||
                !pdResult?.value || pdResult.value.length === 0 ||
                !lgdResult?.value || lgdResult.value.length === 0) {
              console.log(`NFT ${i} missing oracle data, skipping`);
              continue;
            }
            
            const value = new massa.Args(valueResult.value).nextU64();
            const pd = new massa.Args(pdResult.value).nextU64();
            const lgd = new massa.Args(lgdResult.value).nextU64();
            
            // Allow NFTs with 0 value to be displayed (they might need repricing)
            console.log(`NFT ${i} oracle data:`, { value: value.toString(), pd: pd.toString(), lgd: lgd.toString() });
            
            let isDeposited = false;
            if (contracts.collateralVault) {
              try {
                const depositedResult = await contracts.collateralVault.read(
                  'isNFTDeposited',
                  new massa.Args().addU64(BigInt(i)).serialize()
                );
                if (depositedResult.value && depositedResult.value.length > 0) {
                  isDeposited = new TextDecoder().decode(depositedResult.value) === 'true';
                }
              } catch (e) {
                console.warn(`Could not check deposit status for NFT ${i}:`, e);
              }
            }
            
            nfts.push({
              id: i,
              value: value.toString(),
              pd: pd.toString(),
              lgd: lgd.toString(),
              isDeposited
            });
            
            console.log(`Added NFT ${i} to list`);
          }
        } catch (error) {
          console.error(`Error fetching NFT ${i}:`, error);
          continue;
        }
      }
      
      console.log('Final NFTs found:', nfts.length, nfts);
      
      if (!areNFTsEqual(myNFTs, nfts)) {
        setMyNFTs(nfts);
      }
    } catch (error) {
      console.error('Failed to fetch user NFTs:', error);
    } finally {
      if (showLoading) {
        setIsLoadingNFTs(false);
      }
    }
  };

  useEffect(() => {
    fetchMyNFTs(true);
  }, [contracts.rwaNFT, actualProvider]); // Depend on rwaNFT

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showMintModal) {
      document.body.classList.add('modal-open');
      return () => {
        document.body.classList.remove('modal-open');
      };
    }
  }, [showMintModal]);

  const handleMintFromTemplate = async (template: typeof nftLibrary[0]) => {
    setTransactionState(TRANSACTION_STATES.PENDING);
    setError('');
    setNewlyMintedId(null);
    setShowMintModal(false); // Close modal

    try {
      const newId = await positions.mintNFT(
        template.metadata,
        template.value,
        template.pd,
        template.lgd
      );
      setNewlyMintedId(newId);
      toast.success(`NFT #${newId} (${template.name}) minted and priced successfully!`);
      
      setTimeout(() => {
        fetchMyNFTs(false);
        onSuccess();
      }, 1000); // Reduced delay for faster feedback // Give some time for chain state to update
      
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setTransactionState(TRANSACTION_STATES.IDLE);
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
      toast.success(`NFT #${depositTokenId} deposited successfully!`);
      setDepositTokenId('');
      
      setTimeout(() => {
        fetchMyNFTs(false);
        onSuccess();
      }, 1000); // Reduced delay for faster feedback
      
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setTransactionState(TRANSACTION_STATES.IDLE);
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
      toast.success(`NFT #${withdrawTokenId} withdrawn successfully!`);
      setWithdrawTokenId('');
      
      setTimeout(() => {
        fetchMyNFTs(false);
        onSuccess();
      }, 1000); // Reduced delay for faster feedback
      
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setTransactionState(TRANSACTION_STATES.IDLE);
    }
  };

  const isTransacting = transactionState === TRANSACTION_STATES.PENDING;

  return (
    <>
      {showMintModal && (
        <div 
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowMintModal(false);
            }
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">🎯 Select NFT Template</h2>
              <button 
                className="close-btn" 
                onClick={() => setShowMintModal(false)}
                title="Close"
              >
                ×
              </button>
            </div>
            <p style={{ 
              color: 'var(--text-secondary)', 
              marginBottom: '30px',
              fontSize: '16px',
              lineHeight: '1.5'
            }}>
              Choose a Real-World Asset (RWA) template to mint as an NFT. Each template represents different risk profiles and asset types for testing the lending protocol.
            </p>
            <div className="nft-template-grid">
              {nftLibrary.map((template) => (
                <div key={template.id} className="nft-template-card">
                  <h3>{template.name}</h3>
                  <p>{template.description}</p>
                  <div className="template-details">
                    <span>Value: {formatMAS(template.value)} MAS</span>
                    <span>PD: {(Number(template.pd) / 100).toFixed(2)}%</span>
                    <span>LGD: {(Number(template.lgd) / 100).toFixed(2)}%</span>
                  </div>
                  <button 
                    className="btn btn-primary btn-small"
                    onClick={() => handleMintFromTemplate(template)}
                    disabled={isTransacting}
                  >
                    Mint This NFT
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    <div className="card-grid">
      <div className="stat-card">
        <div className="section-title">Mint RWA NFT</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Create a new RWA NFT representing real-world assets. Select from predefined templates for testing.
        </p>

        {error && <div className="error-message">{error}</div>}
        
        {newlyMintedId !== null && transactionState === TRANSACTION_STATES.IDLE && (
          <div className="success-message">
            🎉 Your new NFT ID is: <span style={{ color: 'var(--primary)' }}>{newlyMintedId.toString()}</span>
            <div style={{ fontSize: '14px', fontWeight: 'normal', marginTop: '5px' }}>
              Use this ID to deposit your NFT as collateral below!
            </div>
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={() => setShowMintModal(true)}
          disabled={isTransacting}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              Processing...
            </>
          ) : (
            'Mint NFT from Template'
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
            The ID of the NFT you want to deposit as collateral (see "Available NFTs" below for IDs)
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
        <div className="section-title">
          🎯 Available NFTs
          <button
            onClick={() => fetchMyNFTs(false)}
            disabled={isLoadingNFTs}
            style={{
              marginLeft: '10px',
              padding: '4px 8px',
              fontSize: '12px',
              background: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            🔄
          </button>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          NFTs you own that are available for collateral deposit. Click the NFT ID to auto-fill the deposit form below.
        </p>
        
        {isLoadingNFTs ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div className="loading-spinner"></div>
            <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>Loading your NFTs...</p>
          </div>
        ) : myNFTs.filter(nft => !nft.isDeposited).length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">🖼️</span>
            <h3>No Available NFTs</h3>
            <p>You don't have any NFTs to use as collateral yet.</p>
            <button className="btn btn-primary" onClick={() => setShowMintModal(true)}>Mint an NFT from Template</button>
          </div>
        ) : (
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {myNFTs.filter(nft => !nft.isDeposited).map((nft) => (
              <div key={nft.id} className="position-card" style={{ marginBottom: '10px' }}>
                <div className="position-header">
                  <span 
                    className="position-id" 
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      navigator.clipboard.writeText(nft.id.toString());
                      setDepositTokenId(nft.id.toString());
                    }}
                    title="Click to copy ID and auto-fill deposit form"
                  >
                    NFT #{nft.id} 📋
                  </span>
                  <span className="position-status status-active">Available</span>
                </div>
                
                <div className="position-details">
                  <div className="detail-item">
                    <span className="detail-label">Value</span>
                    <span className="detail-value">{formatMAS(nft.value)} MAS</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">PD</span>
                    <span className="detail-value">{(Number(nft.pd) / 100).toFixed(2)}%</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">LGD</span>
                    <span className="detail-value">{(Number(nft.lgd) / 100).toFixed(2)}%</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Expected LTV</span>
                    <span className="detail-value">
                      {Number(nft.pd) / 100 <= 1 ? '80%' : 
                       Number(nft.pd) / 100 <= 5 ? '75%' :
                       Number(nft.pd) / 100 <= 10 ? '70%' :
                       Number(nft.pd) / 100 <= 20 ? '65%' : '60%'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {myNFTs.filter(nft => !nft.isDeposited).length > 0 && (
          <div style={{ 
            marginTop: '15px', 
            padding: '10px', 
            background: 'var(--surface-light)', 
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--text-secondary)'
          }}>
            💡 Tip: Click on any NFT ID (📋) to automatically fill the deposit form below!
          </div>
        )}
      </div>

      <div className="stat-card">
        <div className="section-title">🏛️ Deposited Collateral</div>
        
        {positions.userCollaterals.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">🏦</span>
            <h3>No Deposited Collateral</h3>
            <p>You haven't deposited any NFT collateral yet. Deposit one to enable borrowing.</p>
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
    </>
  );
}
