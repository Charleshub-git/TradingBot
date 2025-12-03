import { Candle } from '../types';

/**
 * Calculates Exponential Moving Average (EMA) for a dataset
 */
export const calculateEMA = (data: Candle[], period: number): number[] => {
  const k = 2 / (period + 1);
  const emaArray: number[] = new Array(data.length).fill(0);
  
  // Simple MA for the first point
  let sum = 0;
  for (let i = 0; i < period && i < data.length; i++) {
    sum += data[i].close;
  }
  
  if (data.length < period) return emaArray;

  emaArray[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    emaArray[i] = (data[i].close * k) + (emaArray[i - 1] * (1 - k));
  }

  return emaArray;
};

/**
 * Calculates Volume Oscillator (Simplified for simulation: (ShortSMA - LongSMA) / LongSMA * 100)
 */
export const calculateVolumeOsc = (data: Candle[], shortPeriod: number = 1, longPeriod: number = 14): number[] => {
    const oscArray: number[] = new Array(data.length).fill(0);
    
    // Helper for SMA
    const getSMA = (idx: number, p: number) => {
        if (idx < p - 1) return 0;
        let s = 0;
        for (let j = 0; j < p; j++) s += data[idx - j].volume;
        return s / p;
    };

    for (let i = 0; i < data.length; i++) {
        const shortSMA = getSMA(i, shortPeriod);
        const longSMA = getSMA(i, longPeriod);
        
        if (longSMA !== 0) {
            oscArray[i] = ((shortSMA - longSMA) / longSMA) * 100;
        }
    }
    return oscArray;
};

/**
 * Process a candle array and attach indicators
 */
export const processIndicators = (candles: Candle[]): Candle[] => {
    const ema12 = calculateEMA(candles, 12);
    const ema144 = calculateEMA(candles, 144);
    const ema169 = calculateEMA(candles, 169);
    const ema576 = calculateEMA(candles, 576);
    const ema676 = calculateEMA(candles, 676);
    const volOsc = calculateVolumeOsc(candles, 1, 14);

    return candles.map((c, i) => ({
        ...c,
        ema12: ema12[i] || undefined,
        ema144: ema144[i] || undefined,
        ema169: ema169[i] || undefined,
        ema576: ema576[i] || undefined,
        ema676: ema676[i] || undefined,
        volOsc: volOsc[i] || 0
    }));
};