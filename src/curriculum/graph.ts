import type { Lesson, Module, Track } from './schema';

// ─── Lessons ────────────────────────────────────────────────────────────────

const lesson1: Lesson = {
  id: 'lesson-1',
  title: 'Introduction to Programming',
  description: 'Learn what programming is and why it matters.',
  prerequisites: [],
  metadata: {
    difficulty: 'beginner',
    estimatedMinutes: 30,
    tags: ['fundamentals', 'intro', 'getting-started'],
    version: '1.0.0',
  },
  content: {
    markdown: `# Introduction to Programming

Programming is the process of creating instructions that tell a computer what to do.
These instructions are written in a **programming language**, which serves as a bridge
between human thought and machine execution.

## Why Learn Programming?

Programming is one of the most valuable skills in the modern world. Whether you want to
build websites, develop mobile apps, analyze data, or automate tasks, programming gives
you the power to create and innovate.

{{widget:callout-welcome}}

## How Programs Work

At its core, every program follows three basic steps:

1. **Input** — receive data from the user or another source
2. **Process** — manipulate the data according to your instructions
3. **Output** — display or store the results

This simple model underpins everything from simple scripts to complex distributed systems.

{{widget:quiz-basics}}
`,
    widgets: [
      {
        id: 'callout-welcome',
        type: 'callout',
        props: {
          emoji: '👋',
          title: 'Welcome!',
          body: "This is your first lesson. Take your time and don't rush — programming is a marathon, not a sprint.",
        },
      },
      {
        id: 'quiz-basics',
        type: 'quiz',
        props: {
          question: 'What are the three basic steps every program follows?',
          options: [
            { id: 'a', text: 'Compile, Run, Debug', isCorrect: false },
            { id: 'b', text: 'Input, Process, Output', isCorrect: true },
            { id: 'c', text: 'Read, Write, Execute', isCorrect: false },
            { id: 'd', text: 'Design, Build, Test', isCorrect: false },
          ],
          explanation:
            'Every program receives input, processes it according to your code, and produces output.',
        },
      },
    ],
  },
};

const lesson2: Lesson = {
  id: 'lesson-2',
  title: 'Variables and Data Types',
  description: 'Understand how to store and manipulate data.',
  prerequisites: ['lesson-1'],
  metadata: {
    difficulty: 'beginner',
    estimatedMinutes: 45,
    tags: ['variables', 'data-types', 'fundamentals'],
    version: '1.0.0',
  },
  content: {
    markdown: `# Variables and Data Types

Variables are containers for storing data values. Think of them as labeled boxes where
you can put different types of information.

## Declaring Variables

In JavaScript, you can declare variables using \`let\`, \`const\`, or the older \`var\` keyword:

\`\`\`javascript
let name = "Alice";     // can be reassigned
const age = 30;         // cannot be reassigned
\`\`\`

{{widget:note-types}}

## Common Data Types

| Type | Example | Description |
|------|---------|-------------|
| String | \`"hello"\` | Text values |
| Number | \`42\`, \`3.14\` | Numeric values |
| Boolean | \`true\`, \`false\` | Logical values |
| Null | \`null\` | Intentional absence of value |
| Undefined | \`undefined\` | Uninitialized variable |

{{widget:code-variables}}

## Type Coercion

JavaScript is dynamically typed, which means variables can hold different types at
different times. This can lead to surprising behavior:

\`\`\`javascript
"5" + 3   // "53" (string concatenation)
"5" - 3   // 2   (numeric subtraction)
\`\`\`

{{widget:quiz-types}}
`,
    widgets: [
      {
        id: 'note-types',
        type: 'note',
        props: {
          variant: 'tip',
          title: 'Pro Tip',
          body: 'Prefer `const` by default and only use `let` when you know the value will change. Avoid `var` in modern code.',
        },
      },
      {
        id: 'code-variables',
        type: 'code-editor',
        props: {
          language: 'javascript',
          initialCode: '// Try declaring a variable for your name and age\nlet myName = "";\nlet myAge = 0;\n\nconsole.log(`My name is ${myName} and I am ${myAge} years old.`);',
          solution: 'let myName = "Alice";\nlet myAge = 30;\n\nconsole.log(`My name is ${myName} and I am ${myAge} years old.`);',
          testCases: [
            { input: '', expected: 'My name is Alice and I am 30 years old.' },
          ],
        },
      },
      {
        id: 'quiz-types',
        type: 'quiz',
        props: {
          question: 'What is the result of `"5" + 3` in JavaScript?',
          options: [
            { id: 'a', text: '8', isCorrect: false },
            { id: 'b', text: '"53"', isCorrect: true },
            { id: 'c', text: 'NaN', isCorrect: false },
            { id: 'd', text: 'TypeError', isCorrect: false },
          ],
          explanation:
            'The `+` operator with a string triggers string concatenation. The number 3 is coerced to the string "3".',
        },
      },
    ],
  },
};

const lesson3: Lesson = {
  id: 'lesson-3',
  title: 'Control Flow',
  description: 'Master conditionals and loops to control program flow.',
  prerequisites: ['lesson-1', 'lesson-2'],
  metadata: {
    difficulty: 'intermediate',
    estimatedMinutes: 60,
    tags: ['conditionals', 'loops', 'control-flow', 'logic'],
    version: '1.0.0',
  },
  content: {
    markdown: `# Control Flow

Control flow determines the order in which your code executes. Without it, programs
would just run every line from top to bottom. With control flow, you can make decisions,
repeat actions, and handle different scenarios.

## Conditionals

The \`if...else\` statement lets your program choose different paths:

\`\`\`javascript
if (temperature > 30) {
  console.log("It's hot outside!");
} else if (temperature > 15) {
  console.log("Nice weather.");
} else {
  console.log("It's cold!");
}
\`\`\`

{{widget:diagram-flowchart}}

## Loops

Loops let you repeat code until a condition is met:

\`\`\`javascript
// for loop — when you know how many iterations
for (let i = 0; i < 5; i++) {
  console.log(i);
}

// while loop — when you don't know in advance
let count = 0;
while (count < 3) {
  console.log(count);
  count++;
}
\`\`\`

{{widget:code-loops}}

## Common Pitfalls

{{widget:note-infinite}}

Always make sure your loop condition will eventually become false, or you'll create an
**infinite loop** that crashes your program!
`,
    widgets: [
      {
        id: 'diagram-flowchart',
        type: 'diagram',
        props: {
          diagramType: 'flowchart',
          source: 'Start --> Check Temperature --> {> 30?} -->|Yes| Print Hot --> End\nCheck Temperature --> {> 15?} -->|Yes| Print Nice --> End\nCheck Temperature --> Print Cold --> End',
          caption: 'Decision flow for temperature-based output',
        },
      },
      {
        id: 'code-loops',
        type: 'code-editor',
        props: {
          language: 'javascript',
          initialCode: '// Write a loop that prints numbers 1 through 5\n\n\n// Expected output:\n// 1\n// 2\n// 3\n// 4\n// 5',
          solution: 'for (let i = 1; i <= 5; i++) {\n  console.log(i);\n}',
          testCases: [
            { input: '', expected: '1\n2\n3\n4\n5' },
          ],
        },
      },
      {
        id: 'note-infinite',
        type: 'note',
        props: {
          variant: 'danger',
          title: 'Warning: Infinite Loops',
          body: 'If your loop condition never becomes false, your program will freeze or crash. Always double-check that your loop will terminate!',
        },
      },
    ],
  },
};

// ─── Module ─────────────────────────────────────────────────────────────────

const fundamentalsModule: Module = {
  id: 'module-fundamentals',
  title: 'Programming Fundamentals',
  description: 'Core concepts every engineer needs to master.',
  lessons: [lesson1, lesson2, lesson3],
};

// ─── Track ──────────────────────────────────────────────────────────────────

export const tracks: Track[] = [
  {
    id: 'track-software-engineering',
    title: 'Software Engineering',
    description:
      'A comprehensive learning path from programming basics to full-stack mastery.',
    modules: [fundamentalsModule],
  },
];

/**
 * The default track to render when no specific track is selected.
 */
export const defaultTrack = tracks[0];
