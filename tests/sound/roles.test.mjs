import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, CUE_ROLE, roleOf } from '../../scripts/lib/sound-roles.mjs';

test('every cue role names a known role, and every role has an anchor, an offset and a gap', () => {
  for (const [cue, role] of Object.entries(CUE_ROLE)) assert.ok(ROLES[role], `${cue} → ${role}`);
  for (const [name, r] of Object.entries(ROLES)) {
    assert.ok(['onset', 'apex', 'end'].includes(r.anchor), name);
    assert.equal(typeof r.offsetMs, 'number', name);
    assert.ok(r.minGapMs > 0, name);
  }
});

test('a tap leads its picture, a whoosh meets it at its apex, an unknown cue plays as a tone', () => {
  assert.ok(roleOf('sound/tap').offsetMs < 0);
  assert.equal(roleOf('whoosh').anchor, 'apex');
  assert.equal(roleOf('success'), ROLES.tone);
  assert.equal(roleOf('sting').anchor, 'apex', 'a sting builds before its hit, so its loudest moment meets the beat');
  assert.equal(roleOf('sub-drop').anchor, 'apex');
});
