import {test,expect} from '@playwright/test';
import {Color} from 'three';
import {createPadBoostPalette,smoothBoostPower} from '../src/vfx/pad-boost-palette.js';

test('floor boost transitions to green/lime and restores the underlying nitro palette',()=>{
 const palette=createPadBoostPalette(),out=new Color(),core=new Color();
 palette.apply(out,'#42a4ff');expect(out.getHexString()).toBe('42a4ff');
 palette.update(1/60,true);palette.apply(out,'#42a4ff');expect(out.getHexString()).not.toBe('34ff76');
 palette.update(2,true);palette.apply(out,'#42a4ff');palette.apply(core,'#9e8c00',true);
 expect(out.getHexString()).toBe('34ff76');expect(core.getHexString()).toBe('90e000');
 palette.update(0,false);palette.apply(out,'#42a4ff');expect(out.getHexString()).toBe('34ff76');
 palette.update(2,false);palette.apply(out,'#42a4ff');expect(out.getHexString()).toBe('42a4ff');
 palette.apply(out,'#ff6b16');expect(out.getHexString()).toBe('ff6b16');
});

test('normal acceleration and nitro colors interpolate without floor boost',()=>{
 const p=createPadBoostPalette(),out=new Color();p.apply(out,'#ff6b16');
 p.update(1/60,false);p.apply(out,'#42a4ff');
 expect(out.getHexString()).not.toBe('42a4ff');expect(out.getHexString()).not.toBe('ff6b16');
 const intermediate=out.getHexString();p.update(0,false);p.apply(out,'#42a4ff');expect(out.getHexString()).toBe(intermediate);
 p.update(2,false);p.apply(out,'#42a4ff');expect(out.getHexString()).toBe('42a4ff');
 expect(smoothBoostPower(.45,1,1/60)).toBeGreaterThan(.45);expect(smoothBoostPower(.45,1,1/60)).toBeLessThan(1);
 expect(smoothBoostPower(1,0,1/60)).toBeGreaterThan(0);expect(smoothBoostPower(1,0,0)).toBe(1);
});
