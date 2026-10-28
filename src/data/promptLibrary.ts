export interface PromptStarter {
  id: string;
  label: string;
  icon?: string;
  template: string;
  context: 'global' | 'mutator' | 'sandbox' | 'node_graph' | 'trade_off' | 'generator';
}

export const promptLibrary: PromptStarter[] = [
  {
    id: 'hint',
    label: 'Give me a hint',
    icon: '💡',
    template: 'I am stuck on the current challenge. Please give me a conceptual hint to unblock me, but DO NOT give me the exact code or the final answer.',
    context: 'global',
  },
  {
    id: 'explain_simple',
    label: "Explain like I'm 5",
    icon: '🧠',
    template: 'The concept I am learning right now is confusing. Please explain it using a simple, real-world analogy that a beginner can understand.',
    context: 'global',
  },
  {
    id: 'quiz_me',
    label: 'Quiz me',
    icon: '📝',
    template: "Based on what I just read, ask me a challenging question to test my understanding. Wait for my answer before revealing if I'm correct.",
    context: 'global',
  },
  {
    id: 'real_world',
    label: 'Real-world use case',
    icon: '🌍',
    template: 'Explain how this concept is used in a real-world production system. Give me a specific example from a well-known company or product.',
    context: 'global',
  },
  {
    id: 'common_mistakes',
    label: 'Common mistakes',
    icon: '⚠️',
    template: 'What are the most common mistakes developers make when working with this topic? How can I avoid them?',
    context: 'global',
  },
  {
    id: 'compare',
    label: 'Compare alternatives',
    icon: '⚖️',
    template: "What are the main alternatives to this approach? What are the trade-offs of each compared to what I'm learning?",
    context: 'global',
  },
  {
    id: 'why_failing',
    label: 'Why is my code failing?',
    icon: '🔍',
    template: "I've written code for the current challenge but it's not passing the tests. Can you help me understand what might be wrong without giving me the solution?",
    context: 'mutator',
  },
  {
    id: 'complexity',
    label: "What's the complexity?",
    icon: '📊',
    template: "Can you analyze the time and space complexity of the approach I'm taking? Is there a more efficient way?",
    context: 'mutator',
  },
  {
    id: 'optimize',
    label: 'Optimize this',
    icon: '⚡',
    template: "Look at what I've written in the sandbox. Can you suggest ways to make it more efficient or cleaner?",
    context: 'sandbox',
  },
  {
    id: 'explain_output',
    label: 'Explain the output',
    icon: '📋',
    template: 'I ran my code/prompt and got an unexpected output. Can you help me understand why?',
    context: 'sandbox',
  },
  {
    id: 'make_quiz',
    label: 'Make it a quiz',
    icon: '📝',
    template: 'Turn this content into a 5-question multiple-choice quiz that tests deep understanding, not just memorization.',
    context: 'generator',
  },
  {
    id: 'make_challenge',
    label: 'Make it a code challenge',
    icon: '💻',
    template: 'Create a hands-on coding challenge based on this content. Include broken code that I need to fix.',
    context: 'generator',
  },
];

export function getPromptsByContext(context: string): PromptStarter[] {
  const globalPrompts = promptLibrary.filter(p => p.context === 'global');
  if (context === 'global') {
    return globalPrompts;
  }
  const contextPrompts = promptLibrary.filter(p => p.context === context);
  return [...globalPrompts, ...contextPrompts];
}
