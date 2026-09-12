#!/usr/bin/env node
/* Decimate a GLB to a flat positions+indices binary the cream harness can load.
 *
 *   node scripts/decimate-glb.mjs <in.glb> <out.glb|out.bin> [targetTriangles]
 *
 * .glb  -> a real one-mesh GLB with smooth normals, which is what the DESIGNER loads.
 * .bin  -> [u32 verts][u32 indices][f32 positions][u32 indices], which is what the HARNESS loads.
 *
 * ⚠️ WHY THIS EXISTS: a generated stroke from meshy is 3,021,560 triangles. It downloads and parses
 * in 155ms and then renders NOTHING, with no error anywhere — the GPU declining the upload. One
 * stroke has to be a few thousand triangles before it can go round a tier twenty times.
 *
 * Vertex clustering is the right decimation for a closed tube: lay a grid over it, collapse every
 * vertex in a cell to that cell's average, keep the triangles whose corners land in three different
 * cells. It cannot open a hole in a closed surface and it keeps the silhouette. Measured on the
 * reference stroke: 3,021,560 -> 8,908 triangles, 54MB -> 153KB, and the shape survives.
 */
import { readFileSync, writeFileSync } from 'fs';
// ── read the GLB ────────────────────────────────────────────────────────────
const buf = readFileSync(process.argv[2]);
let off = 12, g = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const d = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4E4F534A) g = JSON.parse(d.toString('utf8'));
  if (type === 0x004E4942) bin = d;
  off += 8 + len + ((4 - (len % 4)) % 4);
}
const TN = { SCALAR: 1, VEC2: 2, VEC3: 3 }, CT = { 5121:[Uint8Array,1], 5123:[Uint16Array,2], 5125:[Uint32Array,4], 5126:[Float32Array,4] };
function read(ai) {
  const a = g.accessors[ai], bv = g.bufferViews[a.bufferView], [Arr, sz] = CT[a.componentType], n = TN[a.type] ?? 1;
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = bv.byteStride || n * sz;
  if (stride === n * sz) return new Arr(bin.buffer, bin.byteOffset + base, a.count * n);
  const out = new Arr(a.count * n);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++)
    out[i*n+c] = new Arr(bin.buffer, bin.byteOffset + base + i*stride + c*sz, 1)[0];
  return out;
}
const prim = g.meshes[0].primitives[0];
const P = read(prim.attributes.POSITION), I = read(prim.indices);
console.log('in :', P.length / 3, 'verts', I.length / 3, 'tris');

/* ── VERTEX CLUSTERING ────────────────────────────────────────────────────────
 * The mesh is a closed tube, so the cheap decimation is the right one: lay a grid
 * over it, collapse every vertex in a cell to that cell's average, and keep the
 * triangles whose three corners land in three different cells. It cannot open a
 * hole in a closed surface and it keeps the silhouette, which is all this needs. */
let lo = [Infinity,Infinity,Infinity], hi = [-Infinity,-Infinity,-Infinity];
for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) {
  if (P[i+k] < lo[k]) lo[k] = P[i+k]; if (P[i+k] > hi[k]) hi[k] = P[i+k];
}
const size = [hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]];
function cluster(cell) {
  const nx = Math.max(1, Math.ceil(size[0]/cell)), ny = Math.max(1, Math.ceil(size[1]/cell)), nz = Math.max(1, Math.ceil(size[2]/cell));
  const map = new Map(); const sum = [];
  const cid = new Int32Array(P.length / 3);
  for (let v = 0; v < P.length / 3; v++) {
    const x = Math.min(nx-1, Math.floor((P[v*3]-lo[0])/cell));
    const y = Math.min(ny-1, Math.floor((P[v*3+1]-lo[1])/cell));
    const z = Math.min(nz-1, Math.floor((P[v*3+2]-lo[2])/cell));
    const k = (z*ny + y)*nx + x;
    let id = map.get(k);
    if (id === undefined) { id = sum.length / 4; map.set(k, id); sum.push(0,0,0,0); }
    cid[v] = id; sum[id*4] += P[v*3]; sum[id*4+1] += P[v*3+1]; sum[id*4+2] += P[v*3+2]; sum[id*4+3]++;
  }
  const verts = new Float32Array((sum.length/4)*3);
  for (let i = 0; i < sum.length/4; i++) { const n = sum[i*4+3];
    verts[i*3] = sum[i*4]/n; verts[i*3+1] = sum[i*4+1]/n; verts[i*3+2] = sum[i*4+2]/n; }
  const idx = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = cid[I[t]], b = cid[I[t+1]], c = cid[I[t+2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { verts, idx };
}
const target = Number(process.argv[4] || 9000);
let lo2 = 0.002, hi2 = 0.10, best = null;
for (let it = 0; it < 24; it++) {
  const cell = (lo2 + hi2) / 2, r = cluster(cell);
  const tris = r.idx.length / 3;
  if (tris > target) lo2 = cell; else hi2 = cell;
  best = r;
  if (Math.abs(tris - target) / target < 0.08) break;
}
console.log('out:', best.verts.length/3, 'verts', best.idx.length/3, 'tris');
const idxArr = new Uint32Array(best.idx);

/* ── .glb OUT, for the designer; .bin OUT, for the harness ────────────────────
 * ⚠️ THE DESIGNER CANNOT READ THE .bin. Everything 3D in the app arrives as a GLB through
 * useGLTF — piping shells, toppers, decorations — and a wall style that invented its own
 * container would need its own loader, its own cache and its own failure mode. So when the
 * output is named .glb this writes a real one-mesh GLB and the app's existing loader takes it.
 *
 * ⚠️ NORMALS ARE WRITTEN OUT, not left to the loader. Clustering leaves no normals at all, and a
 * GLB without NORMAL is FLAT-shaded by three.js — every one of the eight thousand facets its own
 * brightness, which is the "merged panel" failure this whole stroke was built to avoid. They are
 * area-weighted (the cross product is not normalised before it is accumulated), which is what
 * computeVertexNormals does, so the mesh shades exactly as it did in the harness. */
function smoothNormals(verts, idx) {
  const N = new Float32Array(verts.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]*3, b = idx[t+1]*3, c = idx[t+2]*3;
    const e1 = [verts[b]-verts[a], verts[b+1]-verts[a+1], verts[b+2]-verts[a+2]];
    const e2 = [verts[c]-verts[a], verts[c+1]-verts[a+1], verts[c+2]-verts[a+2]];
    const n = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
    for (const v of [a, b, c]) { N[v] += n[0]; N[v+1] += n[1]; N[v+2] += n[2]; }
  }
  for (let v = 0; v < N.length; v += 3) {
    const L = Math.hypot(N[v], N[v+1], N[v+2]) || 1;
    N[v] /= L; N[v+1] /= L; N[v+2] /= L;
  }
  return N;
}
function writeGlb(path, verts, normals, idxArr) {
  const pad4 = (n) => (4 - (n % 4)) % 4;
  const parts = [Buffer.from(verts.buffer, verts.byteOffset, verts.byteLength),
                 Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength),
                 Buffer.from(idxArr.buffer, idxArr.byteOffset, idxArr.byteLength)];
  const offs = []; let at = 0;
  for (const b of parts) { offs.push(at); at += b.length + pad4(b.length); }
  const binChunk = Buffer.alloc(at);
  parts.forEach((b, i) => b.copy(binChunk, offs[i]));
  let bmin = [Infinity,Infinity,Infinity], bmax = [-Infinity,-Infinity,-Infinity];
  for (let i = 0; i < verts.length; i += 3) for (let k = 0; k < 3; k++) {
    if (verts[i+k] < bmin[k]) bmin[k] = verts[i+k];
    if (verts[i+k] > bmax[k]) bmax[k] = verts[i+k];
  }
  const json = {
    asset: { version: '2.0', generator: 'spattoo decimate-glb' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: verts.length/3, type: 'VEC3', min: bmin, max: bmax },
      { bufferView: 1, componentType: 5126, count: normals.length/3, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: idxArr.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offs[0], byteLength: parts[0].length, target: 34962 },
      { buffer: 0, byteOffset: offs[1], byteLength: parts[1].length, target: 34962 },
      { buffer: 0, byteOffset: offs[2], byteLength: parts[2].length, target: 34963 },
    ],
    buffers: [{ byteLength: binChunk.length }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length), 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binChunk.length, 8);
  const jHead = Buffer.alloc(8); jHead.writeUInt32LE(jsonBuf.length, 0); jHead.writeUInt32LE(0x4E4F534A, 4);
  const bHead = Buffer.alloc(8); bHead.writeUInt32LE(binChunk.length, 0); bHead.writeUInt32LE(0x004E4942, 4);
  const glb = Buffer.concat([header, jHead, jsonBuf, bHead, binChunk]);
  writeFileSync(path, glb);
  console.log('wrote', path, (glb.length/1024).toFixed(0), 'KB (glb)');
}
if (process.argv[3].endsWith('.glb')) {
  writeGlb(process.argv[3], best.verts, smoothNormals(best.verts, idxArr), idxArr);
  process.exit(0);
}
// ── write positions + indices as a flat binary the harness can read ──────────
const out = Buffer.alloc(8 + best.verts.byteLength + idxArr.byteLength);
out.writeUInt32LE(best.verts.length/3, 0); out.writeUInt32LE(idxArr.length, 4);
Buffer.from(best.verts.buffer, best.verts.byteOffset, best.verts.byteLength).copy(out, 8);
Buffer.from(idxArr.buffer, idxArr.byteOffset, idxArr.byteLength).copy(out, 8 + best.verts.byteLength);
writeFileSync(process.argv[3], out);
console.log('wrote', process.argv[3], (out.length/1024).toFixed(0), 'KB');
