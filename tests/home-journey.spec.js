import { test, expect } from '@playwright/test';
import { HomeJourney } from '../src/home-journey.js';
import { layout } from '../src/home-layout.js';

const {home:HOME_SPOT,seated:SEATED_SPOT}=layout;

const advance=(journey,seconds) => { for(let i=0;i<seconds*60;i++) journey.update(1/60); };

test('Desk journey moves continuously through the aisle and settles on the chair', () => {
  const journey=new HomeJourney();
  journey.go('desk');
  expect(journey.position.distanceTo(HOME_SPOT)).toBe(0);
  for(let frame=0;frame<360;frame++) {
    const before=journey.position.clone();
    journey.update(1/60);
    expect(journey.position.distanceTo(before)).toBeLessThan(.07);
    expect(journey.position.x).toBeGreaterThanOrEqual(Math.min(HOME_SPOT.x,layout.chair.x)-.01);
    expect(journey.position.x).toBeLessThanOrEqual(SEATED_SPOT.x+.01);
  }
  expect(journey.phase).toBe('typing');
  expect(journey.position.distanceTo(SEATED_SPOT)).toBeLessThan(.001);
});

test('Changing intent cancels a walk or a sit without a delayed return to work', () => {
  for(const interruptAt of [.4,2.4,5]) {
    const journey=new HomeJourney();
    journey.go('desk'); advance(journey,interruptAt);
    journey.go('home'); advance(journey,8);
    expect(journey.phase).toBe('idle');
    expect(journey.position.distanceTo(HOME_SPOT)).toBeLessThan(.001);
    advance(journey,5);
    expect(journey.phase).toBe('idle');
  }
});


test('arriving at an object turns first and reaches before the action is ready',()=>{
  const journey=new HomeJourney(),visit={position:layout.home.clone().setZ(1.3),heading:-Math.PI/2};
  journey.go('visit',false,visit);
  for(let frame=0;frame<300&&journey.phase!=='reaching';frame++)journey.update(1/60);
  expect(journey.phase).toBe('reaching');expect(journey.position.distanceTo(visit.position)).toBeLessThan(.001);
  expect(journey.pose.reach).toBe(0);
  advance(journey,.30);expect(journey.pose.reach).toBeGreaterThan(0);
  expect(Math.abs(journey.heading-visit.heading)).toBeLessThan(.01);
  journey.go('home');advance(journey,5);
  expect(journey.intent).toBe('home');expect(journey.phase).toBe('idle');expect(journey.pose.reach).toBe(0);
});

test('interrupting the climb preserves the current pose and cancels the pending interaction',()=>{
  const journey=new HomeJourney();journey.go('bed');
  for(let frame=0;frame<300&&journey.phase!=='lying';frame++)journey.update(1/60);
  advance(journey,.85);
  const before={position:journey.position.clone(),pose:journey.pose};
  expect(before.pose.lying).toBeGreaterThan(0);expect(before.pose.lying).toBeLessThan(1);
  journey.go('home');expect(journey.position.distanceTo(before.position)).toBe(0);
  expect(journey.pose.lying).toBeCloseTo(before.pose.lying,8);
  advance(journey,7);expect(journey.phase).toBe('idle');expect(journey.intent).toBe('home');
});
