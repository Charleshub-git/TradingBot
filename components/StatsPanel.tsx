
import React from 'react';
import { BotStatus, Trade, Candle, Strategy } from '../types';
import { Activity, DollarSign, Clock, Zap, BarChart2 } from 'lucide-react';

interface StatsPanelProps {
  status: BotStatus;
  lastCandle: Candle;
  activeTrade: Trade | null;
  pnl: number;
  strategy: Strategy;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ status, lastCandle, activeTrade, pnl, strategy }) => {
  
  // Scalper Variables
  const rsi = lastCandle.rsi || 50;
  const isOverbought = rsi > 70;
  const isOversold = rsi < 30;
  const isBelowBand = lastCandle.close < (lastCandle.nwLower || 0);
  const isAboveBand = lastCandle.close > (lastCandle.nwUpper || 0);

  // Vegas Variables
  const price = lastCandle.close;
  const ema12 = lastCandle.ema12 || 0;
  const ema144 = lastCandle.ema144 || 0;
  const ema169 = lastCandle.ema169 || 0;
  const isAboveTunnel = price > ema144 && price > ema169;
  const isBelowTunnel = price < ema144 && price < ema169;

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
        <div className="mt-2 text-xs text-gray-500 flex justify-between">
            {strategy === 'SCALPER' ? (
                <>
                   <span>RSI (14):</span>
                   <span className={`font-mono font-bold ${isOverbought ? 'text-red-400' : isOversold ? 'text-green-400' : 'text-gray-200'}`}>
                     {rsi.toFixed(1)}
                   </span>
                </>
            ) : (
                <>
                   <span>Trend:</span>
                   <span className={`font-mono font-bold ${isAboveTunnel ? 'text-green-400' : isBelowTunnel ? 'text-red-400' : 'text-gray-400'}`}>
                     {isAboveTunnel ? 'BULL' : isBelowTunnel ? 'BEAR' : 'NEUTRAL'}
                   </span>
                </>
            )}
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
          Risk: ATR {(lastCandle.atr || 0).toFixed(2)}
        </div>
      </div>

      {/* Signal Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col justify-between">
         <div className="flex items-center gap-2 text-gray-400 mb-2">
          <Zap size={16} />
          <span className="text-xs uppercase font-bold">{strategy === 'SCALPER' ? 'Reversal Logic' : 'Tunnel Logic'}</span>
        </div>
        <div className="flex flex-col gap-1">
            {strategy === 'SCALPER' ? (
                <>
                    <div className={`text-xs flex justify-between ${isAboveBand ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                        <span>Price {'>'} Top Band</span>
                        <span>{isAboveBand ? 'YES' : 'NO'}</span>
                    </div>
                    <div className={`text-xs flex justify-between ${isBelowBand ? 'text-green-400 font-bold' : 'text-gray-500'}`}>
                        <span>Price {'<'} Bot Band</span>
                        <span>{isBelowBand ? 'YES' : 'NO'}</span>
                    </div>
                    <div className="h-px bg-gray-800 my-1"></div>
                    <div className={`text-xs flex justify-between ${isOverbought ? 'text-red-400 font-bold' : isOversold ? 'text-green-400 font-bold' : 'text-gray-500'}`}>
                        <span>RSI Extreme</span>
                        <span>{isOverbought ? '>70' : isOversold ? '<30' : '-'}</span>
                    </div>
                </>
            ) : (
                <>
                    <div className={`text-xs flex justify-between ${ema12 > ema169 ? 'text-green-400 font-bold' : 'text-gray-500'}`}>
                        <span>EMA12 {'>'} Tunnel</span>
                        <span>{ema12 > ema169 ? 'YES' : 'NO'}</span>
                    </div>
                    <div className={`text-xs flex justify-between ${ema12 < ema144 ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                        <span>EMA12 {'<'} Tunnel</span>
                        <span>{ema12 < ema144 ? 'YES' : 'NO'}</span>
                    </div>
                    <div className="h-px bg-gray-800 my-1"></div>
                     <div className={`text-xs flex justify-between text-gray-500`}>
                        <span>Vol Filter</span>
                        <span>{(lastCandle.atr || 0) > 50 ? 'OK' : 'LOW'}</span>
                    </div>
                </>
            )}
        </div>
      </div>

      {/* Active Position Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col justify-between relative overflow-hidden">
        {activeTrade && (
            <div className={`absolute top-0 left-0 w-1 h-full animate-pulse ${activeTrade.type === 'LONG' ? 'bg-green-500' : 'bg-red-500'}`}></div>
        )}
        <div className="flex items-center gap-2 text-gray-400 mb-2">
          <Clock size={16} />
          <span className="text-xs uppercase font-bold">Active Trade</span>
        </div>
        {activeTrade ? (
            <div>
                <div className={`text-lg font-bold ${activeTrade.type === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>{activeTrade.type}</div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1">
                    <div className="text-[10px] text-gray-400">Entry</div>
                    <div className="text-[10px] text-right text-gray-200">{activeTrade.entryPrice.toFixed(2)}</div>
                    
                    <div className="text-[10px] text-gray-400">TP</div>
                    <div className="text-[10px] text-right text-green-300">{activeTrade.takeProfitPrice.toFixed(2)}</div>
                    
                    <div className="text-[10px] text-gray-400">SL</div>
                    <div className="text-[10px] text-right text-red-300">{activeTrade.stopLossPrice.toFixed(2)}</div>
                </div>
            </div>
        ) : (
            <div className="text-gray-600 italic text-sm mt-2">No active positions</div>
        )}
      </div>
    </div>
  );
};

export default StatsPanel;
