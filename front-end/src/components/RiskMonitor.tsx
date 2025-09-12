import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import * as massa from '@massalabs/massa-web3';
import { useContracts } from '../hooks/useContracts';
import { formatMAS, formatPercentage } from '../utils/massa';
import { REFRESH_INTERVALS } from '../utils/constants';

interface RiskMonitorProps {
  provider: any;
  addresses: Record<string, string>;
  tokenId?: number; // optional: when provided, chart follows this NFT's valuation
}

interface RiskData {
  currentPrice: string;
  twapPrice: string;
  volatility: string;
  lastUpdate: string;
  evaluationActive: boolean;
  highRiskPositions: string;
  isLoading: boolean;
}

export default function RiskMonitor({ provider, addresses, tokenId }: RiskMonitorProps) {
  const contracts = useContracts(provider, addresses);
  const [riskData, setRiskData] = useState<RiskData>({
    currentPrice: '0',
    twapPrice: '0',
    volatility: '0',
    lastUpdate: '0',
    evaluationActive: false,
    highRiskPositions: '',
    isLoading: true
  });
  const [priceHistory, setPriceHistory] = useState<Array<{time: string, price: number}>>([]);

  // Retry wrapper for contract calls with longer timeout
  const retryContractCall = async (contractCall: () => Promise<any>, maxRetries: number = 5): Promise<any> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await contractCall();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        console.warn(`Risk Monitor contract call attempt ${attempt} failed, retrying...`, error);
        // Progressive delay with longer waits
        await new Promise(resolve => setTimeout(resolve, Math.min(2000 * attempt, 10000)));
      }
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, REFRESH_INTERVALS.FAST);
    return () => clearInterval(interval);
  }, [contracts.oracle, contracts.riskManager, contracts.collateralVault, tokenId]);

  const safeParseU64 = (result: any, defaultValue: string = '0'): string => {
    try {
      if (!result || !result.value || result.value.length === 0) return defaultValue;
      return new massa.Args(result.value).nextU64().toString();
    } catch (error) {
      return defaultValue;
    }
  };

  const safeParseString = (r: any, d = '') =>
  !r || !r.value || r.value.length === 0
    ? d
    : (() => {
        try {
          return new massa.Args(r.value).nextString()
        } catch {
          return Buffer.from(r.value).toString() || d
        }
      })()

      const safeParseBoolean = (result: any, defaultValue: boolean = false): boolean => {
        try {
          if (!result || !result.value || result.value.length === 0) {
            return defaultValue;
          }
          
          // 直接将字节数组转换为字符串
          const str = new TextDecoder().decode(result.value);
          return str === 'true' || str.includes('true');
        } catch (error) {
          return defaultValue;
        }
      };


  const refreshData = async () => {
    if (!contracts.oracle || !contracts.riskManager) {
      setRiskData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      // If a tokenId is provided, show its valuation as the main series using vault (refreshed by ASC)
      let currentPrice = '0', twapPrice = '0', volatility = '0', lastUpdate = '0';
      let evaluationActive = false; let highRiskPositions = '';
      if (typeof tokenId === 'number' && contracts.collateralVault) {
        const [valRes, evalActiveRes] = await Promise.all([
          retryContractCall(() => contracts.collateralVault!.read('getNFTValue', new massa.Args().addU64(BigInt(tokenId)).serialize())),
          retryContractCall(() => contracts.riskManager.read('isEvaluationActive')),
        ]);
        currentPrice = safeParseU64(valRes, '0');
        evaluationActive = safeParseBoolean(evalActiveRes, false);
      } else {
        const [
          priceResult,
          twapResult,
          volatilityResult,
          lastUpdateResult,
          evaluationActiveResult,
          highRiskResult
        ] = await Promise.all([
          retryContractCall(() => contracts.oracle.read('getPrice')),
          retryContractCall(() => contracts.oracle.read('getTwap')),
          retryContractCall(() => contracts.oracle.read('getVolatility')),
          retryContractCall(() => contracts.oracle.read('getLastUpdate')),
          retryContractCall(() => contracts.riskManager.read('isEvaluationActive')),
          retryContractCall(() => contracts.riskManager.read('getHighRiskPositions'))
        ]);
        currentPrice = safeParseU64(priceResult, '1000000');
        twapPrice = safeParseU64(twapResult, '1000000');
        volatility = safeParseU64(volatilityResult, '100');
        lastUpdate = safeParseU64(lastUpdateResult, '0');
        evaluationActive = safeParseBoolean(evaluationActiveResult, false);
        highRiskPositions = safeParseString(highRiskResult, '');
      }

      // Keep logs minimal; avoid referencing variables not set in NFT mode
      
      setRiskData({
        currentPrice,
        twapPrice,
        volatility,
        lastUpdate,
        evaluationActive,
        highRiskPositions,
        isLoading: false
      });

      const currentTime = new Date().toLocaleTimeString();
      const price = typeof tokenId === 'number' ? Number(currentPrice) / 1_000_000_000 : Number(currentPrice) / 1_000_000;
      
      setPriceHistory(prev => {
        const newHistory = [...prev, { time: currentTime, price }];
        return newHistory.slice(-20);
      });

    } catch (error) {
      console.error('Failed to fetch risk data:', error);
      setRiskData(prev => ({ ...prev, isLoading: false }));
    }
  };

  const getChartOption = () => {
    return {
      backgroundColor: 'transparent',
      grid: { top: 50, left: 80, right: 50, bottom: 80 },
      xAxis: {
        type: 'category',
        data: priceHistory.map(item => item.time),
        axisLine: { lineStyle: { color: '#8B7355' } },
        axisLabel: { color: '#8B7355', fontSize: 11, rotate: 45, margin: 15 }
      },
      yAxis: {
        type: 'value',
        name: tokenId ? 'Price (MAS)' : 'Price ($)',
        nameTextStyle: { color: '#8B7355' },
        axisLine: { lineStyle: { color: '#8B7355' } },
        axisLabel: { color: '#8B7355' },
        splitLine: { lineStyle: { color: '#F5F5DC' } }
      },
      series: [
        {
          name: 'Current Price', type: 'line', data: priceHistory.map(item => item.price),
          smooth: true, lineStyle: { color: '#90EE90', width: 2 }, itemStyle: { color: '#90EE90' },
          areaStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(144, 238, 144, 0.3)' },
                { offset: 1, color: 'rgba(144, 238, 144, 0.05)' }
              ]
            }
          }
        },
        {
          name: 'TWAP', type: 'line', data: priceHistory.map(() => Number(riskData.twapPrice) / 1_000_000),
          lineStyle: { color: '#DAA520', width: 2, type: 'dashed' }, itemStyle: { color: '#DAA520' }
        }
      ],
      tooltip: {
        trigger: 'axis', backgroundColor: 'rgba(139, 115, 85, 0.9)', borderColor: '#8B7355',
        textStyle: { color: '#fff' },
        formatter: function(params: any) {
          let result = `Time: ${params[0].axisValue}<br/>`;
          params.forEach((param: any) => {
            result += `${param.seriesName}: $${param.value.toFixed(6)}<br/>`;
          });
          return result;
        }
      },
      legend: { data: [tokenId ? 'NFT Price' : 'Current Price', ...(tokenId ? [] : ['TWAP'])], textStyle: { color: '#8B7355' }, top: 10 }
    };
  };

  const volatilityLevel = Number(riskData.volatility);
  const volatilityColor = volatilityLevel < 50 ? '#90EE90' : volatilityLevel < 200 ? '#DAA520' : '#CD853F';
  const priceDiff = Number(riskData.currentPrice) - Number(riskData.twapPrice);
  const priceDiffPercent = Number(riskData.twapPrice) > 0 ? (priceDiff / Number(riskData.twapPrice)) * 100 : 0;

  return (
    <div className="section">
      <div className="section-title">⚡ Risk Monitoring Dashboard</div>
      <div className="card-grid">
        <div className="stat-card">
          <div className="stat-label">Current Price</div>
          <div className="stat-value">${(Number(riskData.currentPrice) / 1_000_000).toFixed(6)}</div>
          <div className={`stat-change ${priceDiffPercent >= 0 ? 'positive' : 'negative'}`}>
            {priceDiffPercent >= 0 ? '↗' : '↘'} {Math.abs(priceDiffPercent).toFixed(2)}% vs TWAP
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TWAP Price</div>
          <div className="stat-value">${(Number(riskData.twapPrice) / 1_000_000).toFixed(6)}</div>
          <div className="stat-change">Time-weighted average</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Volatility</div>
          <div className="stat-value" style={{ color: volatilityColor }}>
            {(volatilityLevel / 10).toFixed(1)}%
          </div>
          <div className="stat-change">Price stability indicator</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Risk Evaluation</div>
          <div className="stat-value">
            {riskData.evaluationActive ? 
              <span style={{ color: 'var(--success)' }}>Active</span> :
              <span style={{ color: 'var(--warning)' }}>Inactive</span>
            }
          </div>
          <div className="stat-change">ASC Status</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">High Risk Positions</div>
          <div className="stat-value">
            {riskData.highRiskPositions ? riskData.highRiskPositions.split(',').length : 0}
          </div>
          <div className="stat-change">Positions at risk</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Update</div>
          <div className="stat-value">
            {Number(riskData.lastUpdate) > 0 ? new Date(Number(riskData.lastUpdate) * 1000).toLocaleTimeString() : 'Never'}
          </div>
          <div className="stat-change">Oracle timestamp</div>
        </div>
      </div>
      <div className="chart-container" style={{ height: '450px' }}>
        <h3 style={{ marginBottom: '20px', color: 'var(--text)' }}>Price Monitoring</h3>
        {priceHistory.length > 0 ? (
          <ReactECharts 
            option={getChartOption()} 
            style={{ height: '380px', width: '100%' }}
            theme="dark"
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '350px', color: 'var(--text-secondary)'}}>
            Waiting for price data...
          </div>
        )}
      </div>
      <div className="card-grid" style={{ marginTop: '30px' }}>
        <div className="stat-card">
          <div className="section-title">🎯 Risk Assessment Model</div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            <div style={{ marginBottom: '15px' }}>
              <strong style={{ color: 'var(--primary)' }}>Dynamic LTV Calculation:</strong>
              <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
                <li>PD ≤ 1%: LTV up to 80%</li>
                <li>PD ≤ 5%: LTV up to 75%</li>
                <li>PD ≤ 10%: LTV up to 70%</li>
                <li>PD ≤ 20%: LTV up to 65%</li>
                <li>PD {'>'} 20%: LTV up to 60%</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: 'var(--secondary)' }}>Liquidation Triggers:</strong>
              <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
                <li>LTV exceeds 110% of maximum allowed</li>
                <li>Significant price volatility detected</li>
                <li>Risk evaluation every ~1 hour via ASC</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="section-title">🔄 Autonomous Operations</div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            <div style={{ marginBottom: '15px' }}>
              <strong style={{ color: 'var(--primary)' }}>Interest Accrual:</strong>
              <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
                <li>Automatic every ~15 minutes</li>
                <li>Rate based on utilization</li>
                <li>Self-executing via deferred calls</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: 'var(--secondary)' }}>Risk Evaluation:</strong>
              <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
                <li>Continuous monitoring every ~1 hour</li>
                <li>TWAP price updates from Oracle</li>
                <li>Automatic liquidation triggers</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      {riskData.highRiskPositions && (
        <div className="warning-message" style={{ marginTop: '20px' }}>
          ⚠️ Warning: {riskData.highRiskPositions.split(',').length} position(s) at high risk of liquidation.
          Positions: {riskData.highRiskPositions}
        </div>
      )}
    </div>
  );
}
