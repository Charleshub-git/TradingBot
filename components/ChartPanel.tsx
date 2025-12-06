
import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { createChart, ColorType, CrosshairMode, IChartApi, ISeriesApi, Time, SeriesMarker } from 'lightweight-charts';
import { Candle, Strategy } from '../types';
import { format } from 'date-fns';

interface ChartPanelProps {
  data: Candle[];
  strategy: Strategy;
  isPlaying: boolean;
}

const ChartPanel: React.FC<ChartPanelProps> = ({ data, strategy, isPlaying }) => {
  const [showIndicators, setShowIndicators] = useState(true);
  
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  
  // Series Refs
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  
  // Scalper Indicators
  const upperBandRef = useRef<ISeriesApi<"Line"> | null>(null);
  const midBandRef = useRef<ISeriesApi<"Line"> | null>(null);
  const lowerBandRef = useRef<ISeriesApi<"Line"> | null>(null);
  
  // Vegas Indicators
  const ema12Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema144Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema169Ref = useRef<ISeriesApi<"Line"> | null>(null);

  // Track state for incremental updates
  const lastProcessedTimeRef = useRef<number | null>(null);
  const prevDataLengthRef = useRef<number>(0);

  // Legend State
  const [legendData, setLegendData] = useState<any>(null);

  // Consistent Date Formatter
  const formatTime = (time: number) => {
      // time is in seconds (lightweight-charts), Date expects ms
      return format(new Date(time * 1000), 'yyyy-MM-dd HH:mm');
  };

  // Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#ebf0f5' },
        textColor: '#334155',
      },
      grid: {
        vertLines: { color: '#cbd5e1', style: 2, visible: true }, // Dotted, light
        horzLines: { color: '#cbd5e1', style: 2, visible: true },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      localization: {
        // Use the same formatter for the axis as the legend to prevent discrepancies
        timeFormatter: (timestamp: number) => formatTime(timestamp),
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#94a3b8',
      },
      rightPriceScale: {
        borderColor: '#94a3b8',
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Create Main Candle Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#15803d',
      wickDownColor: '#b91c1c',
    });
    candleSeriesRef.current = candleSeries;

    // Crosshair Movement Handler for Legend
    chart.subscribeCrosshairMove((param) => {
      const container = chartContainerRef.current;
      // Strict null checks for container and point
      if (!container || !param || !param.point) {
        setLegendData(null);
        return;
      }

      // Boundary Check using container dimensions
      if (
        param.point.x < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y < 0 ||
        param.point.y > container.clientHeight
      ) {
        setLegendData(null);
      } else {
        // Get data from the candle series
        const price = param.seriesData.get(candleSeries) as any;
        if (price) {
           setLegendData({
               time: param.time,
               open: price.open,
               high: price.high,
               low: price.low,
               close: price.close
           });
        }
      }
    });

    const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({ 
                width: chartContainerRef.current.clientWidth,
                height: chartContainerRef.current.clientHeight
            });
        }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update Data and Indicators
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    // Helper to clean up series
    const cleanSeries = (ref: React.MutableRefObject<ISeriesApi<"Line"> | null>) => {
        if (ref.current) {
            try { chartRef.current?.removeSeries(ref.current); } catch (e) { }
            ref.current = null;
        }
    };

    // Ensure indicator series exist based on strategy
    if (showIndicators) {
        if (strategy === 'SCALPER') {
            if (!upperBandRef.current) upperBandRef.current = chartRef.current.addLineSeries({ color: '#06b6d4', lineWidth: 2, title: 'Top Band', crosshairMarkerVisible: false });
            if (!midBandRef.current) midBandRef.current = chartRef.current.addLineSeries({ color: '#eab308', lineWidth: 2, title: 'Midline', crosshairMarkerVisible: false });
            if (!lowerBandRef.current) lowerBandRef.current = chartRef.current.addLineSeries({ color: '#d946ef', lineWidth: 2, title: 'Bot Band', crosshairMarkerVisible: false });
            cleanSeries(ema12Ref); cleanSeries(ema144Ref); cleanSeries(ema169Ref);
        } else {
            if (!ema12Ref.current) ema12Ref.current = chartRef.current.addLineSeries({ color: '#eab308', lineWidth: 2, title: 'EMA 12', crosshairMarkerVisible: false });
            if (!ema144Ref.current) ema144Ref.current = chartRef.current.addLineSeries({ color: '#06b6d4', lineWidth: 2, title: 'EMA 144', crosshairMarkerVisible: false });
            if (!ema169Ref.current) ema169Ref.current = chartRef.current.addLineSeries({ color: '#d946ef', lineWidth: 2, title: 'EMA 169', crosshairMarkerVisible: false });
            cleanSeries(upperBandRef); cleanSeries(midBandRef); cleanSeries(lowerBandRef);
        }
    } else {
        cleanSeries(upperBandRef); cleanSeries(midBandRef); cleanSeries(lowerBandRef);
        cleanSeries(ema12Ref); cleanSeries(ema144Ref); cleanSeries(ema169Ref);
    }

    // Format Data
    const formattedData = data
        .filter(d => d.time && !isNaN(d.open))
        .map(d => ({
            time: (d.time / 1000) as Time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
        }));

    if (formattedData.length === 0) return;

    // --- UPDATE LOGIC (Incremental vs Full Reset) ---
    const lastCandle = formattedData[formattedData.length - 1];
    
    // Check if this is a simple append (one new candle, time moved forward)
    // We strictly check if the time is newer to allow for rolling buffers (where length stays same)
    const isNewTime = lastProcessedTimeRef.current !== null && (lastCandle.time as number) > lastProcessedTimeRef.current!;

    if (isNewTime) {
        // 1. Update Candle
        candleSeriesRef.current.update(lastCandle);

        // 2. Update Indicators
        const rawLast = data[data.length - 1];
        const t = (rawLast.time / 1000) as Time;
        
        if (showIndicators) {
            if (strategy === 'SCALPER') {
                upperBandRef.current?.update({ time: t, value: rawLast.nwUpper || rawLast.close });
                midBandRef.current?.update({ time: t, value: rawLast.nwMid || rawLast.close });
                lowerBandRef.current?.update({ time: t, value: rawLast.nwLower || rawLast.close });
            } else {
                ema12Ref.current?.update({ time: t, value: rawLast.ema12 || rawLast.close });
                ema144Ref.current?.update({ time: t, value: rawLast.ema144 || rawLast.close });
                ema169Ref.current?.update({ time: t, value: rawLast.ema169 || rawLast.close });
            }
        }
    } else {
        // FULL RESET (Load new CSV, change timeframe, first load, or strategy change)
        candleSeriesRef.current.setData(formattedData);
        
        // Reset Indicators
        if (showIndicators) {
            const mapLine = (k: keyof Candle) => data.map(d => ({ time: (d.time/1000) as Time, value: (d[k] as number) || d.close }));
            if (strategy === 'SCALPER') {
                upperBandRef.current?.setData(mapLine('nwUpper'));
                midBandRef.current?.setData(mapLine('nwMid'));
                lowerBandRef.current?.setData(mapLine('nwLower'));
            } else {
                ema12Ref.current?.setData(mapLine('ema12'));
                ema144Ref.current?.setData(mapLine('ema144'));
                ema169Ref.current?.setData(mapLine('ema169'));
            }
        }

        // Only auto-fit time scale on full reset or significant change, not during simulation tick
        if (!isPlaying && formattedData.length > 0) {
             chartRef.current.timeScale().fitContent();
        }
    }

    // Update Refs
    lastProcessedTimeRef.current = (lastCandle.time as number);
    prevDataLengthRef.current = formattedData.length;

    // Markers
    const markers: SeriesMarker<Time>[] = [{
        time: lastCandle.time,
        position: 'aboveBar',
        color: '#f59e0b',
        shape: 'arrowDown',
        text: 'HEAD',
        size: 2,
    }];
    candleSeriesRef.current.setMarkers(markers);

    // Update Legend
    if (data.length > 0) {
        const last = data[data.length - 1];
        setLegendData({
            time: last.time / 1000,
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close
        });
    }

  }, [data, strategy, showIndicators, isPlaying]);


  return (
    <div className="w-full h-full bg-[#ebf0f5] rounded-lg p-1 border border-gray-300 flex flex-col shadow-inner relative">
      <div className="absolute top-3 left-4 z-10 flex flex-col gap-1 pointer-events-none">
        <h2 className="text-gray-800 text-sm font-bold uppercase tracking-wider flex items-center gap-2 drop-shadow-md">
            BTC/USDT 5m • 
            <span className={strategy === 'SCALPER' ? 'text-cyan-700' : 'text-purple-700'}>
                {strategy === 'SCALPER' ? 'NW Envelope + RSI' : 'Vegas Tunnel'}
            </span>
        </h2>
        {legendData && (
            <div className="flex gap-3 text-xs font-mono bg-white/80 backdrop-blur-sm p-1 rounded shadow-sm border border-gray-200">
                <span className="text-gray-500 font-bold">{formatTime(legendData.time)}</span>
                <span className="text-gray-800">O: <span className="font-semibold">{legendData.open?.toFixed(2)}</span></span>
                <span className="text-gray-800">H: <span className="font-semibold">{legendData.high?.toFixed(2)}</span></span>
                <span className="text-gray-800">L: <span className="font-semibold">{legendData.low?.toFixed(2)}</span></span>
                <span className="text-gray-800">C: <span className="font-semibold" style={{ color: legendData.close >= legendData.open ? '#15803d' : '#b91c1c' }}>{legendData.close?.toFixed(2)}</span></span>
            </div>
        )}
      </div>

      <div className="absolute top-3 right-4 z-10 flex items-center gap-4 pointer-events-none">
          <div className="pointer-events-auto"> 
            <button
                onClick={() => setShowIndicators(!showIndicators)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-bold transition-all shadow-sm cursor-pointer ${
                    showIndicators 
                    ? 'bg-blue-100 border-blue-300 text-blue-700' 
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
            >
                {showIndicators ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{showIndicators ? 'Hide Indicators' : 'Show Indicators'}</span>
            </button>
          </div>

          {showIndicators && (
            <div className="flex gap-4 text-xs font-semibold text-gray-700 animate-in fade-in slide-in-from-right-4 duration-300 bg-white/80 backdrop-blur-sm px-2 py-1.5 rounded border border-gray-200 pointer-events-auto">
              {strategy === 'SCALPER' ? (
                  <>
                    <div className="flex items-center gap-1"><span className="w-3 h-1 bg-cyan-400"></span> Top</div>
                    <div className="flex items-center gap-1"><span className="w-3 h-1 bg-yellow-400"></span> Mid</div>
                    <div className="flex items-center gap-1"><span className="w-3 h-1 bg-magenta-500" style={{backgroundColor: '#d946ef'}}></span> Bot</div>
                  </>
              ) : (
                  <>
                    <div className="flex items-center gap-1"><span className="w-3 h-1 bg-yellow-400"></span> EMA12</div>
                    <div className="flex items-center gap-1"><span className="w-3 h-1 bg-cyan-400"></span> Top</div>
                    <div className="flex items-center gap-1"><span className="w-3 h-1 bg-magenta-500" style={{backgroundColor: '#d946ef'}}></span> Bot</div>
                  </>
              )}
            </div>
          )}
      </div>
      
      <div ref={chartContainerRef} className="w-full h-full rounded overflow-hidden" />
    </div>
  );
};

export default ChartPanel;
