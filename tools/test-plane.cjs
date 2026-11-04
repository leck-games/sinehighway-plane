// PLANE EDITION — planes e2e: road takeoff, climb 1000+ m, 10+ km cruise with floating-origin rebases (no NaN),
// descent + landing on the road, crash auto-reset, keys P / V, VEHICLE CARS/PLANES tabs, HUD, no console errors.
const { launch, open, ok, done, ROOT } = require('./lib.cjs'); const SH = ROOT + '/shots/'; require('fs').mkdirSync(SH, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const AP_SRC = `(() => { const C = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
  window.__AP = { mode: 'takeoff', alt: 70, thr: 1, boost: false, hdg: null };
  __st.planeCtl = (s) => { const A = window.__AP, d = s.def, vr = d.vRef, bank = Math.atan2(s.left.y, s.up.y), pitch = Math.asin(C(s.fwd.y));
    const o = { pitch: 0, roll: 0, yaw: 0, thr: A.thr, brake: 0, boost: A.boost };
    const level = (bT = 0) => C((bT - bank) * 2.5), vsHold = tv => C((tv - s.vs) * 0.12 + (0.05 - pitch) * 0.3);
    const hdgBank = () => { if (A.hdg == null) return 0; const e = ((A.hdg - s.hdg + 540) % 360) - 180; return C(e * 0.03, -0.6, 0.6); };
    if (A.mode === 'takeoff') { if (s.onGround) { o.pitch = s.ias > vr * 0.75 ? 0.5 : 0; return o; }
      o.roll = level(s.agl > 40 ? hdgBank() : 0); o.pitch = s.alt < A.alt ? vsHold(Math.min(9, (A.alt - s.alt) * 0.2 + 2)) : vsHold(0); return o; }
    if (A.mode === 'hold') { o.roll = level(hdgBank()); o.pitch = vsHold(C((A.alt - s.alt) * 0.15, -6, 6)); return o; }
    if (A.mode === 'descend') { o.roll = level(hdgBank()); o.thr = 0.35; o.pitch = vsHold(s.agl > 120 ? -6 : s.agl > 12 ? -2.5 : -0.8); if (s.onGround) { o.thr = 0; o.brake = 1; o.pitch = 0; o.roll = 0; } return o; }
    if (A.mode === 'land') { const f = A.af, dx = f.dx, dz = f.dz, nx = dz, nz = -dx; // runway frame (n = left)
      const rx = s.p.x - f.x, rz = s.p.z - f.z, along = rx * dx + rz * dz, t = rx * nx + rz * nz, td = s.v.x * nx + s.v.z * nz;
      const aim = -f.L / 2 + 40, dist = aim - along, desH = f.h + Math.max(0, dist) * 0.07; // ~4° glide path to the aim point
      o.roll = level(C(t * 0.025 + td * 0.12, -0.45, 0.45));
      if (s.onGround) { o.pitch = 0; o.thr = 0; o.brake = 1; o.roll = 0; return o; }
      if (s.agl > 5) { const tv = C((desH - s.p.y) * 0.25 - Math.min(9, s.ias * 0.07), -9, 1); o.pitch = vsHold(tv); o.thr = C(0.35 + (vr * 1.15 - s.ias) * 0.05, 0.05, 1); }
      else { o.pitch = vsHold(-0.9); o.thr = 0; o.roll = level(0); }
      return o; }
    return o; }; })()`;
(async () => {
  const h = await launch(), p = h.page, E = (f, ...a) => p.evaluate(f, ...a);
  await open(h, 'q=med&dyn=0&s=2000'); await E(() => localStorage.clear());
  // P key: car -> plane, spawned on the road
  await p.keyboard.press('KeyP'); await sleep(1500);
  let s = await E(() => { const pl = __st.plane, pr = __st.W.project(pl.p.x, pl.p.z); return { craft: __st.craft, id: __st.planeDef.id, gnd: pl.onGround, d: pr.d, body: document.body.className, att: getComputedStyle(document.getElementById('pAtt')).display, lod: __st.FL.visible }; });
  ok(s.craft === 'plane' && s.gnd && Math.abs(s.d) < 3 && /plane/.test(s.body) && s.att !== 'none' && s.lod, 'P: plane spawns on the road centreline (runway) ' + JSON.stringify(s));
  await p.keyboard.press('KeyV'); await sleep(800); const v2 = await E(() => __st.planeDef.id); ok(v2 !== s.id, 'V: next plane (' + s.id + ' -> ' + v2 + ')');
  await E(() => __st.setCraft('plane', 'cub')); await sleep(800);
  await p.screenshot({ path: SH + 'plane_hud.png' });
  // real-time takeoff from the road
  await E(AP_SRC); const t0 = Date.now(); let to = null;
  while (Date.now() - t0 < 60000) { to = await E(() => { const s = __st.plane; return { agl: s.agl, gnd: s.onGround, cr: s.crashed, ias: s.ias }; }); if (to.agl > 25 || to.cr) break; await sleep(300); }
  ok(to && to.agl > 25 && !to.cr, 'takeoff from the road ' + JSON.stringify(to));
  await sleep(1200); await p.screenshot({ path: SH + 'plane_takeoff.png' });
  // headless: climb to 1100 m, then 10+ km cruise along a fixed heading
  const hdg = await E(() => __st.plane.hdg);
  await E(h => Object.assign(window.__AP, { mode: 'takeoff', alt: 1150, hdg: h }), hdg);
  const c1 = await E(() => __st.planeSim(240));
  const alt = await E(() => __st.plane.alt);
  ok(alt > 1000 && !c1.nan && !c1.crashed, 'climb to 1000+ m: alt ' + alt.toFixed(0) + ' ' + JSON.stringify(c1));
  await E(() => Object.assign(window.__AP, { mode: 'hold', alt: 1150 }));
  const c2 = await E(() => __st.planeSim(240));
  ok(c2.km > 10 && c2.rebases >= 5 && !c2.nan && !c2.crashed && c2.maxLocal < 1900 && c2.rebaseErr < 0.01, 'cruise 10+ km with rebases, no NaN ' + JSON.stringify(c2));
  const lod = await E(() => ({ ...__st.FL.stats, range: __st.FL.range }));
  ok(lod.range >= 8000, 'far LOD range on Med >= 8 km: ' + JSON.stringify(lod));
  // render a few frames at altitude
  await E(() => { window.__AP.mode = 'hold'; }); await sleep(3000);
  const fr = await E(() => ({ far: __st.camera.far, uFar: __st.U.uFar.value, calls: __st.rinfo.calls, tris: __st.rinfo.tris, altK: __st.altK }));
  ok(fr.far > 6000 && fr.uFar > 5000, 'at altitude: camera far + fog pushed to the LOD range ' + JSON.stringify(fr));
  await p.screenshot({ path: SH + 'plane_altitude.png' });
  // crash -> auto reset onto the road after 2.6 s
  const cb = await E(() => __st.plane.crashes);
  await E(() => { __st.airStart(); __st.planeCtl = () => ({ pitch: -1, roll: 0, yaw: 0, thr: 1, brake: 0, boost: 0 }); });
  let cr = null; const t1 = Date.now(); while (Date.now() - t1 < 40000) { cr = await E(() => ({ c: __st.plane.crashes })); if (cr.c > cb) break; await sleep(250); }
  await E(() => { __st.planeCtl = null; }); { const t2 = Date.now(); while (Date.now() - t2 < 30000 && await E(() => __st.plane.crashed)) await sleep(300); } await sleep(500);
  const rs = await E(() => { const pl = __st.plane, pr = __st.W.project(pl.p.x, pl.p.z); return { cr: pl.crashed, gnd: pl.onGround, d: pr.d }; });
  ok(cr.c > cb && !rs.cr && rs.gnd && Math.abs(rs.d) < 3, 'crash -> auto reset onto the road ' + JSON.stringify(rs));
  // approach + landing on the road: 4 deg glide path 650 m out, aligned with the road tangent
  await E(AP_SRC);
  const ap = await E(() => { const s = __st.plane, r = __st.W.project(s.p.x, s.p.z), f = __st.roadField(r.s + 900); f.L = 400; f.h = __st.T.groundAt(f.x, f.z); const d = 650 + f.L / 2, x = f.x - f.dx * d, z = f.z - f.dz * d;
    __st.airStart(x, z, Math.atan2(f.dx, f.dz)); s.p.y = f.h + 610 * 0.07 + 2; const v = __st.planeDef.vRef * 1.2; s.v.set(f.dx * v, 0, f.dz * v); window.__AP.af = f; window.__AP.mode = 'land'; return f; });
  await sleep(3500); await p.screenshot({ path: SH + 'plane_landing.png' });
  const c3 = await E(() => __st.planeSim(70));
  const ld = await E(() => { const s = __st.plane, r = __st.W.project(s.p.x, s.p.z); return { gnd: s.onGround, cr: s.crashed, cause: s.cause, landings: s.landings, ias: s.ias, d: r.d }; });
  ok(ld.landings > 0 && !ld.cr && ld.gnd && ld.ias < 4 && Math.abs(ld.d) < 15, 'approach + landing on the road, rolls to a stop ' + JSON.stringify(ld));
  // VEHICLE tab: CARS / PLANES sub-tabs
  await E(() => { __st.planeCtl = null; __st.openMenu(true, 'vehicle'); }); await sleep(800);
  const tabs = await E(() => ({ car: !!document.getElementById('vt_car'), plane: !!document.getElementById('vt_plane') }));
  ok(tabs.car && tabs.plane, 'VEHICLE tab has CARS / PLANES sub-tabs');
  await E(() => __st.openMenu(false));
  // back to the car (P)
  await p.keyboard.press('KeyP'); await sleep(1500);
  const cv = await E(() => ({ craft: __st.craft, lod: __st.FL.visible, far: __st.camera.far, body: document.body.className }));
  const c0 = await E(() => [__st.x, __st.z]); await p.keyboard.down('KeyW'); await sleep(2500); await p.keyboard.up('KeyW'); const cc = await E(() => [__st.x, __st.z]);
  ok(cv.craft === 'car' && !cv.lod && !/plane/.test(cv.body) && Math.hypot(cc[0] - c0[0], cc[1] - c0[1]) > 2, 'P: back to the car, drives ' + JSON.stringify(cv));
  const bad = h.errors.filter(e => !/favicon|AudioContext|autoplay/i.test(e)); ok(bad.length === 0, 'no console errors ' + JSON.stringify(bad.slice(0, 5)));
  await h.close(); done();
})().catch(e => { console.error(e); process.exit(2); });
