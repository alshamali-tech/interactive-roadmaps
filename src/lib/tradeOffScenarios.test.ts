import { describe, it, expect } from 'vitest';
import type { TradeOffOption } from '@/curriculum/schema';
import {
  clampScore,
  getMetricBucket,
  applyWhatIf,
  WHAT_IF_SCENARIOS,
  getConsequence,
  countSentences,
  isJustificationValid,
  parseJustificationFeedback,
  offlineJustificationFeedback,
  buildJustificationMessages,
  pickCounterOption,
  optionGoodness,
  buildCounterArgumentMessages,
  offlineCounterArgument,
} from './tradeOffScenarios';

const pg: TradeOffOption = {
  id: 'pg',
  name: 'PostgreSQL',
  description: 'Relational DB',
  pros: ['ACID compliant', 'Rich querying'],
  cons: ['Harder to scale horizontally'],
  metrics: { cost: 3, performance: 6, complexity: 5, scalability: 5 },
};
const cass: TradeOffOption = {
  id: 'cass',
  name: 'Cassandra',
  description: 'Wide-column NoSQL',
  pros: ['Linear scalability', 'High write throughput'],
  cons: ['Limited query flexibility'],
  metrics: { cost: 5, performance: 9, complexity: 7, scalability: 9 },
};
const mongo: TradeOffOption = {
  id: 'mongo',
  name: 'MongoDB',
  description: 'Document DB',
  pros: ['Flexible schema'],
  cons: ['Weaker consistency'],
  metrics: { cost: 4, performance: 7, complexity: 4, scalability: 7 },
};

describe('tradeOffScenarios', () => {
  describe('metric helpers', () => {
    it('clamps scores into 1..10', () => {
      expect(clampScore(0)).toBe(1);
      expect(clampScore(15)).toBe(10);
      expect(clampScore(6.4)).toBe(6);
    });

    it('buckets higher-is-better metrics correctly', () => {
      expect(getMetricBucket('performance', 9)).toBe('good');
      expect(getMetricBucket('performance', 5)).toBe('mid');
      expect(getMetricBucket('performance', 2)).toBe('poor');
    });

    it('buckets lower-is-better metrics correctly', () => {
      expect(getMetricBucket('cost', 2)).toBe('good');
      expect(getMetricBucket('cost', 5)).toBe('mid');
      expect(getMetricBucket('complexity', 9)).toBe('poor');
    });
  });

  describe('applyWhatIf', () => {
    it('returns an unchanged copy for null (baseline)', () => {
      const result = applyWhatIf(pg.metrics, null);
      expect(result).toEqual(pg.metrics);
      expect(result).not.toBe(pg.metrics);
    });

    it('traffic-10x reduces performance/scalability and raises cost', () => {
      const result = applyWhatIf(pg.metrics, 'traffic-10x');
      expect(result.performance).toBe(3);
      expect(result.scalability).toBe(2);
      expect(result.cost).toBe(5);
      expect(result.complexity).toBe(6);
    });

    it('budget-half raises cost by 3 and clamps at 10', () => {
      expect(applyWhatIf(pg.metrics, 'budget-half').cost).toBe(6);
      expect(applyWhatIf(cass.metrics, 'budget-half').cost).toBe(8);
      const expensive = { ...pg.metrics, cost: 9 };
      expect(applyWhatIf(expensive, 'budget-half').cost).toBe(10);
    });

    it('team-two raises complexity by 3 and clamps at 10', () => {
      expect(applyWhatIf(pg.metrics, 'team-two').complexity).toBe(8);
      expect(applyWhatIf(cass.metrics, 'team-two').complexity).toBe(10);
    });

    it('clamps performance at 1 for very slow options under traffic-10x', () => {
      const slow = { ...pg.metrics, performance: 2 };
      expect(applyWhatIf(slow, 'traffic-10x').performance).toBe(1);
    });

    it('exposes exactly the three required scenarios', () => {
      expect(WHAT_IF_SCENARIOS.map((s) => s.id)).toEqual([
        'traffic-10x',
        'budget-half',
        'team-two',
      ]);
    });
  });

  describe('getConsequence', () => {
    it('produces a concrete performance scenario with request numbers', () => {
      const c = getConsequence('performance', 9, 'Cassandra');
      expect(c.scenario).toContain('10,000 requests/second');
      expect(c.scenario).toContain('Cassandra');
      expect(c.example.length).toBeGreaterThan(10);
    });

    it('produces different text per bucket', () => {
      const good = getConsequence('performance', 9, 'X');
      const poor = getConsequence('performance', 2, 'X');
      expect(good.scenario).not.toBe(poor.scenario);
    });

    it('treats cheap cost as good and expensive cost as poor', () => {
      const cheap = getConsequence('cost', 2, 'X');
      const pricey = getConsequence('cost', 9, 'X');
      expect(cheap.scenario).toContain('startup budget');
      expect(pricey.scenario).toContain('salary');
    });

    it('is deterministic', () => {
      expect(getConsequence('scalability', 5, 'X')).toEqual(
        getConsequence('scalability', 5, 'X')
      );
    });
  });

  describe('countSentences / isJustificationValid', () => {
    it('counts complete sentences', () => {
      expect(countSentences('It is cheap. It is fast.')).toBe(2);
      expect(countSentences('One! Two? Three.')).toBe(0); // fragments < 3 words
      expect(countSentences('This is one. This is two. This is three.')).toBe(3);
    });

    it('counts a trailing sentence without punctuation if it has >= 3 words', () => {
      expect(countSentences('It is cheap. It also scales well')).toBe(2);
    });

    it('rejects empty and single-sentence justifications', () => {
      expect(isJustificationValid('')).toBe(false);
      expect(isJustificationValid('Because it is fast.')).toBe(false);
    });

    it('accepts two real sentences', () => {
      expect(isJustificationValid('It handles writes well. It also scales out.')).toBe(true);
    });
  });

  describe('parseJustificationFeedback', () => {
    it('parses a fenced JSON block', () => {
      const raw = 'Here you go:\n```json\n{"quality":"strong","comment":"Nice work."}\n```';
      expect(parseJustificationFeedback(raw)).toEqual({
        quality: 'strong',
        comment: 'Nice work.',
      });
    });

    it('parses a bare JSON object', () => {
      expect(
        parseJustificationFeedback('{"quality":"adequate","comment":"Add detail."}')
      ).toEqual({ quality: 'adequate', comment: 'Add detail.' });
    });

    it('returns null for malformed JSON', () => {
      expect(parseJustificationFeedback('```json\n{invalid}\n```')).toBeNull();
    });

    it('returns null for unknown quality or missing comment', () => {
      expect(parseJustificationFeedback('{"quality":"amazing","comment":"x"}')).toBeNull();
      expect(parseJustificationFeedback('{"quality":"strong"}')).toBeNull();
      expect(parseJustificationFeedback('no json here')).toBeNull();
    });
  });

  describe('offlineJustificationFeedback', () => {
    it('rates long, trade-off-aware reasoning as strong', () => {
      const text =
        'I chose PostgreSQL because the workload is read-heavy and relational. ' +
        'Although Cassandra scales better, the cost and complexity trade-off is not justified here. ' +
        'The risk of eventual consistency outweighs raw throughput for this use case. ' +
        'Horizontal scaling can wait until traffic actually demands it.';
      expect(offlineJustificationFeedback(text, pg).quality).toBe('strong');
    });

    it('rates medium reasoning as adequate and short as weak', () => {
      const medium =
        'It fits the current team and the budget we have today, which matters most right now, and the migration path stays simple for everyone involved.';
      expect(offlineJustificationFeedback(medium, pg).quality).toBe('adequate');
      expect(offlineJustificationFeedback('It is cheap. It is simple.', pg).quality).toBe('weak');
    });
  });

  describe('prompt builders', () => {
    it('justification prompt includes scenario, option and JSON contract', () => {
      const msgs = buildJustificationMessages('Pick a DB', pg, 'Because reasons.');
      expect(msgs).toHaveLength(2);
      expect(msgs[0].content).toContain('"quality"');
      expect(msgs[1].content).toContain('Pick a DB');
      expect(msgs[1].content).toContain('PostgreSQL');
      expect(msgs[1].content).toContain('Because reasons.');
    });

    it('counter-argument prompt names both options', () => {
      const msgs = buildCounterArgumentMessages('Pick a DB', pg, cass);
      expect(msgs[1].content).toContain('PostgreSQL');
      expect(msgs[1].content).toContain('Cassandra');
    });
  });

  describe('pickCounterOption', () => {
    it('picks the strongest alternative (goodness ranking)', () => {
      // goodness: pg=3, cass=6, mongo=6 → tie resolves to first (cass)
      expect(optionGoodness(cass)).toBe(6);
      expect(pickCounterOption([pg, cass, mongo], 'pg')?.id).toBe('cass');
    });

    it('never picks the selected option', () => {
      expect(pickCounterOption([pg, cass, mongo], 'cass')?.id).toBe('mongo');
    });

    it('returns null when there is no alternative', () => {
      expect(pickCounterOption([pg], 'pg')).toBeNull();
    });
  });

  describe('offlineCounterArgument', () => {
    it('mentions both options and a concrete weakness', () => {
      const text = offlineCounterArgument(pg, cass);
      expect(text).toContain('Cassandra');
      expect(text).toContain('PostgreSQL');
      expect(text).toContain('Harder to scale horizontally');
    });
  });
});
