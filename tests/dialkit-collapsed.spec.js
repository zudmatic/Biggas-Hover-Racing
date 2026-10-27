import {test,expect} from '@playwright/test';

for(const url of ['/playground?vehicle=039&backend=webgl2'])test(`DialKit starts with every folder closed: ${url}`,async({page})=>{
  test.setTimeout(180000);
  await page.goto(url);
  await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:120000});
  const folders=page.locator('.dialkit-folder:not(.dialkit-folder-root)');
  expect(await folders.count()).toBeGreaterThan(3);
  expect(await folders.evaluateAll(nodes=>nodes.filter(n=>n.dataset.open!=='false').map(n=>n.querySelector('.dialkit-folder-title')?.textContent))).toEqual([]);
});
