import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import * as massa from '@massalabs/massa-web3';
import { useContracts } from '../hooks/useContracts';
import { formatMAS, getErrorMessage, validateAmount, formatTimestamp } from '../utils/massa';
import { REFRESH_INTERVALS, TRANSACTION_STATES } from '../utils/constants';

interface LiquidationPanelProps {
  provider: any;
  addresses: Record<string, string>;
}

interface Auction {
  id: number;
  tokenId: number;
  startingPrice: string;
  endTime: number;
  highestBid: string;
  startTime: number;
  isActive: boolean;
  winner?: string;
}

interface Liquidation {
  id: number;
  borrower: string;
  tokenId: number;
  debt: string;
  collateralValue: string;
  timestamp: number;
}

export default function LiquidationPanel({ provider, addresses }: LiquidationPanelProps) {
  const contracts = useContracts(provider, addresses);
  
  const [activeAuctions, setActiveAuctions] = useState<Auction[]>([]);
  const [recentLiquidations, setRecentLiquidations] = useState<Liquidation[]>([]);
  const [bidAmount, setBidAmount] = useState('');
  const [selectedAuction, setSelectedAuction] = useState('');
  const [transactionState, setTransactionState] = useState(TRANSACTION_STATES.IDLE);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    refreshData();
    
    const interval = setInterval(refreshData, REFRESH_INTERVALS.NORMAL);
    return () => clearInterval(interval);
  }, [contracts.liquidationEngine]);

  const safeParseString = (result: any, fieldName: string, defaultValue: string = ''): string => {
    try {
      if (!result || !result.value || result.value.length === 0) {
        console.log(`${fieldName}: No data, using default`);
        return defaultValue;
      }
      return new massa.Args(result.value).nextString();
    } catch (error) {
      try {
        // Fallback to TextDecoder
        const textValue = new TextDecoder().decode(result.value) || defaultValue;
        console.log(`${fieldName}: Used TextDecoder fallback:`, textValue);
        return textValue;
      } catch (fallbackError) {
        console.log(`${fieldName}: Both parsing methods failed, using default`, error, fallbackError);
        return defaultValue;
      }
    }
  };

  const safeParseU64 = (result: any, fieldName: string, defaultValue: string = '0'): string => {
    try {
      if (!result || !result.value || result.value.length === 0) {
        console.log(`${fieldName}: No data, using default`);
        return defaultValue;
      }
      const value = new massa.Args(result.value).nextU64();
      return value.toString();
    } catch (error) {
      console.log(`${fieldName}: Parse error, using default`, error);
      return defaultValue;
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
        console.warn(`Liquidation contract call attempt ${attempt} failed, retrying...`, error);
        // Progressive delay with longer waits
        await new Promise(resolve => setTimeout(resolve, Math.min(2000 * attempt, 10000)));
      }
    }
  };

  const refreshData = async () => {
    if (!contracts.liquidationEngine) {
      setIsLoading(false);
      return;
    }

    try {
      const auctionsResult = await retryContractCall(
        () => contracts.liquidationEngine.read('getActiveAuctionsDetails')
      );
      const auctionsData = safeParseString(auctionsResult, 'auctionsData');
      const auctions: Auction[] = [];

      if (auctionsData && auctionsData !== '') {
        const auctionEntries = auctionsData.split('|');
        for (const entry of auctionEntries) {
          const parts = entry.split(':');
          if (parts.length >= 7) { // auctionId:tokenId:startingPrice:endTime:highestBid:startTime:isActive:winner?
            auctions.push({
              id: parseInt(parts[0]),
              tokenId: parseInt(parts[1]),
              startingPrice: parts[2],
              endTime: parseInt(parts[3]),
              highestBid: parts[4],
              startTime: parseInt(parts[5]),
              isActive: parts[6] === 'true',
              winner: parts.length > 7 ? parts[7] : undefined
            });
          }
        }
      }

      setActiveAuctions(auctions);
      // Temporarily disable fetching recent liquidations to focus on auction performance
      setRecentLiquidations([]); 
      setIsLoading(false);

    } catch (error) {
      console.error('Failed to fetch liquidation data:', error);
      setIsLoading(false);
      // Don't clear existing auctions, just keep the current state for better UX
    }
  };

  const handleBid = async () => {
    if (!selectedAuction) {
      setError('Please select an auction');
      return;
    }
    
    if (!validateAmount(bidAmount)) {
      setError('Please enter a valid bid amount');
      return;
    }

    const auction = activeAuctions.find(a => a.id.toString() === selectedAuction);
    if (!auction) {
      setError('Auction not found');
      return;
    }

    const minBid = Math.max(
      Number(formatMAS(auction.startingPrice)),
      Number(formatMAS(auction.highestBid))
    );
    
    if (parseFloat(bidAmount) <= minBid) {
      setError(`Bid must be higher than ${minBid.toFixed(6)} MAS`);
      return;
    }

    setTransactionState(TRANSACTION_STATES.PENDING);
    setError('');

    try {
      const bidAmountNano = BigInt(Math.floor(parseFloat(bidAmount) * 1_000_000));
      
      const operation = await contracts.liquidationEngine.call(
        'bid',
        new massa.Args()
          .addU64(BigInt(selectedAuction))
          .addU64(bidAmountNano)
          .serialize()
      );

      await operation.waitFinalExecution();
      setTransactionState(TRANSACTION_STATES.SUCCESS);
      setBidAmount('');
      setSelectedAuction('');
      await refreshData();
      
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

  const finalizeAuction = async (auctionId: number) => {
    setTransactionState(TRANSACTION_STATES.PENDING);
    setError('');

    try {
      const operation = await contracts.liquidationEngine.call(
        'finalizeAuction',
        new massa.Args().addU64(BigInt(auctionId)).serialize()
      );

      await operation.waitFinalExecution();
      toast.success('Auction finalized successfully!');
      await refreshData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
    setTransactionState(TRANSACTION_STATES.IDLE);
  };

  const isTransacting = transactionState === TRANSACTION_STATES.PENDING;
  const currentTime = Math.floor(Date.now() / 1000);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div className="loading-spinner"></div>
        <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>Loading liquidation data...</p>
      </div>
    );
  }

  return (
    <div className="card-grid">
      <div className="stat-card">
        <div className="section-title">🔨 Place Bid</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Participate in liquidation auctions to acquire RWA collateral at discounted prices.
        </p>

        {error && <div className="error-message">{error}</div>}
        
        <div className="input-group">
          <label>Select Auction</label>
          <select
            value={selectedAuction}
            onChange={(e) => setSelectedAuction(e.target.value)}
            disabled={isTransacting}
          >
            <option value="">Choose auction...</option>
            {activeAuctions.filter(a => a.isActive && currentTime < a.endTime).map((auction) => (
              <option key={auction.id} value={auction.id}>
                Auction #{auction.id} - NFT #{auction.tokenId} (Min: {formatMAS(auction.startingPrice)} MAS)
              </option>
            ))}
          </select>
        </div>

        {selectedAuction && (
          <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--surface-light)', borderRadius: '8px' }}>
            {(() => {
              const auction = activeAuctions.find(a => a.id.toString() === selectedAuction);
              if (!auction) return null;
              
              const timeLeft = auction.endTime - currentTime;
              const minBid = Math.max(
                Number(formatMAS(auction.startingPrice)),
                Number(formatMAS(auction.highestBid))
              );
              
              return (
                <div className="position-details">
                  <div className="detail-item">
                    <span className="detail-label">Token ID</span>
                    <span className="detail-value">#{auction.tokenId}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Starting Price</span>
                    <span className="detail-value">{formatMAS(auction.startingPrice)} MAS</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Current High Bid</span>
                    <span className="detail-value">{formatMAS(auction.highestBid)} MAS</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Time Left</span>
                    <span className="detail-value">
                      {timeLeft > 0 ? `${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s` : 'Ended'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Minimum Bid</span>
                    <span className="detail-value">{minBid.toFixed(6)} MAS</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div className="input-group">
          <label>Bid Amount (MAS)</label>
          <input
            type="number"
            min="0"
            step="0.000001"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            placeholder="Enter bid amount"
            disabled={isTransacting || !selectedAuction}
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleBid}
          disabled={isTransacting || !selectedAuction || !bidAmount}
          style={{ width: '100%' }}
        >
          {isTransacting ? (
            <>
              <span className="loading-spinner"></span>
              Processing...
            </>
          ) : (
            'Place Bid'
          )}
        </button>
      </div>

      <div className="stat-card">
        <div className="section-title">🔥 Active Auctions</div>
        
        {activeAuctions.length === 0 ? (
          <div className="empty-state">
            <h3>No Active Auctions</h3>
            <p>There are currently no liquidation auctions running.</p>
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {activeAuctions.map((auction) => {
              const timeLeft = auction.endTime - currentTime;
              const isExpired = timeLeft <= 0;
              const canFinalize = isExpired && auction.isActive;
              
              return (
                <div key={auction.id} className="position-card" style={{ marginBottom: '15px' }}>
                  <div className="position-header">
                    <span className="position-id">Auction #{auction.id}</span>
                    <span className={`position-status ${auction.isActive ? 'status-active' : 'status-inactive'}`}>
                      {isExpired ? 'Ended' : 'Active'}
                    </span>
                  </div>
                  
                  <div className="position-details">
                    <div className="detail-item">
                      <span className="detail-label">NFT Token ID</span>
                      <span className="detail-value">#{auction.tokenId}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Starting Price</span>
                      <span className="detail-value">{formatMAS(auction.startingPrice)} MAS</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Current High Bid</span>
                      <span className="detail-value">
                        {Number(auction.highestBid) > 0 ? formatMAS(auction.highestBid) + ' MAS' : 'No bids'}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Time Remaining</span>
                      <span className="detail-value">
                        {isExpired ? 'Ended' : `${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s`}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">End Time</span>
                      <span className="detail-value">{formatTimestamp(auction.endTime)}</span>
                    </div>
                  </div>

                  {canFinalize && (
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => finalizeAuction(auction.id)}
                      disabled={isTransacting}
                      style={{ marginTop: '10px', width: '100%' }}
                    >
                      Finalize Auction
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="stat-card">
        <div className="section-title">📊 Recent Liquidations</div>
        
        {recentLiquidations.length === 0 ? (
          <div className="empty-state">
            <h3>No Recent Liquidations</h3>
            <p>No liquidations have occurred recently.</p>
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {recentLiquidations.map((liquidation) => (
              <div key={liquidation.id} className="position-card" style={{ marginBottom: '15px' }}>
                <div className="position-header">
                  <span className="position-id">Liquidation #{liquidation.id}</span>
                  <span className="risk-indicator risk-high">LIQUIDATED</span>
                </div>
                
                <div className="position-details">
                  <div className="detail-item">
                    <span className="detail-label">Borrower</span>
                    <span className="detail-value">{liquidation.borrower.slice(0, 10)}...</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">NFT Token ID</span>
                    <span className="detail-value">#{liquidation.tokenId}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Outstanding Debt</span>
                    <span className="detail-value">{formatMAS(liquidation.debt)} MAS</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Collateral Value</span>
                    <span className="detail-value">{formatMAS(liquidation.collateralValue)} MAS</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Liquidation Time</span>
                    <span className="detail-value">{formatTimestamp(liquidation.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '20px', padding: '15px', background: 'var(--surface-light)', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '10px', color: 'var(--primary)' }}>Liquidation Process:</h4>
          <ul style={{ fontSize: '14px', color: 'var(--text-secondary)', paddingLeft: '20px' }}>
            <li>Positions are liquidated when LTV exceeds safety threshold</li>
            <li>Collateral is auctioned with 1-hour duration</li>
            <li>Starting price includes 5% liquidation penalty</li>
            <li>Highest bidder receives the NFT collateral</li>
            <li>Proceeds are used to repay outstanding debt</li>
          </ul>
        </div>
      </div>
    </div>
  );
}