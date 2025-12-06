
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, RefreshCw, Zap, BrainCircuit, Database, Settings, X, Layers, Wifi, Activity, Upload, Gauge, FlaskConical, StopCircle, ArrowLeft } from 'lucide-react';
import { Candle, Trade, BotStatus, Strategy, DataSource } from './types';
import { generateInitialData, generateNextCandle, fetchHistoricalData } from './services/dataGenerator';
import { processIndicators, updateLastCandle } from './services/math';
import { analyzeMarket } from './services/geminiService';
import { connectBinanceStream } from './services/websocketService';
import { parseCSV } from './services/csvParser';
import ChartPanel from './components/ChartPanel';
import StatsPanel from './components/StatsPanel';
import LogPanel from './components/LogPanel';

// --- STRATEGY PARAMETERS ---
const TIMEFRAME = '5m'; // Default for API, CSV uses its own timestamps
const RSI_OB = 70;
const RSI_OS = 30;
const ATR_SL_MULTIPLIER = 2.5; // Dynamic Stop Loss Distance
const RISK_REWARD_RATIO = 1.5; // Take Profit relative to SL distance
const MAX_STORED_CANDLES = 3000; // Rolling buffer size to maintain performance

type AppMode = 'IDLE' | 'BACKTEST' | 'LIVE';

export default function App() {
  // Initialize with 200 generated candles so the chart has data immediately and indicators are valid
  const [data, setData] = useState<Candle[]>(() => {
    return processIndicators(generateInitialData(200));
  });
  const [appMode, setAppMode] = useState<AppMode>('IDLE');
  const [isPlaying, setIsPlaying] = useState(false);
  const [simulationDelay, setSimulationDelay] = useState(100); // Default to moderate speed
  const [activeTrade, setActiveTrade] = useState<Trade | null>(null);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [logs, setLogs] = useState<{time: number, message: string, type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'}[]>([]);
  const [pnl, setPnl] = useState(0);
  const [geminiAnalysis, setGeminiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRealData, setIsRealData] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  
  // Strategy Selection
  const [currentStrategy, setCurrentStrategy] = useState<Strategy>('SCALPER');

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [dataSource, setDataSource] = useState<DataSource>('BINANCE');
  const [alpacaConfig, setAlpacaConfig] = useState({ key: '', secret: '' });
  const [fmpApiKey, setFmpApiKey] = useState('');
  
  const backlogRef = useRef<Candle[]>([]);
  const wsRef = useRef<{ close: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (message: string, type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' = 'INFO') => {
    setLogs(prev => [...prev.slice(-99), { time: Date.now(), message, type }]);
  };

  // Load Settings
  useEffect(() => {
    const savedSource = localStorage.getItem('DATA_SOURCE') as DataSource | null;
    if (savedSource && savedSource !== 'CSV') setDataSource(savedSource); 

    const savedKey = localStorage.getItem('ALPACA_KEY') || '';
    const savedSecret = localStorage.getItem('ALPACA_SECRET') || '';
    setAlpacaConfig({ key: savedKey, secret: savedSecret });

    const savedFmpKey = localStorage.getItem('FMP_KEY') || '';
    setFmpApiKey(savedFmpKey);
  }, []);

  const saveSettings = () => {
    localStorage.setItem('DATA_SOURCE', dataSource === 'CSV' ? 'BINANCE' : dataSource);
    localStorage.setItem('ALPACA_KEY', alpacaConfig.key);
    localStorage.setItem('ALPACA_SECRET', alpacaConfig.secret);
    localStorage.setItem('FMP_KEY', fmpApiKey);
    
    addLog("Configuration saved.", "SUCCESS");
    setIsSettingsOpen(false);
  };

  // Initialize Data
  const initData = async (forceSource?: DataSource, silent: boolean = false) => {
        const sourceToUse = forceSource || dataSource;
        backlogRef.current = []; // Reset backlog to prevent ghost data

        if (sourceToUse === 'CSV') {
             if (!silent) addLog("To reset CSV backtest, please reload the file.", "INFO");
             return;
        }

        if (!silent) addLog(`Initializing... Fetching ${TIMEFRAME} market data from ${sourceToUse}...`, "INFO");
        try {
            const rawData = await fetchHistoricalData('BTCUSDT', TIMEFRAME, 1000, sourceToUse, {
                alpacaKey: alpacaConfig.key,
                alpacaSecret: alpacaConfig.secret,
                fmpKey: fmpApiKey
            });
            
            if (rawData.length > 0) {
                const isReal = (Date.now() - rawData[rawData.length-1].time) < 24 * 60 * 60 * 1000;
                setIsRealData(isReal);
                
                // Start with a small context to allow simulation of the rest
                const initialCount = 200;
                const initialContext = rawData.slice(0, initialCount);
                backlogRef.current = rawData.slice(initialCount);

                setData(processIndicators(initialContext));
                if (!silent) {
                    addLog(`Loaded ${rawData.length} candles from ${sourceToUse}.`, "SUCCESS");
                    addLog(`Initialized with ${initialCount}. ${backlogRef.current.length} queued for simulation.`, "INFO");
                }
            } else {
                 throw new Error("No data returned");
            }
        } catch (e) {
            addLog(`API unreachable for ${sourceToUse}. Falling back to synthetic generator.`, "WARNING");
            const fallback = generateInitialData(200);
            setData(processIndicators(fallback));
            setIsRealData(false);
        }
  };

  // Initial Background Load
  useEffect(() => {
      // Only auto-fetch real data if we aren't already working with data (though we init with random data now)
      const timer = setTimeout(() => {
          if (dataSource !== 'CSV') initData(dataSource, true);
      }, 500);
      return () => clearTimeout(timer);
  }, []); 


  // --- LIVE DATA HANDLING ---
  const startLiveStrategy = async () => {
      if (dataSource === 'CSV') {
          addLog("Cannot run Live Strategy with CSV source. Switching to Binance.", "WARNING");
          setDataSource('BINANCE');
          setTimeout(() => startLiveConnection('BINANCE'), 100);
          return;
      }
      startLiveConnection(dataSource);
  };

  const startLiveConnection = async (source: DataSource) => {
      setAppMode('LIVE');
      setIsPlaying(false);
      
      addLog("Connecting to Binance WebSocket...", "INFO");
      
      // Sync History first
      await initData(source);

      wsRef.current = connectBinanceStream(
          'btcusdt', 
          TIMEFRAME, 
          (liveCandle, isFinal) => {
              setData(prevData => {
                  const lastCandle = prevData[prevData.length - 1];
                  
                  if (lastCandle && liveCandle.time === lastCandle.time) {
                      // Update existing candle
                      const newData = [...prevData];
                      newData[newData.length - 1] = liveCandle;
                      
                      // Optimized: Only re-process the tail
                      const tail = newData.slice(-500);
                      const processedTail = processIndicators(tail);
                      newData.splice(-processedTail.length, processedTail.length, ...processedTail);
                      return newData;

                  } else if (lastCandle && liveCandle.time > lastCandle.time) {
                      // New candle
                      const processedNewCandle = updateLastCandle(prevData, liveCandle);
                      const newData = [...prevData, processedNewCandle];
                      
                      // Cap buffer size
                      if (newData.length > MAX_STORED_CANDLES) {
                          newData.shift();
                      }
                      return newData;
                  } else {
                      return prevData;
                  }
              });
              
              if (isFinal) {
                  addLog(`Candle Closed: $${liveCandle.close}`, "INFO");
              }
          },
          (error) => {
              console.error("Live Stream Error", error);
              addLog("Live Stream Connection Failed.", "ERROR");
              stopLiveStrategy();
          }
      );
      
      addLog("Live Stream Connected. Strategy Running.", "SUCCESS");
  };

  const stopLiveStrategy = () => {
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
      setAppMode('IDLE');
      setIsPlaying(false);
      addLog("Live Strategy Stopped.", "INFO");
  };

  // Cleanup WS on unmount
  useEffect(() => {
      return () => {
          if (wsRef.current) wsRef.current.close();
      }
  }, []);

  // --- FILE UPLOAD HANDLING ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    addLog(`Parsing CSV file: ${file.name}...`, "INFO");
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            const rawCandles = parseCSV(text);
            
            if (rawCandles.length === 0) {
                throw new Error("No valid data found in CSV");
            }

            // RESET STATE for new simulation
            setActiveTrade(null);
            setTradeHistory([]);
            setPnl(0);
            
            // Start small to allow simulation playback, but large enough for indicators (EMA169) to work
            const initialCount = 200;
            const initialContext = rawCandles.slice(0, initialCount);
            
            // Queue the rest of the RAW candles for the loop to pick up one by one
            backlogRef.current = rawCandles.slice(initialCount);
            
            // Process initial chunk only
            const processedData = processIndicators(initialContext);
            setData(processedData);

            setDataSource('CSV');
            setAppMode('BACKTEST'); 
            setIsRealData(true);
            setIsPlaying(false);

            addLog(`Successfully loaded ${rawCandles.length} candles from CSV.`, "SUCCESS");
            addLog(`Initialized with first ${initialCount} candles. ${backlogRef.current.length} queued for simulation.`, "INFO");
            addLog(`Ready to Backtest. Press Play to run simulation.`, "INFO");

        } catch (error) {
            console.error(error);
            addLog("Failed to parse CSV file. Ensure format is: datetime, open, high, low, close", "ERROR");
        }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startBacktest = () => {
      setAppMode('BACKTEST');
      setIsPlaying(false); // Start paused to allow upload or config
      
      if (dataSource !== 'CSV') {
          // Re-init data to ensure clean slate from current source
          initData(dataSource);
      } 
  };

  const stopBacktest = () => {
      setIsPlaying(false);
      setAppMode('IDLE');
      addLog("Backtest Stopped.", "INFO");
  };


  // --- TRADING LOGIC ---
  const openTrade = useCallback((candle: Candle, type: 'LONG' | 'SHORT', reason: string) => {
      if (!candle.atr) return;

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
      
      const execPrefix = (appMode === 'LIVE' && autoExecute) ? "[REAL EXEC]" : "[SIM]";
      addLog(`${execPrefix} OPEN ${type} (${currentStrategy}) @ ${entryPrice.toFixed(2)} | TP: ${takeProfitPrice.toFixed(2)} | SL: ${stopLossPrice.toFixed(2)}`, "SUCCESS");
  }, [currentStrategy, appMode, autoExecute]);

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
          const execPrefix = (appMode === 'LIVE' && autoExecute) ? "[REAL EXEC]" : "[SIM]";
          addLog(`${execPrefix} CLOSE ${currentTrade.type} @ ${exitPrice.toFixed(2)} (${realizedPnl.toFixed(2)}) - ${reason}`, logType);
          
          return null;
      });
  }, [appMode, autoExecute]);

  // Strategy Execution Hook
  useEffect(() => {
    // Only run logic if we have data and (Playing Simulation OR Live Mode)
    if ((!isPlaying && appMode !== 'LIVE') || data.length === 0) return;

    const last = data[data.length - 1];
    if (!last.rsi || !last.nwUpper || !last.nwLower || !last.atr || !last.ema12 || !last.ema144 || !last.ema169) return;

    // --- 1. Exit Logic ---
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
        return; 
    }

    // --- 2. Entry Logic ---
    if (currentStrategy === 'SCALPER') {
        const isBelowLowerBand = last.close < last.nwLower; 
        const isRsiOversold = last.rsi < RSI_OS;
        if (isBelowLowerBand && isRsiOversold) {
            openTrade(last, 'LONG', `[Scalp] RSI ${last.rsi.toFixed(1)} + Price < Band`);
            return;
        }
        const isAboveUpperBand = last.close > last.nwUpper;
        const isRsiOverbought = last.rsi > RSI_OB;
        if (isAboveUpperBand && isRsiOverbought) {
            openTrade(last, 'SHORT', `[Scalp] RSI ${last.rsi.toFixed(1)} + Price > Band`);
            return;
        }
    } else {
        const isAboveTunnel = last.close > last.ema144 && last.close > last.ema169;
        const ema12CrossUp = last.ema12 > last.ema169;
        if (isAboveTunnel && ema12CrossUp && last.rsi > 50) {
             const threshold = appMode === 'LIVE' ? 0.3 : 0.7;
             if (Math.random() > threshold) openTrade(last, 'LONG', `[Vegas] Price > Tunnel + EMA12 Bullish`);
        }
        const isBelowTunnel = last.close < last.ema144 && last.close < last.ema169;
        const ema12CrossDown = last.ema12 < last.ema144;
        if (isBelowTunnel && ema12CrossDown && last.rsi < 50) {
            const threshold = appMode === 'LIVE' ? 0.3 : 0.7;
            if (Math.random() > threshold) openTrade(last, 'SHORT', `[Vegas] Price < Tunnel + EMA12 Bearish`);
        }
    }

  }, [data, isPlaying, appMode, activeTrade, openTrade, closeTrade, currentStrategy]);


  // Simulation Loop
  useEffect(() => {
    let interval: any;
    if (isPlaying && appMode === 'BACKTEST') {
      interval = setInterval(() => {
        setData(prevData => {
           let nextCandle: Candle;
           
           if (backlogRef.current.length > 0) {
               nextCandle = backlogRef.current.shift()!;
           } else {
               if (dataSource === 'CSV') {
                   setIsPlaying(false);
                   addLog("Backtest Complete: End of CSV Data.", "SUCCESS");
                   return prevData;
               }

               if (isRealData) {
                   setIsRealData(false);
                   addLog("Real history exhausted. Switching to synthetic data.", "WARNING");
               }
               const lastCandle = prevData[prevData.length - 1];
               nextCandle = generateNextCandle(lastCandle);
           }

           const processedNext = updateLastCandle(prevData, nextCandle);
           const newData = [...prevData, processedNext];
           
           // IMPLEMENT ROLLING BUFFER
           if (newData.length > MAX_STORED_CANDLES) {
               newData.shift();
           }
           
           return newData;
        });
      }, simulationDelay);
    }
    return () => clearInterval(interval);
  }, [isPlaying, appMode, isRealData, dataSource, simulationDelay]);

  const handleManualAnalysis = async () => {
    if (data.length === 0) return;
    setIsAnalyzing(true);
    const last = data[data.length - 1];
    
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

  const lastCandle = data[data.length - 1] || { 
    time: 0, 
    open: 0, 
    high: 0, 
    low: 0, 
    close: 0, 
    volume: 0 
  };
  
  return (
    <div className="flex flex-col h-full bg-gray-950 text-white p-4 gap-4 relative">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept=".csv,.txt" 
        className="hidden" 
      />

      {/* Header */}
      <div className="flex justify-between items-center bg-gray-900 p-4 rounded-lg border border-gray-800 shrink-0">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg transition-colors ${currentStrategy === 'SCALPER' ? 'bg-blue-600' : 'bg-purple-600'}`}>
            <Layers size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              {currentStrategy === 'SCALPER' ? 'Nadaraya-Watson Scalper' : 'Vegas Tunnel Bot'}
            </h1>
            <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{currentStrategy === 'SCALPER' ? 'Reversal • NW Env • RSI' : 'Trend • EMA Tunnel'}</span>
                {appMode !== 'IDLE' && (
                     <span className={`flex items-center gap-1 px-2 py-0.5 rounded border ${
                         appMode === 'LIVE' ? 'bg-red-900/50 text-red-400 border-red-800' : 'bg-blue-900/50 text-blue-400 border-blue-800'
                     }`}>
                        {appMode === 'LIVE' ? <><Activity size={10} className="animate-pulse"/> LIVE EXECUTION</> : <><FlaskConical size={10} /> BACKTEST MODE</>}
                     </span>
                )}
            </div>
          </div>

          <div className="h-8 w-px bg-gray-700 mx-2"></div>
          
           {/* Strategy Selector - Always Visible */}
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
        </div>
        
        <div className="flex items-center gap-4">
            
            {/* --- IDLE MODE TOOLBAR --- */}
            {appMode === 'IDLE' && (
                <>
                    <button 
                        onClick={startBacktest}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600/20 hover:bg-blue-600 border border-blue-600/50 text-blue-200 hover:text-white rounded-md font-bold transition-all"
                    >
                        <FlaskConical size={18} /> Backtest
                    </button>
                    <button 
                        onClick={startLiveStrategy}
                        className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-bold transition-all shadow-lg shadow-red-900/20"
                    >
                        <Zap size={18} /> Run Live Strategy
                    </button>
                </>
            )}

            {/* --- BACKTEST MODE TOOLBAR --- */}
            {appMode === 'BACKTEST' && (
                <div className="flex items-center gap-3 bg-gray-800/50 p-1.5 rounded-lg border border-gray-700 animate-in fade-in slide-in-from-right-4">
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs font-bold transition-colors" 
                        title="Upload CSV"
                    >
                        <Upload size={16} /> Load CSV
                    </button>

                    <div className="h-6 w-px bg-gray-600"></div>

                    <div className="flex items-center gap-1 px-2" title="Speed">
                        <Gauge size={16} className="text-gray-400" />
                        <select 
                            value={simulationDelay}
                            onChange={(e) => setSimulationDelay(Number(e.target.value))}
                            className="bg-transparent text-xs text-gray-300 outline-none w-16"
                        >
                            <option value={1000}>1x</option>
                            <option value={200}>5x</option>
                            <option value={100}>10x</option>
                            <option value={20}>50x</option>
                            <option value={1}>Max</option>
                        </select>
                    </div>

                    <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded font-bold text-sm transition-all ${
                        isPlaying 
                            ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                    >
                        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                    </button>

                    <button onClick={stopBacktest} className="p-2 hover:bg-red-900/50 text-red-400 hover:text-red-300 rounded transition-colors" title="Stop Backtest">
                        <StopCircle size={20} />
                    </button>
                </div>
            )}

            {/* --- LIVE MODE TOOLBAR --- */}
            {appMode === 'LIVE' && (
                 <div className="flex items-center gap-3 bg-red-900/10 p-1.5 rounded-lg border border-red-900/30 animate-in fade-in slide-in-from-right-4">
                    <select 
                        value={dataSource} 
                        onChange={(e) => {
                            const newSource = e.target.value as DataSource;
                            setDataSource(newSource);
                            // Live mode usually requires restarting connection if source changes, 
                            // but for simplicity we just set it here. Real app would reconnect.
                        }}
                        className="bg-gray-950 text-xs text-gray-300 border border-gray-700 rounded px-2 py-1 outline-none focus:border-red-500 uppercase"
                    >
                        <option value="BINANCE">Binance</option>
                        <option value="ALPACA">Alpaca</option>
                        <option value="FMP">FMP</option>
                    </select>

                    <label className="flex items-center gap-2 cursor-pointer px-2" title="Allow bot to execute orders">
                        <input type="checkbox" checked={autoExecute} onChange={e => setAutoExecute(e.target.checked)} className="accent-red-500" />
                        <span className="text-xs font-bold text-red-200">AUTO EXEC</span>
                    </label>

                    <div className="h-6 w-px bg-red-900/30"></div>

                    <button 
                        onClick={stopLiveStrategy}
                        className="flex items-center gap-2 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-sm transition-colors"
                    >
                        <StopCircle size={16} /> STOP
                    </button>
                 </div>
            )}

            {/* Common Tools */}
            <div className="flex items-center gap-2 border-l border-gray-700 pl-4">
                <button 
                    onClick={handleManualAnalysis}
                    disabled={isAnalyzing}
                    className="p-2 hover:bg-purple-900/30 rounded-md text-purple-300 transition-colors"
                    title="Ask AI Analyst"
                >
                    <BrainCircuit size={20} />
                </button>
                <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-2 hover:bg-gray-800 rounded-md text-gray-400 transition-colors"
                    title="API Settings"
                >
                    <Settings size={20} />
                </button>
                <button 
                    onClick={() => initData(dataSource)}
                    className="p-2 hover:bg-gray-800 rounded-md text-gray-400"
                    title="Refresh Data"
                >
                    <RefreshCw size={20} />
                </button>
            </div>
        </div>
      </div>
      
      {/* Content Area */}
      <div className="flex-grow flex gap-4 min-h-0 overflow-hidden">
        {/* Left Column: Chart */}
        <div className="flex-grow h-full flex flex-col gap-4">
           {/* Chart */}
           <div className="flex-grow min-h-0">
               <ChartPanel 
                    data={data} 
                    strategy={currentStrategy} 
                    isPlaying={isPlaying} 
                />
           </div>
        </div>

        {/* Right Sidebar - Stats and Logs */}
        <div className="w-96 shrink-0 h-full flex flex-col gap-4">
            {/* Stats */}
            <div className="shrink-0">
               <StatsPanel 
                status={appMode === 'LIVE' ? (activeTrade ? BotStatus.IN_POSITION : BotStatus.SCANNING) : BotStatus.IDLE} 
                lastCandle={lastCandle} 
                activeTrade={activeTrade} 
                pnl={pnl}
                strategy={currentStrategy}
               />
            </div>
            {/* Logs */}
            <div className="flex-grow min-h-0">
                <LogPanel logs={logs} />
            </div>
        </div>
      </div>

      {/* API Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg w-full max-w-md p-6 relative shadow-2xl">
            <button 
              onClick={() => setIsSettingsOpen(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Database className="text-blue-500" />
              Data Source Settings
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Preferred Source</label>
                <select 
                  value={dataSource}
                  onChange={(e) => setDataSource(e.target.value as DataSource)}
                  className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                >
                  <option value="BINANCE">Binance (Public API)</option>
                  <option value="ALPACA">Alpaca Markets</option>
                  <option value="FMP">Financial Modeling Prep</option>
                </select>
              </div>

              {dataSource === 'ALPACA' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                   <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Alpaca Key ID</label>
                    <input 
                      type="text" 
                      value={alpacaConfig.key}
                      onChange={(e) => setAlpacaConfig({...alpacaConfig, key: e.target.value})}
                      className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                      placeholder="PK..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Alpaca Secret Key</label>
                    <input 
                      type="password" 
                      value={alpacaConfig.secret}
                      onChange={(e) => setAlpacaConfig({...alpacaConfig, secret: e.target.value})}
                      className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                      placeholder="SK..."
                    />
                  </div>
                </div>
              )}

              {dataSource === 'FMP' && (
                <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">FMP API Key</label>
                    <input 
                      type="text" 
                      value={fmpApiKey}
                      onChange={(e) => setFmpApiKey(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                      placeholder="Your FMP Key..."
                    />
                </div>
              )}

              <div className="pt-4 border-t border-gray-800">
                <button 
                  onClick={saveSettings}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded transition-colors"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Analysis Modal */}
      {geminiAnalysis && (
           <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-gray-900 border border-purple-500/50 rounded-lg w-full max-w-lg p-6 relative shadow-2xl">
                 <button 
                  onClick={() => setGeminiAnalysis("")}
                  className="absolute top-4 right-4 text-gray-500 hover:text-white"
                >
                  <X size={20} />
                </button>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-purple-400">
                    <BrainCircuit /> AI Market Analysis
                </h2>
                <div className="bg-gray-950 p-4 rounded border border-gray-800 text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                    {geminiAnalysis}
                </div>
                <div className="mt-4 text-xs text-gray-600 text-center">
                    Powered by Google Gemini 3 Pro
                </div>
              </div>
           </div>
      )}
    </div>
  );
}
