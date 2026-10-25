'use strict';

// The Camp menu intentionally starts closed and closes after a tool action.
// Use the caller's genuine mouse/touch path; never force visibility or bypass
// the original details/summary activation and gameplay input lifecycle.
module.exports=async function openPowTools(page,click){
 if(typeof click!=='function')throw new TypeError('Provide the test\'s native click/tap callback');
 const menu=page.locator('#powHUD .pow-tools-menu');
 await menu.waitFor({state:'visible',timeout:10000});
 if(await menu.evaluate(node=>node.open))return false;
 await click(menu.locator(':scope > summary'));
 await page.waitForFunction(()=>document.querySelector('#powHUD .pow-tools-menu')?.open===true,null,{polling:50,timeout:5000});
 return true;
};
