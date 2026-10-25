'use strict';

// Shared test-only access to the current complete-photograph renderer. No
// legacy atlas is uploaded and no actor, source image or physics state changes.
async function waitCompletePhotographs(page, { timeout = 90000 } = {}) {
  await page.waitForFunction(() => {
    const R = window.App?.rend;
    if (R?.gl?.isContextLost()) throw Error('Complete photographs: WebGL context lost');
    const state = window.PhotoCutouts && R && PhotoCutouts.inspect(R);
    if (state?.status === 'error') throw Error(state.failures.join('; '));
    if (R?.textures?.people) throw Error('Removed legacy people atlas unexpectedly uploaded');
    return state?.status === 'ready' && PhotoCutouts.subjects.every(subject => state.records.some(record => record.subject === subject && record.pose === 'idle' && record.resident && R.gl.isTexture(R.textures[record.textureName]?.tex)));
  }, null, { polling: 50, timeout });
}

async function waitPOWVegetation(page, { timeout = 90000 } = {}) {
  await page.waitForFunction(() => {
    if (window.App?.rend?.gl?.isContextLost()) throw Error('POW vegetation: WebGL context lost');
    return !!App.game?.pow && App.rend._legacyVegetationRequested && !!App.rend.textures.photo_vegetation;
  }, null, { polling: 50, timeout });
}

async function installCompletePhotoFixture(page) {
  await waitCompletePhotographs(page);
  await page.evaluate(() => {
    window.__completePhotoFixture = {
      async prepare(subject, clip) {
        const R = App.rend;
        PhotoCutouts.beginFrame(R);
        if (clip) await PhotoCutouts.prepareMotion(R, subject, clip);
        else await PhotoCutouts.preparePose(R, subject, 'idle');
        const state = PhotoCutouts.inspect(R);
        if (state.failures.length || state.motions.failures.length) throw Error(JSON.stringify(state));
        return state;
      },
      sprite(kind, p = [0, 0, -3], options = {}) {
        const actor = { kind, p: p.slice(), alive: options.pose !== 'fallen', armed: options.pose === 'aim', seen: options.pose === 'aim' };
        const photoMotion = options.clip ? { enabled: true, moving: true, clip: options.clip, phase: options.phase || 0, velocity: [1, 0] } : undefined;
        const descriptor = PhotoSprites.describe(actor, { renderer: App.rend, camera: [0, 1, 0], photoMotion, height: options.height || 1.76 });
        if (!descriptor?.photoCutout) throw Error('Complete source photograph unavailable: ' + kind);
        return PhotoSprites.anchor({ ...descriptor, p: p.slice(), owner: actor, sourcePhotograph: true });
      },
      meta(sprite) {
        const R = App.rend, texture = R.textures[sprite.textureName];
        const bodyFraction = sprite.photoBodyFraction || (sprite.photoBounds[3] - sprite.photoBounds[1]) / sprite.photoHeight;
        const baseline = sprite.photoBaseline === undefined ? sprite.photoBounds[3] / sprite.photoHeight : sprite.photoBaseline;
        return {
          asset: sprite.photoAsset, texture: sprite.textureName, complete: sprite.photoCutout,
          cols: sprite.cols, rows: sprite.rows, cell: sprite.cell, motion: sprite.motion,
          sourceAspect: sprite.photoWidth / sprite.photoHeight, renderedAspect: sprite.w / sprite.h,
          visibleHeight: sprite.h * bodyFraction, feet: sprite.p[1] + sprite.h * (1 - baseline),
          gpuWidth: texture?.w, gpuHeight: texture?.h, liveTexture: !!texture && R.gl.isTexture(texture.tex)
        };
      }
    };
  });
}

module.exports = installCompletePhotoFixture;
module.exports.waitCompletePhotographs = waitCompletePhotographs;
module.exports.waitPOWVegetation = waitPOWVegetation;
