(function () {
  'use strict';
  const historicalPhotoAssets = {
    rollCall: { file: 'pow_roll_call_1960s.webp', title: 'POW roll call — supplied illustrative photograph', caption: 'A supplied photograph of prisoners at roll call. Exact camp, date and individual identities have not been independently verified.' },
    coker: { file: 'ltjg_coker_may_1966_colorized.webp', title: 'LTJG George Thomas Coker — May 1966', caption: 'The supplied May 1966 caption is retained. Interpretive estimated coloring; colors are not established historical fact. George Coker is a different person from the tribute subject, William S. McConnell.' },
    aerial: { file: 'hanoi_hilton_aerial_colorized.webp', title: 'Hanoi Hilton — supplied aerial context image', caption: 'Interpretive estimated coloring. This image provides context for POW facilities; it is not a surveyed plan of the Dirty Bird power-plant prison.' },
    courtyard: { file: 'pow_prison_courtyard.webp', title: 'Prison courtyard — supplied illustrative photograph', caption: 'The specific facility and date have not been independently verified. The playable compound is a fictional schematic inspired by the supplied account, not a reconstruction from this photograph.' },
    interrogation: { file: 'pow_interrogation_scene.webp', title: 'Captivity — supplied illustrative photograph', caption: 'Provenance and identities are unverified. This is not labeled as a recording of an interrogation of Coker, McKnight, or any particular event.' },
    repatriation: { file: 'pow_group_repatriation.webp', title: 'POW repatriation — supplied illustrative photograph', caption: 'A supplied image of a prisoner group and release context. Exact date, location and individual identities have not been independently verified.' },
    denton: { file: 'denton_blinking_torture_color.png', title: 'Jeremiah Denton — supplied color photograph', caption: 'Identified as Jeremiah Denton by the user. The supplied color version is preserved unchanged; original archival provenance, exact frame date and colors have not been independently verified. This reference photograph is separate from your playable escape.' },
    stockdale: { file: 'stockdale_pow_color.png', title: 'James Stockdale — supplied color photograph', caption: 'Identified as James Stockdale by the user. The supplied color version is preserved unchanged; original archival provenance, exact photograph date and colors have not been independently verified. This reference portrait is separate from fictional gameplay conversations.' }
  };
  for (const item of Object.values(historicalPhotoAssets)) item.src = 'assets/history/' + item.file;
  let dialog, pausedGame, previousPause;
  function open(key = 'coker') {
    close();
    if (key && typeof key === 'object') key = key.pow?.stage === 'solitary' ? 'interrogation' : key.pow?.stage === 'cell' ? 'courtyard' : 'aerial';
    pausedGame = window.POW?.ctx?.App?.game;
    if (pausedGame?.pow) {
      previousPause = pausedGame.paused; pausedGame.paused = true;
      const app = pausedGame.app || window.POW?.ctx?.App;
      for (const name of Object.keys(app?.keys || {})) app.keys[name] = 0;
      for (const name of ['pitch', 'roll', 'run', 'crouch']) if (app?.gctl) app.gctl[name] = 0;
      pausedGame.pow.touchInteract = false; pausedGame.pow.touchClimb = false; pausedGame.pow.holding = null;
    }
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    dialog = document.createElement('dialog'); dialog.id = 'powHistory'; dialog.setAttribute('aria-label','POW history photographs'); dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true');
    dialog.style.cssText = 'max-width:850px;width:calc(100% - 24px);max-height:94dvh;padding:18px;background:#101a23;color:#e8ecef;border:1px solid #617887;overflow:auto;z-index:250';
    const header = document.createElement('div'); header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px';
    const h = document.createElement('h2'); h.textContent = 'POW history and supplied photographs'; header.append(h);
    const exit = document.createElement('button'); exit.textContent = 'Close history'; exit.onclick = close; header.append(exit); dialog.append(header);
    const introduction = document.createElement('p'); introduction.textContent = '12 October 1967: Navy Lieutenant George Thomas Coker and U.S. Air Force Captain George G. McKnight escaped from the Dirty Bird prison and traveled roughly 15 miles downstream before recapture. The game’s successful escape, delta, boat and rescue outcomes are hypothetical alternate history.'; dialog.append(introduction);
    const note = document.createElement('p'); note.style.color = '#c3d2dd'; note.textContent = 'The supplied Gemini-generated Coker interview summary inspires covert siesta communication, concealed metal behind door hinges, a circuitous route to the river, mudbank hiding, and mutual support after coercion. The user identified its two-part interview source; video retrieval is blocked in this cloud environment. No text below is presented as a verified quotation by a real POW.'; dialog.append(note);
    const links = document.createElement('p');
    for (const [title, id] of [['Coker interview · Part 1','k6d_teRSYOU'], [' · Part 2','TlUR9dRWlIk']]) { const link = document.createElement('a'); link.href = 'https://www.youtube.com/watch?v=' + id; link.textContent = title; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.style.color = '#b4cfea'; links.append(link); }
    dialog.append(links);
    const controls = document.createElement('div'); controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px'; dialog.append(controls);
    const figure = document.createElement('figure'); figure.style.cssText = 'margin:16px 0';
    const photo = document.createElement('img'); photo.loading = 'lazy'; photo.decoding = 'async'; photo.style.cssText = 'display:block;max-width:100%;width:auto;max-height:48dvh;height:auto;object-fit:contain;opacity:1;filter:none;mix-blend-mode:normal;margin:auto;background:#080c10';
    const caption = document.createElement('figcaption'); caption.style.cssText = 'padding-top:12px;line-height:1.5'; figure.append(photo, caption); dialog.append(figure);
    const choose = name => { const item = historicalPhotoAssets[name] || historicalPhotoAssets.coker; photo.src = item.src; photo.alt = item.title; photo.dataset.asset = name; caption.textContent = item.title + '. ' + item.caption; };
    for (const [name, item] of Object.entries(historicalPhotoAssets)) { const button = document.createElement('button'); button.type = 'button'; button.style.minHeight = '44px'; button.textContent = item.title.split(' — ')[0]; button.onclick = () => choose(name); controls.append(button); }
    exit.style.minHeight = '44px';
    if(window.POW?.DentonFlashback){const flashback=document.createElement('button');flashback.type='button';flashback.style.minHeight='44px';flashback.textContent='Denton Morse flashback · May 1966';flashback.onclick=()=>{const game=pausedGame;close();window.POW.DentonFlashback.open(game);};controls.append(flashback);}
    const credits = document.createElement('p'); credits.textContent = 'The six supplied enhanced WebPs and the Denton/Stockdale PNGs are unchanged. Reference originals and PNG masters are preserved. Color treatments are labeled; archival monochrome versions were not supplied and are not manufactured. Upload does not establish reproduction rights. Authoritative-source retrieval is documented separately.'; dialog.append(credits);
    dialog.addEventListener('keydown', event => { event.stopPropagation(); if (event.code === 'Escape') { event.preventDefault(); close(); } });
    dialog.addEventListener('keyup', event => event.stopPropagation());
    document.body.append(dialog); dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }); choose(key); dialog.showModal();
  }
  function close() {
    if (dialog) { dialog.remove(); dialog = null; }
    if (pausedGame?.pow && !pausedGame.pow.complete) pausedGame.paused = previousPause;
    pausedGame = null;
  }
  window.POWPhotos = { historicalPhotoAssets, open, close };
})();
