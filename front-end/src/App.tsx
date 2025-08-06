import { useState, useEffect } from 'react';
import * as massa from '@massalabs/massa-web3';
import { getWallets } from '@massalabs/wallet-provider';
import { Toaster } from 'react-hot-toast';
import Dashboard from './components/Dashboard';
import { loadAddresses } from './utils/massa';

interface AppState {
  provider: any | null;
  account: massa.Account | null;
  wallet: any;
  addresses: Record<string, string>;
  balance: string;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  showWalletSelector: boolean;
  availableWallets: any[];
}

const WALLET_CONNECTION_KEY = 'alpaca_wallet_connected';
const WALLET_TYPE_KEY = 'alpaca_wallet_type';
const WALLET_NAME_KEY = 'alpaca_wallet_name';

function App() {
  const [state, setState] = useState<AppState>({
    provider: null,
    account: null,
    wallet: null,
    addresses: {},
    balance: '0',
    isConnected: false,
    isLoading: true,
    error: null,
    showWalletSelector: false,
    availableWallets: []
  });

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      const addresses = await loadAddresses();
      setState(prev => ({ ...prev, addresses }));
      
      await checkPreviousConnection();
      
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to load contract addresses', 
        isLoading: false 
      }));
    }
  };

  const checkPreviousConnection = async () => {
    const wasConnected = localStorage.getItem(WALLET_CONNECTION_KEY);
    const walletType = localStorage.getItem(WALLET_TYPE_KEY);
    
    if (wasConnected === 'true') {
      console.log('Attempting to restore wallet connection...');
      try {
        if (walletType === 'env' && (import.meta as any).env?.VITE_PRIVATE_KEY) {
          await connectFromEnv();
        } else {
          await reconnectWallet();
        }
      } catch (error) {
        console.log('Failed to restore connection:', error);
        clearConnectionState();
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const reconnectWallet = async () => {
    try {
      const wallets = await getWallets();
      
      const filteredWallets = wallets.filter(w => {
        const walletName = w.name().toLowerCase();
        return !walletName.includes('metamask');
      });
      
      if (filteredWallets.length === 0) {
        throw new Error('No wallet found');
      }
      
      const savedWalletName = localStorage.getItem(WALLET_NAME_KEY);
      let selectedWallet = filteredWallets[0];
      
      if (savedWalletName) {
        const foundWallet = filteredWallets.find(w => w.name() === savedWalletName);
        if (foundWallet) {
          selectedWallet = foundWallet;
        }
      }
      
      const walletName = selectedWallet.name().toLowerCase();
      
      if (walletName.includes('bearby')) {
        if (!selectedWallet.connected()) {
          const connected = await selectedWallet.connect();
          if (!connected) {
            throw new Error('Failed to connect to Bearby');
          }
        }
      }
      
      const accounts = await selectedWallet.accounts();
        if (accounts.length > 0) {
      const provider = accounts[0];
  
      const balance = await provider.balance(true);
        
        setState(prev => ({
          ...prev,
          provider,
          wallet: selectedWallet,
          balance: massa.Mas.toString(balance),
          isConnected: true,
          isLoading: false
        }));
        
        console.log('Wallet reconnected successfully');
        return;
      }
      
      throw new Error('No accounts found');
      
    } catch (error) {
      throw error;
    }
  };

  const connectFromEnv = async () => {
    try {
      const account = await massa.Account.fromEnv();
      const provider = massa.JsonRpcProvider.buildnet(account);
      const balance = await provider.balance(true);
      
      setState(prev => ({
        ...prev,
        provider,
        account,
        balance: massa.Mas.toString(balance),
        isConnected: true,
        isLoading: false
      }));
      
      console.log('Environment account reconnected');
    } catch (error) {
      throw error;
    }
  };

  const handleWalletDisconnect = () => {
    console.log('Wallet disconnected');
    clearConnectionState();
    setState(prev => ({
      ...prev,
      provider: null,
      account: null,
      wallet: null,
      balance: '0',
      isConnected: false
    }));
  };

  const clearConnectionState = () => {
    localStorage.removeItem(WALLET_CONNECTION_KEY);
    localStorage.removeItem(WALLET_TYPE_KEY);
    localStorage.removeItem(WALLET_NAME_KEY);
  };

  const saveConnectionState = (type: 'wallet' | 'env', walletName?: string) => {
    localStorage.setItem(WALLET_CONNECTION_KEY, 'true');
    localStorage.setItem(WALLET_TYPE_KEY, type);
    if (walletName) {
      localStorage.setItem(WALLET_NAME_KEY, walletName);
    }
  };

  const connectWallet = async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const wallets = await getWallets();
      
      const filteredWallets = wallets.filter(w => {
        const walletName = w.name().toLowerCase();
        return !walletName.includes('metamask');
      });
      
      if (filteredWallets.length === 0) {
        throw new Error('No wallet found. Please install MassaStation or Bearby.');
      }
      
      if (filteredWallets.length === 1) {
        await connectToWallet(filteredWallets[0]);
      } else {
        setState(prev => ({
          ...prev,
          availableWallets: filteredWallets,
          showWalletSelector: true,
          isLoading: false
        }));
      }
      
    } catch (error) {
      console.error('Wallet connection error:', error);
      
      try {
        if (process.env.NODE_ENV === 'development' && (import.meta as any).env?.VITE_PRIVATE_KEY) {
          const account = await massa.Account.fromEnv();
          const provider = massa.JsonRpcProvider.buildnet(account);
          const balance = await provider.balance(true);
          
          saveConnectionState('env', 'env');
          
          setState(prev => ({
            ...prev,
            provider,
            account,
            balance: massa.Mas.toString(balance),
            isConnected: true,
            isLoading: false
          }));
        } else {
          throw new Error('No wallet found and no private key configured');
        }
      } catch (envError) {
        setState(prev => ({
          ...prev,
          error: 'Failed to connect wallet. Please install MassaStation or Bearby.',
          isLoading: false
        }));
      }
    }
  };

  const connectToWallet = async (selectedWallet: any) => {
    try {
      const walletName = selectedWallet.name().toLowerCase();
      
      if (walletName.includes('bearby')) {
        const connected = await selectedWallet.connect();
        if (!connected) {
          throw new Error('Failed to connect to Bearby');
        }
      }
      
      const accounts = await selectedWallet.accounts();
      if (accounts.length === 0) {
        throw new Error('No accounts found in wallet');
      }

      const provider = accounts[0];

      const balance = await provider.balance(true);
      
      saveConnectionState('wallet', selectedWallet.name());
      
      setState(prev => ({
        ...prev,
        provider,
        wallet: selectedWallet,
        balance: massa.Mas.toString(balance),
        isConnected: true,
        isLoading: false,
        showWalletSelector: false
      }));
      
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `Failed to connect to ${selectedWallet.name()}: ${error.message}`,
        isLoading: false,
        showWalletSelector: false
      }));
    }
  };

  const disconnectWallet = async () => {
    if (state.wallet) {
      const walletName = state.wallet.name().toLowerCase();
      
      if (walletName.includes('bearby') && state.wallet.disconnect) {
        try {
          await state.wallet.disconnect();
        } catch (error) {
          console.log('Error disconnecting wallet:', error);
        }
      }
    }
    
    clearConnectionState();
    
    setState(prev => ({
      ...prev,
      provider: null,
      account: null,
      wallet: null,
      balance: '0',
      isConnected: false
    }));
  };

  const refreshBalance = async () => {
    if (state.provider) {
      try {
        const balance = await state.provider.balance(true);
        setState(prev => ({
          ...prev,
          balance: massa.Mas.toString(balance)
        }));
      } catch (error) {
        console.error('Failed to refresh balance:', error);
      }
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="container">
          <nav className="nav">
            <div className="logo">
              <div className="alpaca-icon">
                  <img src="/alpaca-icon.webp" alt="Alpaca" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              Alpaca Bridge
            </div>
            <div className="wallet-info">
              {state.isConnected && (
                <div className="balance" onClick={refreshBalance}>
                  💰 {state.balance} MAS
                </div>
              )}
              <button
                className={`btn ${state.isConnected ? 'btn-secondary' : 'btn-primary'}`}
                onClick={state.isConnected ? disconnectWallet : connectWallet}
                disabled={state.isLoading}
              >
                {state.isLoading ? (
                  <span className="loading-spinner"></span>
                ) : state.isConnected ? (
                  'Disconnect'
                ) : (
                  'Connect Wallet'
                )}
              </button>
            </div>
          </nav>
        </div>
      </header>

      {state.showWalletSelector && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Select Wallet</h2>
              <button 
                className="close-btn" 
                onClick={() => setState(prev => ({ ...prev, showWalletSelector: false }))}
              >
                ×
              </button>
            </div>
            <div className="wallet-options">
              {state.availableWallets.map((wallet, index) => (
                <button
                  key={index}
                  className="wallet-option"
                  onClick={() => connectToWallet(wallet)}
                >
                  <span className="wallet-icon">
                    {wallet.name().toLowerCase().includes('bearby') ? '🐻' : '🏛️'}
                  </span>
                  <span className="wallet-name">{wallet.name()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!state.isConnected && (
        <div className="quick-guide">
          <div className="container">
            <h2>🚀 Quick Start Guide</h2>
            <div className="guide-steps">
              <div className="guide-step">
                <span className="step-number">1</span>
                <h3>Connect Wallet</h3>
                <p>Connect your Massa wallet to start using Alpaca Bridge</p>
              </div>
              <div className="guide-step">
                <span className="step-number">2</span>
                <h3>Deposit or Mint NFT</h3>
                <p>Deposit MAS to earn interest or mint RWA NFT as collateral</p>
              </div>
              <div className="guide-step">
                <span className="step-number">3</span>
                <h3>Borrow Against RWA</h3>
                <p>Use your NFT collateral to borrow MAS with dynamic LTV</p>
              </div>
              <div className="guide-step">
                <span className="step-number">4</span>
                <h3>Autonomous Management</h3>
                <p>ASC automatically manages interest accrual and risk assessment</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <main>
        {!state.isConnected ? (
          <div className="hero">
            <div className="container">
              <div style={{ 
                position: 'relative', 
                zIndex: 2,
                background: 'rgba(255, 250, 240, 0.9)',
                borderRadius: '30px',
                padding: '60px 40px',
                margin: '0 auto',
                maxWidth: '800px',
                boxShadow: '0 20px 60px rgba(139, 115, 85, 0.2)'
              }}>
                  <img src="/alpaca-hero.webp" alt="Alpaca" style={{ 
                    position: 'absolute', 
                    top: '-20px', 
                    right: '-20px', 
                    width: '200px', 
                    opacity: 0.1 
                  }} />
                
                <h1>🦙 Autonomous Lending Protocol</h1>
                <p>
                  Experience the future of decentralized finance with Real World Asset collateral, 
                  self-running risk management, and guaranteed liquidations powered by Massa's ASC technology.
                </p>
                
                {state.error && (
                  <div className="error-message">{state.error}</div>
                )}
                
                <button 
                  className="btn btn-primary" 
                  onClick={connectWallet}
                  disabled={state.isLoading}
                  style={{ 
                    fontSize: '18px',
                    padding: '16px 32px',
                    marginTop: '20px'
                  }}
                >
                  {state.isLoading ? '🔄 Loading...' : '🚀 Get Started'}
                </button>
                
                <div className="stats-grid" style={{ marginTop: '60px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                  <div className="stat-card alpaca-pattern">
                    <div className="card-icon-wrapper">
                        <img src="/icon-rwa.webp" alt="RWA Collateral" className="card-icon"/>
                    </div>
                    <div className="stat-label">🏭 RWA Collateral</div>
                    <div className="stat-value alpaca-accent">Enterprise NFTs</div>
                    <div className="stat-change">Receivables • Bills • Invoices</div>
                  </div>
                  <div className="stat-card alpaca-pattern">
                    <div className="card-icon-wrapper">
                        <img src="/icon-asc.webp" alt="Autonomous Operation" className="card-icon"/>
                    </div>
                    <div className="stat-label">🤖 Autonomous Operation</div>
                    <div className="stat-value alpaca-accent">ASC Powered</div>
                    <div className="stat-change">Self-executing • No bots needed</div>
                  </div>
                  <div className="stat-card alpaca-pattern">
                    <div className="card-icon-wrapper">
                        <img src="/icon-risk.webp" alt="Risk Management" className="card-icon"/>
                    </div>
                    <div className="stat-label">⚖️ Risk Management</div>
                    <div className="stat-value alpaca-accent">PD/LGD Model</div>
                    <div className="stat-change">Dynamic LTV • Auto liquidation</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <Dashboard 
            provider={state.provider} 
            addresses={state.addresses}
            onBalanceChange={refreshBalance}
          />
        )}
      </main>

      <footer className="footer">
        <Toaster 
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#333',
              color: '#fff',
            },
          }}
        />
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <p>&copy; 2024 Alpaca Bridge. Built on Massa.</p>
          </div>
          <div className="footer-links">
            <a href="#" target="_blank" rel="noopener noreferrer">Documentation</a>
            <a href="#" target="_blank" rel="noopener noreferrer">Community</a>
            <a href="#" target="_blank" rel="noopener noreferrer">Source Code</a>
          </div>
          
          <div style={{ 
            marginTop: '20px', 
            fontSize: '14px', 
            color: 'var(--text-secondary)',
            textAlign: 'center' 
          }}>
            <p>Autonomous Finance on the Decentralized Web</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;