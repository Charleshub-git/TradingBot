
import React from 'react';
import { BotStatus, Trade, Candle, Strategy } from '../types';
import { Activity, DollarSign, Clock, Zap } from 'lucide-react';

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
    <div className="grid grid-cols-2 gap-2">
      {/* Status Card - Compact */}
      <div className="bg-gray-900 border border-gray-800 rounded-md p-2.5 flex flex-col justify-between col-span-1">
        <div className="flex items-center gap-1.5 text-gray-400 mb-1">
          <Activity size={12} />
          <span className="text-[10px] uppercase font-bold tracking-wider">Status</span>
        </div>
        <div className={`text-sm font-bold truncate ${getStatusColor(status)}`}>
          {status.replace('_', ' ')}
        </div>
        <div className="mt-1 text-[10px] text-gray-500 font-mono flex justify-between items-center">
            {strategy === 'SCALPER' ? (
                <>
                   <span>RSI:</span>
                   <span className={`font-bold ${isOverbought ? 'text-red-400' : isOversold ? 'text-green-400' : 'text-gray-300'}`}>
                     {rsi.toFixed(0)}
                   </span>
                </>
            ) : (
                <>
                   <span>Trnd:</span>
                   <span className={`font-bold ${isAboveTunnel ? 'text-green-400' : isBelowTunnel ? 'text-red-400' : 'text-gray-300'}`}>
                     {isAboveTunnel ? '↑' : isBelowTunnel ? '↓' : '-'}
                   </span>
                </>
            )}
        </div>
      </div>

      {/* PnL Card - Compact */}
      <div className="bg-gray-900 border border-gray-800 rounded-md p-2.5 flex flex-col justify-between col-span-1">
        <div className="flex items-center gap-1.5 text-gray-400 mb-1">
          <DollarSign size={12} />
          <span className="text-[10px] uppercase font-bold tracking-wider">PnL</span>
        </div>
        <div className={`text-sm font-bold truncate ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
        </div>
        <div className="mt-1 text-[10px] text-gray-500 font-mono">
          ATR: {(lastCandle.atr || 0).toFixed(1)}
        </div>
      </div>

      {/* Signal Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-md p-2.5 col-span-2">
         <div className="flex items-center gap-1.5 text-gray-400 mb-2">
          <Zap size={12} />
          <span className="text-[10px] uppercase font-bold tracking-wider">Logic: {strategy === 'SCALPER' ? 'Reversal' : 'Tunnel'}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {strategy === 'SCALPER' ? (
                <>
                    <div className={`text-[10px] flex justify-between items-center ${isAboveBand ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                        <span>P &gt; Top</span>
                        <span>{isAboveBand ? 'YES' : 'NO'}</span>
                    </div>
                    <div className={`text-[10px] flex justify-between items-center ${isBelowBand ? 'text-green-400 font-bold' : 'text-gray-500'}`}>
                        <span>P &lt; Bot</span>
                        <span>{isBelowBand ? 'YES' : 'NO'}</span>
                    </div>
                    <div className={`text-[10px] flex justify-between items-center col-span-2 ${isOverbought ? 'text-red-400 font-bold' : isOversold ? 'text-green-400 font-bold' : 'text-gray-500'}`}>
                        <span>RSI Extreme ({rsi.toFixed(0)})</span>
                        <span>{isOverbought ? '>70' : isOversold ? '<30' : 'OK'}</span>
                    </div>
                </>
            ) : (
                <>
                    <div className={`text-[10px] flex justify-between items-center ${ema12 > ema169 ? 'text-green-400 font-bold' : 'text-gray-500'}`}>
                        <span>12 &gt; Tun</span>
                        <span>{ema12 > ema169 ? 'YES' : 'NO'}</span>
                    </div>
                    <div className={`text-[10px] flex justify-between items-center ${ema12 < ema144 ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                        <span>12 &lt; Tun</span>
                        <span>{ema12 < ema144 ? 'YES' : 'NO'}</span>
                    </div>
                     <div className={`text-[10px] flex justify-between items-center col-span-2 text-gray-500`}>
                        <span>Vol Filter</span>
                        <span>{(lastCandle.atr || 0) > 50 ? 'PASS' : 'LOW'}</span>
                    </div>
                </>
            )}
        </div>
      </div>

      {/* Active Position Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-md p-2.5 col-span-2 relative overflow-hidden min-h-[80px]">
        {activeTrade && (
            <div className={`absolute top-0 left-0 w-0.5 h-full ${activeTrade.type === 'LONG' ? 'bg-green-500' : 'bg-red-500'}`}></div>
        )}
        <div className="flex items-center gap-1.5 text-gray-400 mb-2">
          <Clock size={12} />
          <span className="text-[10px] uppercase font-bold tracking-wider">Active Trade</span>
        </div>
        {activeTrade ? (
            <div>
                <div className="flex justify-between items-baseline mb-1">
                     <span className={`text-sm font-bold ${activeTrade.type === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>{activeTrade.type}</span>
                     <span className="text-[10px] text-gray-400 font-mono">{activeTrade.id}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                    <div className="flex flex-col">
                        <span className="text-[9px] text-gray-500">ENTRY</span>
                        <span className="text-[10px] text-gray-200">{activeTrade.entryPrice.toFixed(1)}</span>
                    </div>
                    <div className="flex flex-col text-right">
                        <span className="text-[9px] text-gray-500">TP</span>
                        <span className="text-[10px] text-green-300">{activeTrade.takeProfitPrice.toFixed(1)}</span>
                    </div>
                    <div className="flex flex-col text-right">
                        <span className="text-[9px] text-gray-500">SL</span>
                        <span className="text-[10px] text-red-300">{activeTrade.stopLossPrice.toFixed(1)}</span>
                    </div>
                </div>
            </div>
        ) : (
            <div className="h-full flex items-center justify-center text-gray-700 italic text-[10px] py-2">
                Scanning for setups...
            </div>
        )}
      </div>
    </div>
  );
};

export default StatsPanel;
