import { Candle } from '../types';

export const generateInitialData = (count: number = 1000): Candle[] => {
  let price = 42000;
  let time = new Date().getTime() - (count * 15 * 60 * 1000);
  const candles: Candle[] = [];

  // Random walk with trend bias
  let trend = 1;
  let trendDuration = 0;

  for (let i = 0; i < count; i++) {
    // Change trend occasionally
    if (trendDuration <= 0) {
        trend = Math.random() > 0.5 ? 1 : -1;
        trendDuration = Math.floor(Math.random() * 100) + 50; 
    }
    trendDuration--;

    const volatility = price * 0.005; // 0.5% volatility
    const change = (Math.random() - 0.5 + (trend * 0.02)) * volatility;
    
    const close = price + change;
    const open = price;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.random() * 1000 + 500;

    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume
    });

    price = close;
    time += 15 * 60 * 1000; // 15 minutes
  }

  return candles;
};

export const generateNextCandle = (prev: Candle): Candle => {
    const volatility = prev.close * 0.004;
    // Slight bias to continue previous move
    const momentum = (prev.close - prev.open) * 0.2; 
    
    const change = (Math.random() - 0.5) * volatility + momentum;
    const close = prev.close + change;
    const open = prev.close; // Gapless
    const high = Math.max(open, close) + Math.random() * volatility * 0.4;
    const low = Math.min(open, close) - Math.random() * volatility * 0.4;
    
    return {
        time: prev.time + 15 * 60 * 1000,
        open,
        high,
        low,
        close,
        volume: Math.random() * 1500 + 200
    };
};

export const fetchHistoricalData = async (symbol: string = 'BTCUSDT', interval: string = '15m', limit: number = 1000): Promise<Candle[]> => {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    
    if (!response.ok) {
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
    console.error("Failed to fetch real data, falling back to generator.", error);
    // Fallback to generated data if API fails
    return generateInitialData(limit);
  }
};