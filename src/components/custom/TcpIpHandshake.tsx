import type { WidgetProps } from '@/engine/registry';
import { Server, Laptop, ArrowRight, ArrowLeft } from 'lucide-react';

export interface TcpIpHandshakeProps extends WidgetProps {
  clientIp: string;
  serverIp: string;
  sequence: Array<{ step: string; from: 'client' | 'server'; label: string }>;
}

export function TcpIpHandshake({ clientIp, serverIp, sequence }: TcpIpHandshakeProps) {
  return (
    <div className="p-6 bg-slate-900 text-white rounded-xl font-mono text-sm">
      <div className="flex justify-between mb-8">
        <div className="flex flex-col items-center">
          <Laptop className="text-blue-400 mb-2" size={32} />
          <span className="text-blue-400">Client</span>
          <span className="text-slate-400 text-xs">{clientIp}</span>
        </div>
        <div className="flex flex-col items-center">
          <Server className="text-green-400 mb-2" size={32} />
          <span className="text-green-400">Server</span>
          <span className="text-slate-400 text-xs">{serverIp}</span>
        </div>
      </div>

      <div className="space-y-4">
        {sequence.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-16 text-right text-slate-500">{item.step}</span>
            {item.from === 'client' ? (
              <ArrowRight className="text-yellow-400 flex-1" />
            ) : (
              <ArrowLeft className="text-purple-400 flex-1" />
            )}
            <span className="w-24 text-left font-bold">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
