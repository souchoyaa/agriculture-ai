// Fine-tuned (GGUF) pass-1 parser against recorded llama-server responses (sample photos, 512 px).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpretFineTuned } from '../src/model/fineTuned';

const rec = JSON.parse(readFileSync('tests/fixtures/fine-tuned-responses.json', 'utf8'));
const rust = interpretFineTuned(rec['coffee-leaf-rust.jpg'].text, rec['coffee-leaf-rust.jpg'].tokens);
assert.equal(rust.raw.labels[0].label, 'rust');
assert.ok(rust.raw.labels[0].score > 0.9);
assert.equal(rust.subject.kind, 'leaf');
assert.equal(rust.followUp, undefined);
const sum = rust.raw.labels.reduce((s, l) => s + l.score, 0);
assert.ok(Math.abs(sum - 1) < 0.01, 'renormalised over the 5 conditions');

const unusable = interpretFineTuned('{"usable": false, "reason": "not_coffee_leaf", "condition": "none"}', []);
assert.equal(unusable.followUp, 'not_a_plant');
assert.equal(interpretFineTuned('{"usable": false, "reason": "too_far", "condition": "none"}', []).followUp, 'closer_leaf');

const noProbs = interpretFineTuned('{"usable": true, "reason": "ok", "condition": "miner"}', []);
assert.deepEqual(noProbs.raw.labels, [{ label: 'leaf_miner', score: 0.354 }]);
console.log('fineTuned: ok', rust.raw.labels, interpretFineTuned(rec['coffee-healthy.jpg'].text, rec['coffee-healthy.jpg'].tokens).raw.labels);
