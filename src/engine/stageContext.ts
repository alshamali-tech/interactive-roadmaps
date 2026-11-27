/**
 * S3 — Stage Context Manager
 *
 * Tracks what a lesson has already explained, what is still owed, the running
 * word budget, established terminology and an anti-repetition list, so later
 * stages and later lessons build on earlier content instead of re-teaching it.
 *
 * NOTE ON NAMING: Task S3 specified `src/engine/contextManager.ts`, but that path
 * is occupied by the chat context-window trimmer consumed by `aiService.ts`, so
 * the tracker lives here and the class is `StageContextManager` rather than the
 * spec's `ContextManager` — two different "ContextManager" symbols in one engine
 * folder would be a standing source of confusion.
 *
 * NOTE ON `lessonLength`: the spec derives the word budget from a
 * short/medium/long field. No such field exists in `LessonPlanSchema`, and the
 * only sizing signal in the app is `metadata.estimatedMinutes`, so the budget is
 * derived from minutes.
 *
 * The state is plain, JSON-serializable data (no class instances, no cycles) so
 * it can round-trip through localStorage for resumable generation.
 */

import type { LessonPlan } from './generatorSchema';
import type { ModelTier } from './modelCapability';

/** Canonical definition lives in modelCapability.ts (S6). */
export type { ModelTier };

/** The eight generation stages defined by the Sprint 2 spec. */
export type StageType =
  | 'introduction'
  | 'motivation'
  | 'explanation'
  | 'example'
  | 'widget_generation'
  | 'quiz'
  | 'summary'
  | 'review';

/** Order stages run in when the caller does not choose them. */
export const DEFAULT_STAGES: StageType[] = [
  'introduction',
  'motivation',
  'explanation',
  'example',
  'quiz',
  'summary',
  'review',
];

export interface RepetitionIssue {
  concept: string;
  phrase: string;
  severity: 'warning' | 'error';
}

export interface LessonRef {
  id: string;
  title: string;
  keyPoints?: string[];
}

/** Course-level input to the constructor (see `CoursePlanSchema`). */
export interface CourseContext {
  courseTitle: string;
  /** 1-based index of this lesson within the course plan. */
  lessonPosition: number;
  totalLessons: number;
  /** Lessons already generated — their key points become known concepts. */
  previousLessons: LessonRef[];
  tone?: string;
  preferredLanguage?: string;
  modelTier?: ModelTier;
  /** From `GeneratedLesson.metadata.estimatedMinutes` when known. */
  estimatedMinutes?: number;
}

export interface StageContext {
  lessonId: string;
  lessonTitle: string;
  lessonPosition: number;
  totalLessons: number;

  conceptsAlreadyKnown: string[];
  conceptsIntroducedSoFar: string[];
  conceptsRemaining: string[];

  stagesCompleted: StageType[];
  stagesRemaining: StageType[];
  currentStage: StageType | null;

  wordCountSoFar: number;
  targetWordCount: number;
  keyDecisionsMade: string[];
  terminologyUsed: Record<string, string>;

  tone: string;
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced';
  antiRepetitionList: string[];

  modelTier: ModelTier;
}

/** Prompt-ready view of the context: structured fields plus rendered text. */
export interface StagePromptContext extends StageContext {
  knownConcepts: string[];
  wordBudget: number;
  terminology: string[];
  text: string;
}

export interface StageContextOptions {
  stages?: StageType[];
  targetWordCount?: number;
  /** Disables the localStorage write after each stage (used by tests). */
  persist?: boolean;
}

const STORAGE_PREFIX = 'stage-context:';
/** Older contexts beyond this count are pruned, oldest saved state first. */
const MAX_SAVED_CONTEXTS = 10;
const CONTEXT_VERSION = 1;

/** Prose density used to turn a duration into a word budget. */
const WORDS_PER_MINUTE = 130;
const MIN_TARGET_WORDS = 300;
const MAX_TARGET_WORDS = 2600;

/** Cap on tracked concepts so a long lesson cannot grow the list unbounded. */
const MAX_TRACKED_CONCEPTS = 60;

/**
 * Words that are never useful as a "concept". Deliberately short: concept
 * extraction is best-effort by design (S3 Risks), and the callers prune by
 * reading the list, not by trusting it to be precise.
 */
const STOPWORDS = new Set(
  `a an the and or but if then else when while for of in on at to from by with without
   is are was were be been being do does did done this that these those there here it its
   as so such not no yes can could should would will shall may might must have has had
   you your yours we our they their he she it i me my mine us them what which who whom
   how why again once about above after before between both during each few more most
   other some same too very just also first second last next new old well much many
   example examples lesson lessons concept concepts step steps part parts way case point
   time data code using used use via like note remember build builds building`
    .split(/\s+/)
    .filter(Boolean)
);

/** Definition phrasings that mean "this concept is being explained again". */
const REDEFINITION_PATTERNS: Array<{ pattern: RegExp; severity: 'error' | 'warning' }> = [
  { pattern: /is\s+a\s+way\s+to/i, severity: 'error' },
  { pattern: /refers\s+to/i, severity: 'error' },
  { pattern: /is\s+defined\s+as/i, severity: 'error' },
  { pattern: /means\s+that/i, severity: 'error' },
  { pattern: /\bcan\s+be\s+described\s+as/i, severity: 'error' },
  { pattern: /is\s+a\s+(?:process|technique|method|approach|system|tool|concept|term)\b/i, severity: 'warning' },
  { pattern: /is\s+the\s+(?:process|practice|ability|act)\s+of/i, severity: 'warning' },
];

/** Counts words in prose, ignoring markdown syntax and code. */
export function countWords(text: string): number {
  return stripMarkdown(text)
    .split(/\s+/)
    .filter((word) => word.replace(/[^A-Za-z0-9]/g, '').length > 0).length;
}

/**
 * Reduces markdown to plain words: fenced and inline code removed entirely (a
 * code sample should not eat the prose budget), markup characters dropped, link
 * text kept over URLs.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // fenced code blocks
      .replace(/```[\s\S]*?```/g, ' ')
      // inline code
      .replace(/`[^`\n]*`/g, ' ')
      // images then links -> keep the label
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // html comments and tags
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      // headings, emphasis, blockquotes, list markers, tables, rules
      .replace(/^#{1,6}\s+/gm, ' ')
      .replace(/^\s*>\s?/gm, ' ')
      .replace(/^\s*[-*+]\s+/gm, ' ')
      .replace(/^\s*\d+\.\s+/gm, ' ')
      .replace(/\|/g, ' ')
      .replace(/^\s*[-:]{3,}\s*$/gm, ' ')
      .replace(/[*_~]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function normalizePhrase(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/[.,;:!?]+$/, '');
}

function isLikelyConcept(phrase: string): boolean {
  const clean = normalizePhrase(phrase);
  if (clean.length < 3 || clean.length > 40) return false;
  const words = clean.toLowerCase().split(' ');
  if (words.some((word) => STOPWORDS.has(word))) return false;
  // Reject fragments that are almost certainly sentence noise.
  if (!/[A-Za-z]/.test(clean)) return false;
  return true;
}

/**
 * Best-effort noun-phrase extraction: quoted terms, capitalized sequences and
 * acronyms. Imperfect by design (S3 Risks) — it exists to make repetition
 * *likely* to be caught, not to be a parser.
 */
export function extractCandidateConcepts(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```/g, ' ');
  const found = new Set<string>();

  for (const match of prose.matchAll(/["“']([^"”']{3,40})["”']/g)) {
    if (isLikelyConcept(match[1])) found.add(normalizePhrase(match[1]));
  }
  for (const match of prose.matchAll(/\b([A-Z][a-z]{2,}(?:[ -][A-Z][a-z]{2,}){0,2})\b/g)) {
    if (isLikelyConcept(match[1])) found.add(normalizePhrase(match[1]));
  }
  for (const match of prose.matchAll(/\b([A-Z]{2,6})\b/g)) {
    if (isLikelyConcept(match[1])) found.add(normalizePhrase(match[1]));
  }
  return [...found];
}

/** Pulls `TERM (Expansion)` and `Expansion (TERM)` pairs out of prose. */
export function extractTerminology(text: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const match of text.matchAll(/\b([A-Z]{2,6})\s*\(([^()]{3,60})\)/g)) {
    pairs.push([match[1], normalizePhrase(match[2])]);
  }
  for (const match of text.matchAll(/\b([A-Za-z][A-Za-z -]{2,58}?)\s*\(([A-Z]{2,6})\)/g)) {
    pairs.push([match[2], normalizePhrase(match[1])]);
  }
  return pairs;
}

/** Code fence languages used in a stage — an implicit "we chose X" decision. */
export function extractCodeLanguages(text: string): string[] {
  const languages = new Set<string>();
  for (const match of text.matchAll(/```([A-Za-z0-9+#-]{1,20})/g)) {
    const lang = match[1].toLowerCase();
    if (lang && lang !== 'text' && lang !== 'plaintext') languages.add(lang);
  }
  return [...languages];
}

function defaultTargetWords(estimatedMinutes?: number): number {
  if (!estimatedMinutes || estimatedMinutes <= 0) return 1200;
  return Math.min(MAX_TARGET_WORDS, Math.max(MIN_TARGET_WORDS, Math.round(estimatedMinutes * WORDS_PER_MINUTE)));
}

function dedupe<T extends string>(values: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canUseStorage(): boolean {
  try {
    return typeof globalThis !== 'undefined' && !!globalThis.localStorage;
  } catch {
    return false;
  }
}

/**
 * Tracks lesson state across generation stages.
 *
 * Mutating methods (`updateAfterStage`, `addAntiRepetitionItem`, `setStages`)
 * persist automatically unless constructed with `{ persist: false }`.
 */
export class StageContextManager {
  // Not `readonly`: `hydrate` installs a previously persisted state without
  // running the constructor's derivation.
  private state: StageContext;
  private persistEnabled: boolean;

  constructor(
    lessonPlan: Pick<LessonPlan, 'id' | 'title' | 'keyPoints'> & {
      suggestedDifficulty?: LessonPlan['suggestedDifficulty'];
    },
    courseContext: CourseContext,
    options: StageContextOptions = {}
  ) {
    const previousConcepts = courseContext.previousLessons.flatMap(
      (lesson) => lesson.keyPoints ?? []
    );

    this.persistEnabled = options.persist !== false;
    this.state = {
      lessonId: lessonPlan.id,
      lessonTitle: lessonPlan.title,
      lessonPosition: courseContext.lessonPosition,
      totalLessons: courseContext.totalLessons,

      conceptsAlreadyKnown: dedupe(previousConcepts.map(normalizePhrase)).filter(isLikelyConcept),
      conceptsIntroducedSoFar: [],
      conceptsRemaining: dedupe((lessonPlan.keyPoints ?? []).map(normalizePhrase)).filter(
        isLikelyConcept
      ),

      stagesCompleted: [],
      stagesRemaining: options.stages ? dedupe(options.stages) : [...DEFAULT_STAGES],
      currentStage: (options.stages?.[0] ?? DEFAULT_STAGES[0]) ?? null,

      wordCountSoFar: 0,
      targetWordCount: options.targetWordCount ?? defaultTargetWords(courseContext.estimatedMinutes),
      keyDecisionsMade: courseContext.preferredLanguage
        ? [`Examples use ${courseContext.preferredLanguage}`]
        : [],
      terminologyUsed: {},

      tone: courseContext.tone ?? 'Conversational but technical',
      difficultyLevel: lessonPlan.suggestedDifficulty ?? 'beginner',
      antiRepetitionList: [],

      modelTier: courseContext.modelTier ?? 'medium',
    };

    if (this.persistEnabled) this.save();
  }

  /** Rebuilds a manager from persisted state without recomputing anything. */
  private static hydrate(state: StageContext): StageContextManager {
    const manager = Object.create(StageContextManager.prototype) as StageContextManager;
    manager.state = state;
    manager.persistEnabled = true;
    return manager;
  }

  getContext(): StageContext {
    return this.state;
  }

  /** Replaces the stage plan (S1 decides stages from model tier and length). */
  setStages(stages: StageType[]): void {
    this.state.stagesRemaining = dedupe(stages);
    this.state.stagesCompleted = this.state.stagesCompleted.filter((stage) => !stages.includes(stage));
    this.state.currentStage = this.state.stagesRemaining[0] ?? null;
    if (this.persistEnabled) this.save();
  }

  getStagePromptContext(): StagePromptContext {
    const snapshot = this.getContext();
    const knownConcepts = this.getKnownConcepts();
    const wordBudget = this.getWordBudget();
    const terminology = Object.entries(snapshot.terminologyUsed).map(
      ([acronym, expansion]) => `${acronym} = ${expansion}`
    );

    const lines = [
      `LESSON: ${snapshot.lessonTitle} (lesson ${snapshot.lessonPosition} of ${snapshot.totalLessons})`,
      `TONE: ${snapshot.tone}`,
      `DIFFICULTY: ${snapshot.difficultyLevel}`,
      `MODEL TIER: ${snapshot.modelTier}`,
      `WORD BUDGET REMAINING: ${wordBudget}`,
      knownConcepts.length
        ? `CONCEPTS ALREADY EXPLAINED — do NOT define or re-explain these: ${knownConcepts.join(', ')}`
        : 'CONCEPTS ALREADY EXPLAINED: (none yet — this is the first stage)',
      snapshot.conceptsRemaining.length
        ? `CONCEPTS STILL TO COVER IN THIS LESSON: ${snapshot.conceptsRemaining.join(', ')}`
        : 'CONCEPTS STILL TO COVER: (all planned key points are covered)',
      terminology.length ? `ESTABLISHED TERMINOLOGY — use these exact terms: ${terminology.join('; ')}` : '',
      snapshot.keyDecisionsMade.length
        ? `DECISIONS ALREADY MADE: ${snapshot.keyDecisionsMade.join('; ')}`
        : '',
      snapshot.antiRepetitionList.length
        ? `DO NOT REPEAT THESE PHRASES: ${snapshot.antiRepetitionList.join('; ')}`
        : '',
      snapshot.stagesCompleted.length
        ? `STAGES COMPLETED: ${snapshot.stagesCompleted.join(', ')}`
        : 'STAGES COMPLETED: (none yet)',
    ].filter(Boolean);

    return {
      ...snapshot,
      knownConcepts,
      wordBudget,
      terminology,
      text: lines.join('\n'),
    };
  }

  /**
   * Records a finished stage: advances the plan, consumes the word budget, and
   * folds newly explained concepts, terminology and implicit decisions into the
   * context.
   */
  updateAfterStage(stageType: StageType, output: string): void {
    // Re-recording a stage that already finished (retry bookkeeping, or a
    // duplicate event) must not consume the word budget a second time.
    if (this.state.stagesCompleted.includes(stageType)) return;

    this.state.stagesRemaining = this.state.stagesRemaining.filter((stage) => stage !== stageType);
    this.state.stagesCompleted = dedupe([...this.state.stagesCompleted, stageType]);
    this.state.currentStage = this.state.stagesRemaining[0] ?? null;

    this.state.wordCountSoFar += countWords(output);

    const introduced = new Set(this.state.conceptsIntroducedSoFar.map((c) => c.toLowerCase()));
    const known = new Set(this.getKnownConcepts().map((c) => c.toLowerCase()));

    // Planned key points that appeared are now taught; anything else found is a
    // bonus concept the model introduced unprompted.
    const mentioned = this.state.conceptsRemaining.filter((concept) =>
      new RegExp(`\\b${escapeForRegExp(concept)}\\b`, 'i').test(output)
    );
    this.state.conceptsRemaining = this.state.conceptsRemaining.filter(
      (concept) => !mentioned.includes(concept)
    );

    const additions = [...mentioned, ...extractCandidateConcepts(output)].filter((concept) => {
      const key = concept.toLowerCase();
      return !introduced.has(key) && !known.has(key);
    });

    this.state.conceptsIntroducedSoFar = dedupe([
      ...this.state.conceptsIntroducedSoFar,
      ...additions,
    ]).slice(0, MAX_TRACKED_CONCEPTS);

    for (const [acronym, expansion] of extractTerminology(output)) {
      const key = acronym.toUpperCase();
      if (!this.state.terminologyUsed[key]) this.state.terminologyUsed[key] = expansion;
    }

    for (const language of extractCodeLanguages(output)) {
      const decision = `Examples use ${language}`;
      if (!this.state.keyDecisionsMade.includes(decision)) {
        this.state.keyDecisionsMade.push(decision);
      }
    }

    if (this.persistEnabled) this.save();
  }

  getKnownConcepts(): string[] {
    return dedupe([...this.state.conceptsAlreadyKnown, ...this.state.conceptsIntroducedSoFar]);
  }

  /**
   * Flags places where the text re-defines something already taught.
   * `exclude` suppresses the concept the current stage is legitimately about.
   */
  checkRepetition(text: string, exclude: string[] = []): RepetitionIssue[] {
    const issues: RepetitionIssue[] = [];
    const excluded = new Set(exclude.map((value) => value.toLowerCase()));
    const plain = stripMarkdown(text);

    for (const concept of this.getKnownConcepts()) {
      if (excluded.has(concept.toLowerCase())) continue;

      const conceptRe = new RegExp(
        `\\b${escapeForRegExp(concept)}\\b[^.\\n]{0,60}?\\b(is|refers|means|describes|can be)\\b[^.\\n]{0,60}`,
        'i'
      );
      const sentence = plain.match(conceptRe);
      if (!sentence) continue;

      const phrase = sentence[0].trim();
      for (const { pattern, severity } of REDEFINITION_PATTERNS) {
        if (pattern.test(phrase)) {
          issues.push({ concept, phrase, severity });
          break;
        }
      }
    }
    return issues;
  }

  getWordBudget(): number {
    return Math.max(0, this.state.targetWordCount - this.state.wordCountSoFar);
  }

  isWordBudgetExceeded(): boolean {
    return this.state.wordCountSoFar >= this.state.targetWordCount;
  }

  addAntiRepetitionItem(phrase: string): void {
    const clean = normalizePhrase(phrase);
    if (!clean) return;
    if (!this.state.antiRepetitionList.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      this.state.antiRepetitionList.push(clean);
    }
    if (this.persistEnabled) this.save();
  }

  addKeyDecision(decision: string): void {
    const clean = normalizePhrase(decision);
    if (clean && !this.state.keyDecisionsMade.includes(clean)) {
      this.state.keyDecisionsMade.push(clean);
      if (this.persistEnabled) this.save();
    }
  }

  /** Forgets everything tracked for this lesson, including saved state. */
  reset(): void {
    this.state.stagesCompleted = [];
    this.state.currentStage = this.state.stagesRemaining[0] ?? null;
    this.state.conceptsIntroducedSoFar = [];
    this.state.wordCountSoFar = 0;
    this.state.keyDecisionsMade = [];
    this.state.antiRepetitionList = [];
    this.state.terminologyUsed = {};
    StageContextManager.clear(this.state.lessonId);
  }

  serialize(): string {
    return JSON.stringify({ version: CONTEXT_VERSION, savedAt: Date.now(), context: this.state });
  }

  /**
   * Rebuilds a manager from `serialize()` output.
   * @throws when the payload is not a versioned stage context.
   */
  static deserialize(json: string): StageContextManager {
    const parsed = JSON.parse(json) as { version?: number; context?: Partial<StageContext> };
    if (!parsed || parsed.version !== CONTEXT_VERSION || !parsed.context) {
      throw new Error('StageContextManager.deserialize: unrecognized payload');
    }
    const context = parsed.context;
    if (
      typeof context.lessonId !== 'string' ||
      !Array.isArray(context.stagesCompleted) ||
      !Array.isArray(context.stagesRemaining)
    ) {
      throw new Error('StageContextManager.deserialize: payload is missing required fields');
    }

    // Fill anything a newer/older payload omitted so reads never see undefined.
    const state: StageContext = {
      lessonId: context.lessonId,
      lessonTitle: context.lessonTitle ?? '',
      lessonPosition: context.lessonPosition ?? 1,
      totalLessons: context.totalLessons ?? 1,
      conceptsAlreadyKnown: context.conceptsAlreadyKnown ?? [],
      conceptsIntroducedSoFar: context.conceptsIntroducedSoFar ?? [],
      conceptsRemaining: context.conceptsRemaining ?? [],
      stagesCompleted: context.stagesCompleted,
      stagesRemaining: context.stagesRemaining,
      currentStage: context.currentStage ?? context.stagesRemaining[0] ?? null,
      wordCountSoFar: context.wordCountSoFar ?? 0,
      targetWordCount: context.targetWordCount ?? 1200,
      keyDecisionsMade: context.keyDecisionsMade ?? [],
      terminologyUsed: context.terminologyUsed ?? {},
      tone: context.tone ?? 'Conversational but technical',
      difficultyLevel: context.difficultyLevel ?? 'beginner',
      antiRepetitionList: context.antiRepetitionList ?? [],
      modelTier: context.modelTier ?? 'medium',
    };
    return StageContextManager.hydrate(state);
  }

  /** localStorage key for a lesson's tracked context. */
  static storageKey(lessonId: string): string {
    return `${STORAGE_PREFIX}${lessonId}`;
  }

  private save(): void {
    if (!canUseStorage()) return;
    try {
      globalThis.localStorage.setItem(StageContextManager.storageKey(this.state.lessonId), this.serialize());
      StageContextManager.prune();
    } catch {
      // Quota errors must never abort generation.
    }
  }

  static load(lessonId: string): StageContextManager | null {
    if (!canUseStorage()) return null;
    const raw = globalThis.localStorage.getItem(StageContextManager.storageKey(lessonId));
    if (!raw) return null;
    try {
      return StageContextManager.deserialize(raw);
    } catch {
      return null;
    }
  }

  static clear(lessonId: string): void {
    if (!canUseStorage()) return;
    globalThis.localStorage.removeItem(StageContextManager.storageKey(lessonId));
  }

  /** Keeps at most MAX_SAVED_CONTEXTS saved lessons, dropping the oldest. */
  static prune(): void {
    if (!canUseStorage()) return;
    const keys: string[] = [];
    for (let i = 0; i < globalThis.localStorage.length; i++) {
      const key = globalThis.localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    if (keys.length <= MAX_SAVED_CONTEXTS) return;

    const byAge = keys
      .map((key) => {
        let savedAt: number;
        try {
          savedAt =
            (
              JSON.parse(String(globalThis.localStorage.getItem(key))) as { savedAt?: number }
            ).savedAt ?? 0;
        } catch {
          // Unparseable entries sort oldest and get pruned first.
          savedAt = 0;
        }
        return { key, savedAt };
      })
      .sort((a, b) => a.savedAt - b.savedAt);

    for (const entry of byAge.slice(0, byAge.length - MAX_SAVED_CONTEXTS)) {
      globalThis.localStorage.removeItem(entry.key);
    }
  }
}
