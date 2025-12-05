
import { Candle } from '../types';

/**
 * Parses a CSV string into Candle array.
 * Supports dynamic column ordering if header is present.
 * Delimiters: Comma (,), Tab (\t), Semicolon (;), Space/Whitespace
 */
export const parseCSV = (content: string): Candle[] => {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  // 1. Detect Delimiter
  const sampleLine = lines[0].trim();
  const delimiters = [',', '\t', ';'];
  let delimiter: string | RegExp = ',';
  let maxCols = 0;

  for (const d of delimiters) {
      const cols = sampleLine.split(d).length;
      if (cols > maxCols) {
          maxCols = cols;
          delimiter = d;
      }
  }

  // Fallback to whitespace if standard delimiters fail
  // We use a regex that matches one or more whitespace characters
  if (maxCols < 2) {
      delimiter = /\s+/; 
  }

  // 2. Detect Header & Map Columns
  // Default mapping (Standard OHLCV)
  let colMap = { time: 0, open: 1, high: 2, low: 3, close: 4, volume: 5 };
  
  // Clean header parts
  const headerParts = sampleLine.split(delimiter)
    .map(p => p.trim().replace(/['"]/g, ''))
    .filter(p => p.length > 0);
  
  // Check if first row is header (contains letters)
  const isHeader = headerParts.some(part => /[a-zA-Z]/.test(part));
  
  let startRow = 0;
  
  if (isHeader) {
      startRow = 1; // Skip header row
      
      const lowerHeaders = headerParts.map(h => h.toLowerCase());
      
      // Helper to find index of keyword
      const findIdx = (keywords: string[]) => lowerHeaders.findIndex(h => keywords.some(k => h.includes(k)));
      
      const tIdx = findIdx(['time', 'date', 'ts', 'dt', 'timestamp']);
      const oIdx = findIdx(['open']);
      const hIdx = findIdx(['high']);
      const lIdx = findIdx(['low']);
      const cIdx = findIdx(['close']);
      const vIdx = findIdx(['vol']);

      // Only update map if we found plausible headers, otherwise stick to default
      if (tIdx !== -1) colMap.time = tIdx;
      if (oIdx !== -1) colMap.open = oIdx;
      if (hIdx !== -1) colMap.high = hIdx;
      if (lIdx !== -1) colMap.low = lIdx;
      if (cIdx !== -1) colMap.close = cIdx;
      if (vIdx !== -1) colMap.volume = vIdx;
  }

  const candles: Candle[] = [];

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Split and clean
    const parts = line.split(delimiter).map(p => p.trim()).filter(p => p.length > 0);
    
    // Need enough columns to satisfy the map
    const maxIdx = Math.max(...Object.values(colMap));
    if (parts.length <= maxIdx) continue;

    const cleanParts = parts.map(p => p.replace(/['"]/g, ''));

    // 3. Parse Time
    const timeRaw = cleanParts[colMap.time];
    let time = 0;

    if (/^\d+(\.\d+)?$/.test(timeRaw)) {
        const ts = parseFloat(timeRaw);
        // Auto-detect seconds vs ms (if < 100 billion, assume seconds)
        if (ts < 100000000000) {
            time = ts * 1000;
        } else {
            time = ts;
        }
    } else {
        const parsed = Date.parse(timeRaw);
        if (!isNaN(parsed)) time = parsed;
    }

    if (time === 0) continue;

    // 4. Parse OHLCV using dynamic map
    const open = parseFloat(cleanParts[colMap.open]);
    const high = parseFloat(cleanParts[colMap.high]);
    const low = parseFloat(cleanParts[colMap.low]);
    const close = parseFloat(cleanParts[colMap.close]);
    const volume = parseFloat(cleanParts[colMap.volume]) || 0;

    // Validation
    if (isNaN(open) || isNaN(close) || isNaN(high) || isNaN(low)) continue;

    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume
    });
  }

  return candles.sort((a, b) => a.time - b.time);
};
