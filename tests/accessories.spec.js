import {test,expect} from '@playwright/test';
import {enter,act,line} from './helpers.js';

test('Smoking has its own pose and smoke; accessories clear on action changes',async({page})=> {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);await page.keyboard.press('7');
  await expect(page.locator('#stage')).toHaveAttribute('data-state','smoke');
  await expect(page.locator('#stage')).toHaveAttribute('data-accessory','smoke');
  await expect(line(page)).toHaveText('Un ratito en las nubes.');
  await act(page,'wave');
  await expect(page.locator('#stage')).toHaveAttribute('data-accessory','none');
  await act(page,'smoke');
  await expect(page.locator('#stage')).toHaveAttribute('data-accessory','smoke');
  await page.keyboard.press('Escape');await expect(page.locator('#stage')).toHaveAttribute('data-accessory','none');
  expect(errors).toEqual([]);
});

test('Glasses use local audio only, stop at twelve seconds and cancel on action changes',async({page})=> {
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await enter(page);await page.keyboard.press('8');
  await expect(page.locator('#stage')).toHaveAttribute('data-accessory','glasses');
  await expect(page.locator('#music-panel')).toHaveAttribute('data-playback','playing');
  await expect(page.locator('#music-panel')).toBeHidden();
  await expect(page.locator('iframe')).toHaveCount(0);
  const metadata=await page.locator('#dance-audio').evaluate(audio=>({duration:audio.duration,src:audio.currentSrc,paused:audio.paused,muted:audio.muted}));
  expect(metadata.duration).toBeCloseTo(12,1);expect(metadata.src).toContain('/audio/techno-80-92.m4a');expect(metadata.paused).toBe(false);
  // The glasses are what turns sound on.
  expect(metadata.muted).toBe(false);
  expect(requests.some(url=>/youtube|googlevideo/.test(url))).toBe(false);
  await page.locator('#dance-audio').evaluate(audio=>{audio.currentTime=11.96;});
  await expect(page.locator('#stage')).toHaveAttribute('data-state','idle');
  expect(await page.locator('#dance-audio').evaluate(audio=>audio.paused)).toBe(true);
  await act(page,'disco');await expect(page.locator('#music-panel')).toHaveAttribute('data-playback','playing');
  await act(page,'smoke');
  expect(await page.locator('#dance-audio').evaluate(audio=>audio.paused)).toBe(true);
  await expect(page.locator('#stage')).toHaveAttribute('data-accessory','smoke');
});

test('Blocked audio offers a retry without a video, and canceling clears it',async({page})=> {
  await page.addInitScript(()=>{
    const original=HTMLMediaElement.prototype.play;let blocked=true;
    HTMLMediaElement.prototype.play=function(){if(blocked){blocked=false;return Promise.reject(new DOMException('Blocked','NotAllowedError'));}return original.call(this);};
  });
  await enter(page);await act(page,'disco');
  await expect(page.locator('#music-panel')).toHaveAttribute('data-playback','blocked');
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.locator('#music-retry').click();await expect(page.locator('#music-panel')).toHaveAttribute('data-playback','playing');
  await expect(page.locator('#music-panel')).toBeHidden();
  await page.keyboard.press('Escape');expect(await page.locator('#dance-audio').evaluate(audio=>audio.paused)).toBe(true);
});

test('Dancing with glasses waits until Zud returns from the desk; new actions fit mobile with reduced motion',async({page})=> {
  test.setTimeout(90000); // Allow the complete desk route in software WebGL.
  await enter(page);
  await act(page,'work');await expect(page.locator('#stage')).toHaveAttribute('data-activity','typing',{timeout:25000});
  await page.getByRole('link',{name:'Home',exact:true}).click();
  await act(page,'disco');await expect(page.locator('#music-panel')).toBeHidden();
  await expect(page.locator('#music-panel')).not.toHaveAttribute('data-playback','playing');
  await expect(page.locator('#music-panel')).toHaveAttribute('data-playback','playing',{timeout:10000});
  await expect(page.locator('#stage')).toHaveAttribute('data-activity','idle');
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await act(page,'disco');await expect(page.locator('#stage')).toHaveAttribute('data-accessory','glasses');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await act(page,'smoke');await expect(page.locator('#stage')).toHaveAttribute('data-accessory','smoke');
  await page.waitForTimeout(300);await page.screenshot({path:'.context/zud-smoking-mobile.png',fullPage:true});
});

test('Halloween puts on the reference mask, cancels music, and clears when changing action or walking',async({page})=> {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);await act(page,'disco');
  await expect(page.locator('#music-panel')).toHaveAttribute('data-playback','playing');
  await page.keyboard.press('9');
  const stage=page.locator('#stage');
  await expect(stage).toHaveAttribute('data-state','halloween');
  await expect(stage).toHaveAttribute('data-accessory','mask');
  await expect(stage).toHaveAttribute('data-costume-phase','putting-on');
  expect(await page.locator('#dance-audio').evaluate(audio=>audio.paused)).toBe(true);
  await expect(stage).toHaveAttribute('data-costume-phase','worn');
  await expect(line(page)).toHaveText('¿Bú…? Sigo siendo yo.');
  await act(page,'wave');await expect(stage).toHaveAttribute('data-accessory','none');
  await page.keyboard.press('9');
  await expect(stage).toHaveAttribute('data-accessory','mask');
  await page.keyboard.press('ArrowDown');await expect(stage).toHaveAttribute('data-accessory','none');
  expect(errors).toEqual([]);
});

test('Halloween is reachable on mobile and reduced motion skips dressing and the scare',async({page})=> {
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await enter(page);
  await act(page,'halloween');
  await expect(page.locator('#stage')).toHaveAttribute('data-costume-phase','worn');
  await expect(page.locator('#floating-symbol')).toHaveText('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.waitForTimeout(300);await page.mouse.move(0,0);
  await page.screenshot({path:'.context/zud-halloween-mobile.png',fullPage:true});
});
