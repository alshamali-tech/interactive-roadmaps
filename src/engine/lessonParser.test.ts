import { describe, it, expect } from 'vitest';
import { parseFocusedLesson } from '@/engine/lessonParser';

describe('parseFocusedLesson', () => {
  // ─── Basic parsing ────────────────────────────────────────────

  it('parses a simple sandbox widget', () => {
    const raw = `This is some intro text.

:::widget sandbox
label: Try it
inputType: text
outputType: text
initialState: Type something
:::

More text after the widget.`;

    const result = parseFocusedLesson(raw, 'lesson-1');

    expect(result.widgets).toHaveLength(1);
    const w = result.widgets[0];
    expect(w.type).toBe('sandbox');
    expect(w.id).toBe('lesson-1-widget-1');
    if (w.type === 'sandbox') {
      expect(w.props.label).toBe('Try it');
      expect(w.props.inputType).toBe('text');
      expect(w.props.initialState).toBe('Type something');
    }
    expect(result.markdown).toContain('<widget id="lesson-1-widget-1" />');
    expect(result.markdown).toContain('This is some intro text.');
    expect(result.markdown).toContain('More text after the widget.');
  });

  it('parses a mutator widget with test cases', () => {
    const raw = `Some intro.

:::widget mutator
title: Find the Bug
language: javascript
brokenCode: const x = 1
hint: Check the variable name
testCase: valid input
testCase: invalid input
:::

After widget.`;

    const result = parseFocusedLesson(raw, 'lesson-2');

    expect(result.widgets).toHaveLength(1);
    const w = result.widgets[0];
    expect(w.type).toBe('mutator');
    if (w.type === 'mutator') {
      expect(w.props.title).toBe('Find the Bug');
      expect(w.props.language).toBe('javascript');
      expect(w.props.brokenCode).toBe('const x = 1');
      expect(w.props.hint).toBe('Check the variable name');
      expect(w.props.testCases).toEqual(['valid input', 'invalid input']);
    }
  });

  it('parses a trade-off widget with flat naming convention', () => {
    const raw = `Intro text.

:::widget trade-off
scenario: Choose a database
optionA_name: PostgreSQL
optionA_description: Relational DB
optionA_pro: ACID compliant
optionA_pro: Mature ecosystem
optionA_con: Complex setup
optionA_cost: 5
optionA_performance: 8
optionB_name: MongoDB
optionB_description: Document DB
optionB_pro: Easy to scale
optionB_pro: Flexible schema
optionB_con: No joins
optionB_cost: 4
optionB_performance: 7
explanation: SQL for structured data, NoSQL for flexibility
:::

Outro.`;

    const result = parseFocusedLesson(raw, 'lesson-3');

    expect(result.widgets).toHaveLength(1);
    const w = result.widgets[0];
    expect(w.type).toBe('trade-off');
    if (w.type === 'trade-off') {
      expect(w.props.scenario).toBe('Choose a database');
      expect(w.props.options).toHaveLength(2);
      expect(w.props.options[0].name).toBe('PostgreSQL');
      expect(w.props.options[0].pros).toEqual(['ACID compliant', 'Mature ecosystem']);
      expect(w.props.options[0].cons).toEqual(['Complex setup']);
      expect(w.props.options[0].metrics.cost).toBe(5);
      expect(w.props.options[0].metrics.performance).toBe(8);
      expect(w.props.options[1].name).toBe('MongoDB');
      expect(w.props.explanation).toBe('SQL for structured data, NoSQL for flexibility');
    }
  });

  // ─── Multiple widgets ─────────────────────────────────────────

  it('parses multiple widgets with sequential IDs', () => {
    const raw = `Intro.

:::widget sandbox
inputType: text
outputType: text
initialState: First
:::

Middle.

:::widget mutator
language: python
brokenCode: print("hello"
hint: Missing parenthesis
:::

End.`;

    const result = parseFocusedLesson(raw, 'lesson-1');

    expect(result.widgets).toHaveLength(2);
    expect(result.widgets[0].id).toBe('lesson-1-widget-1');
    expect(result.widgets[0].type).toBe('sandbox');
    expect(result.widgets[1].id).toBe('lesson-1-widget-2');
    expect(result.widgets[1].type).toBe('mutator');
    expect(result.markdown).toContain('<widget id="lesson-1-widget-1" />');
    expect(result.markdown).toContain('<widget id="lesson-1-widget-2" />');
  });

  // ─── Error handling ───────────────────────────────────────────

  it('handles content with no widgets', () => {
    const raw = `# My Lesson\n\nSome content without any widgets.\n\n## Section\n\nMore text.`;
    const result = parseFocusedLesson(raw, 'lesson-1');

    expect(result.widgets).toHaveLength(0);
    expect(result.markdown).toContain('Some content without any widgets.');
  });

  it('silently skips invalid widgets (missing required props)', () => {
    const raw = `Text before.

:::widget sandbox
:::

Text after.`;

    const result = parseFocusedLesson(raw, 'lesson-1');

    // Widget is invalid (no initialState) — should be removed
    expect(result.widgets).toHaveLength(0);
    // The widget block should be removed from markdown
    expect(result.markdown).not.toContain(':::widget');
    expect(result.markdown).toContain('Text before.');
    expect(result.markdown).toContain('Text after.');
  });

  it('handles trade_off (underscore) as trade-off', () => {
    const raw = `Intro.

:::widget trade_off
scenario: Pick one
optionA_name: A
optionA_description: Desc A
optionB_name: B
optionB_description: Desc B
:::

End.`;

    const result = parseFocusedLesson(raw, 'lesson-1');

    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0].type).toBe('trade-off');
  });

  // ─── Edge cases ───────────────────────────────────────────────

  it('strips markdown code fences around the output', () => {
    const raw = `\`\`\`markdown
Some content.

:::widget sandbox
inputType: text
outputType: text
initialState: hello
:::
\`\`\``;

    const result = parseFocusedLesson(raw, 'lesson-1');

    expect(result.widgets).toHaveLength(1);
    expect(result.markdown).toContain('Some content.');
    expect(result.markdown).not.toContain('```');
  });

  it('handles multiline prop values (continuation lines)', () => {
    const raw = `Text.

:::widget sandbox
inputType: code
outputType: text
initialState: function greet(name) {
  return "Hello " + name;
}
processFunction: return input.replace("Hello", "Hi")
:::

After.`;

    const result = parseFocusedLesson(raw, 'lesson-1');

    expect(result.widgets).toHaveLength(1);
    const w = result.widgets[0];
    if (w.type === 'sandbox') {
      expect(w.props.initialState).toContain('function greet');
      expect(w.props.initialState).toContain('return');
      expect(w.props.initialState).toContain('name');
      expect(w.props.inputType).toBe('code');
    }
  });

  it('defaults trade-off metrics when not provided', () => {
    const raw = `Intro.

:::widget trade-off
scenario: Choose
optionA_name: Alpha
optionA_description: First
optionB_name: Beta
optionB_description: Second
:::

End.`;

    const result = parseFocusedLesson(raw, 'lesson-1');

    expect(result.widgets).toHaveLength(1);
    const w = result.widgets[0];
    if (w.type === 'trade-off') {
      const metrics = w.props.options[0].metrics;
      expect(metrics.cost).toBe(5);
      expect(metrics.performance).toBe(5);
      expect(metrics.complexity).toBe(5);
      expect(metrics.scalability).toBe(5);
    }
  });

  it('ensures trade-off has minimum 2 options (fills dummies if needed)', () => {
    const raw = `Intro.

:::widget trade-off
scenario: Choose
optionA_name: Only One
optionA_description: The only option
:::

End.`;

    const result = parseFocusedLesson(raw, 'lesson-1');

    expect(result.widgets).toHaveLength(1);
    const w = result.widgets[0];
    if (w.type === 'trade-off') {
      expect(w.props.options).toHaveLength(2);
      expect(w.props.options[1].name).toBe('Option 2');
    }
  });

  it('assigns correct widget IDs using lesson ID prefix', () => {
    const raw = `Text.

:::widget sandbox
inputType: text
outputType: text
initialState: test
:::

:::widget sandbox
inputType: text
outputType: text
initialState: test2
:::`;

    const result = parseFocusedLesson(raw, 'lesson-42');

    expect(result.widgets[0].id).toBe('lesson-42-widget-1');
    expect(result.widgets[1].id).toBe('lesson-42-widget-2');
  });

  it('handles empty input', () => {
    const result = parseFocusedLesson('', 'lesson-1');
    expect(result.widgets).toHaveLength(0);
    expect(result.markdown).toBe('');
  });

  it('handles comma-separated pros/cons in trade-off', () => {
    const raw = `Intro.

:::widget trade-off
scenario: Choose
optionA_name: Alpha
optionA_description: First
optionA_pros: Fast, Reliable, Mature
optionA_cons: Expensive, Complex
optionB_name: Beta
optionB_description: Second
optionB_pros: Cheap, Simple
optionB_cons: New, Unstable
:::

End.`;

    const result = parseFocusedLesson(raw, 'lesson-1');

    expect(result.widgets).toHaveLength(1);
    const w = result.widgets[0];
    if (w.type === 'trade-off') {
      expect(w.props.options[0].pros).toEqual(['Fast', 'Reliable', 'Mature']);
      expect(w.props.options[0].cons).toEqual(['Expensive', 'Complex']);
    }
  });

  // ─── Realistic output ─────────────────────────────────────────

  it('parses a realistic full lesson', () => {
    const raw = `Every time you open Instagram and see your personalized feed, a backend server made that happen. Backend development is all the work that happens behind the scenes to process your requests and serve your data.

## What Is a Backend?

Think of a restaurant. You see the menu and place your order (that's the frontend). But the kitchen — where the actual cooking happens — that's the backend.

## Why Does It Matter?

Without a backend, apps would just be static pages. No login, no shopping cart, no social feed.

## How Does It Work?

When you click "Like" on a post, your phone sends a request to a server. The server checks your identity, records the like in a database, and sends back a confirmation.

Try it yourself:

:::widget sandbox
label: Simulate a request
inputType: text
outputType: text
initialState: Type: POST /likes postId=123
processFunction: input.includes("POST") ? "200 OK: Like recorded for post" : "400 Bad Request"
:::

## Key Takeaways

- Backends handle the invisible work
- Every user action sends a request
- Servers process requests and return responses`;

    const result = parseFocusedLesson(raw, 'lesson-1');

    expect(result.widgets).toHaveLength(1);
    const w = result.widgets[0];
    expect(w.type).toBe('sandbox');
    if (w.type === 'sandbox') {
      expect(w.props.label).toBe('Simulate a request');
    }
    expect(result.markdown).toContain('Every time you open Instagram');
    expect(result.markdown).toContain('## What Is a Backend?');
    expect(result.markdown).toContain('<widget id="lesson-1-widget-1" />');
    expect(result.markdown).toContain('## Key Takeaways');
  });
});
