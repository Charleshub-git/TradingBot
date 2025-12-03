
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, RefreshCw, Zap, BrainCircuit, Database, Settings, X, Layers, Wifi, Activity } from 'lucide-react';
import { Candle, Trade, BotStatus, Strategy } from './types';
import { generateInitialData, generateNextCandle, fetchHistoricalData } from './services/dataGenerator';
import { processIndicators } from './services/math';
import { analyzeMarket } from './services/geminiService';
import { connectBinanceStream } from './services/websocketService';
import ChartPanel from './components/ChartPanel';
import StatsPanel from './components/StatsPanel';
import LogPanel from './components/LogPanel';

// --- STRATEGY PARAMETERS ---
const TIMEFRAME = '5m';
const RSI_OB = 70;
const RSI_OS = 30;
const ATR_SL_MULTIPLIER = 2.5; // Dynamic Stop Loss Distance
const RISK_REWARD_RATIO = 1.5; // Take Profit relative to SL distance

export default function App() {
  const [data, setData] = useState<Candle[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLive, setIsLive] = useState(false); // Live WebSocket Mode
  const [activeTrade, setActiveTrade] = useState<Trade | null>(null);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [logs, setLogs] = useState<{time: number, message: string, type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'}[]>([]);
  const [pnl, setPnl] = useState(0);
  const [geminiAnalysis, setGeminiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRealData, setIsRealData] = useState(false);
  
  // Strategy Selection
  const [currentStrategy, setCurrentStrategy] = useState<Strategy>('SCALPER');

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [alpacaConfig, setAlpacaConfig] = useState({ key: '', secret: '' });
  
  const backlogRef = useRef<Candle[]>([]);
  const wsRef = useRef<{ close: () => void } | null>(null);

  // Initialize Data
  useEffect(() => {
    const init = async () => {
        addLog(`Initializing... Fetching ${TIMEFRAME} market data...`, "INFO");
        try {
            const rawData = await fetchHistoricalData('BTCUSDT', TIMEFRAME);
            
            if (rawData.length > 0) {
                const isReal = (Date.now() - rawData[rawData.length-1].time) < 24 * 60 * 60 * 1000;
                setIsRealData(isReal);
                
                const splitIndex = Math.floor(rawData.length * 0.85);
                const initialContext = rawData.slice(0, splitIndex);
                backlogRef.current = rawData.slice(splitIndex);

                setData(processIndicators(initialContext));
                addLog(`Loaded ${rawData.length} candles. (${isReal ? 'Real Binance Data' : 'Generated Data'})`, "SUCCESS");
                addLog(`Simulation ready. ${backlogRef.current.length} historical candles queued for replay.`, "INFO");
            } else {
                 throw new Error("No data returned");
            }
        } catch (e) {
            addLog("API unreachable. Falling back to synthetic generator.", "WARNING");
            const fallback = generateInitialData(1000);
            setData(processIndicators(fallback));
        }
    };

    init();
  }, []);

  useEffect(() => {
    const savedKey = localStorage.getItem('ALPACA_KEY') || '';
    const savedSecret = localStorage.getItem('ALPACA_SECRET') || '';
    setAlpacaConfig({ key: savedKey, secret: savedSecret });
  }, []);

  const addLog = (message: string, type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' = 'INFO') => {
    setLogs(prev => [...prev.slice(-99), { time: Date.now(), message, type }]);
  };

  const saveSettings = () => {
    localStorage.setItem('ALPACA_KEY', alpacaConfig.key);
    localStorage.setItem('ALPACA_SECRET', alpacaConfig.secret);
    addLog("Alpaca API credentials saved locally.", "SUCCESS");
    setIsSettingsOpen(false);
  };

  // --- LIVE DATA HANDLING ---
  const toggleLiveMode = async () => {
      if (isLive) {
          // Stop Live Mode
          if (wsRef.current) wsRef.current.close();
          wsRef.current = null;
          setIsLive(false);
          addLog("Live connection closed. Returning to simulation mode.", "INFO");
      } else {
          // Start Live Mode
          setIsPlaying(false); // Stop simulation if running
          setIsLive(true);
          
          addLog("Connecting to Binance WebSocket...", "INFO");
          
          // First, refresh history to ensure no gap (if possible)
          try {
             const rawData = await fetchHistoricalData('BTCUSDT', TIMEFRAME);
             if (rawData.length > 0) {
                 setData(processIndicators(rawData));
                 backlogRef.current = [];
                 setIsRealData(true);
             } else {
                 addLog("Could not sync historical data. Charts may be discontinuous.", "WARNING");
             }
          } catch(e) {
              addLog("Failed to sync history before live connection", "WARNING");
          }

          wsRef.current = connectBinanceStream(
              'btcusdt', 
              TIMEFRAME, 
              (liveCandle, isFinal) => {
                  setData(prevData => {
                      const lastCandle = prevData[prevData.length - 1];
                      let newData = [...prevData];

                      if (lastCandle && liveCandle.time === lastCandle.time) {
                          // Update existing candle
                          newData[newData.length - 1] = liveCandle;
                      } else if (lastCandle && liveCandle.time > lastCandle.time) {
                          // New candle started
                          newData.push(liveCandle);
                          // Keep array size manageable
                          if (newData.length > 500) newData.shift();
                      } else {
                          // Should not happen often, but if we get older data ignore or handle
                          return prevData;
                      }
                      
                      // Re-calc indicators on every tick (can be optimized, but ok for <1000 items)
                      return processIndicators(newData);
                  });
                  
                  if (isFinal) {
                      addLog(`Candle Closed: $${liveCandle.close}`, "INFO");
                  }
              },
              (error) => {
                  // On Error
                  console.error("Live Stream Error", error);
                  addLog("Live Stream Connection Failed (Firewall/SSL).", "ERROR");
                  setIsLive(false);
                  if (wsRef.current) wsRef.current.close();
                  wsRef.current = null;
              }
          );
          
          addLog("Live Stream Connected. Receiving real-time updates.", "SUCCESS");
      }
  };

  // Cleanup WS on unmount
  useEffect(() => {
      return () => {
          if (wsRef.current) wsRef.current.close();
      }
  }, []);


  // --- TRADING LOGIC ---

  const openTrade = useCallback((candle: Candle, type: 'LONG' | 'SHORT', reason: string) => {
      if (!candle.atr) return;

      // Adjust risk based on strategy slightly?
      // For simplicity, we use the same ATR multiplier for both, as they are both 5m strategies
      const slDistance = candle.atr * ATR_SL_MULTIPLIER;
      const tpDistance = slDistance * RISK_REWARD_RATIO;
      
      const entryPrice = candle.close;
      let stopLossPrice = 0;
      let takeProfitPrice = 0;

      if (type === 'LONG') {
          stopLossPrice = entryPrice - slDistance;
          takeProfitPrice = entryPrice + tpDistance;
      } else {
          stopLossPrice = entryPrice + slDistance;
          takeProfitPrice = entryPrice - tpDistance;
      }

      const trade: Trade = {
          id: Math.random().toString(36).substr(2, 9),
          type,
          entryPrice,
          entryTime: candle.time,
          status: 'OPEN',
          reason,
          stopLossPrice,
          takeProfitPrice
      };

      setActiveTrade(trade);
      addLog(`OPEN ${type} (${currentStrategy}) @ ${entryPrice.toFixed(2)} | TP: ${takeProfitPrice.toFixed(2)} | SL: ${stopLossPrice.toFixed(2)}`, "SUCCESS");
  }, [currentStrategy]);

  const closeTrade = useCallback((candle: Candle, reason: string, forcedPrice?: number) => {
      setActiveTrade(currentTrade => {
          if (!currentTrade) return null;
          
          const exitPrice = forcedPrice || candle.close;
          const tradePnl = currentTrade.type === 'LONG' 
            ? (exitPrice - currentTrade.entryPrice) 
            : (currentTrade.entryPrice - exitPrice);
          
          const realizedPnl = tradePnl; 

          setPnl(prev => prev + realizedPnl);
          setTradeHistory(prev => [...prev, { ...currentTrade, exitPrice, exitTime: candle.time, status: 'CLOSED', pnl: realizedPnl }]);
          
          const logType = realizedPnl > 0 ? "SUCCESS" : "ERROR";
          addLog(`CLOSE ${currentTrade.type} @ ${exitPrice.toFixed(2)} (${realizedPnl.toFixed(2)}) - ${reason}`, logType);
          
          return null;
      });
  }, []);

  // Strategy Execution Hook
  useEffect(() => {
    // Only run logic if we have data and (Playing Simulation OR Live Mode)
    if ((!isPlaying && !isLive) || data.length === 0) return;

    const last = data[data.length - 1];
    
    // Ensure all indicators exist
    if (!last.rsi || !last.nwUpper || !last.nwLower || !last.atr || !last.ema12 || !last.ema144 || !last.ema169) return;

    // --- 1. Exit Logic (Risk Management - Shared) ---
    if (activeTrade) {
        if (activeTrade.type === 'LONG') {
            if (last.low <= activeTrade.stopLossPrice) {
                closeTrade(last, "Stop Loss Hit", activeTrade.stopLossPrice);
                return;
            }
            if (last.high >= activeTrade.takeProfitPrice) {
                closeTrade(last, "Take Profit Hit", activeTrade.takeProfitPrice);
                return;
            }
        } else if (activeTrade.type === 'SHORT') {
             if (last.high >= activeTrade.stopLossPrice) {
                closeTrade(last, "Stop Loss Hit", activeTrade.stopLossPrice);
                return;
            }
            if (last.low <= activeTrade.takeProfitPrice) {
                closeTrade(last, "Take Profit Hit", activeTrade.takeProfitPrice);
                return;
            }
        }
        return; // Currently in trade, don't check entries
    }

    // --- 2. Entry Logic ---

    if (currentStrategy === 'SCALPER') {
        // --- SCALPER STRATEGY (Reversal) ---
        // LONG: Price below Lower Band AND RSI Oversold
        const isBelowLowerBand = last.close < last.nwLower; 
        const isRsiOversold = last.rsi < RSI_OS;

        if (isBelowLowerBand && isRsiOversold) {
            openTrade(last, 'LONG', `[Scalp] RSI ${last.rsi.toFixed(1)} + Price < Band`);
            return;
        }

        // SHORT: Price above Upper Band AND RSI Overbought
        const isAboveUpperBand = last.close > last.nwUpper;
        const isRsiOverbought = last.rsi > RSI_OB;

        if (isAboveUpperBand && isRsiOverbought) {
            openTrade(last, 'SHORT', `[Scalp] RSI ${last.rsi.toFixed(1)} + Price > Band`);
            return;
        }
    
    } else {
        // --- VEGAS STRATEGY (Trend Follow) ---
        // Tunnel = EMA 144 & EMA 169
        // Filter = EMA 12
        
        // LONG: EMA 12 crosses ABOVE Tunnel (EMA 169) AND Price is above Tunnel
        const isAboveTunnel = last.close > last.ema144 && last.close > last.ema169;
        const ema12CrossUp = last.ema12 > last.ema169;
        
        // Simple filter: Only enter if EMA12 is clearly above tunnel and price is trending up
        if (isAboveTunnel && ema12CrossUp && last.rsi > 50) {
             // We need a way to detect the *cross* specifically, but for this simulation loop, 
             // checking state is okay if we prevent spamming. 
             // Ideally we check prevCandle, but activeTrade check handles spamming.
             // We add a random factor or stricter check to simulate waiting for a pullback or breakout
             // In Live mode, we reduce randomness because we can't wait infinite time
             const threshold = isLive ? 0.3 : 0.7;
             if (Math.random() > threshold) { 
                 openTrade(last, 'LONG', `[Vegas] Price > Tunnel + EMA12 Bullish`);
             }
        }

        // SHORT: EMA 12 crosses BELOW Tunnel (EMA 144) AND Price is below Tunnel
        const isBelowTunnel = last.close < last.ema144 && last.close < last.ema169;
        const ema12CrossDown = last.ema12 < last.ema144;

        if (isBelowTunnel && ema12CrossDown && last.rsi < 50) {
            const threshold = isLive ? 0.3 : 0.7;
            if (Math.random() > threshold) {
                openTrade(last, 'SHORT', `[Vegas] Price < Tunnel + EMA12 Bearish`);
            }
        }
    }

  }, [data, isPlaying, isLive, activeTrade, openTrade, closeTrade, currentStrategy]);


  // Simulation Loop
  useEffect(() => {
    let interval: any;
    if (isPlaying && !isLive) {
      interval = setInterval(() => {
        setData(prevData => {
           let nextCandle: Candle;
           
           if (backlogRef.current.length > 0) {
               nextCandle = backlogRef.current.shift()!;
           } else {
               if (isRealData) {
                   setIsRealData(false);
                   addLog("Real history exhausted. Switching to synthetic data.", "WARNING");
               }
               const lastCandle = prevData[prevData.length - 1];
               nextCandle = generateNextCandle(lastCandle);
           }

           // Optimization: Only keep last 500 candles to prevent memory bloat
           const newData = [...prevData.slice(-500), nextCandle]; 
           return processIndicators(newData);
        });
      }, 100); 
    }
    return () => clearInterval(interval);
  }, [isPlaying, isLive, isRealData]);

  const handleManualAnalysis = async () => {
    if (data.length === 0) return;
    setIsAnalyzing(true);
    const last = data[data.length - 1];
    
    // Construct signal string context
    let signal = "Neutral";
    if (currentStrategy === 'SCALPER') {
        if (last.rsi! > RSI_OB && last.close > last.nwUpper!) signal = "POTENTIAL SHORT (Extreme High)";
        if (last.rsi! < RSI_OS && last.close < last.nwLower!) signal = "POTENTIAL LONG (Extreme Low)";
    } else {
        if (last.ema12! > last.ema169!) signal = "BULLISH TREND (Above Tunnel)";
        if (last.ema12! < last.ema144!) signal = "BEARISH TREND (Below Tunnel)";
    }
    
    addLog(`Requesting Gemini Analysis for ${currentStrategy}...`, "INFO");
    const result = await analyzeMarket(last, signal, currentStrategy);
    setGeminiAnalysis(result);
    addLog("Gemini Analysis Received", "INFO");
    setIsAnalyzing(false);
  }

  const lastCandle = data[data.length - 1] || { close: 0, time: 0 };
  
  return (
    <div className="flex flex-col h-full bg-gray-950 text-white p-4 gap-4 relative">
      {/* Header */}
      <div className="flex justify-between items-center bg-gray-900 p-4 rounded-lg border border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg transition-colors ${currentStrategy === 'SCALPER' ? 'bg-blue-600' : 'bg-purple-600'}`}>
            <Layers size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              {currentStrategy === 'SCALPER' ? 'Nadaraya-Watson Scalper' : 'Vegas Tunnel Bot'}
            </h1>
            <div className="flex items-center gap-2">
                <p className="text-xs text-gray-500">
                    {currentStrategy === 'SCALPER' 
                        ? 'Reversal • NW Envelope • RSI • ATR' 
                        : 'Trend Follow • EMA 144/169 • EMA 12'}
                </p>
                {isRealData && (
                    <span className="flex items-center gap-1 text-[10px] bg-green-900/50 text-green-400 px-2 py-0.5 rounded border border-green-800">
                        <Database size={10} /> Real Binance Data
                    </span>
                )}
                {isLive && (
                    <span className="flex items-center gap-1 text-[10px] bg-red-900/50 text-red-400 px-2 py-0.5 rounded border border-red-800 animate-pulse">
                        <Activity size={10} /> LIVE STREAM
                    </span>
                )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
             {/* Strategy Selector */}
             <div className="flex bg-gray-950 p-1 rounded-lg border border-gray-800">
                <button 
                    onClick={() => setCurrentStrategy('SCALPER')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${currentStrategy === 'SCALPER' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    SCALPER
                </button>
                <button 
                    onClick={() => setCurrentStrategy('VEGAS')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${currentStrategy === 'VEGAS' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    VEGAS
                </button>
             </div>

            <div className="h-8 w-px bg-gray-700"></div>

            <button 
                onClick={handleManualAnalysis}
                disabled={isAnalyzing}
                className="flex items-center gap-2 px-4 py-2 bg-purple-900/50 hover:bg-purple-900 border border-purple-700 rounded-md text-purple-200 transition-colors text-sm"
            >
                <BrainCircuit size={16} />
                {isAnalyzing ? "..." : "AI Analyst"}
            </button>
            
            <button 
                onClick={toggleLiveMode}
                className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors text-sm font-bold ${isLive ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
                title={isLive ? "Disconnect Live Stream" : "Connect Live Stream"}
            >
                <Wifi size={18} className={isLive ? "animate-pulse" : ""} />
                {isLive ? "LIVE" : "GO LIVE"}
            </button>

            <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 hover:bg-gray-800 rounded-md text-gray-400 transition-colors"
                title="Settings"
            >
                <Settings size={20} />
            </button>
            <button 
                onClick={() => window.location.reload()}
                className="p-2 hover:bg-gray-800 rounded-md text-gray-400"
                title="Reset/Reload"
            >
                <RefreshCw size={20} />
            </button>
            
            {/* Play button disabled in Live Mode */}
            <button
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={isLive}
                className={`flex items-center gap-2 px-6 py-2 rounded-md font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                isPlaying 
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
            >
                {isPlaying ? <span className="flex items-center gap-2"><Pause size={18} /> STOP</span> : <span className="flex items-center gap-2"><Play size={18} /> SIMULATE</span>}
            </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="flex-grow grid grid-cols-12 gap-4 min-h-0">
        
        {/* Left Column: Chart */}
        <div className="col-span-9 flex flex-col gap-4 min-h-0">
           <div className="flex-grow h-full min-h-0">
             {data.length > 0 && <ChartPanel data={data} strategy={currentStrategy} />}
           </div>
           
           {/* Gemini Analysis Output */}
           {geminiAnalysis && (
             <div className="bg-gray-900 border border-purple-900/50 p-4 rounded-lg shrink-0 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 mb-2">
                    <BrainCircuit size={16} className="text-purple-400" />
                    <span className="text-xs font-bold text-purple-400 uppercase">AI Analyst Insight</span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{geminiAnalysis}</p>
             </div>
           )}
        </div>

        {/* Right Column: Stats & Logs */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">
          <div className="shrink-0">
            <StatsPanel 
                status={activeTrade ? BotStatus.IN_POSITION : (isPlaying || isLive) ? BotStatus.SCANNING : BotStatus.IDLE}
                lastCandle={lastCandle}
                activeTrade={activeTrade}
                pnl={pnl}
                strategy={currentStrategy}
            />
          </div>
          <div className="flex-grow min-h-0">
             <LogPanel logs={logs} />
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-4 border-b border-gray-800">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Settings size={18} /> Settings
                    </h2>
                    <button onClick={() => setIsSettingsOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="bg-blue-900/20 border border-blue-900/50 p-3 rounded text-xs text-blue-200 mb-4">
                        Enter your Alpaca Markets API credentials below. These will be stored locally in your browser.
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Alpaca API Key ID</label>
                        <input 
                            type="text" 
                            value={alpacaConfig.key}
                            onChange={(e) => setAlpacaConfig(prev => ({...prev, key: e.target.value}))}
                            className="w-full bg-gray-950 border border-gray-800 rounded p-2.5 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-gray-700 font-mono"
                            placeholder="PK******************"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Alpaca Secret Key</label>
                        <input 
                            type="password" 
                            value={alpacaConfig.secret}
                            onChange={(e) => setAlpacaConfig(prev => ({...prev, secret: e.target.value}))}
                            className="w-full bg-gray-950 border border-gray-800 rounded p-2.5 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-gray-700 font-mono"
                            placeholder="***********************************"
                        />
                    </div>
                </div>
                <div className="p-4 border-t border-gray-800 flex justify-end gap-3 bg-gray-900/50 rounded-b-lg">
                    <button 
                        onClick={() => setIsSettingsOpen(false)}
                        className="px-4 py-2 hover:bg-gray-800 text-gray-400 rounded text-sm font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={saveSettings}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
                    >
                        Save Configuration
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}