import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, RefreshCw, Zap, BrainCircuit, Database, Settings, X } from 'lucide-react';
import { Candle, Trade, BotStatus } from './types';
import { generateInitialData, generateNextCandle, fetchHistoricalData } from './services/dataGenerator';
import { processIndicators } from './services/math';
import { analyzeMarket } from './services/geminiService';
import ChartPanel from './components/ChartPanel';
import StatsPanel from './components/StatsPanel';
import LogPanel from './components/LogPanel';

// Constants for strategy
const BUFFER_PERCENT = 0.0015; // 0.15% buffer for "touching" the tunnel

export default function App() {
  const [data, setData] = useState<Candle[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrade, setActiveTrade] = useState<Trade | null>(null);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [logs, setLogs] = useState<{time: number, message: string, type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'}[]>([]);
  const [pnl, setPnl] = useState(0);
  const [geminiAnalysis, setGeminiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRealData, setIsRealData] = useState(false);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [alpacaConfig, setAlpacaConfig] = useState({ key: '', secret: '' });
  
  // Backlog holds "future" candles (from real history) that we will replay one by one
  const backlogRef = useRef<Candle[]>([]);

  // Initialize Data
  useEffect(() => {
    const init = async () => {
        addLog("Initializing... Fetching market data...", "INFO");
        try {
            const rawData = await fetchHistoricalData();
            
            if (rawData.length > 0) {
                // If the timestamps are recent (within last 24h), assume real data
                const isReal = (Date.now() - rawData[rawData.length-1].time) < 24 * 60 * 60 * 1000;
                setIsRealData(isReal);
                
                // Split: 80% initial context, 20% simulation buffer
                const splitIndex = Math.floor(rawData.length * 0.85);
                const initialContext = rawData.slice(0, splitIndex);
                backlogRef.current = rawData.slice(splitIndex);

                setData(processIndicators(initialContext));
                addLog(`Loaded ${rawData.length} candles. (${isReal ? 'Real Binance Data' : 'Generated Data'})`, "SUCCESS");
                addLog(`Simulation ready. ${backlogRef.current.length} historical candles queued for replay.`, "INFO");
            }
        } catch (e) {
            addLog("Data fetch failed. Using generator.", "ERROR");
            const fallback = generateInitialData(1000);
            setData(processIndicators(fallback));
        }
    };

    init();
  }, []);

  // Load Settings from LocalStorage
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

  const openTrade = useCallback((candle: Candle, type: 'LONG' | 'SHORT', reason: string) => {
      const trade: Trade = {
          id: Math.random().toString(36).substr(2, 9),
          type,
          entryPrice: candle.close,
          entryTime: candle.time,
          status: 'OPEN',
          reason
      };
      setActiveTrade(trade);
      addLog(`OPEN ${type} @ ${candle.close.toFixed(2)} - ${reason}`, "SUCCESS");
  }, []);

  const closeTrade = useCallback((candle: Candle, reason: string, overridePrice?: number) => {
      setActiveTrade(currentTrade => {
          if (!currentTrade) return null;
          
          const exitPrice = overridePrice || candle.close;
          const tradePnl = currentTrade.type === 'LONG' 
            ? (exitPrice - currentTrade.entryPrice) 
            : (currentTrade.entryPrice - exitPrice); // Short logic if needed
          
          const realizedPnl = tradePnl; 

          setPnl(prev => prev + realizedPnl);
          setTradeHistory(prev => [...prev, { ...currentTrade, exitPrice, exitTime: candle.time, status: 'CLOSED', pnl: realizedPnl }]);
          
          const logType = realizedPnl > 0 ? "SUCCESS" : "ERROR";
          addLog(`CLOSE ${currentTrade.type} @ ${exitPrice.toFixed(2)} (${realizedPnl.toFixed(2)}) - ${reason}`, logType);
          
          return null;
      });
  }, []);

  // Strategy Logic
  // This runs whenever `data` updates and we are playing
  useEffect(() => {
    if (!isPlaying || data.length === 0) return;

    const last = data[data.length - 1];
    
    // Skip if not enough data for EMAs
    if (!last.ema676) return;

    // --- 1. Check Exit Conditions if in trade ---
    if (activeTrade) {
        // Hard Stop: Close < EMA676 (Long)
        if (activeTrade.type === 'LONG' && last.close < last.ema676!) {
            closeTrade(last, "Hard Stop Loss (Price < EMA676)");
            return;
        }

        // Take Profit (Simplified 1:1.5 Risk Reward simulation)
        const profitTarget = activeTrade.entryPrice * 1.05; // 5% move target for simulation
        if (activeTrade.type === 'LONG' && last.high >= profitTarget) {
            closeTrade(last, "Take Profit Target Hit", profitTarget);
            return;
        }

        // Volume Exit
        if (last.volOsc && last.volOsc > 25) { 
             closeTrade(last, "Volume Climax Exit");
             return;
        }
        return; 
    }

    // --- 2. Check Entry Conditions ---
    
    // Bullish Trend Definition: 12 > 144 > 576
    const isBullish = last.ema12! > last.ema144! && last.ema144! > last.ema576!;
    
    if (isBullish) {
        const tunnelTop = Math.max(last.ema144!, last.ema169!);
        const tunnelBottom = Math.min(last.ema144!, last.ema169!);
        
        const upperBuffer = tunnelTop * (1 + BUFFER_PERCENT);
        // Did price wick into the tunnel?
        const touchesTunnel = last.low <= upperBuffer && last.low >= (tunnelBottom * 0.98); 

        if (touchesTunnel) {
             openTrade(last, 'LONG', "Retracement to Vegas Tunnel");
        }
    }
  }, [data, isPlaying, activeTrade, openTrade, closeTrade]);


  // Simulation Tick (Replay & Generate)
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setData(prevData => {
           // 1. Check if we have history to replay
           let nextCandle: Candle;
           
           if (backlogRef.current.length > 0) {
               // Pop from backlog
               nextCandle = backlogRef.current.shift()!;
           } else {
               // 2. If backlog empty, generate synthetic data
               if (isRealData) {
                   setIsRealData(false); // Switch flag once we run out of real data
                   addLog("Real history exhausted. Switching to synthetic data generation.", "WARNING");
               }
               const lastCandle = prevData[prevData.length - 1];
               nextCandle = generateNextCandle(lastCandle);
           }

           const newData = [...prevData.slice(1), nextCandle]; 
           // Recalculate indicators for the new set (or just the tail)
           // For simplicity in this demo, we re-process. In prod, optimize this.
           return processIndicators(newData);
        });
      }, 150); // Speed up simulation a bit
    }
    return () => clearInterval(interval);
  }, [isPlaying, isRealData]);

  const handleManualAnalysis = async () => {
    if (data.length === 0) return;
    setIsAnalyzing(true);
    const last = data[data.length - 1];
    const isBullish = (last.ema12 || 0) > (last.ema144 || 0) && (last.ema144 || 0) > (last.ema576 || 0);
    const trendStr = isBullish ? "Bullish Alignment (12 > 144 > 576)" : "Not Aligned / Bearish";
    
    addLog("Requesting Gemini Analysis...", "INFO");
    const result = await analyzeMarket(last, trendStr);
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
          <div className="p-2 bg-blue-600 rounded-lg">
            <Zap size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
              Vegas Tunnel Bot
            </h1>
            <div className="flex items-center gap-2">
                <p className="text-xs text-gray-500">Automated Strategy Simulator • 15m Timeframe</p>
                {isRealData && (
                    <span className="flex items-center gap-1 text-[10px] bg-green-900/50 text-green-400 px-2 py-0.5 rounded border border-green-800">
                        <Database size={10} /> Real Binance Data
                    </span>
                )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
            <button 
                onClick={handleManualAnalysis}
                disabled={isAnalyzing}
                className="flex items-center gap-2 px-4 py-2 bg-purple-900/50 hover:bg-purple-900 border border-purple-700 rounded-md text-purple-200 transition-colors text-sm"
            >
                <BrainCircuit size={16} />
                {isAnalyzing ? "Analyzing..." : "Ask Gemini Analyst"}
            </button>
            <div className="h-8 w-px bg-gray-700"></div>
            <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 hover:bg-gray-800 rounded-md text-gray-400 transition-colors"
                title="Configuration"
            >
                <Settings size={20} />
            </button>
            <button 
                onClick={() => window.location.reload()}
                className="p-2 hover:bg-gray-800 rounded-md text-gray-400"
                title="Reset Simulation"
            >
                <RefreshCw size={20} />
            </button>
            <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`flex items-center gap-2 px-6 py-2 rounded-md font-bold transition-all ${
                isPlaying 
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
            >
                {isPlaying ? <span className="flex items-center gap-2"><Pause size={18} /> PAUSE</span> : <span className="flex items-center gap-2"><Play size={18} /> RUN BOT</span>}
            </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="flex-grow grid grid-cols-12 gap-4 min-h-0">
        
        {/* Left Column: Chart */}
        <div className="col-span-9 flex flex-col gap-4 min-h-0">
           <div className="flex-grow h-full min-h-0">
             {data.length > 0 && <ChartPanel data={data} />}
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
                status={activeTrade ? BotStatus.IN_POSITION : isPlaying ? BotStatus.SCANNING : BotStatus.IDLE}
                lastCandle={lastCandle}
                activeTrade={activeTrade}
                pnl={pnl}
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