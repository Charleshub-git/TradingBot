
import React from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import { Candle, Strategy } from '../types';

interface ChartPanelProps {
  data: Candle[];
  strategy: Strategy;
}

const ChartPanel: React.FC<ChartPanelProps> = ({ data, strategy }) => {
  // We take the last 150 candles for performance and visibility
  const visibleData = data.slice(-150);
  
  const minPrice = visibleData.length > 0 ? Math.min(...visibleData.map(d => d.low)) : 0;
  const maxPrice = visibleData.length > 0 ? Math.max(...visibleData.map(d => d.high)) : 100;
  const padding = (maxPrice - minPrice) * 0.1;
  const domain = [minPrice - padding, maxPrice + padding];

  return (
    <div className="w-full h-full bg-gray-900 rounded-lg p-4 border border-gray-800 flex flex-col">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-gray-300 text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
            BTC/USDT 5m • 
            <span className={strategy === 'SCALPER' ? 'text-blue-400' : 'text-purple-400'}>
                {strategy === 'SCALPER' ? 'NW Envelope + RSI' : 'Vegas Tunnel'}
            </span>
        </h2>
        <div className="flex gap-4 text-xs">
          {strategy === 'SCALPER' ? (
              <>
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500/50 rounded-full"></span> Top Band</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-full"></span> Midline</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500/50 rounded-full"></span> Bot Band</div>
              </>
          ) : (
              <>
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-500 rounded-full"></span> EMA 12</div>
                <div className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-500 rounded-full"></span> Tunnel (144/169)</div>
              </>
          )}
        </div>
      </div>
      
      <div className="flex-grow min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visibleData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
            <XAxis 
              dataKey="time" 
              tickFormatter={(tick) => {
                  try {
                      return format(new Date(tick), 'HH:mm');
                  } catch (e) { return ''; }
              }}
              stroke="#718096"
              minTickGap={30}
            />
            <YAxis 
              domain={domain} 
              stroke="#718096" 
              tickFormatter={(val) => Number(val).toFixed(0)}
              width={60}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1a202c', borderColor: '#4a5568', color: '#e2e8f0' }}
              labelFormatter={(label) => {
                  try {
                      return format(new Date(label), 'MMM dd HH:mm');
                  } catch (e) { return ''; }
              }}
              formatter={(value: any, name: string) => [Number(value).toFixed(2), name === 'close' ? 'Price' : name]}
            />
            
            {/* Price Line */}
            <Line type="monotone" dataKey="close" stroke="#cbd5e0" dot={false} strokeWidth={2} isAnimationActive={false} />

            {/* Scalper Lines */}
            {strategy === 'SCALPER' && (
                <>
                    <Line type="basis" dataKey="nwUpper" stroke="#ef4444" strokeDasharray="5 5" dot={false} strokeWidth={2} isAnimationActive={false} />
                    <Line type="basis" dataKey="nwMid" stroke="#3b82f6" dot={false} strokeWidth={1} strokeOpacity={0.5} isAnimationActive={false} />
                    <Line type="basis" dataKey="nwLower" stroke="#22c55e" strokeDasharray="5 5" dot={false} strokeWidth={2} isAnimationActive={false} />
                </>
            )}

            {/* Vegas Lines */}
            {strategy === 'VEGAS' && (
                <>
                    <Line type="monotone" dataKey="ema12" stroke="#eab308" dot={false} strokeWidth={2} isAnimationActive={false} />
                    <Line type="monotone" dataKey="ema144" stroke="#a855f7" strokeDasharray="3 3" dot={false} strokeWidth={2} isAnimationActive={false} />
                    <Line type="monotone" dataKey="ema169" stroke="#c084fc" strokeDasharray="3 3" dot={false} strokeWidth={2} isAnimationActive={false} />
                </>
            )}
            
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ChartPanel;
