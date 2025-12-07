
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

  // Handle division by zero
  if (avgLoss === 0) {
      rsiArray[period] = 100; 
  } else {
      rsiArray[period] = 100 - (100 / (1 + (avgGain / avgLoss)));
  }

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
        const prevEma = emaArray[i - 1];
        if (isNaN(prevEma)) {
            emaArray[i] = data[i].close;
        } else {
            emaArray[i] = (data[i].close * k) + (prevEma * (1 - k));
        }
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
 * Calculates Average Directional Index (ADX)
 */
export const calculateADX = (data: Candle[], period: number = 14): number[] => {
    const adxArray: number[] = new Array(data.length).fill(0);
    if (data.length < period * 2) return adxArray;

    const tr: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];

    // 1. Calculate TR, +DM, -DM
    for (let i = 0; i < data.length; i++) {
        if (i === 0) {
            tr.push(0); plusDM.push(0); minusDM.push(0);
            continue;
        }
        
        const curr = data[i];
        const prev = data[i - 1];

        // TR
        tr.push(Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - prev.close),
            Math.abs(curr.low - prev.close)
        ));

        // DM
        const upMove = curr.high - prev.high;
        const downMove = prev.low - curr.low;

        if (upMove > downMove && upMove > 0) plusDM.push(upMove);
        else plusDM.push(0);

        if (downMove > upMove && downMove > 0) minusDM.push(downMove);
        else minusDM.push(0);
    }

    // 2. Smooth TR, +DM, -DM (Wilder's Smoothing)
    const smoothTR: number[] = new Array(data.length).fill(0);
    const smoothPlusDM: number[] = new Array(data.length).fill(0);
    const smoothMinusDM: number[] = new Array(data.length).fill(0);

    // Initial smoothing (Sum)
    let sumTR = 0, sumPDM = 0, sumMDM = 0;
    for (let i = 1; i <= period; i++) {
        sumTR += tr[i]; sumPDM += plusDM[i]; sumMDM += minusDM[i];
    }
    smoothTR[period] = sumTR;
    smoothPlusDM[period] = sumPDM;
    smoothMinusDM[period] = sumMDM;

    // Subsequent smoothing
    for (let i = period + 1; i < data.length; i++) {
        smoothTR[i] = smoothTR[i - 1] - (smoothTR[i - 1] / period) + tr[i];
        smoothPlusDM[i] = smoothPlusDM[i - 1] - (smoothPlusDM[i - 1] / period) + plusDM[i];
        smoothMinusDM[i] = smoothMinusDM[i - 1] - (smoothMinusDM[i - 1] / period) + minusDM[i];
    }

    // 3. Calculate DX and ADX
    const dx: number[] = new Array(data.length).fill(0);
    
    for (let i = period; i < data.length; i++) {
        const pdi = (smoothPlusDM[i] / smoothTR[i]) * 100;
        const mdi = (smoothMinusDM[i] / smoothTR[i]) * 100;
        
        if (pdi + mdi === 0) dx[i] = 0;
        else dx[i] = (Math.abs(pdi - mdi) / (pdi + mdi)) * 100;
    }

    // ADX is smoothed DX
    // First ADX is average of DX
    let sumDX = 0;
    for (let i = period; i < period * 2; i++) {
        sumDX += dx[i];
    }
    adxArray[period * 2 - 1] = sumDX / period;

    // Subsequent ADX
    for (let i = period * 2; i < data.length; i++) {
        adxArray[i] = ((adxArray[i - 1] * (period - 1)) + dx[i]) / period;
    }

    return adxArray;
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
      // Protect against NaN/Infinite weights
      const weight = Math.exp(-(distance * distance) / (2 * bandwidth * bandwidth));
      
      sumWeights += weight;
      sumWeightedClose += data[j].close * weight;
    }

    // Safety against division by zero
    const yHat = sumWeights > 0 ? (sumWeightedClose / sumWeights) : data[i].close;
    mid[i] = yHat;

    for (let j = startJ; j <= i; j++) {
        const distance = i - j;
        const weight = Math.exp(-(distance * distance) / (2 * bandwidth * bandwidth));
        sumWeightedDiff += weight * Math.abs(data[j].close - yHat);
    }
    
    const mae = sumWeights > 0 ? (sumWeightedDiff / sumWeights) : 0;
    upper[i] = yHat + (multiplier * mae);
    lower[i] = yHat - (multiplier * mae);
  }

  return { mid, upper, lower };
};

/**
 * Calculates the Nadaraya-Watson Envelope for a single new candle relative to history.
 * Optimized O(N) calculation instead of O(N^2).
 */
export const calculateNextNadarayaWatson = (
  history: Candle[],
  newCandle: Candle,
  bandwidth: number = 50,
  multiplier: number = 3
): { nwMid: number, nwUpper: number, nwLower: number } => {
    // History contains previous candles. We treat newCandle as the last point.
    // Window size
    const lookback = Math.min(500, history.length);
    const startIndex = Math.max(0, history.length - lookback);
    
    // We are calculating for the point at index = history.length (the new candle's position relative to history)
    const i = history.length; 
    
    let sumWeights = 0;
    let sumWeightedClose = 0;
    
    // 1. Calculate weighted average (Estimator)
    for (let j = startIndex; j < history.length; j++) {
        const distance = i - j;
        const weight = Math.exp(-(distance * distance) / (2 * bandwidth * bandwidth));
        sumWeights += weight;
        sumWeightedClose += history[j].close * weight;
    }
    
    // Add current candle (distance 0, weight 1.0)
    const currentWeight = 1.0; // exp(0) = 1
    sumWeights += currentWeight;
    sumWeightedClose += newCandle.close * currentWeight;
    
    const yHat = sumWeightedClose / sumWeights;
    
    // 2. Calculate Mean Absolute Error (MAE) for the band
    let sumWeightedDiff = 0;
    
    for (let j = startIndex; j < history.length; j++) {
        const distance = i - j;
        const weight = Math.exp(-(distance * distance) / (2 * bandwidth * bandwidth));
        sumWeightedDiff += weight * Math.abs(history[j].close - yHat);
    }
    
    // Add current candle diff
    sumWeightedDiff += currentWeight * Math.abs(newCandle.close - yHat);
    
    const mae = sumWeightedDiff / sumWeights;
    
    return {
        nwMid: yHat,
        nwUpper: yHat + (multiplier * mae),
        nwLower: yHat - (multiplier * mae)
    };
}


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
    
    // Vegas ADX Params
    const EMA_TREND_1 = 576;
    const EMA_TREND_2 = 676;
    const ADX_PERIOD = 14;

    // Ensure candles is an array and has valid data
    if (!Array.isArray(candles) || candles.length === 0) return [];
    
    // Pre-process to ensure no NaNs in core OHLC (simple fix if needed, though dataGenerator ensures this)
    const safeCandles = candles.map(c => ({
        ...c,
        open: isNaN(c.open) ? 0 : c.open,
        high: isNaN(c.high) ? 0 : c.high,
        low: isNaN(c.low) ? 0 : c.low,
        close: isNaN(c.close) ? 0 : c.close,
    }));

    const rsi = calculateRSI(safeCandles, RSI_PERIOD);
    const atr = calculateATR(safeCandles, ATR_PERIOD);
    const nw = calculateNadarayaWatson(safeCandles, NW_BANDWIDTH, NW_MULT);
    const adx = calculateADX(safeCandles, ADX_PERIOD);
    
    const ema12 = calculateEMA(safeCandles, EMA_FAST);
    const ema144 = calculateEMA(safeCandles, EMA_TUNNEL_1);
    const ema169 = calculateEMA(safeCandles, EMA_TUNNEL_2);
    const ema576 = calculateEMA(safeCandles, EMA_TREND_1);
    const ema676 = calculateEMA(safeCandles, EMA_TREND_2);

    return safeCandles.map((c, i) => ({
        ...c,
        rsi: rsi[i] || 50, // Default to mid if NaN
        atr: atr[i] || 0,
        nwMid: nw.mid[i] || c.close,
        nwUpper: nw.upper[i] || c.close,
        nwLower: nw.lower[i] || c.close,
        ema12: ema12[i] || c.close,
        ema144: ema144[i] || c.close,
        ema169: ema169[i] || c.close,
        ema576: ema576[i] || c.close,
        ema676: ema676[i] || c.close,
        adx: adx[i] || 0
    }));
};

/**
 * Incrementally updates the indicators for a single new candle.
 * This is significantly faster than processIndicators for large datasets
 * as it avoids recalculating the entire history.
 */
export const updateLastCandle = (prevData: Candle[], newCandle: Candle): Candle => {
    // If no history, just return processed single candle (will be unstable but safe)
    if (prevData.length === 0) {
        return processIndicators([newCandle])[0];
    }

    const lastKnown = prevData[prevData.length - 1];

    // 1. EMA (Incremental - Perfect Precision)
    const calcEma = (prev: number | undefined, close: number, period: number) => {
        // If prev is missing, fallback to close (approximation for start)
        if (prev === undefined || isNaN(prev)) return close; 
        const k = 2 / (period + 1);
        return (close * k) + (prev * (1 - k));
    };
    
    const ema12 = calcEma(lastKnown.ema12, newCandle.close, 12);
    const ema144 = calcEma(lastKnown.ema144, newCandle.close, 144);
    const ema169 = calcEma(lastKnown.ema169, newCandle.close, 169);
    const ema576 = calcEma(lastKnown.ema576, newCandle.close, 576);
    const ema676 = calcEma(lastKnown.ema676, newCandle.close, 676);

    // 2. ATR (Incremental - Perfect Precision)
    const calcAtr = (prevAtr: number | undefined, current: Candle, prevClose: number, period: number) => {
         const tr = Math.max(
            current.high - current.low,
            Math.abs(current.high - prevClose),
            Math.abs(current.low - prevClose)
        );
        if (prevAtr === undefined || isNaN(prevAtr)) return tr;
        return ((prevAtr * (period - 1)) + tr) / period;
    };
    const atr = calcAtr(lastKnown.atr, newCandle, lastKnown.close, 14);

    // 3. Optimized NW Calculation (O(N) instead of O(N^2))
    const nwParams = calculateNextNadarayaWatson(prevData, newCandle, 20, 3.0);

    // 4. RSI & ADX (Windowed)
    // We only need the last RSI/ADX value. We use a smaller window.
    // ADX needs slightly more history for smoothing to stabilize, allow 300
    const lookback = 300; 
    const context = prevData.slice(-lookback);
    const buffer = [...context, newCandle];
    
    // RSI
    const rsiArray = calculateRSI(buffer, 14);
    const lastRsi = rsiArray[rsiArray.length - 1];

    // ADX
    const adxArray = calculateADX(buffer, 14);
    const lastAdx = adxArray[adxArray.length - 1];

    // 5. Merge
    return {
        ...newCandle,
        ema12,
        ema144,
        ema169,
        ema576,
        ema676,
        atr,
        rsi: lastRsi,
        adx: lastAdx,
        nwMid: nwParams.nwMid,
        nwUpper: nwParams.nwUpper,
        nwLower: nwParams.nwLower
    };
};
