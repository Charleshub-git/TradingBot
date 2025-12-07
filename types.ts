
export type Strategy = 'SCALPER' | 'VEGAS' | 'VEGAS_ADX';
export type DataSource = 'BINANCE' | 'ALPACA' | 'FMP' | 'CSV';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Scalper Indicators
  rsi?: number;
  atr?: number;
  nwMid?: number;
  nwUpper?: number;
  nwLower?: number;
  // Vegas Indicators
  ema12?: number;
  ema144?: number;
  ema169?: number;
  // Vegas ADX Additional Indicators
  ema576?: number;
  ema676?: number;
  adx?: number;
}

export interface Trade {
  id: string;
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  entryTime: number;
  exitPrice?: number;
  exitTime?: number;
  status: 'OPEN' | 'CLOSED';
  pnl?: number;
  reason: string;
  // Dynamic Risk Management
  stopLossPrice: number;
  takeProfitPrice: number;
}

export enum BotStatus {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  IN_POSITION = 'IN_POSITION'
}

export interface StrategyConfig {
  symbol: string;
  timeframe: string;
  nwBandwidth: number;
  nwMultiplier: number;
  rsiPeriod: number;
  atrPeriod: number;
  atrSlMultiplier: number;
  riskRewardRatio: number;
}
