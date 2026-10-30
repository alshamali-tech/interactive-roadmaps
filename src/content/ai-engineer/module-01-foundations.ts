/**
 * Module 1: Foundations — AI Engineer Track
 *
 * The first module in the AI Engineer roadmap. Introduces core concepts
 * like tokens/context windows and networking fundamentals that every
 * AI engineer needs to understand.
 */

import type { Lesson } from '@/curriculum/schema';

export const module01Lessons: Lesson[] = [
  {
    id: 'tokens',
    title: 'Tokens & Context Windows',
    description:
      'Understand how LLMs process text and why context window limits matter for your prompts.',
    prerequisites: [],
    metadata: {
      difficulty: 'beginner',
      estimatedMinutes: 10,
      tags: ['llm', 'tokens', 'context'],
      version: '1.0.0',
    },
    content: {
      markdown: `# Understanding Tokens & Context Windows

Large Language Models don't read words. They read **tokens**. A token is roughly 4 characters, or about 3/4 of a word.

### Why does this matter?
Every model has a **Context Window** (e.g., 4,096 tokens). If your prompt + the AI's response exceeds this limit, the model will crash or truncate your text.

Let's test this! Type some text in the Sandbox below and watch how many tokens it generates.

{{widget:sandbox-tokens}}

### Challenge
Try pasting a large block of text (like a terms of service agreement) into the sandbox. Notice how quickly the token count climbs!`,
      widgets: [
        {
          id: 'sandbox-tokens',
          type: 'sandbox',
          props: {
            inputType: 'text',
            outputType: 'text',
            initialState: 'Type here to count tokens...',
            label: 'Token Counter',
            placeholder: 'Paste or type any text to see how many tokens it generates...',
            processFunction: `function process(input) {
  // Simple token approximation: ~4 chars per token (GPT-style)
  const chars = input.length;
  const words = input.trim() ? input.trim().split(/\\s+/).length : 0;
  const approxTokens = Math.ceil(chars / 4);
  const sentences = input.split(/[.!?]+/).filter(s => s.trim()).length;

  return \`
Character count:  \${chars}
Word count:       \${words}
Sentence count:   \${sentences}
──────────────────────────
Approx tokens:    ~\${approxTokens}
(GPT-style: ~4 chars per token)

Context window usage (4K model):
\${'█'.repeat(Math.min(Math.round((approxTokens / 4096) * 30), 30))}\${'░'.repeat(Math.max(30 - Math.round((approxTokens / 4096) * 30), 0))} \${((approxTokens / 4096) * 100).toFixed(1)}%
\`;
}`,
          },
        },
      ],
    },
  },
  {
    id: 'tcp-ip-basics',
    title: 'Network Basics: The TCP/IP Handshake',
    description:
      'Learn the 3-way handshake that underpins every network request — and why it matters for AI latency.',
    prerequisites: ['tokens'],
    metadata: {
      difficulty: 'intermediate',
      estimatedMinutes: 8,
      tags: ['networking', 'backend', 'tcp'],
      version: '1.0.0',
    },
    content: {
      markdown: `# The TCP/IP 3-Way Handshake

Before data can be sent over a network, the client and server must establish a connection. This is called the 3-way handshake (SYN, SYN-ACK, ACK).

Let's visualize this process:

{{widget:tcp-visualizer}}

As an AI Engineer, you need to understand this because network latency during this handshake can severely impact the **Time-to-First-Token (TTFT)** in your RAG pipelines. Every external API call to an LLM provider (OpenAI, Anthropic, etc.) goes through this handshake before any data flows.

### Key Takeaway
When you see high TTFT numbers in your AI application, the TCP handshake is often the hidden culprit — especially for users far from the provider's data centers.`,
      widgets: [
        {
          id: 'tcp-visualizer',
          type: 'tcp-ip',
          props: {
            clientIp: '192.168.1.10',
            serverIp: '10.0.0.5',
            sequence: [
              { step: '1. SYN', from: 'client', label: 'Seq=100' },
              { step: '2. SYN-ACK', from: 'server', label: 'Seq=300, Ack=101' },
              { step: '3. ACK', from: 'client', label: 'Ack=301' },
            ],
          },
        },
      ],
    },
  },
];