import { Candle } from '../types';

export const generateInitialData = (count: number = 1000): Candle[] => {
  let price = 65000;
  let time = new Date().getTime() - (count * 5 * 60 * 1000); // 5m intervals
  const candles: Candle[] = [];

  // Random walk with mean reversion tendencies
  let trend = 1;
  let trendDuration = 0;

  for (let i = 0; i < count; i++) {
    // Shorter trends for scalping sim
    if (trendDuration <= 0) {
        trend = Math.random() > 0.5 ? 1 : -1;
        trendDuration = Math.floor(Math.random() * 20) + 10; 
    }
    trendDuration--;

    const volatility = price * 0.002; // 0.2% volatility per candle
    const change = (Math.random() - 0.5 + (trend * 0.01)) * volatility;
    
    const close = price + change;
    const open = price;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.random() * 100 + 50;

    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume
    });

    price = close;
    time += 5 * 60 * 1000; // 5 minutes
  }

  return candles;
};

export const generateNextCandle = (prev: Candle): Candle => {
    const volatility = prev.close * 0.002;
    const momentum = (prev.close - prev.open) * 0.1; 
    
    const change = (Math.random() - 0.5) * volatility + momentum;
    const close = prev.close + change;
    const open = prev.close; 
    const high = Math.max(open, close) + Math.random() * volatility * 0.4;
    const low = Math.min(open, close) - Math.random() * volatility * 0.4;
    
    return {
        time: prev.time + 5 * 60 * 1000,
        open,
        high,
        low,
        close,
        volume: Math.random() * 150 + 20
    };
};

export const fetchHistoricalData = async (symbol: string = 'BTCUSDT', interval: string = '5m', limit: number = 1000): Promise<Candle[]> => {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    
    if (!response.ok) {
        // Silently throw to trigger catch block
        throw new Error(`Binance API Error: ${response.statusText}`);
    }

    const rawData = await response.json();

    // Binance format: [openTime, open, high, low, close, volume, ...]
    return rawData.map((d: any[]) => ({
      time: d[0],
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5])
    }));

  } catch (error) {
    // Return empty array to signal fallback needed, without crashing logic
    console.warn("Binance API unreachable (likely firewall/SSL). Using generator.");
    return [];
  }
};