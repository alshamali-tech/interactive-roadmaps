# Universal Components

Interactive widget components for the Software Engineer Academy curriculum system.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Widget Registry](#widget-registry)
- [Available Widgets](#available-widgets)
- [Adding a New Widget](#adding-a-new-widget)
- [Testing Widgets](#testing-widgets)
- [Widget Selection Guide](#widget-selection-guide)

---

## Architecture Overview

The widget system is a type-safe, registry-based architecture that maps string identifiers to React components. This allows curriculum content to reference widgets by type without creating tight coupling between content and implementation.

### Key Components

1. **Widget Registry** (`src/engine/registry.ts`)
   - Central mapping from widget type strings to React components
   - Type-safe registration and resolution
   - Singleton instance with pre-registered built-in widgets

2. **Curriculum Schema** (`src/curriculum/schema.ts`)
   - TypeScript interfaces defining widget prop contracts
   - Discriminated union type (`WidgetConfig`) for runtime type narrowing
   - Enforces prop validation at compile time

3. **Widget Components** (this directory)
   - React components that render interactive learning experiences
   - Each component receives props defined by its corresponding interface
   - Components are stateful and handle user interactions

### Data Flow

```
Curriculum Content (Markdown)
    ↓
Lesson Parser (extracts widget markers)
    ↓
WidgetConfig objects (typed props)
    ↓
Widget Registry (resolves type → component)
    ↓
React Component (renders with props)
```

---

## Widget Registry

The `widgetRegistry` is a singleton instance that manages all available widget types.

### Usage

```typescript
import { widgetRegistry } from '@/engine/registry';

// Register a new widget type
widgetRegistry.register('my-widget', MyWidgetComponent);

// Resolve a widget config to its component
const Component = widgetRegistry.resolve(widgetConfig);
if (Component) {
  return <Component {...widgetConfig.props} />;
}

// Check if a widget type is registered
if (widgetRegistry.has('my-widget')) {
  // Widget exists
}

// Get all registered widget types
const types = widgetRegistry.types(); // ['sandbox', 'mutator', ...]
```

### Registry API

| Method | Description | Returns |
|--------|-------------|---------|
| `register(type, component)` | Register a widget component | `this` (for chaining) |
| `get(type)` | Retrieve component by type | `Component \| undefined` |
| `has(type)` | Check if type is registered | `boolean` |
| `resolve(widget)` | Resolve WidgetConfig to component | `Component \| null` |
| `types()` | Get all registered type strings | `string[]` |
| `unregister(type)` | Remove a widget type | `boolean` |
| `clear()` | Remove all registered widgets | `void` |

---

## Available Widgets

The registry currently contains **5 widgets**, each serving a specific pedagogical purpose.

### 1. Sandbox (`sandbox`)

Interactive code execution environment for hands-on learning.

**Purpose:** Provides a split-pane interface with input (text or code) and output display. Supports real-time token counting, multiple input/output types, and custom processing functions.

**Use Cases:**
- Teaching concepts that benefit from experimentation (e.g., token counting, data transformation)
- Demonstrating cause-and-effect relationships
- Allowing learners to test hypotheses in real-time

**Props Interface:** `SandboxProps`

```typescript
{
  inputType: 'text' | 'code',
  outputType: 'text' | 'html' | 'json',
  initialState: string,
  processFunction?: string, // JavaScript function string
  label?: string,
  placeholder?: string,
  tokenLimit?: number,
  widgetId?: string
}
```

**Example:**
```json
{
  "inputType": "text",
  "outputType": "text",
  "initialState": "Type here to count tokens...",
  "label": "Token Counter",
  "processFunction": "function process(input) { return `Tokens: ${Math.ceil(input.length / 4)}`; }"
}
```

---

### 2. Mutator (`mutator`)

Code debugging challenge widget for problem-solving practice.

**Purpose:** Presents broken code in a Monaco editor with hidden test cases. Learners must identify and fix bugs to make all tests pass.

**Use Cases:**
- Teaching debugging skills
- Reinforcing code comprehension through repair exercises
- Assessing understanding of specific programming concepts

**Props Interface:** `MutatorProps`

```typescript
{
  language: string,
  brokenCode: string,
  testCases: string[], // Format: "functionCall(args) => expected"
  hint: string,
  title?: string,
  maxHints?: number
}
```

**Example:**
```json
{
  "language": "javascript",
  "brokenCode": "function add(a, b) {\n  return a - b;\n}",
  "testCases": ["add(2, 3) => 5", "add(-1, 1) => 0"],
  "hint": "Look at the operator — is subtraction correct for addition?"
}
```

**Anti-Cheat Enforcement:** Mutator widgets must contain *genuinely broken but fixable* code. Hints must guide the learner conceptually, never provide the direct solution.

---

### 3. Trade-Off (`trade-off`)

Decision-making exercise for evaluating architectural choices.

**Purpose:** Presents multiple options with trade-offs across dimensions like cost, performance, complexity, and scalability. Learners select an option and see consequences with real-world scenarios.

**Use Cases:**
- Teaching systems thinking and architectural decision-making
- Exploring trade-offs in technology selection
- Developing critical evaluation skills

**Props Interface:** `TradeOffProps`

```typescript
{
  scenario: string,
  options: TradeOffOption[],
  explanation?: string,
  requireJustification?: boolean
}
```

Where `TradeOffOption` is:
```typescript
{
  id: string,
  name: string,
  description: string,
  pros: string[],
  cons: string[],
  metrics: {
    cost: number,        // 1-10
    performance: number, // 1-10
    complexity: number,  // 1-10
    scalability: number  // 1-10
  }
}
```

**Example:**
```json
{
  "scenario": "You need a database for 100k writes/sec. Choose wisely.",
  "options": [
    {
      "id": "pg",
      "name": "PostgreSQL",
      "description": "Relational database with strong consistency",
      "pros": ["ACID compliant", "Rich query language"],
      "cons": ["Horizontal scaling is complex", "Write throughput limited"],
      "metrics": { "cost": 6, "performance": 7, "complexity": 5, "scalability": 6 }
    }
  ],
  "requireJustification": true
}
```

---

### 4. Context Diagram (`context-diagram`)

System architecture visualization using React Flow.

**Purpose:** Renders interactive diagrams (flowcharts, sequence diagrams, architecture diagrams) that users can explore by clicking nodes. Replaces the deprecated NodeGraph widget.

**Use Cases:**
- Visualizing system architecture and component relationships
- Teaching design patterns and data flow
- Explaining protocols and communication sequences

**Props Interface:** `ContextDiagramProps`

```typescript
{
  diagram: {
    type: 'flow' | 'relationship' | 'architecture' | 'sequence',
    title: string,
    nodes: DiagramNode[],
    edges: DiagramEdge[]
  }
}
```

**Diagram Constraints:**
- **Nodes:** 2-8 nodes. Each needs a unique kebab-case `id`, `label` (max 20 chars), and `type` (input/process/decision/output/storage/service). Optional `description` for click-to-reveal details.
- **Edges:** 1-10 edges. `from` and `to` must reference existing node IDs. Optional `label` (max 15 chars).
- **Flow diagrams** must be acyclic (no loops).
- **No orphan nodes** — every node must connect to at least one edge.

**Example:**
```json
{
  "diagram": {
    "type": "flow",
    "title": "Request Processing",
    "nodes": [
      { "id": "start", "label": "Start", "type": "input" },
      { "id": "process", "label": "Process", "type": "process" },
      { "id": "end", "label": "End", "type": "output" }
    ],
    "edges": [
      { "from": "start", "to": "process" },
      { "from": "process", "to": "end" }
    ]
  }
}
```

---

### 5. Socratic Chat (`socratic-chat`)

AI-powered Socratic dialogue for guided discovery learning.

**Purpose:** Presents a problem or concept, then engages learners in a Socratic dialogue where the AI asks probing questions to guide them toward understanding rather than providing answers.

**Three Modes:**

- **`tutor`** (default): General Socratic help during lessons. Guides the learner with questions rather than giving answers.
- **`interview`**: Mock technical interviews with scored feedback (1-5 per answer). Place at the end of a module to test comprehensive knowledge.
- **`challenge`**: Quick knowledge checks with immediate pass/fail feedback. Use between lessons for rapid-fire practice.

**Props Interface:** `SocraticChatProps`

```typescript
{
  mode?: 'tutor' | 'interview' | 'challenge',
  topic?: string,           // Required for interview mode
  difficulty?: 'junior' | 'mid' | 'senior',
  timeLimit?: number,       // Minutes
  maxQuestions?: number,    // For interview mode (default: 5)
  challengeQuestions?: Array<{ question: string, modelAnswer: string }>
}
```

**Example (Interview Mode):**
```json
{
  "mode": "interview",
  "topic": "JavaScript Fundamentals",
  "difficulty": "mid",
  "timeLimit": 30,
  "maxQuestions": 5
}
```

**Example (Challenge Mode):**
```json
{
  "mode": "challenge",
  "challengeQuestions": [
    { "question": "What is closure?", "modelAnswer": "A closure is a function that retains access to variables from its outer scope..." }
  ]
}
```

---

## Adding a New Widget

Follow these steps to add a new widget type to the system:

### Step 1: Define the Props Interface

In `src/curriculum/schema.ts`, add a new interface extending `WidgetProps`:

```typescript
/**
 * Props for my-new-widget — description of what it does.
 */
export interface MyNewWidgetProps extends WidgetProps {
  // Define required props
  requiredProp: string;
  
  // Define optional props
  optionalProp?: number;
}
```

### Step 2: Create the Widget Discriminated Union Entry

Add the widget interface to the discriminated union:

```typescript
export interface MyNewWidget {
  id: string;
  type: 'my-new-widget';
  props: MyNewWidgetProps;
}

// Add to the WidgetConfig union
export type WidgetConfig =
  | SandboxWidget
  | MutatorWidget
  | ContextDiagramWidget
  | TradeOffWidget
  | SocraticChatWidget
  | MyNewWidget; // ← Add here
```

### Step 3: Create the React Component

Create a new file in `src/components/universal/`:

```typescript
// src/components/universal/MyNewWidget.tsx
import type { MyNewWidgetProps } from '@/curriculum/schema';

export function MyNewWidget({ requiredProp, optionalProp }: MyNewWidgetProps) {
  return (
    <div className="my-new-widget">
      {/* Your component implementation */}
    </div>
  );
}
```

### Step 4: Register the Widget

In `src/engine/registry.ts`, import and register the component:

```typescript
import { MyNewWidget } from '@/components/universal/MyNewWidget';

widgetRegistry
  // ... existing registrations
  .register('my-new-widget', MyNewWidget);
```

### Step 5: Add JSDoc Documentation

Add comprehensive JSDoc comments to the registration explaining:
- What the widget does
- When to use it
- Required props
- Optional props

### Step 6: Write Tests

Create a test file in the same directory as the component:

```typescript
// src/components/universal/MyNewWidget.test.tsx
import { render, screen } from '@testing-library/react';
import { MyNewWidget } from './MyNewWidget';

describe('MyNewWidget', () => {
  it('renders with required props', () => {
    render(<MyNewWidget requiredProp="test" />);
    expect(screen.getByText(/test/i)).toBeInTheDocument();
  });
  
  it('handles optional props correctly', () => {
    render(<MyNewWidget requiredProp="test" optionalProp={42} />);
    // Add assertions
  });
});
```

### Step 7: Update Documentation

- Add the widget to this README.md
- Add it to `docs/MCP_INSTRUCTIONS.md` Widget Catalog
- Update the Widget Selection Guide table

---

## Testing Widgets

All widgets should have comprehensive test coverage. Use Vitest and React Testing Library.

### Test Structure

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MyWidget } from './MyWidget';

describe('MyWidget', () => {
  // Basic rendering tests
  describe('rendering', () => {
    it('renders with required props', () => {
      render(<MyWidget requiredProp="value" />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
    
    it('applies custom className', () => {
      render(<MyWidget requiredProp="value" className="custom" />);
      expect(screen.getByRole('button')).toHaveClass('custom');
    });
  });
  
  // User interaction tests
  describe('user interactions', () => {
    it('calls onClick when clicked', () => {
      const handleClick = vi.fn();
      render(<MyWidget requiredProp="value" onClick={handleClick} />);
      
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
  
  // Edge case tests
  describe('edge cases', () => {
    it('handles empty arrays', () => {
      render(<MyWidget items={[]} />);
      expect(screen.getByText('No items')).toBeInTheDocument();
    });
    
    it('handles null/undefined gracefully', () => {
      expect(() => render(<MyWidget />)).not.toThrow();
    });
  });
  
  // Accessibility tests
  describe('accessibility', () => {
    it('has accessible name', () => {
      render(<MyWidget requiredProp="value" />);
      expect(screen.getByRole('button')).toHaveAccessibleName();
    });
    
    it('supports keyboard navigation', () => {
      render(<MyWidget requiredProp="value" />);
      const button = screen.getByRole('button');
      
      button.focus();
      expect(button).toHaveFocus();
    });
  });
});
```

### Running Tests

```bash
# Run all widget tests
npm test src/components/universal

# Run a specific widget test
npm test src/components/universal/Sandbox.test.tsx

# Run tests with coverage
npm run test:coverage
```

### Test Best Practices

1. **Test behavior, not implementation** - Focus on what the user sees and does, not internal state
2. **Use accessible queries** - Prefer `getByRole`, `getByLabelText` over `getByTestId`
3. **Test error states** - Verify components handle missing data gracefully
4. **Test async operations** - Use `waitFor` and `findBy` for async updates
5. **Mock external dependencies** - Use `vi.mock()` for API calls, timers, etc.

---

## Widget Selection Guide

Use this decision matrix to choose the right widget for each lesson:

| Concept Type | Best Widget | Why | Example |
|---|---|---|---|
| **Process / Flow** (step-by-step) | `context-diagram` (type: flow) | Visual sequences are easier to understand than text | Request lifecycle, data pipeline, authentication flow |
| **Architecture / Components** | `context-diagram` (type: architecture) | Shows how parts relate spatially | Microservices layout, system components |
| **Relationships / Dependencies** | `context-diagram` (type: relationship) | Radial layout highlights central concepts | Module dependencies, concept maps |
| **Time-ordered Interactions** | `context-diagram` (type: sequence) | Shows temporal ordering clearly | API call sequence, event propagation |
| **Experimentation / Try-it** | `sandbox` | Hands-on reinforcement of concepts | Regex testing, algorithm visualization, code playground |
| **Debugging / Comprehension** | `mutator` | Active problem-solving builds deeper understanding | Spot-the-bug, fix the anti-pattern |
| **Design Decisions** | `trade-off` | Teaches engineering judgment | SQL vs NoSQL, monolith vs microservices |
| **General Help During Lesson** | `socratic-chat` (mode: tutor) | On-demand Socratic guidance without leaving the lesson | "Ask me anything about this topic" |
| **End-of-Module Assessment** | `socratic-chat` (mode: interview) | Comprehensive knowledge testing with scored feedback | Mock interview on module topics |
| **Quick Knowledge Checks** | `socratic-chat` (mode: challenge) | Rapid-fire practice between lessons | "Can you answer these 5 questions?" |

### Rules of Thumb

- Use **at most 2 widgets per lesson** to avoid overwhelming the learner
- Prefer `context-diagram` when the concept is inherently visual (flows, architectures, relationships)
- Prefer `sandbox` when the concept benefits from experimentation (algorithms, transforms, syntax)
- Prefer `mutator` when the concept is about identifying mistakes (common bugs, anti-patterns)
- Prefer `trade-off` when the concept involves choosing between approaches
- Use `socratic-chat` (tutor) when the learner needs on-demand help navigating complex content
- Use `socratic-chat` (interview) at the **end of a module** to test comprehensive knowledge across all lessons in that module
- Use `socratic-chat` (challenge) **between lessons** for quick knowledge checks that reinforce what was just learned

### Widget Placement Guidelines

**Sandbox:**
- Place after explaining a concept that benefits from experimentation
- Use for "try it yourself" moments
- Good for demonstrating cause-and-effect

**Mutator:**
- Place after teaching a concept to test comprehension
- Use for "can you spot the bug?" exercises
- Good for reinforcing best practices

**Trade-Off:**
- Place when teaching architectural decisions
- Use for "which approach would you choose?" scenarios
- Good for developing engineering judgment

**Context Diagram:**
- Place at the beginning of a lesson to provide visual context
- Use for explaining flows, architectures, or relationships
- Good for "here's how the pieces fit together" moments

**Socratic Chat (Tutor):**
- Place anywhere in a lesson where content is complex
- Use as an "Ask me anything" helper
- Good for providing on-demand guidance

**Socratic Chat (Interview):**
- Place at the **end of a module** (typically last lesson)
- Use for comprehensive assessment
- Good for simulating real interview scenarios

**Socratic Chat (Challenge):**
- Place **between lessons** or at lesson end
- Use for rapid-fire knowledge checks
- Good for reinforcing key concepts

---

## File Structure

```
src/components/universal/
├── README.md                          # This file
├── Sandbox.tsx                        # Sandbox widget component
├── Sandbox.test.tsx                   # Sandbox tests
├── Mutator.tsx                        # Mutator widget component
├── Mutator.test.tsx                   # Mutator tests
├── TradeOff.tsx                       # Trade-off widget component
├── TradeOff.test.tsx                  # Trade-off tests
├── ContextDiagram.tsx                 # Context diagram widget component
├── ContextDiagram.test.tsx            # Context diagram tests
├── SocraticChat.tsx                   # Socratic chat widget component
├── SocraticChat.test.tsx              # Socratic chat tests (base)
├── SocraticChat.interview.test.tsx    # Interview mode tests
├── SocraticChat.challenge.test.tsx    # Challenge mode tests
└── SocraticChat.persona.test.tsx      # Persona tests
```

---

## Common Patterns

### Handling User Input

```typescript
function MyWidget({ onChange }: MyWidgetProps) {
  const [value, setValue] = useState('');
  
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    onChange?.(e.target.value);
  };
  
  return <input value={value} onChange={handleChange} />;
}
```

### Async Operations

```typescript
function MyWidget({ data }: MyWidgetProps) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  
  const processData = async () => {
    setLoading(true);
    try {
      const res = await api.process(data);
      setResult(res);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) return <Spinner />;
  return <button onClick={processData}>Process</button>;
}
```

### Local Storage Persistence

```typescript
function MyWidget({ widgetId }: MyWidgetProps) {
  const [state, setState] = useState(() => {
    const saved = localStorage.getItem(`widget-${widgetId}`);
    return saved ? JSON.parse(saved) : initialState;
  });
  
  useEffect(() => {
    localStorage.setItem(`widget-${widgetId}`, JSON.stringify(state));
  }, [state, widgetId]);
  
  // ...
}
```

---

## Troubleshooting

### Widget Not Rendering

1. **Check registry** - Is the widget type registered in `src/engine/registry.ts`?
2. **Check props** - Are all required props provided? Check TypeScript errors.
3. **Check imports** - Is the component correctly imported in the registry?
4. **Check console** - Look for runtime errors in the browser console.

### Type Errors

1. **Props interface mismatch** - Ensure component props match the schema interface
2. **Missing required props** - Add all required props to the widget config
3. **Incorrect prop types** - Verify prop types match the interface definitions

### Tests Failing

1. **Async operations** - Use `waitFor` or `findBy` for async updates
2. **State updates** - Wrap in `act()` for state updates in tests
3. **Mock dependencies** - Mock API calls, timers, and external modules

---

## Contributing

When adding or modifying widgets:

1. ✅ Follow the [Adding a New Widget](#adding-a-new-widget) guide
2. ✅ Write comprehensive tests (aim for >80% coverage)
3. ✅ Update this README.md with documentation
4. ✅ Update `docs/MCP_INSTRUCTIONS.md` Widget Catalog
5. ✅ Add JSDoc comments to all public APIs
6. ✅ Run `npm run lint` and fix all issues
7. ✅ Run `npm run type-check` and fix all type errors
8. ✅ Run `npm test` and ensure all tests pass

---

## License

Part of the Software Engineer Academy project.
