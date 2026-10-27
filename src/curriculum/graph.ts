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

## Try It Yourself: Input → Process → Output

Here's a live sandbox. Type anything in the left pane and watch the right pane
update in real-time. The \`process\` function transforms your input into HTML.

{{widget:sandbox-echo}}

Now try a code-style sandbox — type JavaScript and see it evaluated as text output:

{{widget:sandbox-code}}
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
      {
        id: 'sandbox-echo',
        type: 'sandbox',
        props: {
          inputType: 'text',
          outputType: 'html',
          initialState: 'Hello, Engineer!',
          label: 'Live Preview: Text → HTML',
          placeholder: 'Type something and watch it become HTML...',
          processFunction: `function process(input) {
  // Reverse the input, uppercase it, and wrap in styled HTML
  const reversed = input.split('').reverse().join('');
  return \`
    <div style="font-family: system-ui, sans-serif;">
      <h2 style="color: #0066cc; margin: 0 0 8px;">Your input:</h2>
      <p style="font-size: 18px; background: #f0f4ff; padding: 12px; border-radius: 6px; margin: 0 0 12px;">\${input}</p>
      <h2 style="color: #0066cc; margin: 0 0 8px;">Reversed:</h2>
      <p style="font-size: 18px; background: #fff0f4; padding: 12px; border-radius: 6px; margin: 0 0 12px;">\${reversed}</p>
      <p style="color: #666; font-size: 13px;">Character count: <strong>\${input.length}</strong> | Word count: <strong>\${input.trim().split(/\\s+/).filter(Boolean).length}</strong></p>
    </div>
  \`;
}`,
        },
      },
      {
        id: 'sandbox-code',
        type: 'sandbox',
        props: {
          inputType: 'code',
          outputType: 'text',
          initialState: 'const x = 10;\nconst y = 20;\nreturn x + y;',
          label: 'JavaScript Evaluator',
          placeholder: 'Write JavaScript code that returns a value...',
          processFunction: `function process(input) {
  // Safely evaluate the code and return the result
  try {
    const fn = new Function(input);
    const result = fn();
    return 'Result: ' + (result === undefined ? '(no return value — add "return" to your code)' : JSON.stringify(result, null, 2));
  } catch (err) {
    return 'Error: ' + err.message;
  }
}`,
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

## Experiment: Type Coercion Sandbox

Play with type coercion live. Change the input and watch JavaScript's
surprising behavior in real-time:

{{widget:sandbox-coercion}}

## Challenge: Fix the Calculator

Can you spot the bug in this function? The developer meant to create a
\`multiply\` function, but something is wrong with the operator...

{{widget:mutator-calculator}}
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
      {
        id: 'sandbox-coercion',
        type: 'sandbox',
        props: {
          inputType: 'code',
          outputType: 'text',
          initialState: '"5" + 3',
          label: 'Type Coercion Lab',
          placeholder: 'Try: "5" - 3  or  true + 1  or  [] + {}',
          processFunction: `function process(input) {
  try {
    const fn = new Function('return (' + input + ')');
    const result = fn();
    return 'Expression:  ' + input +
           '\\nResult:      ' + String(result) +
           '\\nType:        ' + typeof result +
           '\\nJSON:        ' + JSON.stringify(result);
  } catch (err) {
    return 'Error: ' + err.message;
  }
}`,
        },
      },
      {
        id: 'mutator-calculator',
        type: 'mutator',
        props: {
          language: 'javascript',
          title: 'Fix the Multiply Function',
          brokenCode: 'function multiply(a, b) {\n  return a + b;\n}',
          testCases: [
            'multiply(2, 3) => 6',
            'multiply(0, 5) => 0',
            'multiply(-1, 4) => -4',
            'multiply(10, 10) => 100',
          ],
          hint: 'Look at the operator inside the function. Is `+` the right operator for multiplication?',
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

## Challenge: Fix the Even Checker

This function should return \`true\` for even numbers and \`false\` for odd numbers.
But the logic is backwards — can you debug it?

{{widget:mutator-even}}

## Visual Pipelines: Drag-and-Drop Flow

Control flow isn't just for code — it's the foundation of **data pipelines** too.

In the interactive canvas below, you can:
- **Drag nodes** to rearrange the layout
- **Connect nodes** by dragging from a colored dot (right side) to another node's dot (left side)
- **Delete connections** by clicking an edge to select it, then pressing Delete or Backspace
- Click **Run Pipeline** to validate the graph and watch data flow through it

A valid pipeline must have exactly one Input node, exactly one Output node, no cycles,
and all nodes reachable from the Input. Try breaking the connections and rebuilding them!

{{widget:pipeline-demo}}
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
      {
        id: 'mutator-even',
        type: 'mutator',
        props: {
          language: 'javascript',
          title: 'Fix the Even Number Checker',
          brokenCode: 'function isEven(n) {\n  if (n % 2 === 0) {\n    return false;\n  } else {\n    return true;\n  }\n}',
          testCases: [
            'isEven(2) => true',
            'isEven(3) => false',
            'isEven(0) => true',
            'isEven(7) => false',
            'isEven(100) => true',
          ],
          hint: 'If `n % 2 === 0` is true, that means the number IS divisible by 2 — which makes it even, not odd!',
        },
      },
      {
        id: 'pipeline-demo',
        type: 'node-graph',
        props: {
          title: '🧩 Data Processing Pipeline — Try It!',
          playground: true,
          initialNodes: [
            { id: 'source', type: 'input', position: { x: 0, y: 100 }, label: 'Data Source', description: 'Raw input stream' },
            { id: 'filter', type: 'process', position: { x: 250, y: 100 }, label: 'Filter', description: 'Remove invalid entries' },
            { id: 'validator', type: 'condition', position: { x: 500, y: 0 }, label: 'Valid?', description: 'Schema check' },
            { id: 'transform', type: 'process', position: { x: 750, y: 0 }, label: 'Transform', description: 'Normalize & enrich' },
            { id: 'error', type: 'process', position: { x: 500, y: 200 }, label: 'Error Log', description: 'Failed records' },
            { id: 'output', type: 'output', position: { x: 1000, y: 0 }, label: 'Database', description: 'Persist results' },
          ],
          initialEdges: [
            { id: 'e1', source: 'source', target: 'filter', animated: false },
            { id: 'e2', source: 'filter', target: 'validator', animated: false },
            { id: 'e3', source: 'validator', target: 'transform', label: 'Yes', animated: false },
            { id: 'e4', source: 'validator', target: 'error', label: 'No', animated: false },
            { id: 'e5', source: 'transform', target: 'output', animated: false },
          ],
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
