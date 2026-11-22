// Re-export universal components (not tied to a specific schema type)
export { Sandbox } from '@/components/universal/Sandbox';
export { Mutator } from '@/components/universal/Mutator';
export { TradeOff } from '@/components/universal/TradeOff';
export { ContextDiagram } from '@/components/universal/ContextDiagram';
export { SocraticChat } from '@/components/universal/SocraticChat';

// Re-export the widget registry for convenient access
export { widgetRegistry } from '@/engine/registry';
export type { WidgetProps, WidgetComponent } from '@/engine/registry';
