import type { Lesson } from '@/curriculum/schema';

/**
 * Integration test lesson that includes all 5 widget types.
 * Used to verify widgets work together without conflicts.
 */
export const integrationTestLesson: Lesson = {
  id: 'integration-test-lesson',
  title: 'Integration Test: All Widgets Together',
  description: 'A comprehensive test lesson featuring all widget types',
  prerequisites: [],
  metadata: {
    difficulty: 'intermediate',
    estimatedMinutes: 45,
    tags: ['integration', 'testing', 'widgets'],
    version: '1.0.0'
  },
  content: {
    markdown: `
# Integration Test: All Widgets Together

This lesson contains all 5 widget types to verify they work together correctly.

## Section 1: Code Playground

Try the sandbox widget below to write and test code.

{{widget:widget-sandbox}}

## Section 2: Bug Fixing Challenge

Fix the bug in the code below to make all tests pass.

{{widget:widget-mutator}}

## Section 3: Decision Making

Choose between two database options and see the tradeoffs.

{{widget:widget-tradeoff}}

## Section 4: System Architecture

Explore the authentication flow diagram.

{{widget:widget-diagram}}

## Section 5: Ask Questions

Use the Socratic chat to ask questions about this lesson.

{{widget:widget-chat}}
`,
    widgets: [
      // Widget 1: Sandbox
      {
        id: 'widget-sandbox',
        type: 'sandbox',
        props: {
          inputType: 'text',
          outputType: 'text',
          initialState: 'console.log("Hello from sandbox!");',
          tokenLimit: 500,
          widgetId: 'widget-sandbox'
        }
      },
      // Widget 2: Mutator (Code Fix Challenge)
      {
        id: 'widget-mutator',
        type: 'mutator',
        props: {
          title: 'Fix the Bug',
          language: 'javascript',
          brokenCode: 'function multiply(a, b) { return a - b; }',
          hint: 'Think about what multiplication means mathematically.',
          testCases: [
            'multiply(2, 3) => 6',
            'multiply(5, 5) => 25',
            'multiply(0, 10) => 0'
          ]
        }
      },
      // Widget 3: TradeOff (Decision Making)
      {
        id: 'widget-tradeoff',
        type: 'trade-off',
        props: {
          scenario: 'Which database should we use for our startup?',
          options: [
            {
              id: 'postgres',
              name: 'PostgreSQL',
              description: 'Mature relational database with ACID compliance',
              pros: ['ACID compliant', 'Rich feature set', 'Strong community'],
              cons: ['Complex setup', 'Higher resource usage'],
              metrics: { cost: 3, performance: 7, complexity: 6, scalability: 7 }
            },
            {
              id: 'mongodb',
              name: 'MongoDB',
              description: 'Flexible NoSQL database for rapid development',
              pros: ['Schema flexibility', 'Fast writes', 'Easy scaling'],
              cons: ['No ACID by default', 'Memory intensive'],
              metrics: { cost: 4, performance: 8, complexity: 4, scalability: 9 }
            }
          ],
          explanation: 'For most startups, PostgreSQL is the safer choice due to ACID compliance.'
        }
      },
      // Widget 4: Context Diagram
      {
        id: 'widget-diagram',
        type: 'context-diagram',
        props: {
          diagram: {
            type: 'flow',
            title: 'User Authentication Flow',
            nodes: [
              { id: 'user', label: 'User', type: 'input', description: 'The end user initiating login' },
              { id: 'frontend', label: 'Frontend', type: 'process', description: 'React application' },
              { id: 'api', label: 'API Gateway', type: 'process', description: 'Handles authentication requests' },
              { id: 'auth', label: 'Auth Service', type: 'service', description: 'Validates credentials' },
              { id: 'success', label: 'Login Success', type: 'output', description: 'User receives JWT token' }
            ],
            edges: [
              { from: 'user', to: 'frontend', label: 'Enters credentials' },
              { from: 'frontend', to: 'api', label: 'POST /login' },
              { from: 'api', to: 'auth', label: 'Validate' },
              { from: 'auth', to: 'success', label: 'Return token' }
            ]
          }
        }
      },
      // Widget 5: Socratic Chat
      {
        id: 'widget-chat',
        type: 'socratic-chat',
        props: {
          mode: 'tutor'
        }
      }
    ]
  }
};
