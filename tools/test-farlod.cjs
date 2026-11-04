// PLANE EDITION — far-terrain LOD: visible range per quality, seamless heights at the ring borders (near-far grid / mid ring / ultra ring
// share their global vertices), deterministic heights across floating-origin rebases, and the draw-call / triangle / fps budget per quality.
const { launch, open, ok, done, ROOT } = require('./lib.cjs'); const SH = ROOT + '/shots/'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const BORDER = () => { const F = __st.T.ground.far, M = __st.FL.mid, U = __st.FL.ult;
  const at = (g, x, z) => { const gi = Math.round(x / g.step), gj = Math.round(z / g.step); if (Math.abs(gi * g.step - x) > 0.01 || Math.abs(gj * g.step - z) > 0.01) return null;
    const i = gi - g.gi0, j = gj - g.gj0; if (i < 0 || j < 0 || i >= g.n || j >= g.n) return null; const k = g.rz(gj) * g.n + g.rx(gi); return { h: g.H[k], cw: g.CW[k] }; };
  const ring = (inner, outer) => { let mx = 0, n = 0, road = 0;
    const cx = (inner.gi0 + inner.N / 2) * inner.step, cz = (inner.gj0 + inner.N / 2) * inner.step, R = inner.N * inner.step / 2;
    for (let a = -R; a <= R; a += inner.step) for (const [x, z] of [[cx + a, cz - R], [cx + a, cz + R], [cx - R, cz + a], [cx + R, cz + a]]) {
      const A = at(inner, x, z), B = at(outer, x, z); if (!A || !B) continue; const r = __st.W.project(x, z); if (Math.abs(r.d) < outer.step * 1.5 + 40) { road++; continue; } n++; mx = Math.max(mx, Math.abs(A.h - B.h)); }
    return { n, mx: +mx.toFixed(3), road }; };
  return { nearFar: ring(F, __st.FL.mid), midUlt: ring(M, U), F: [F.gi0, F.gj0, F.N], M: [M.gi0, M.gj0] }; };
(async () => {
  const res = {};
  for (const q of (process.env.QS || 'low,med,high,ultra').split(',')) {
    const h = await launch(), p = h.page, E = (f, ...a) => p.evaluate(f, ...a);
    await open(h, `q=${q}&dyn=0&s=30000&plane=cub`); await sleep(1500);
    await E(() => { const pl = __st.plane; __st.airStart(); pl.p.y = __st.T.groundAt(pl.p.x, pl.p.z) + 1400; __st.planeCtl = () => ({ pitch: 0, roll: 0, yaw: 0, thr: 0.8, brake: 0, boost: 0 }); });
    await sleep(6000); const f0 = await E(() => __st.frames || 0);
    const r = await E(() => { const t0 = performance.now(), n0 = window.__frames || 0; return new Promise(res => setTimeout(() => res({ fps: window.__fps, calls: __st.rinfo.calls, tris: __st.rinfo.tris, far: __st.camera.far, uFar: __st.U.uFar.value, lod: { ...__st.FL.stats } }), 3000)); });
    res[q] = r; console.log(q, JSON.stringify(r)); void f0;
    if (q === 'med') {
      await p.screenshot({ path: SH + 'plane_altitude_biomes.png' });
      ok(r.calls < 80 && r.tris < 300000, `Med budget at 1.4 km altitude: ${r.calls} draw calls (<80), ${r.tris} tris (<300k)`);
      const b = await E(BORDER); console.log('border', JSON.stringify(b));
      ok(b.nearFar.n + b.midUlt.n > 20 && b.nearFar.mx < 0.01 && b.midUlt.mx < 0.01, 'ring borders: shared vertices have identical heights (seamless) ' + JSON.stringify(b));
      // determinism across a rebase: re-sample one ultra cell after shifting the origin
      const d = await E(() => { const U = __st.FL.ult, gi = U.gi0 + 5, gj = U.gj0 + 7, k = U.rz(gj) * U.n + U.rx(gi), h0 = U.H[k], x0 = gi * U.step, z0 = gj * U.step;
        const o0 = __st.W.origin(); __st.planeCtl = null; const pl = __st.plane; pl.p.x += 900; __st.rebaseNow ? __st.rebaseNow() : 0; return { h0, x0, z0, o0 }; });
      await sleep(3000);
      const d2 = await E((d) => { const o = __st.W.origin(), U = __st.FL.ult, x = d.x0 - (o.x - d.o0.x), z = d.z0 - (o.z - d.o0.z), gi = Math.round(x / U.step), gj = Math.round(z / U.step), k = U.rz(gj) * U.n + U.rx(gi); return { o, h: U.H[k], moved: o.x !== d.o0.x || o.z !== d.o0.z }; }, d);
      ok(d2.moved && Math.abs(d2.h - d.h0) < 1e-3, 'deterministic heights across a rebase ' + JSON.stringify({ h0: d.h0, h1: d2.h, o: d2.o }));
    }
    if (q === 'med') { // low flight over the forest
      await E(() => { const pl = __st.plane, f = __st.roadField(__st.W.project(pl.p.x, pl.p.z).s + 300); __st.airStart(f.x + f.dz * 250, f.z - f.dx * 250, Math.atan2(f.dx, f.dz)); pl.p.y = __st.T.groundAt(pl.p.x, pl.p.z) + 45; __st.planeCtl = () => ({ pitch: 0.05, roll: 0, yaw: 0, thr: 0.7, brake: 0, boost: 0 }); });
      await sleep(2500); await p.screenshot({ path: SH + 'plane_low_forest.png' }); await E(() => { __st.planeCtl = null; });
    }
    ok(r.lod.range >= ({ low: 5700, med: 8000, high: 11000, ultra: 15000 })[q] && r.far >= r.lod.range * 0.9, `${q}: far LOD range ${(r.lod.range / 1000).toFixed(1)} km, camera far ${r.far.toFixed(0)} m`);
    const bad = h.errors.filter(e => !/favicon|AudioContext|autoplay/i.test(e)); ok(bad.length === 0, q + ': no console errors ' + JSON.stringify(bad.slice(0, 3)));
    await h.close();
  }
  ok(res.low.lod.range < res.med.lod.range && res.med.lod.range < res.high.lod.range && res.high.lod.range < res.ultra.lod.range, 'quality scales the LOD range');
  console.log('\nPERF (SwiftShader software GL, 844x390; fps is not representative of a GPU):'); for (const q in res) console.log(`  ${q.padEnd(6)} range ${(res[q].lod.range / 1000).toFixed(1)} km  calls ${res[q].calls}  tris ${res[q].tris}  fps ${res[q].fps}  lodTris ${res[q].lod.tris} clumps ${res[q].lod.clumps}`);
  done();
})().catch(e => { console.error(e); process.exit(2); });
