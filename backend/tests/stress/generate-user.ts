'use strict';

// Artillery processor — generates a unique userId per virtual user and
// exposes it as {{ userId }} in the scenario flow.
//
// Artillery calls beforeScenario once per VU per scenario run, so each
// virtual user gets its own stable UUID for the duration of that scenario.

const { randomUUID } = require('crypto');

function setUserId(context: { vars: { userId: any; }; }, _events: any, done: () => any) {
  context.vars.userId = randomUUID();
  return done();
}

module.exports = { setUserId };
