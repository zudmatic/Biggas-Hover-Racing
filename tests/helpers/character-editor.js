import {expect} from '@playwright/test';

// Editing scenarios explicitly open the controls they exercise; the UI starts folded.
export async function expandCharacterSections(page) {
  await expect(page.locator('.lab-viewport')).toHaveAttribute('data-ready','true');
  for(const section of await page.locator('.lab-panel details').all()){
    if(await section.getAttribute('open')===null)await section.locator(':scope > summary').click();
  }
}
