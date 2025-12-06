
import React, { useEffect, useRef } from 'react';
import { format } from 'date-fns';

interface LogEntry {
  time: number;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
}

interface LogPanelProps {
  logs: LogEntry[];
}

const LogPanel: React.FC<LogPanelProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getColor = (type: string) => {
    switch(type) {
        case 'SUCCESS': return 'text-green-400';
        case 'WARNING': return 'text-yellow-400';
        case 'ERROR': return 'text-red-400';
        default: return 'text-gray-400';
    }
  }

  return (
    <div className="h-full bg-gray-900 border border-gray-800 rounded-lg flex flex-col overflow-hidden">
      <div className="p-3 border-b border-gray-800 bg-gray-850">
        <h3 className="text-xs font-bold uppercase text-gray-400">System Logs</h3>
      </div>
      <div className="flex-grow overflow-y-auto p-2 font-mono text-xs space-y-1">
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2 hover:bg-gray-800 p-1 rounded">
            <span className="text-gray-600 shrink-0">[{format(new Date(log.time), 'yyyy-MM-dd HH:mm:ss')}]</span>
            <span className={`${getColor(log.type)} break-all`}>{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default LogPanel;
