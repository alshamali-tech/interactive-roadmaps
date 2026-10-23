export { QuizWidget } from './QuizWidget';
export { CodeEditorWidget } from './CodeEditorWidget';
export { DiagramWidget } from './DiagramWidget';
export { NoteWidget } from './NoteWidget';
export { CalloutWidget } from './CalloutWidget';
export { VideoWidget } from './VideoWidget';

// Re-export universal components (not tied to a specific schema type)
export { Sandbox } from '@/components/universal/Sandbox';

// Re-export the widget registry for convenient access
export { widgetRegistry } from '@/engine/registry';
export type { WidgetProps, WidgetComponent } from '@/engine/registry';
