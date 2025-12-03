export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema12?: number;
  ema144?: number;
  ema169?: number;
  ema576?: number;
  ema676?: number;
  volOsc?: number;
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
}

export enum BotStatus {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  IN_POSITION = 'IN_POSITION'
}

export interface StrategyConfig {
  symbol: string;
  timeframe: string;
  riskPerTrade: number;
  emaShort: number;
  emaTunnel1: number;
  emaTunnel2: number;
  emaTrend1: number;
  emaTrend2: number;
}