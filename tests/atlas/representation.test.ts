import test from 'node:test';
import assert from 'node:assert/strict';
import {troopFormation} from '../../src/client/game/troops';
import {terrainContours,contourLevels} from '../../src/client/game/contours';
import {scenarioWorld} from '../../src/client/game/scenarioWorld';
import {scenarios} from '../../src/client/game/scenarios';

test('troop formations convey increasing strength without unbounded size or phantom troops',()=>{
 assert.deepEqual(troopFormation(0),[]);
 let previous=0;
 for(const army of [1,3,6,12,24,36,100,10000]){
  const dots=troopFormation(army);assert.ok(dots.length>=previous);assert.ok(dots.length<=12);
  assert.ok(dots.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.hypot(p.x,p.y)<21));previous=dots.length;
 }
 assert.ok(troopFormation(20).length>troopFormation(10).length);
});
test('every atlas has finite contour paths for lowlands and elevated terrain',()=>{
 for(const scenario of scenarios){
  const paths=terrainContours(scenarioWorld(scenario));assert.equal(paths.length,contourLevels.length);
  assert.ok(paths.some((d,i)=>contourLevels[i]<=60&&d.length>0));
  assert.ok(paths.some((d,i)=>contourLevels[i]>=200&&d.length>0));
  assert.ok(paths.every(d=>!d.includes('NaN')&&!d.includes('Infinity')));
 }
});
