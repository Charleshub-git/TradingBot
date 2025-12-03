
import { GoogleGenAI } from "@google/genai";
import { Candle, Strategy } from "../types";

// Safe initialization
let ai: GoogleGenAI | null = null;
try {
  if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
} catch (e) {
  console.error("Failed to initialize Gemini client", e);
}

export const analyzeMarket = async (lastCandle: Candle, trend: string, strategy: Strategy): Promise<string> => {
  if (!ai) return "API Key not configured. Please set process.env.API_KEY to use Gemini.";

  let prompt = "";

  if (strategy === 'SCALPER') {
      prompt = `
        Act as a professional crypto quant scalper using a Nadaraya-Watson Envelope + RSI Reversal Strategy on 5m timeframe.
        
        Current Market Data (BTC/USDT 5m):
        - Price: $${lastCandle.close.toFixed(2)}
        - RSI (14): ${lastCandle.rsi?.toFixed(2)} (Oversold < 30, Overbought > 70)
        - Nadaraya-Watson Upper: ${lastCandle.nwUpper?.toFixed(2)}
        - Nadaraya-Watson Lower: ${lastCandle.nwLower?.toFixed(2)}
        - ATR (Vol): ${lastCandle.atr?.toFixed(2)}

        Signal: ${trend}

        Provide a concise 2-sentence analysis on whether a reversal is likely or if we should wait.
      `;
  } else {
      prompt = `
        Act as a professional crypto trader using the Vegas Tunnel Strategy (EMA 144 & 169) on 5m timeframe.
        
        Current Market Data (BTC/USDT 5m):
        - Price: $${lastCandle.close.toFixed(2)}
        - EMA 12 (Fast): ${lastCandle.ema12?.toFixed(2)}
        - EMA 144 (Tunnel Top): ${lastCandle.ema144?.toFixed(2)}
        - EMA 169 (Tunnel Bottom): ${lastCandle.ema169?.toFixed(2)}
        - ATR (Vol): ${lastCandle.atr?.toFixed(2)}

        Signal: ${trend}

        Provide a concise 2-sentence analysis on trend direction and tunnel breakout strength.
      `;
  }

  try {
    const model = 'gemini-2.5-flash';
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini analysis failed", error);
    return "Analysis currently unavailable due to network or API limits.";
  }
};
