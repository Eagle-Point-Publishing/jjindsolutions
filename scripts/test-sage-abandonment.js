'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'sage-chat.js'), 'utf8');
const prefix = source.slice(0, source.indexOf('  function injectCss()')) + '\n})();';
const context = { window: {}, Object, Date, Math };
vm.runInNewContext(prefix, context, { filename: 'sage-chat-policy.js' });

const policy = context.window.SageAbandonment;
const base = {
  hidden: false,
  partial: false,
  completed: false,
  intakeStarted: true,
  email: '',
  phone: '208-555-0100',
  inactiveMs: policy.idleMs,
};

assert.equal(policy.idleMs, 15 * 60 * 1000);
assert.equal(policy.qualifies(base), true);
assert.equal(policy.qualifies({ ...base, hidden: true }), false);
assert.equal(policy.qualifies({ ...base, phone: '' }), false);
assert.equal(policy.qualifies({ ...base, intakeStarted: false }), false);
assert.equal(policy.qualifies({ ...base, inactiveMs: policy.idleMs - 1 }), false);
assert.equal(policy.qualifies({ ...base, partial: true }), false);
assert.equal(policy.qualifies({ ...base, completed: true }), false);
assert.doesNotMatch(source, /visibilitychange[\s\S]{0,220}sendLead\('partial'\)/);
assert.doesNotMatch(source, /pagehide[\s\S]{0,180}sendLead\('partial'\)/);
assert.match(source, /leadSubmissionState\s*=\s*\{\s*partial:\s*false,\s*completed:\s*false\s*\}/);
assert.match(source, /Ask general questions without sharing contact details/);
assert.match(source, /Continue with Sage/);
assert.match(source, /if \(!contactGateComplete\) \{[\s\S]{0,180}showContactGate\(true\)/);
assert.match(source, /callbackRequired \? '' : '<button type="button" class="contact-skip">Continue with Sage<\/button>'/);
assert.match(source, /A service request, estimate, or owner follow-up requires your contact information first/);
assert.match(source, /name="name"[\s\S]{0,260}name="email"[\s\S]{0,260}name="phone"/);
assert.match(source, /if \(!email && !phone\)/);
assert.match(source, /if \(email && !validEmail\(email\)\)/);
assert.match(source, /if \(phone && !validPhone\(phone\)\)/);
assert.match(source, /visitorContact\.name && \(visitorContact\.email \|\| visitorContact\.phone\)/);
assert.match(source, /contact:\s*visitorContact/);
assert.match(source, /conversation_id:\s*CONVERSATION_ID/);
assert.match(source, /persistContactState\(\)/);
assert.match(source, /\(!leadContact\.phone && !leadContact\.email\)/);
assert.doesNotMatch(source, /!leadContact\.phone \|\| !leadContact\.email/);
assert.match(source, /function beginCallback\(initialRequest\)[\s\S]{0,900}step: 'done'[\s\S]{0,500}sendLead\('completed'\)/);
assert.doesNotMatch(source, /function beginCallback\(initialRequest\)[\s\S]{0,900}What company or facility are you with\?/);

console.log('Sage abandonment policy tests passed');
