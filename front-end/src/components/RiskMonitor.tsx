import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import * as massa from '@massalabs/massa-web3';
import { useContracts } from '../hooks/useContracts';
import { formatMAS, formatPercentage } from '../utils/massa';
import { REFRESH_INTERVALS } from '../utils/constants';

interface RiskMonitorProps {
  provider: any;
  addresses: Record<string, string>;
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

export default function RiskMonitor({ provider, addresses }: RiskMonitorProps) {
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

  useEffect(() => {
    refreshData();
    
    const interval = setInterval(refreshData, REFRESH_INTERVALS.FAST);
    return () => clearInterval(interval);
  }, [contracts.oracle, contracts.riskManager]);

  const refreshData = async () => {
    if (!contracts.oracle || !contracts.riskManager) {
      setRiskData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      const [
        priceResult,
        twapResult,
        volatilityResult,
        lastUpdateResult,
        evaluationActiveResult,
        highRiskResult
      ] = await Promise.all([
        contracts.oracle.read('getPrice'),
        contracts.oracle.read('getTwap'),
        contracts.oracle.read('getVolatility'),
        contracts.oracle.read('getLastUpdate'),
        contracts.riskManager.read('isEvaluationActive'),
        contracts.riskManager.read('getHighRiskPositions')
      ]);

      const currentPrice = new massa.Args(priceResult.value).nextU64();
      const twapPrice = new massa.Args(twapResult.value).nextU64();
      const volatility = new massa.Args(volatilityResult.value).nextU64();
      const lastUpdate = new massa.Args(lastUpdateResult.value).nextU64();
      const evaluationActive = new massa.Args(evaluationActiveResult.value).nextString() === 'true';
      const highRiskPositions = new massa.Args(highRiskResult.value).nextString();

      setRiskData({
        currentPrice: currentPrice.toString(),
        twapPrice: twapPrice.toString(),
        volatility: volatility.toString(),
        lastUpdate: lastUpdate.toString(),
        evaluationActive,
        highRiskPositions,
        isLoading: false
      });

      const currentTime = new Date().toLocaleTimeString();
      const price = Number(currentPrice) / 1_000_000;
      
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
      grid: {
        top: 40,
        left: 60,
        right: 40,
        bottom: 60
      },
      xAxis: {
        type: 'category',
        data: priceHistory.map(item => item.time),
        axisLine: { lineStyle: { color: '#666' } },
        axisLabel: { color: '#999', fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        name: 'Price ($)',
        nameTextStyle: { color: '#999' },
        axisLine: { lineStyle: { color: '#666' } },
        axisLabel: { color: '#999' },
        splitLine: { lineStyle: { color: '#333' } }
      },
      series: [
        {
          name: 'Current Price',
          type: 'line',
          data: priceHistory.map(item => item.price),
          smooth: true,
          lineStyle: { color: '#00ff88', width: 2 },
          itemStyle: { color: '#00ff88' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0, 255, 136, 0.3)' },
                { offset: 1, color: 'rgba(0, 255, 136, 0.05)' }
              ]
            }
          }
        },
        {
          name: 'TWAP',
          type: 'line',
          data: priceHistory.map(() => Number(riskData.twapPrice) / 1_000_000),
          lineStyle: { color: '#ff6b00', width: 2, type: 'dashed' },
          itemStyle: { color: '#ff6b00' }
        }
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderColor: '#333',
        textStyle: { color: '#fff' },
        formatter: function(params: any) {
          let result = `Time: ${params[0].axisValue}<br/>`;
          params.forEach((param: any) => {
            result += `${param.seriesName}: $${param.value.toFixed(6)}<br/>`;
          });
          return result;
        }
      },
      legend: {
        data: ['Current Price', 'TWAP'],
        textStyle: { color: '#999' },
        top: 10
      }
    };
  };

  const volatilityLevel = Number(riskData.volatility);
  const volatilityColor = volatilityLevel < 50 ? '#00ff88' : 
                         volatilityLevel < 200 ? '#ffaa00' : '#ff4444';
  
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
          <div className="stat-change">
            Time-weighted average
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Volatility</div>
          <div className="stat-value" style={{ color: volatilityColor }}>
            {(volatilityLevel / 10).toFixed(1)}%
          </div>
          <div className="stat-change">
            Price stability indicator
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Risk Evaluation</div>
          <div className="stat-value">
            {riskData.evaluationActive ? 
              <span style={{ color: 'var(--success)' }}>Active</span> :
              <span style={{ color: 'var(--error)' }}>Inactive</span>
            }
          </div>
          <div className="stat-change">
            ASC Status
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">High Risk Positions</div>
          <div className="stat-value">
            {riskData.highRiskPositions ? riskData.highRiskPositions.split(',').length : 0}
          </div>
          <div className="stat-change">
            Positions at risk
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Last Update</div>
          <div className="stat-value">
            {Number(riskData.lastUpdate) > 0 ? 
              new Date(Number(riskData.lastUpdate) * 1000).toLocaleTimeString() : 
              'Never'
            }
          </div>
          <div className="stat-change">
            Oracle timestamp
          </div>
        </div>
      </div>

      <div className="chart-container">
        <h3 style={{ marginBottom: '20px', color: 'var(--text)' }}>Price Monitoring</h3>
        {priceHistory.length > 0 ? (
          <ReactECharts 
            option={getChartOption()} 
            style={{ height: '100%', width: '100%' }}
            theme="dark"
          />
        ) : (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '300px',
            color: 'var(--text-secondary)'
          }}>
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