
import { Candle, DataSource } from '../types';

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

interface FetchConfig {
    alpacaKey?: string;
    alpacaSecret?: string;
    fmpKey?: string;
}

export const fetchHistoricalData = async (
    symbol: string = 'BTCUSDT', 
    interval: string = '5m', 
    limit: number = 1000,
    source: DataSource = 'BINANCE',
    config: FetchConfig = {}
): Promise<Candle[]> => {
  try {
    let url = '';
    let headers: Record<string, string> = {};

    if (source === 'ALPACA') {
        // Alpaca Crypto Bars
        // Symbol format: BTC/USD
        const alpacaSymbol = symbol.replace('USDT', '/USD'); 
        url = `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${alpacaSymbol}&timeframe=5Min&limit=${limit}&sort=desc`;
        headers = {
            'APCA-API-KEY-ID': config.alpacaKey || '',
            'APCA-API-SECRET-KEY': config.alpacaSecret || '',
            'accept': 'application/json'
        };

        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`Alpaca API Error: ${response.statusText}`);
        
        const data = await response.json();
        const bars = data.bars?.[alpacaSymbol] || [];
        
        // Alpaca returns descending if sorted, or ascending. Usually easier to just sort manually.
        // Format: { t, o, h, l, c, v }
        return bars.reverse().map((b: any) => ({
            time: new Date(b.t).getTime(),
            open: b.o,
            high: b.h,
            low: b.l,
            close: b.c,
            volume: b.v
        })).sort((a: Candle, b: Candle) => a.time - b.time);

    } else if (source === 'FMP') {
        // Financial Modeling Prep
        // Symbol format: BTCUSD (usually)
        const fmpSymbol = symbol.replace('USDT', 'USD');
        // FMP historical chart endpoint
        // https://financialmodelingprep.com/api/v3/historical-chart/5min/BTCUSD?apikey=...
        url = `https://financialmodelingprep.com/api/v3/historical-chart/5min/${fmpSymbol}?apikey=${config.fmpKey}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`FMP API Error: ${response.statusText}`);
        
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Invalid FMP Data Format");

        // FMP returns data newest first [ { date, open, low, high, close, volume }, ... ]
        return data.map((d: any) => ({
            time: new Date(d.date).getTime(),
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume
        })).reverse(); // Reverse to get oldest first for chart

    } else {
        // Default: BINANCE
        url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Binance API Error: ${response.statusText}`);
        
        const rawData = await response.json();
        return rawData.map((d: any[]) => ({
          time: d[0],
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
          volume: parseFloat(d[5])
        }));
    }

  } catch (error) {
    console.warn(`${source} API unreachable or error. Using generator fallback.`, error);
    return [];
  }
};
