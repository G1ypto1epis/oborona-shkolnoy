/* Aerodrome mission rules and map. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AerodromeMission = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // Expanded road corridor conservatively covers the full house and its roof.
  function overlapsRoad(h, road) {
    const margin = (road.type === 'ring' ? 145 : 130) / 2 + 7;
    const bounds = [h.x-margin, h.y-margin, h.x+h.width+margin, h.y+h.height+margin];
    for (let i=1;i<road.points.length;i++) {
      const [x,y]=road.points[i-1], [endX,endY]=road.points[i], dx=endX-x, dy=endY-y;
      let low=0, high=1;
      for (const [origin,delta,min,max] of [[x,dx,bounds[0],bounds[2]],[y,dy,bounds[1],bounds[3]]]) {
        if (Math.abs(delta)<1e-9) { if (origin<min || origin>max) {low=1;high=0;break;} }
        else {let a=(min-origin)/delta,b=(max-origin)/delta;if(a>b)[a,b]=[b,a];low=Math.max(low,a);high=Math.min(high,b);}
      }
      if (low<=high) return true;
    }
    return false;
  }
  const MAP = {
    width: 4200, height: 2500,
    runway: { x: 850, y: 930, width: 2300, height: 260 },
    departure: { x: 2900, y: 1060, radius: 150 },
    river: { points: [[0, 160], [700, 190], [1400, 145], [2100, 180], [2800, 130], [3500, 180], [4200, 150]], width: 160 },
    bridges: [{ x: 2100, y: 180, width: 145 }],
    depot: { x: 3800, y: 2050, radius: 150, name: 'Леннонское депо' },
    buildings: [
      { type: 'hangar', name: 'Ангар', x: 450, y: 1450, width: 360, height: 220 },
      { type: 'serviceHangar', name: 'Мастерская', x: 430, y: 700, width: 260, height: 150, service: ['repair', 'ammunition'], servicePoint: { x: 740, y: 775, radius: 100 } },
      { type: 'serviceHangar', name: 'Боеприпасы', x: 430, y: 1060, width: 260, height: 150, service: ['repair', 'ammunition'], servicePoint: { x: 740, y: 1135, radius: 100 } },
      { type: 'tower', name: 'Диспетчерская', x: 3280, y: 530, width: 120, height: 120 },
      { type: 'terminal', name: 'Терминал', x: 1230, y: 1780, width: 650, height: 220 }
    ],
    // The roads are polylines so the renderer and navigation can share the same layout.
    roads: [
      { type: 'ring', points: [[400, 390], [3600, 390], [3840, 680], [3840, 1910], [3600, 2170], [400, 2170], [180, 1910], [180, 680], [400, 390]] },
      { type: 'approach', points: [[0, 650], [180, 680]] },
      { type: 'approach', points: [[0, 1780], [180, 1780]] },
      { type: 'approach', points: [[4200, 700], [3840, 700]] },
      { type: 'approach', points: [[4200, 1750], [3840, 1750]] },
      { type: 'approach', points: [[2100, 0], [2100, 390]] },
      { type: 'approach', points: [[2800, 2500], [2800, 2170]] },
      { type: 'village', points: [[60, 720], [60, 1900], [180, 1900]] },
      { type: 'village', points: [[4140, 720], [4140, 1900], [3840, 1900]] },
      { type: 'village', points: [[400, 2170], [400, 2420], [3600, 2420], [3600, 2170]] }
    ],
    wireLines: [
      { points: [[400, 390], [3600, 390], [3840, 680], [3840, 1910], [3600, 2170], [400, 2170], [180, 1910], [180, 680], [400, 390]] },
      { points: [[180, 775], [740, 775], [740, 1300], [2000, 1300], [3150, 1300], [3600, 1300], [3840, 1300]] },
      { points: [[740, 1135], [740, 775]] },
      { points: [[400, 2170], [400, 2420], [3600, 2420], [3600, 2170]] }
    ],
    houseCandidates: [
      ...Array.from({ length: 7 }, (_, i) => ({ x: 270, y: 780 + i * 165, width: 75, height: 75 })),
      ...Array.from({ length: 7 }, (_, i) => ({ x: 3950, y: 780 + i * 165, width: 75, height: 75 })),
      ...Array.from({ length: 12 }, (_, i) => ({ x: 500 + i * 250, y: 2260, width: 115, height: 65 })),
      ...Array.from({ length: 12 }, (_, i) => ({ x: 500 + i * 250, y: 2420, width: 115, height: 65 }))
    ],
    helicopter: { x: 3180, y: 1630 }
  };

  MAP.houses = MAP.houseCandidates.filter(h => !MAP.roads.some(r => overlapsRoad(h,r)));
  const CLOSE_COMBAT = Object.freeze(['basic', 'flank', 'rammer', 'cannon', 'missile', 'flame', 'quad', 'heavy', 'explosive']);
  const ARTILLERY = Object.freeze({ kind: 'artillery', name: 'Артиллерийская маршрутка', hp: 45, armor: 1, range: 1800, minimumDistance: 800, damage: 48, cooldown: 4 });
  const VEHICLES = Object.freeze([
    { id: 'ant', name: 'Муравей модернизированный', role: 'tug', sections: 1, machineGuns: 2, mortars: 0 },
    { id: 'thunder', name: 'Гром', role: 'combat', sections: 3, automaticWeapons: 10, machineGuns: 5, mortars: 2 },
    { id: 'donor', name: 'Донор — троллейбус поддержки', role: 'repair' },
    { id: 'comet', name: 'Комета — бронетроллейбус', role: 'armor' }
  ]);

  function create() {
    return {
      phase: 'defense', playerAlive: true, wave: 0, waveDelay: null, credits: 160,
      enemies: [], pending: [], rescued: 0, destroyed: 0,
      aircraft: Array.from({ length: 12 }, (_, i) => ({
        id: i + 1, neutral: i >= 10, hp: 200, status: 'parked', towBy: null,
        x: 900 + (i % 6) * 375, y: i < 6 ? 570 : 1500
      }))
    };
  }
  function waveSize(n) {
    if (!Number.isInteger(n) || n < 1) throw new RangeError('Wave number must be a positive integer');
    return 2 * n * (n % 5 === 0 ? 5 : 1);
  }
  function nextWave(state) {
    if (state.phase !== 'defense' && state.phase !== 'evacuation') return [];
    state.wave++;
    state.waveDelay = null;
    const count = waveSize(state.wave);
    // Artillery is part of the announced total; at least one enemy is close-combat.
    const artilleryCount = state.wave >= 2 ? Math.min(count - 1, Math.floor(count / 4)) : 0;
    const incoming = Array.from({ length: count }, (_, i) => ({
      kind: i >= count - artilleryCount ? ARTILLERY.kind : CLOSE_COMBAT[(i + state.wave - 1) % CLOSE_COMBAT.length],
      alive: true
    }));
    state.pending.push(...incoming);
    return incoming;
  }
  function registerSpawn(state, enemy) {
    const i = state.pending.indexOf(enemy);
    if (i < 0) return false;
    state.pending.splice(i, 1);
    state.enemies.push(enemy);
    return true;
  }
  function updateWave(state, seconds) {
    if (state.phase !== 'defense' && state.phase !== 'evacuation') return false;
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Invalid elapsed time');
    const closeAlive = e => e.alive && e.kind !== ARTILLERY.kind;
    if (state.pending.some(closeAlive) || state.enemies.some(closeAlive)) {
      state.waveDelay = null;
      return false;
    }
    if (state.waveDelay === null) state.waveDelay = 10;
    state.waveDelay = Math.max(0, state.waveDelay - seconds);
    if (state.waveDelay === 0) { nextWave(state); return true; }
    return false;
  }
  function damageAircraft(state, id, amount) {
    const p = state.aircraft.find(a => a.id === id);
    if (!p || !['parked', 'towed'].includes(p.status) || !Number.isFinite(amount) || amount <= 0) return false;
    p.hp = Math.max(0, p.hp - amount);
    if (!p.hp) {
      p.status = 'destroyed'; p.towBy = null;
      if (!p.neutral) state.destroyed++;
      if (state.destroyed > 5) state.phase = 'defeat';
    }
    return true;
  }
  function attach(state, id, tug) {
    const p = state.aircraft.find(a => a.id === id);
    if (state.phase !== 'defense' || !p || p.neutral || p.status !== 'parked' || !tug || tug.role !== 'tug' || !tug.id || tug.alive === false || state.aircraft.some(a => a.towBy === tug.id)) return false;
    p.status = 'towed'; p.towBy = tug.id; return true;
  }
  function detach(state, id) {
    const p = state.aircraft.find(a => a.id === id);
    if (!p || p.status !== 'towed') return false;
    p.status = 'parked'; p.towBy = null; return true;
  }
  function deliver(state, id, tugId, x, y) {
    const p = state.aircraft.find(a => a.id === id), d = MAP.departure;
    if (state.phase !== 'defense' || !p || p.status !== 'towed' || p.towBy !== tugId || !Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x-d.x, y-d.y) > d.radius) return false;
    p.status = 'rescued'; p.towBy = null; state.rescued++;
    if (state.rescued >= 5) state.phase = 'evacuation';
    return true;
  }
  function playerDestroyed(state) {
    state.playerAlive = false;
    if (state.phase === 'defense' || state.phase === 'evacuation') state.phase = 'defeat';
  }
  function segmentDistance(x,y,a,b) {
    const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
    const t=den?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/den)):0;
    return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
  }
  function nearPower(x,y) {
    if (!Number.isFinite(x)||!Number.isFinite(y)) return false;
    return MAP.wireLines.some(w=>w.points.some((p,i)=>i>0 && segmentDistance(x,y,w.points[i-1],p)<=65));
  }
  function serviceAt(x,y) {
    return MAP.buildings.find(b=>b.type==='serviceHangar' && Math.hypot(x-b.servicePoint.x,y-b.servicePoint.y)<=b.servicePoint.radius) || null;
  }
  function service(state, vehicle) {
    if (!vehicle || !vehicle.alive || !serviceAt(vehicle.x,vehicle.y) || state.credits<100 || !['defense','evacuation'].includes(state.phase)) return false;
    const needs=vehicle.hp<vehicle.maxHp || vehicle.ammo<vehicle.maxAmmo || vehicle.shells<vehicle.maxShells || vehicle.energy<100;
    if (!needs) return false;
    state.credits-=100;
    vehicle.hp=Math.min(vehicle.maxHp,vehicle.hp+95);
    vehicle.ammo=Math.min(vehicle.maxAmmo,vehicle.ammo+220);
    vehicle.shells=Math.min(vehicle.maxShells,vehicle.shells+14);
    vehicle.energy=Math.min(100,vehicle.energy+50);
    return true;
  }
  function updateCharge(vehicle,dt) {
    if (!vehicle || !vehicle.alive || !Number.isFinite(dt) || dt<0 || !Number.isFinite(vehicle.energy)) return;
    vehicle.energy=Math.max(0,Math.min(100,vehicle.energy+(nearPower(vehicle.x,vehicle.y)?10:-4.1)*dt));
  }
  function canPlace(x,y,radius=25) {
    if (![x,y,radius].every(Number.isFinite) || radius<0 || x-radius<0 || y-radius<0 || x+radius>MAP.width || y+radius>MAP.height) return false;
    const hit=b=>{const cx=Math.max(b.x,Math.min(x,b.x+b.width)),cy=Math.max(b.y,Math.min(y,b.y+b.height));return (cx-x)**2+(cy-y)**2<radius*radius};
    return !MAP.houses.some(hit) && !MAP.buildings.some(hit);
  }
  function reachDepot(state, x, y) {
    const d = MAP.depot;
    if (state.phase !== 'evacuation' || !state.playerAlive || !Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x-d.x, y-d.y) > d.radius) return false;
    state.phase = 'victory'; return true;
  }
  return { MAP, overlapsRoad, CLOSE_COMBAT, ARTILLERY, VEHICLES, create, waveSize, nextWave, registerSpawn, updateWave, damageAircraft, attach, detach, deliver, playerDestroyed, reachDepot, segmentDistance, nearPower, serviceAt, service, updateCharge, canPlace };
});
