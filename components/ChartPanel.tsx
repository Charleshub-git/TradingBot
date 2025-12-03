import React from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { Candle } from '../types';

interface ChartPanelProps {
  data: Candle[];
}

const ChartPanel: React.FC<ChartPanelProps> = ({ data }) => {
  // We take the last 150 candles for performance and visibility
  const visibleData = data.slice(-150);
  
  const minPrice = visibleData.length > 0 ? Math.min(...visibleData.map(d => d.low)) : 0;
  const maxPrice = visibleData.length > 0 ? Math.max(...visibleData.map(d => d.high)) : 100;
  const domain = [minPrice - (minPrice * 0.005), maxPrice + (maxPrice * 0.005)];

  return (
    <div className="w-full h-full bg-gray-900 rounded-lg p-4 border border-gray-800 flex flex-col">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-gray-300 text-sm font-semibold uppercase tracking-wider">BTC/USDT 15m • Vegas Tunnel</h2>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-400 rounded-full"></span> EMA 12</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 bg-teal-300 rounded-full"></span> Tunnel (144/169)</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded-full"></span> Trend (576/676)</div>
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
              formatter={(value: any) => [String(Number(value).toFixed(2)), "Price"]}
            />
            
            {/* Price Line (Close) - keeping it simple vs Candle bars for cleaner EMA visibility */}
            <Line type="monotone" dataKey="close" stroke="#cbd5e0" dot={false} strokeWidth={1} isAnimationActive={false} />

            {/* EMA Group A: Vegas Tunnel */}
            <Line type="monotone" dataKey="ema144" stroke="#4fd1c5" dot={false} strokeWidth={2} strokeOpacity={0.8} isAnimationActive={false} />
            <Line type="monotone" dataKey="ema169" stroke="#4fd1c5" dot={false} strokeWidth={2} strokeOpacity={0.8} isAnimationActive={false} />

            {/* EMA Group B: Long Term Trend */}
            <Line type="monotone" dataKey="ema576" stroke="#f56565" dot={false} strokeWidth={2} strokeOpacity={0.6} isAnimationActive={false} />
            <Line type="monotone" dataKey="ema676" stroke="#f56565" dot={false} strokeWidth={2} strokeOpacity={0.6} isAnimationActive={false} />

            {/* EMA Group C: Short Term */}
            <Line type="monotone" dataKey="ema12" stroke="#ecc94b" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ChartPanel;