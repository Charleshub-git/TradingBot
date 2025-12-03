import { GoogleGenAI } from "@google/genai";
import { Candle } from "../types";

// Safe initialization
let ai: GoogleGenAI | null = null;
try {
  if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
} catch (e) {
  console.error("Failed to initialize Gemini client", e);
}

export const analyzeMarket = async (lastCandle: Candle, trend: string): Promise<string> => {
  if (!ai) return "API Key not configured. Please set process.env.API_KEY to use Gemini.";

  const prompt = `
    Act as a professional crypto quant trader using the Vegas Tunnel Strategy.
    
    Current Market Data (BTC/USDT 15m):
    - Price: $${lastCandle.close.toFixed(2)}
    - EMA 12: ${lastCandle.ema12?.toFixed(2)}
    - EMA 144 (Tunnel Top): ${lastCandle.ema144?.toFixed(2)}
    - EMA 169 (Tunnel Bottom): ${lastCandle.ema169?.toFixed(2)}
    - EMA 576 (Trend Top): ${lastCandle.ema576?.toFixed(2)}
    - EMA 676 (Trend Bottom): ${lastCandle.ema676?.toFixed(2)}
    - Volume Oscillator: ${lastCandle.volOsc?.toFixed(2)}

    Current System State: ${trend}

    Please provide a concise 2-sentence analysis of the current setup. 
    1. Is the trend strong or weak?
    2. Are we in a potential entry zone (retracement to tunnel) or danger zone?
  `;

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