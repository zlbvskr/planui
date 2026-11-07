import assert from 'node:assert/strict';
import test from 'node:test';
import {
  springs,
  tweens,
  easings,
  evaluateSpringPosition,
  solveSpringCurve,
  isReducedMotion,
} from '../motion';

test('motion tokens match Stage D1 specification', () => {
  assert.deepEqual(springs.press, { stiffness: 520, damping: 38 });
  assert.deepEqual(springs.smooth, { stiffness: 320, damping: 30 });
  assert.deepEqual(springs.sheet, { stiffness: 380, damping: 36 });
  assert.deepEqual(springs.gentle, { stiffness: 220, damping: 26 });

  assert.equal(tweens.fast, 140);
  assert.equal(tweens.base, 220);
  assert.equal(tweens.slow, 360);
  assert.equal(tweens.reduced, 120);

  assert.equal(easings.out, 'cubic-bezier(0.22,1,0.36,1)');
  assert.equal(easings.emphasized, 'cubic-bezier(0.32,0.72,0,1)');
});

test('spring solver settles smoothly from 0 to 1 for all tokens', () => {
  for (const [name, token] of Object.entries(springs)) {
    assert.equal(evaluateSpringPosition(token, 0), 0, `${name} starts at 0`);
    const mid = evaluateSpringPosition(token, 0.08);
    assert.ok(mid > 0.3 && mid < 1.2, `${name} progresses smoothly at 80ms (${mid})`);
    const end = evaluateSpringPosition(token, 1.0);
    assert.ok(Math.abs(1 - end) < 0.005, `${name} converges to 1 (${end})`);

    const curve = solveSpringCurve(token);
    assert.ok(curve.durationMs >= 140 && curve.durationMs <= 620);
    assert.equal(curve.samples[0], 0);
    assert.equal(curve.samples[curve.samples.length - 1], 1);
    assert.ok(curve.linearEasing.startsWith('linear(0,'));
  }
});

test('isReducedMotion returns false in SSR/Node environment', () => {
  assert.equal(isReducedMotion(), false);
});
