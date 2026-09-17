
﻿/* BEGIN_MESHCORE */
window.MeshCore = (function MeshCoreFactory() {
  'use strict';

  const PREVIEW_MAX_DETAIL = 160;
  const MIN_LOGO_SHELL = 0.12;

  function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function getExportDetail(detail) {
    return Math.min(400, Math.max(50, Math.round(num(detail, 200))));
  }

  function getPreviewDetail(exportDetail, fullPreview) {
    const e = getExportDetail(exportDetail);
    return fullPreview ? e : Math.min(e, PREVIEW_MAX_DETAIL);
  }

  /** @returns {{ triCount, zeroArea, boundary, nonManifold }} */
  function validateMesh(positions, indices) {
    const triCount = indices.length / 3;
    let zeroArea = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const e1x = positions[b] - positions[a];
      const e1y = positions[b + 1] - positions[a + 1];
      const e1z = positions[b + 2] - positions[a + 2];
      const e2x = positions[c] - positions[a];
      const e2y = positions[c + 1] - positions[a + 1];
      const e2z = positions[c + 2] - positions[a + 2];
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      // Preserve valid microscopic contour triangles; reject collapsed geometry.
      if ((nx * nx + ny * ny + nz * nz) < 1e-18) zeroArea++;
    }
    const edges = new Map();
    const addEdge = (u, v) => {
      const key = u < v ? u + ',' + v : v + ',' + u;
      edges.set(key, (edges.get(key) || 0) + 1);
    };
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i], b = indices[i + 1], c = indices[i + 2];
      addEdge(a, b); addEdge(b, c); addEdge(c, a);
    }
    let boundary = 0, nonManifold = 0;
    edges.forEach((count) => {
      if (count === 1) boundary++;
      else if (count > 2) nonManifold++;
    });
    return { triCount, zeroArea, boundary, nonManifold };
  }

  /** Binary STL → ArrayBuffer */
  function exportSTL(positions, indices) {
    const triCount = indices.length / 3;
    const buffer = new ArrayBuffer(84 + triCount * 50);
    const view = new DataView(buffer);
    view.setUint32(80, triCount, true);
    let off = 84;
    for (let i = 0; i < triCount; i++) {
      const a = indices[i * 3], b = indices[i * 3 + 1], c = indices[i * 3 + 2];
      const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
      const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
      const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      view.setFloat32(off, nx, true); off += 4;
      view.setFloat32(off, ny, true); off += 4;
      view.setFloat32(off, nz, true); off += 4;
      view.setFloat32(off, ax, true); off += 4;
      view.setFloat32(off, ay, true); off += 4;
      view.setFloat32(off, az, true); off += 4;
      view.setFloat32(off, bx, true); off += 4;
      view.setFloat32(off, by, true); off += 4;
      view.setFloat32(off, bz, true); off += 4;
      view.setFloat32(off, cx, true); off += 4;
      view.setFloat32(off, cy, true); off += 4;
      view.setFloat32(off, cz, true); off += 4;
      off += 2;
    }
    return buffer;
  }

  function exportOBJ(positions, indices) {
    const lines = ['# iCaviot OBJ export', 'o iCaviot'];
    const vCount = positions.length / 3;
    for (let i = 0; i < vCount; i++) {
      lines.push(
        'v ' +
          positions[i * 3].toFixed(4) + ' ' +
          positions[i * 3 + 1].toFixed(4) + ' ' +
          positions[i * 3 + 2].toFixed(4)
      );
    }
    for (let i = 0; i < indices.length; i += 3) {
      lines.push('f ' + (indices[i] + 1) + ' ' + (indices[i + 1] + 1) + ' ' + (indices[i + 2] + 1));
    }
    return lines.join('\n');
  }

  function curlPositions(positions, width, depth, direction, radius, bendDeg, flatCenterPct) {
    const flatHalf = (flatCenterPct / 100) * 0.5;
    const bendSign = bendDeg < 0 ? -1 : 1;
    const bendRad = Math.abs(bendDeg) * Math.PI / 180;

    const bendAxis = (uNorm, halfDimMm) => {
      const absU = Math.abs(uNorm);
      if (absU <= flatHalf) return { offsetU: uNorm * halfDimMm * 2, lift: 0, angle: 0 };
      const sign = uNorm < 0 ? -1 : 1;
      const t = (absU - flatHalf) / (0.5 - flatHalf || 1e-6);
      const localAngle = sign * bendRad * t;
      const flatDistMm = sign * (flatHalf * halfDimMm * 2);
      const offsetU = flatDistMm + radius * Math.sin(localAngle);
      const lift = bendSign * radius * (1 - Math.cos(localAngle));
      return { offsetU, lift, angle: bendSign * localAngle };
    };

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      let newX = x, newY = y, newZ = z;

      if (direction === 'horizontal') {
        const uNorm = x / width;
        const r = bendAxis(uNorm, width / 2);
        if (Math.abs(uNorm) > flatHalf) {
          newX = r.offsetU + y * Math.sin(r.angle);
          newY = r.lift + y * Math.cos(r.angle);
        }
      } else if (direction === 'vertical') {
        const vNorm = z / depth;
        const r = bendAxis(vNorm, depth / 2);
        if (Math.abs(vNorm) > flatHalf) {
          newZ = r.offsetU + y * Math.sin(r.angle);
          newY = r.lift + y * Math.cos(r.angle);
        }
      } else if (direction === 'all') {
        const uNorm = x / width;
        const vNorm = z / depth;
        const rH = bendAxis(uNorm, width / 2);
        const rV = bendAxis(vNorm, depth / 2);
        const inHBend = Math.abs(uNorm) > flatHalf;
        const inVBend = Math.abs(vNorm) > flatHalf;
        newX = inHBend ? (rH.offsetU + y * Math.sin(rH.angle)) : x;
        newZ = inVBend ? (rV.offsetU + y * Math.sin(rV.angle)) : z;
        let liftSum = 0;
        let reliefScale = 1;
        if (inHBend) { liftSum += rH.lift; reliefScale *= Math.cos(rH.angle); }
        if (inVBend) { liftSum += rV.lift; reliefScale *= Math.cos(rV.angle); }
        newY = liftSum + y * reliefScale;
      }

      positions[i] = newX;
      positions[i + 1] = newY;
      positions[i + 2] = newZ;
    }
  }

  /**
   * Elliptical sleeve (or logo-only shell).
   * Options are plain numbers/bools — no DOM.
   */
  function buildSleeve(o) {
    const maxHeight = Math.max(0, num(o.maxHeight, 1));
    const negative = !!o.negative;
    const innerWidth = num(o.innerWidth, 25.5);
    const innerDepth = num(o.innerDepth, 15.2);
    const wall = Math.max(0.2, num(o.wall, 2.4));
    const sleeveHeight = Math.max(1, num(o.sleeveHeight, 72));
    const tol = Math.max(0, num(o.tol, 0));
    const wrapDeg = num(o.wrapAngle, 360);
    const wrapAngleRad = wrapDeg * Math.PI / 180;
    const logoOnly = !!o.logoOnly;
    const capBottom = !!o.capBottom && Math.abs(wrapDeg - 360) < 0.01 && !logoOnly;
    const capThick = capBottom ? Math.max(0.2, num(o.capThick, 1.5)) : 0;
    const capHoleR = capBottom ? Math.max(0, num(o.capHole, 6) / 2) : 0;
    if (capBottom && capHoleR >= Math.min(innerWidth, innerDepth) / 2 + tol / 2) throw new Error('Bottom hole must be smaller than the cavity width and depth.');

    const hm = o.heightmap;
    const rows = o.rows | 0;
    const cols = o.cols | 0;
    const mask = o.mask || null;

    const a = innerWidth / 2 + tol / 2;
    const b = innerDepth / 2 + tol / 2;
    const innerR = (theta) => {
      const ct = Math.cos(theta), st = Math.sin(theta);
      return (a * b) / Math.sqrt(b * b * ct * ct + a * a * st * st);
    };
    const thetaOffset = a >= b ? Math.PI / 2 : 0;

    const isFullWrap = Math.abs(wrapDeg - 360) < 0.01;
    const colMax = isFullWrap ? cols : cols - 1;
    const colNext = (j) => (isFullWrap ? (j + 1) % cols : j + 1);
    const sampleH = (i, j) => hm[(rows - 1 - i) * cols + j];

    const maskedHere = (i, j) => {
      if (!mask) return true;
      const cellRows = rows - 1, cellCols = cols - 1;
      const flippedI = rows - 1 - i;
      const ii = Math.min(flippedI, cellRows - 1);
      const jj = Math.min(j, cellCols - 1);
      return mask[ii * cellCols + jj] === 1;
    };

    const positions = [];
    const outerStart = 0;

    for (let i = 0; i < rows; i++) {
      const yAxial = (i / (rows - 1)) * sleeveHeight;
      for (let j = 0; j < cols; j++) {
        const theta = (isFullWrap
          ? (j / cols) * 2 * Math.PI - Math.PI
          : -wrapAngleRad / 2 + (j / (cols - 1)) * wrapAngleRad) + thetaOffset;
        const ri = innerR(theta);
        const reliefRaw = sampleH(i, j) * maxHeight;
        const reliefActive = mask ? maskedHere(i, j) : true;
        const relief = reliefActive ? reliefRaw : 0;
        let ro;
        if (logoOnly) {
          if (negative) {
            ro = Math.max(ri + wall + MIN_LOGO_SHELL * 0.5, ri + wall + MIN_LOGO_SHELL - relief);
          } else {
            ro = ri + wall + Math.max(relief, MIN_LOGO_SHELL);
          }
        } else if (negative) {
          ro = ri + wall + maxHeight - relief;
        } else {
          ro = ri + wall + relief;
        }
        positions.push(ro * Math.cos(theta), yAxial, ro * Math.sin(theta));
      }
    }

    const innerStart = positions.length / 3;
    const innerYStart = capThick;
    const innerYRange = sleeveHeight - capThick;
    for (let i = 0; i < rows; i++) {
      const yAxial = innerYStart + (i / (rows - 1)) * innerYRange;
      for (let j = 0; j < cols; j++) {
        const theta = (isFullWrap
          ? (j / cols) * 2 * Math.PI - Math.PI
          : -wrapAngleRad / 2 + (j / (cols - 1)) * wrapAngleRad) + thetaOffset;
        const ri = innerR(theta);
        const innerRadius = logoOnly ? ri + wall : ri;
        positions.push(innerRadius * Math.cos(theta), yAxial, innerRadius * Math.sin(theta));
      }
    }

    const oIdx = (i, j) => outerStart + i * cols + j;
    const iIdx = (i, j) => innerStart + i * cols + j;
    const indices = [];

    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < colMax; j++) {
        const jn = colNext(j);
        const va = oIdx(i, j), vb = oIdx(i, jn), vc = oIdx(i + 1, jn), vd = oIdx(i + 1, j);
        indices.push(va, vd, vc, va, vc, vb);
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < colMax; j++) {
        const jn = colNext(j);
        const va = iIdx(i, j), vb = iIdx(i, jn), vc = iIdx(i + 1, jn), vd = iIdx(i + 1, j);
        indices.push(va, vb, vc, va, vc, vd);
      }
    }
    for (let j = 0; j < colMax; j++) {
      const jn = colNext(j);
      const oa = oIdx(rows - 1, j), ob = oIdx(rows - 1, jn);
      const ia = iIdx(rows - 1, j), ib = iIdx(rows - 1, jn);
      indices.push(oa, ia, ib, oa, ib, ob);
    }
    if (!capBottom) {
      for (let j = 0; j < colMax; j++) {
        const jn = colNext(j);
        const oa = oIdx(0, j), ob = oIdx(0, jn);
        const ia = iIdx(0, j), ib = iIdx(0, jn);
        indices.push(oa, ob, ib, oa, ib, ia);
      }
    }

    if (capBottom) {
      const sealed = capHoleR < 0.05;
      const holeRingBotStart = positions.length / 3;
      if (!sealed) {
        for (let j = 0; j < cols; j++) {
          const theta = (isFullWrap
            ? (j / cols) * 2 * Math.PI - Math.PI
            : -wrapAngleRad / 2 + (j / (cols - 1)) * wrapAngleRad) + thetaOffset;
          positions.push(capHoleR * Math.cos(theta), 0, capHoleR * Math.sin(theta));
        }
      }
      const holeRingTopStart = positions.length / 3;
      if (!sealed) {
        for (let j = 0; j < cols; j++) {
          const theta = (isFullWrap
            ? (j / cols) * 2 * Math.PI - Math.PI
            : -wrapAngleRad / 2 + (j / (cols - 1)) * wrapAngleRad) + thetaOffset;
          positions.push(capHoleR * Math.cos(theta), capThick, capHoleR * Math.sin(theta));
        }
      }
      let cBotIdx = -1, cTopIdx = -1;
      if (sealed) {
        cBotIdx = positions.length / 3;
        positions.push(0, 0, 0);
        cTopIdx = positions.length / 3;
        positions.push(0, capThick, 0);
      }
      for (let j = 0; j < colMax; j++) {
        const jn = colNext(j);
        const oA = oIdx(0, j), oB = oIdx(0, jn);
        if (sealed) indices.push(oA, oB, cBotIdx);
        else {
          const hA = holeRingBotStart + j, hB = holeRingBotStart + jn;
          indices.push(oA, oB, hB, oA, hB, hA);
        }
      }
      for (let j = 0; j < colMax; j++) {
        const jn = colNext(j);
        const iA = iIdx(0, j), iB = iIdx(0, jn);
        if (sealed) indices.push(iA, cTopIdx, iB);
        else {
          const hA = holeRingTopStart + j, hB = holeRingTopStart + jn;
          indices.push(iA, hA, hB, iA, hB, iB);
        }
      }
      if (!sealed) {
        for (let j = 0; j < colMax; j++) {
          const jn = colNext(j);
          const hAb = holeRingBotStart + j, hBb = holeRingBotStart + jn;
          const hAt = holeRingTopStart + j, hBt = holeRingTopStart + jn;
          indices.push(hAb, hAt, hBt, hAb, hBt, hBb);
        }
      }
    }

    if (!isFullWrap) {
      for (let i = 0; i < rows - 1; i++) {
        const oBot = oIdx(i, 0), oTop = oIdx(i + 1, 0);
        const iBot = iIdx(i, 0), iTop = iIdx(i + 1, 0);
        indices.push(oBot, iBot, iTop, oBot, iTop, oTop);
      }
      for (let i = 0; i < rows - 1; i++) {
        const oBot = oIdx(i, cols - 1), oTop = oIdx(i + 1, cols - 1);
        const iBot = iIdx(i, cols - 1), iTop = iIdx(i + 1, cols - 1);
        indices.push(oBot, oTop, iTop, oBot, iTop, iBot);
      }
    }

    return {
      positions: new Float32Array(positions),
      indices: indices,
    };
  }

  function buildFlat(o) {
    const maxHeight = Math.max(0, num(o.maxHeight, 1));
    const negative = !!o.negative;
    const width = Math.max(1, num(o.width, 100));
    const base = Math.max(0.1, num(o.base, 1));
    const hm = o.heightmap;
    const rows = o.rows | 0;
    const cols = o.cols | 0;
    const mask = o.mask || null;
    const edgeSmooth = Math.max(0, num(o.edgeSmooth, 0) | 0);
    const curveEnable = !!o.curveEnable;
    const curveDirection = o.curveDirection || 'horizontal';
    const curveRadius = Math.max(1, num(o.curveRadius, 50));
    const curveAngle = num(o.curveAngle, 30);
    const curveFalloff = num(o.curveFalloff, 60);

    if (mask) {
      return buildFlatWithMask(hm, mask, rows, cols, {
        width, base, maxHeight, negative, edgeSmooth,
        curveEnable, curveDirection, curveRadius, curveAngle, curveFalloff,
      });
    }

    const aspect = cols / rows;
    const depth = width / aspect;
    const dx = width / (cols - 1);
    const dz = depth / (rows - 1);
    const totalTopBottom = rows * cols * 2;
    const positions = new Float32Array(totalTopBottom * 3);
    let p = 0;

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const x = j * dx - width / 2;
        const z = i * dz - depth / 2;
        const h = hm[i * cols + j] * maxHeight;
        const y = negative ? (base + maxHeight - h) : (base + h);
        positions[p++] = x; positions[p++] = y; positions[p++] = z;
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const x = j * dx - width / 2;
        const z = i * dz - depth / 2;
        positions[p++] = x; positions[p++] = 0; positions[p++] = z;
      }
    }

    const indices = [];
    const topIdx = (i, j) => i * cols + j;
    const botIdx = (i, j) => rows * cols + i * cols + j;

    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = topIdx(i, j), b = topIdx(i, j + 1), c = topIdx(i + 1, j + 1), d = topIdx(i + 1, j);
        indices.push(a, c, b, a, d, c);
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = botIdx(i, j), b = botIdx(i, j + 1), c = botIdx(i + 1, j + 1), d = botIdx(i + 1, j);
        indices.push(a, b, c, a, c, d);
      }
    }
    for (let j = 0; j < cols - 1; j++) {
      const tl = topIdx(0, j), tr = topIdx(0, j + 1);
      const bl = botIdx(0, j), br = botIdx(0, j + 1);
      indices.push(bl, tl, br, tl, tr, br);
    }
    for (let j = 0; j < cols - 1; j++) {
      const tl = topIdx(rows - 1, j), tr = topIdx(rows - 1, j + 1);
      const bl = botIdx(rows - 1, j), br = botIdx(rows - 1, j + 1);
      indices.push(bl, br, tl, tl, br, tr);
    }
    for (let i = 0; i < rows - 1; i++) {
      const tn = topIdx(i, 0), tf = topIdx(i + 1, 0);
      const bn = botIdx(i, 0), bf = botIdx(i + 1, 0);
      indices.push(bn, bf, tn, tn, bf, tf);
    }
    for (let i = 0; i < rows - 1; i++) {
      const tn = topIdx(i, cols - 1), tf = topIdx(i + 1, cols - 1);
      const bn = botIdx(i, cols - 1), bf = botIdx(i + 1, cols - 1);
      indices.push(bn, tn, bf, tn, tf, bf);
    }

    if (curveEnable) {
      curlPositions(positions, width, depth, curveDirection, curveRadius, curveAngle, curveFalloff);
    }
    return { positions, indices };
  }

  function buildFlatWithMask(hm, mask, rows, cols, p) {
    const { width, base, maxHeight, negative, edgeSmooth } = p;
    const aspect = cols / rows;
    const depth = width / aspect;
    const dx = width / (cols - 1);
    const dz = depth / (rows - 1);
    const cellRows = rows - 1;
    const cellCols = cols - 1;

    const used = new Uint8Array(rows * cols);
    for (let i = 0; i < cellRows; i++) {
      for (let j = 0; j < cellCols; j++) {
        if (!mask[i * cellCols + j]) continue;
        used[i * cols + j] = 1;
        used[i * cols + j + 1] = 1;
        used[(i + 1) * cols + j] = 1;
        used[(i + 1) * cols + j + 1] = 1;
      }
    }

    const topIdx = new Int32Array(rows * cols);
    const botIdx = new Int32Array(rows * cols);
    topIdx.fill(-1);
    botIdx.fill(-1);
    const positions = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (!used[i * cols + j]) continue;
        const x = j * dx - width / 2;
        const z = i * dz - depth / 2;
        const h = hm[i * cols + j] * maxHeight;
        const y = negative ? (base + maxHeight - h) : (base + h);
        topIdx[i * cols + j] = positions.length / 3;
        positions.push(x, y, z);
        botIdx[i * cols + j] = positions.length / 3;
        positions.push(x, 0, z);
      }
    }

    if (positions.length === 0) {
      return { positions: new Float32Array(0), indices: [] };
    }

    if (edgeSmooth > 0) {
      const boundary = new Uint8Array(rows * cols);
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          if (!used[i * cols + j]) continue;
          const c00 = (i > 0 && j > 0) ? mask[(i - 1) * cellCols + (j - 1)] : 0;
          const c01 = (i > 0 && j < cellCols) ? mask[(i - 1) * cellCols + j] : 0;
          const c10 = (i < cellRows && j > 0) ? mask[i * cellCols + (j - 1)] : 0;
          const c11 = (i < cellRows && j < cellCols) ? mask[i * cellCols + j] : 0;
          if (c00 + c01 + c10 + c11 < 4) boundary[i * cols + j] = 1;
        }
      }
      const neighborOffsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (let pass = 0; pass < edgeSmooth; pass++) {
        const newX = new Float32Array(positions.length / 3);
        const newZ = new Float32Array(positions.length / 3);
        for (let k = 0; k < positions.length / 3; k++) {
          newX[k] = positions[k * 3];
          newZ[k] = positions[k * 3 + 2];
        }
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            if (!boundary[i * cols + j]) continue;
            let sx = 0, sz = 0, n = 0;
            for (let nIdx = 0; nIdx < 4; nIdx++) {
              const di = neighborOffsets[nIdx][0], dj = neighborOffsets[nIdx][1];
              const ni = i + di, nj = j + dj;
              if (ni < 0 || ni >= rows || nj < 0 || nj >= cols) continue;
              if (!boundary[ni * cols + nj]) continue;
              const tIdx = topIdx[ni * cols + nj];
              sx += positions[tIdx * 3];
              sz += positions[tIdx * 3 + 2];
              n++;
            }
            if (n === 0) continue;
            const avgX = sx / n, avgZ = sz / n;
            const tIdx = topIdx[i * cols + j];
            const bIdx = botIdx[i * cols + j];
            const newXVal = (positions[tIdx * 3] + avgX) * 0.5;
            const newZVal = (positions[tIdx * 3 + 2] + avgZ) * 0.5;
            newX[tIdx] = newXVal; newZ[tIdx] = newZVal;
            newX[bIdx] = newXVal; newZ[bIdx] = newZVal;
          }
        }
        for (let k = 0; k < positions.length / 3; k++) {
          positions[k * 3] = newX[k];
          positions[k * 3 + 2] = newZ[k];
        }
      }
    }

    const indices = [];
    const isMasked = (i, j) => {
      if (i < 0 || i >= cellRows || j < 0 || j >= cellCols) return false;
      return mask[i * cellCols + j] === 1;
    };

    for (let i = 0; i < cellRows; i++) {
      for (let j = 0; j < cellCols; j++) {
        if (!mask[i * cellCols + j]) continue;
        const tA = topIdx[i * cols + j];
        const tB = topIdx[i * cols + j + 1];
        const tC = topIdx[(i + 1) * cols + j + 1];
        const tD = topIdx[(i + 1) * cols + j];
        const bA = botIdx[i * cols + j];
        const bB = botIdx[i * cols + j + 1];
        const bC = botIdx[(i + 1) * cols + j + 1];
        const bD = botIdx[(i + 1) * cols + j];
        indices.push(tA, tC, tB, tA, tD, tC);
        indices.push(bA, bB, bC, bA, bC, bD);
        if (!isMasked(i - 1, j)) indices.push(bA, tA, bB, tA, tB, bB);
        if (!isMasked(i + 1, j)) indices.push(bD, bC, tD, tD, bC, tC);
        if (!isMasked(i, j - 1)) indices.push(bA, bD, tA, tA, bD, tD);
        if (!isMasked(i, j + 1)) indices.push(bB, tB, bC, tB, tC, bC);
      }
    }

    const posArr = new Float32Array(positions);
    if (p.curveEnable) {
      curlPositions(
        posArr, width, depth, p.curveDirection, p.curveRadius, p.curveAngle, p.curveFalloff
      );
    }
    return { positions: posArr, indices };
  }

  /**
   * Unified builder.
   * mode: 'sleeve' | 'logo-only' | 'flat'
   */
  function buildMesh(options) {
    const mode = options.mode || 'sleeve';
    if (mode === 'flat') {
      return buildFlat(options);
    }
    return buildSleeve(Object.assign({}, options, { logoOnly: mode === 'logo-only' }));
  }

  /** Convert pure mesh to THREE.BufferGeometry when THREE is available. */
  function toThreeGeometry(mesh, THREE) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setIndex(mesh.indices);
    geo.computeVertexNormals();
    return geo;
  }

  return {
    PREVIEW_MAX_DETAIL,
    MIN_LOGO_SHELL,
    getExportDetail,
    getPreviewDetail,
    validateMesh,
    exportSTL,
    exportOBJ,
    curlPositions,
    buildSleeve,
    buildFlat,
    buildMesh,
    toThreeGeometry,
  };
})();
/* END_MESHCORE */

