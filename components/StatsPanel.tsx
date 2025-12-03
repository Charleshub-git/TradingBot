import React from 'react';
import { BotStatus, Trade, Candle } from '../types';
import { TrendingUp, TrendingDown, Activity, DollarSign, Clock } from 'lucide-react';

interface StatsPanelProps {
  status: BotStatus;
  lastCandle: Candle;
  activeTrade: Trade | null;
  pnl: number;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ status, lastCandle, activeTrade, pnl }) => {
  const isBullish = (lastCandle.ema12 || 0) > (lastCandle.ema144 || 0) && (lastCandle.ema144 || 0) > (lastCandle.ema576 || 0);
  const isBearish = (lastCandle.ema12 || 0) < (lastCandle.ema144 || 0) && (lastCandle.ema144 || 0) < (lastCandle.ema576 || 0);

  const getStatusColor = (s: BotStatus) => {
    switch (s) {
      case BotStatus.IN_POSITION: return 'text-green-400';
      case BotStatus.SCANNING: return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      {/* Status Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <Activity size={16} />
          <span className="text-xs uppercase font-bold">Bot Status</span>
        </div>
        <div className={`text-2xl font-bold ${getStatusColor(status)}`}>
          {status.replace('_', ' ')}
        </div>
        <div className="mt-2 text-xs text-gray-500">
           Last Price: <span className="text-gray-200">${lastCandle.close.toFixed(2)}</span>
        </div>
      </div>

      {/* PnL Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <DollarSign size={16} />
          <span className="text-xs uppercase font-bold">Total PnL</span>
        </div>
        <div className={`text-2xl font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} USDT
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Risk per Trade: 1.0%
        </div>
      </div>

      {/* Trend Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col justify-between">
         <div className="flex items-center gap-2 text-gray-400 mb-2">
          {isBullish ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <span className="text-xs uppercase font-bold">Market Regime</span>
        </div>
        <div className="text-lg font-bold text-gray-200">
            {isBullish ? "FULL BULLISH" : isBearish ? "FULL BEARISH" : "CHOPPY / RANGING"}
        </div>
        <div className="mt-1 text-xs text-gray-500">
          Aligned: 12 {'>'} 144 {'>'} 576
        </div>
      </div>

      {/* Active Position Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col justify-between relative overflow-hidden">
        {activeTrade && (
            <div className="absolute top-0 left-0 w-1 h-full bg-green-500 animate-pulse"></div>
        )}
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <Clock size={16} />
          <span className="text-xs uppercase font-bold">Active Trade</span>
        </div>
        {activeTrade ? (
            <div>
                <div className="text-lg font-bold text-green-400">{activeTrade.type}</div>
                <div className="text-xs text-gray-400">Entry: ${activeTrade.entryPrice.toFixed(2)}</div>
                <div className="text-xs text-gray-400">Target: ${(activeTrade.entryPrice * 1.05).toFixed(2)}</div>
            </div>
        ) : (
            <div className="text-gray-600 italic">No active positions</div>
        )}
      </div>
    </div>
  );
};

export default StatsPanel;