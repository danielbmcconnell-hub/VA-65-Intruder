'use strict';

// The standalone visual-clarity harness accepts an options object. Keep its
// explicit protocol while exposing the shared browser registry signature.
module.exports = async function visualClarity(browser, target, evidenceDir) {
  return require('./visual-clarity-browser.cjs')({ browser, baseURL: target, evidenceDir });
};
