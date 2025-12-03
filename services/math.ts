
import { Candle } from '../types';

/**
 * Calculates Relative Strength Index (RSI)
 */
export const calculateRSI = (data: Candle[], period: number = 14): number[] => {
  const rsiArray: number[] = new Array(data.length).fill(0);
  
  if (data.length < period + 1) return rsiArray;

  let gains = 0;
  let losses = 0;

  // Initial SMA
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsiArray[period] = 100 - (100 / (1 + (avgGain / (avgLoss === 0 ? 1 : avgLoss))));

  // Smoothed averages
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;

    if (avgLoss === 0) {
      rsiArray[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsiArray[i] = 100 - (100 / (1 + rs));
    }
  }

  return rsiArray;
};

/**
 * Calculates Exponential Moving Average (EMA)
 */
export const calculateEMA = (data: Candle[], period: number): number[] => {
    const k = 2 / (period + 1);
    const emaArray = new Array(data.length).fill(0);
    
    if (data.length < period) return emaArray;

    // Start with SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += data[i].close;
    }
    emaArray[period - 1] = sum / period;

    // Calculate EMAs
    for (let i = period; i < data.length; i++) {
        emaArray[i] = (data[i].close * k) + (emaArray[i - 1] * (1 - k));
    }

    return emaArray;
}

/**
 * Calculates Average True Range (ATR)
 */
export const calculateATR = (data: Candle[], period: number = 14): number[] => {
  const atrArray: number[] = new Array(data.length).fill(0);
  const trArray: number[] = new Array(data.length).fill(0);

  if (data.length < period) return atrArray;

  // Calculate True Range
  trArray[0] = data[0].high - data[0].low;
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    
    trArray[i] = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
  }

  // First ATR is SMA of TR
  let sumTR = 0;
  for (let i = 0; i < period; i++) {
    sumTR += trArray[i];
  }
  atrArray[period - 1] = sumTR / period;

  // Subsequent ATR (Wilder's Smoothing)
  for (let i = period; i < data.length; i++) {
    atrArray[i] = ((atrArray[i - 1] * (period - 1)) + trArray[i]) / period;
  }

  return atrArray;
};

/**
 * Calculates Nadaraya-Watson Envelope (Endpoint Estimation)
 */
export const calculateNadarayaWatson = (data: Candle[], bandwidth: number = 50, multiplier: number = 3): { mid: number[], upper: number[], lower: number[] } => {
  const n = data.length;
  const mid = new Array(n).fill(0);
  const upper = new Array(n).fill(0);
  const lower = new Array(n).fill(0);

  // We need enough data to form a window
  const lookback = Math.min(500, n); 

  for (let i = 0; i < n; i++) {
    if (i < 10) { 
        mid[i] = data[i].close;
        upper[i] = data[i].close * 1.01;
        lower[i] = data[i].close * 0.99;
        continue;
    }

    let sumWeights = 0;
    let sumWeightedClose = 0;
    let sumWeightedDiff = 0;

    const startJ = Math.max(0, i - lookback);
    
    for (let j = startJ; j <= i; j++) {
      const distance = i - j;
      const weight = Math.exp(-(distance * distance) / (2 * bandwidth * bandwidth));
      
      sumWeights += weight;
      sumWeightedClose += data[j].close * weight;
    }

    const yHat = sumWeightedClose / sumWeights;
    mid[i] = yHat;

    for (let j = startJ; j <= i; j++) {
        const distance = i - j;
        const weight = Math.exp(-(distance * distance) / (2 * bandwidth * bandwidth));
        sumWeightedDiff += weight * Math.abs(data[j].close - yHat);
    }
    
    const mae = sumWeightedDiff / sumWeights;
    upper[i] = yHat + (multiplier * mae);
    lower[i] = yHat - (multiplier * mae);
  }

  return { mid, upper, lower };
};

/**
 * Process a candle array and attach all indicators
 */
export const processIndicators = (candles: Candle[]): Candle[] => {
    // Scalper Params
    const RSI_PERIOD = 14;
    const ATR_PERIOD = 14;
    const NW_BANDWIDTH = 20; 
    const NW_MULT = 3.0;

    // Vegas Params
    const EMA_FAST = 12;
    const EMA_TUNNEL_1 = 144;
    const EMA_TUNNEL_2 = 169;

    const rsi = calculateRSI(candles, RSI_PERIOD);
    const atr = calculateATR(candles, ATR_PERIOD);
    const nw = calculateNadarayaWatson(candles, NW_BANDWIDTH, NW_MULT);
    
    const ema12 = calculateEMA(candles, EMA_FAST);
    const ema144 = calculateEMA(candles, EMA_TUNNEL_1);
    const ema169 = calculateEMA(candles, EMA_TUNNEL_2);

    return candles.map((c, i) => ({
        ...c,
        rsi: rsi[i],
        atr: atr[i],
        nwMid: nw.mid[i],
        nwUpper: nw.upper[i],
        nwLower: nw.lower[i],
        ema12: ema12[i],
        ema144: ema144[i],
        ema169: ema169[i],
    }));
};
