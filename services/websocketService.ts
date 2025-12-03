
import { Candle } from '../types';

export const connectBinanceStream = (
  symbol: string, 
  interval: string, 
  onUpdate: (candle: Candle, isFinal: boolean) => void,
  onError?: (error: Event) => void
) => {
  const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log(`Connected to Binance Stream for ${symbol} ${interval}`);
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      
      // Event type 'kline'
      if (message.e === 'kline') {
        const k = message.k;
        
        const candle: Candle = {
          time: k.t,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };

        onUpdate(candle, k.x); // k.x is boolean "is candle closed"
      }
    } catch (e) {
      console.error("Error parsing WS message", e);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket Error:', error);
    if (onError) onError(error);
  };

  return {
    close: () => {
      ws.close();
      console.log('Binance Stream Closed');
    }
  };
};