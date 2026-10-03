// cad-surface.js — smooth CAD body derived from occupied voxels.
// The CAD button prefers a Dragon-style tubular surface: medial curve, smoothed spline,
// then a print-resolution marching-cubes mesh of the smooth tube SDF (edge about
// 0.15-0.25 of the local radius). Branching blobs fall back to the occupancy
// isosurface (grid capped at 64, one Catmull-Clark). The editor stays voxels.
// This module does not touch the brush or the live view.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VoxelCadSurface = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_DIM = 64;
  var SUBDIV_LEVELS = 1;
  var ISO = 0.5;

  // Standard marching-cubes case tables (Lorensen/Cline). Corner bit i is set when the sample is inside.
  var edgeTable = new Int32Array([0,265,515,778,1030,1295,1541,1804,2060,2309,2575,2822,3082,3331,3593,3840,400,153,915,666,1430,1183,1941,1692,2460,2197,2975,2710,3482,3219,3993,3728,560,825,51,314,1590,1855,1077,1340,2620,2869,2111,2358,3642,3891,3129,3376,928,681,419,170,1958,1711,1445,1196,2988,2725,2479,2214,4010,3747,3497,3232,1120,1385,1635,1898,102,367,613,876,3180,3429,3695,3942,2154,2403,2665,2912,1520,1273,2035,1786,502,255,1013,764,3580,3317,4095,3830,2554,2291,3065,2800,1616,1881,1107,1370,598,863,85,348,3676,3925,3167,3414,2650,2899,2137,2384,1984,1737,1475,1226,966,719,453,204,4044,3781,3535,3270,3018,2755,2505,2240,2240,2505,2755,3018,3270,3535,3781,4044,204,453,719,966,1226,1475,1737,1984,2384,2137,2899,2650,3414,3167,3925,3676,348,85,863,598,1370,1107,1881,1616,2800,3065,2291,2554,3830,4095,3317,3580,764,1013,255,502,1786,2035,1273,1520,2912,2665,2403,2154,3942,3695,3429,3180,876,613,367,102,1898,1635,1385,1120,3232,3497,3747,4010,2214,2479,2725,2988,1196,1445,1711,1958,170,419,681,928,3376,3129,3891,3642,2358,2111,2869,2620,1340,1077,1855,1590,314,51,825,560,3728,3993,3219,3482,2710,2975,2197,2460,1692,1941,1183,1430,666,915,153,400,3840,3593,3331,3082,2822,2575,2309,2060,1804,1541,1295,1030,778,515,265,0]);
  var triTable = new Int32Array([-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,1,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,8,3,9,8,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,3,1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,2,10,0,2,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,8,3,2,10,8,10,9,8,-1,-1,-1,-1,-1,-1,-1,3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,11,2,8,11,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,9,0,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,11,2,1,9,11,9,8,11,-1,-1,-1,-1,-1,-1,-1,3,10,1,11,10,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,10,1,0,8,10,8,11,10,-1,-1,-1,-1,-1,-1,-1,3,9,0,3,11,9,11,10,9,-1,-1,-1,-1,-1,-1,-1,9,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,3,0,7,3,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,1,9,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,1,9,4,7,1,7,3,1,-1,-1,-1,-1,-1,-1,-1,1,2,10,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,4,7,3,0,4,1,2,10,-1,-1,-1,-1,-1,-1,-1,9,2,10,9,0,2,8,4,7,-1,-1,-1,-1,-1,-1,-1,2,10,9,2,9,7,2,7,3,7,9,4,-1,-1,-1,-1,8,4,7,3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,11,4,7,11,2,4,2,0,4,-1,-1,-1,-1,-1,-1,-1,9,0,1,8,4,7,2,3,11,-1,-1,-1,-1,-1,-1,-1,4,7,11,9,4,11,9,11,2,9,2,1,-1,-1,-1,-1,3,10,1,3,11,10,7,8,4,-1,-1,-1,-1,-1,-1,-1,1,11,10,1,4,11,1,0,4,7,11,4,-1,-1,-1,-1,4,7,8,9,0,11,9,11,10,11,0,3,-1,-1,-1,-1,4,7,11,4,11,9,9,11,10,-1,-1,-1,-1,-1,-1,-1,9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,5,4,0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,5,4,1,5,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,5,4,8,3,5,3,1,5,-1,-1,-1,-1,-1,-1,-1,1,2,10,9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,0,8,1,2,10,4,9,5,-1,-1,-1,-1,-1,-1,-1,5,2,10,5,4,2,4,0,2,-1,-1,-1,-1,-1,-1,-1,2,10,5,3,2,5,3,5,4,3,4,8,-1,-1,-1,-1,9,5,4,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,11,2,0,8,11,4,9,5,-1,-1,-1,-1,-1,-1,-1,0,5,4,0,1,5,2,3,11,-1,-1,-1,-1,-1,-1,-1,2,1,5,2,5,8,2,8,11,4,8,5,-1,-1,-1,-1,10,3,11,10,1,3,9,5,4,-1,-1,-1,-1,-1,-1,-1,4,9,5,0,8,1,8,10,1,8,11,10,-1,-1,-1,-1,5,4,0,5,0,11,5,11,10,11,0,3,-1,-1,-1,-1,5,4,8,5,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1,9,7,8,5,7,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,3,0,9,5,3,5,7,3,-1,-1,-1,-1,-1,-1,-1,0,7,8,0,1,7,1,5,7,-1,-1,-1,-1,-1,-1,-1,1,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,7,8,9,5,7,10,1,2,-1,-1,-1,-1,-1,-1,-1,10,1,2,9,5,0,5,3,0,5,7,3,-1,-1,-1,-1,8,0,2,8,2,5,8,5,7,10,5,2,-1,-1,-1,-1,2,10,5,2,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1,7,9,5,7,8,9,3,11,2,-1,-1,-1,-1,-1,-1,-1,9,5,7,9,7,2,9,2,0,2,7,11,-1,-1,-1,-1,2,3,11,0,1,8,1,7,8,1,5,7,-1,-1,-1,-1,11,2,1,11,1,7,7,1,5,-1,-1,-1,-1,-1,-1,-1,9,5,8,8,5,7,10,1,3,10,3,11,-1,-1,-1,-1,5,7,0,5,0,9,7,11,0,1,0,10,11,10,0,-1,11,10,0,11,0,3,10,5,0,8,0,7,5,7,0,-1,11,10,5,7,11,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,3,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,0,1,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,8,3,1,9,8,5,10,6,-1,-1,-1,-1,-1,-1,-1,1,6,5,2,6,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,6,5,1,2,6,3,0,8,-1,-1,-1,-1,-1,-1,-1,9,6,5,9,0,6,0,2,6,-1,-1,-1,-1,-1,-1,-1,5,9,8,5,8,2,5,2,6,3,2,8,-1,-1,-1,-1,2,3,11,10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,11,0,8,11,2,0,10,6,5,-1,-1,-1,-1,-1,-1,-1,0,1,9,2,3,11,5,10,6,-1,-1,-1,-1,-1,-1,-1,5,10,6,1,9,2,9,11,2,9,8,11,-1,-1,-1,-1,6,3,11,6,5,3,5,1,3,-1,-1,-1,-1,-1,-1,-1,0,8,11,0,11,5,0,5,1,5,11,6,-1,-1,-1,-1,3,11,6,0,3,6,0,6,5,0,5,9,-1,-1,-1,-1,6,5,9,6,9,11,11,9,8,-1,-1,-1,-1,-1,-1,-1,5,10,6,4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,3,0,4,7,3,6,5,10,-1,-1,-1,-1,-1,-1,-1,1,9,0,5,10,6,8,4,7,-1,-1,-1,-1,-1,-1,-1,10,6,5,1,9,7,1,7,3,7,9,4,-1,-1,-1,-1,6,1,2,6,5,1,4,7,8,-1,-1,-1,-1,-1,-1,-1,1,2,5,5,2,6,3,0,4,3,4,7,-1,-1,-1,-1,8,4,7,9,0,5,0,6,5,0,2,6,-1,-1,-1,-1,7,3,9,7,9,4,3,2,9,5,9,6,2,6,9,-1,3,11,2,7,8,4,10,6,5,-1,-1,-1,-1,-1,-1,-1,5,10,6,4,7,2,4,2,0,2,7,11,-1,-1,-1,-1,0,1,9,4,7,8,2,3,11,5,10,6,-1,-1,-1,-1,9,2,1,9,11,2,9,4,11,7,11,4,5,10,6,-1,8,4,7,3,11,5,3,5,1,5,11,6,-1,-1,-1,-1,5,1,11,5,11,6,1,0,11,7,11,4,0,4,11,-1,0,5,9,0,6,5,0,3,6,11,6,3,8,4,7,-1,6,5,9,6,9,11,4,7,9,7,11,9,-1,-1,-1,-1,10,4,9,6,4,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,10,6,4,9,10,0,8,3,-1,-1,-1,-1,-1,-1,-1,10,0,1,10,6,0,6,4,0,-1,-1,-1,-1,-1,-1,-1,8,3,1,8,1,6,8,6,4,6,1,10,-1,-1,-1,-1,1,4,9,1,2,4,2,6,4,-1,-1,-1,-1,-1,-1,-1,3,0,8,1,2,9,2,4,9,2,6,4,-1,-1,-1,-1,0,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,3,2,8,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1,10,4,9,10,6,4,11,2,3,-1,-1,-1,-1,-1,-1,-1,0,8,2,2,8,11,4,9,10,4,10,6,-1,-1,-1,-1,3,11,2,0,1,6,0,6,4,6,1,10,-1,-1,-1,-1,6,4,1,6,1,10,4,8,1,2,1,11,8,11,1,-1,9,6,4,9,3,6,9,1,3,11,6,3,-1,-1,-1,-1,8,11,1,8,1,0,11,6,1,9,1,4,6,4,1,-1,3,11,6,3,6,0,0,6,4,-1,-1,-1,-1,-1,-1,-1,6,4,8,11,6,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,7,10,6,7,8,10,8,9,10,-1,-1,-1,-1,-1,-1,-1,0,7,3,0,10,7,0,9,10,6,7,10,-1,-1,-1,-1,10,6,7,1,10,7,1,7,8,1,8,0,-1,-1,-1,-1,10,6,7,10,7,1,1,7,3,-1,-1,-1,-1,-1,-1,-1,1,2,6,1,6,8,1,8,9,8,6,7,-1,-1,-1,-1,2,6,9,2,9,1,6,7,9,0,9,3,7,3,9,-1,7,8,0,7,0,6,6,0,2,-1,-1,-1,-1,-1,-1,-1,7,3,2,6,7,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,3,11,10,6,8,10,8,9,8,6,7,-1,-1,-1,-1,2,0,7,2,7,11,0,9,7,6,7,10,9,10,7,-1,1,8,0,1,7,8,1,10,7,6,7,10,2,3,11,-1,11,2,1,11,1,7,10,6,1,6,7,1,-1,-1,-1,-1,8,9,6,8,6,7,9,1,6,11,6,3,1,3,6,-1,0,9,1,11,6,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,7,8,0,7,0,6,3,11,0,11,6,0,-1,-1,-1,-1,7,11,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,0,8,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,1,9,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,1,9,8,3,1,11,7,6,-1,-1,-1,-1,-1,-1,-1,10,1,2,6,11,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,2,10,3,0,8,6,11,7,-1,-1,-1,-1,-1,-1,-1,2,9,0,2,10,9,6,11,7,-1,-1,-1,-1,-1,-1,-1,6,11,7,2,10,3,10,8,3,10,9,8,-1,-1,-1,-1,7,2,3,6,2,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,7,0,8,7,6,0,6,2,0,-1,-1,-1,-1,-1,-1,-1,2,7,6,2,3,7,0,1,9,-1,-1,-1,-1,-1,-1,-1,1,6,2,1,8,6,1,9,8,8,7,6,-1,-1,-1,-1,10,7,6,10,1,7,1,3,7,-1,-1,-1,-1,-1,-1,-1,10,7,6,1,7,10,1,8,7,1,0,8,-1,-1,-1,-1,0,3,7,0,7,10,0,10,9,6,10,7,-1,-1,-1,-1,7,6,10,7,10,8,8,10,9,-1,-1,-1,-1,-1,-1,-1,6,8,4,11,8,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,6,11,3,0,6,0,4,6,-1,-1,-1,-1,-1,-1,-1,8,6,11,8,4,6,9,0,1,-1,-1,-1,-1,-1,-1,-1,9,4,6,9,6,3,9,3,1,11,3,6,-1,-1,-1,-1,6,8,4,6,11,8,2,10,1,-1,-1,-1,-1,-1,-1,-1,1,2,10,3,0,11,0,6,11,0,4,6,-1,-1,-1,-1,4,11,8,4,6,11,0,2,9,2,10,9,-1,-1,-1,-1,10,9,3,10,3,2,9,4,3,11,3,6,4,6,3,-1,8,2,3,8,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1,0,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,9,0,2,3,4,2,4,6,4,3,8,-1,-1,-1,-1,1,9,4,1,4,2,2,4,6,-1,-1,-1,-1,-1,-1,-1,8,1,3,8,6,1,8,4,6,6,10,1,-1,-1,-1,-1,10,1,0,10,0,6,6,0,4,-1,-1,-1,-1,-1,-1,-1,4,6,3,4,3,8,6,10,3,0,3,9,10,9,3,-1,10,9,4,6,10,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,9,5,7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,3,4,9,5,11,7,6,-1,-1,-1,-1,-1,-1,-1,5,0,1,5,4,0,7,6,11,-1,-1,-1,-1,-1,-1,-1,11,7,6,8,3,4,3,5,4,3,1,5,-1,-1,-1,-1,9,5,4,10,1,2,7,6,11,-1,-1,-1,-1,-1,-1,-1,6,11,7,1,2,10,0,8,3,4,9,5,-1,-1,-1,-1,7,6,11,5,4,10,4,2,10,4,0,2,-1,-1,-1,-1,3,4,8,3,5,4,3,2,5,10,5,2,11,7,6,-1,7,2,3,7,6,2,5,4,9,-1,-1,-1,-1,-1,-1,-1,9,5,4,0,8,6,0,6,2,6,8,7,-1,-1,-1,-1,3,6,2,3,7,6,1,5,0,5,4,0,-1,-1,-1,-1,6,2,8,6,8,7,2,1,8,4,8,5,1,5,8,-1,9,5,4,10,1,6,1,7,6,1,3,7,-1,-1,-1,-1,1,6,10,1,7,6,1,0,7,8,7,0,9,5,4,-1,4,0,10,4,10,5,0,3,10,6,10,7,3,7,10,-1,7,6,10,7,10,8,5,4,10,4,8,10,-1,-1,-1,-1,6,9,5,6,11,9,11,8,9,-1,-1,-1,-1,-1,-1,-1,3,6,11,0,6,3,0,5,6,0,9,5,-1,-1,-1,-1,0,11,8,0,5,11,0,1,5,5,6,11,-1,-1,-1,-1,6,11,3,6,3,5,5,3,1,-1,-1,-1,-1,-1,-1,-1,1,2,10,9,5,11,9,11,8,11,5,6,-1,-1,-1,-1,0,11,3,0,6,11,0,9,6,5,6,9,1,2,10,-1,11,8,5,11,5,6,8,0,5,10,5,2,0,2,5,-1,6,11,3,6,3,5,2,10,3,10,5,3,-1,-1,-1,-1,5,8,9,5,2,8,5,6,2,3,8,2,-1,-1,-1,-1,9,5,6,9,6,0,0,6,2,-1,-1,-1,-1,-1,-1,-1,1,5,8,1,8,0,5,6,8,3,8,2,6,2,8,-1,1,5,6,2,1,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,3,6,1,6,10,3,8,6,5,6,9,8,9,6,-1,10,1,0,10,0,6,9,5,0,5,6,0,-1,-1,-1,-1,0,3,8,5,6,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,10,5,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,11,5,10,7,5,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,11,5,10,11,7,5,8,3,0,-1,-1,-1,-1,-1,-1,-1,5,11,7,5,10,11,1,9,0,-1,-1,-1,-1,-1,-1,-1,10,7,5,10,11,7,9,8,1,8,3,1,-1,-1,-1,-1,11,1,2,11,7,1,7,5,1,-1,-1,-1,-1,-1,-1,-1,0,8,3,1,2,7,1,7,5,7,2,11,-1,-1,-1,-1,9,7,5,9,2,7,9,0,2,2,11,7,-1,-1,-1,-1,7,5,2,7,2,11,5,9,2,3,2,8,9,8,2,-1,2,5,10,2,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1,8,2,0,8,5,2,8,7,5,10,2,5,-1,-1,-1,-1,9,0,1,5,10,3,5,3,7,3,10,2,-1,-1,-1,-1,9,8,2,9,2,1,8,7,2,10,2,5,7,5,2,-1,1,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,7,0,7,1,1,7,5,-1,-1,-1,-1,-1,-1,-1,9,0,3,9,3,5,5,3,7,-1,-1,-1,-1,-1,-1,-1,9,8,7,5,9,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,5,8,4,5,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1,5,0,4,5,11,0,5,10,11,11,3,0,-1,-1,-1,-1,0,1,9,8,4,10,8,10,11,10,4,5,-1,-1,-1,-1,10,11,4,10,4,5,11,3,4,9,4,1,3,1,4,-1,2,5,1,2,8,5,2,11,8,4,5,8,-1,-1,-1,-1,0,4,11,0,11,3,4,5,11,2,11,1,5,1,11,-1,0,2,5,0,5,9,2,11,5,4,5,8,11,8,5,-1,9,4,5,2,11,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,5,10,3,5,2,3,4,5,3,8,4,-1,-1,-1,-1,5,10,2,5,2,4,4,2,0,-1,-1,-1,-1,-1,-1,-1,3,10,2,3,5,10,3,8,5,4,5,8,0,1,9,-1,5,10,2,5,2,4,1,9,2,9,4,2,-1,-1,-1,-1,8,4,5,8,5,3,3,5,1,-1,-1,-1,-1,-1,-1,-1,0,4,5,1,0,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,4,5,8,5,3,9,0,5,0,3,5,-1,-1,-1,-1,9,4,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,11,7,4,9,11,9,10,11,-1,-1,-1,-1,-1,-1,-1,0,8,3,4,9,7,9,11,7,9,10,11,-1,-1,-1,-1,1,10,11,1,11,4,1,4,0,7,4,11,-1,-1,-1,-1,3,1,4,3,4,8,1,10,4,7,4,11,10,11,4,-1,4,11,7,9,11,4,9,2,11,9,1,2,-1,-1,-1,-1,9,7,4,9,11,7,9,1,11,2,11,1,0,8,3,-1,11,7,4,11,4,2,2,4,0,-1,-1,-1,-1,-1,-1,-1,11,7,4,11,4,2,8,3,4,3,2,4,-1,-1,-1,-1,2,9,10,2,7,9,2,3,7,7,4,9,-1,-1,-1,-1,9,10,7,9,7,4,10,2,7,8,7,0,2,0,7,-1,3,7,10,3,10,2,7,4,10,1,10,0,4,0,10,-1,1,10,2,8,7,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,9,1,4,1,7,7,1,3,-1,-1,-1,-1,-1,-1,-1,4,9,1,4,1,7,0,8,1,8,7,1,-1,-1,-1,-1,4,0,3,7,4,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,8,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,0,9,3,9,11,11,9,10,-1,-1,-1,-1,-1,-1,-1,0,1,10,0,10,8,8,10,11,-1,-1,-1,-1,-1,-1,-1,3,1,10,11,3,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,2,11,1,11,9,9,11,8,-1,-1,-1,-1,-1,-1,-1,3,0,9,3,9,11,1,2,9,2,11,9,-1,-1,-1,-1,0,2,11,8,0,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,2,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,3,8,2,8,10,10,8,9,-1,-1,-1,-1,-1,-1,-1,9,10,2,0,9,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,3,8,2,8,10,0,1,8,1,10,8,-1,-1,-1,-1,1,10,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,3,8,9,1,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,9,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,3,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1]);

  var CORNER = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
  ];
  var EDGE_CORNERS = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];

  function build(cells, options) {
    options = options || {};
    var maxDim = options.maxDim || MAX_DIM;
    var subdiv = options.subdiv == null ? SUBDIV_LEVELS : options.subdiv | 0;
    var voxelSize = options.voxelSize == null ? 1 : options.voxelSize;
    if (!cells || cells.length < 3) return null;

    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    var n = cells.length / 3 | 0;
    var i, x, y, z;
    for (i = 0; i < n; i++) {
      x = cells[i * 3]; y = cells[i * 3 + 1]; z = cells[i * 3 + 2];
      if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    if (!isFinite(minX)) return null;

    var sizeX = maxX - minX + 1;
    var sizeY = maxY - minY + 1;
    var sizeZ = maxZ - minZ + 1;
    var longest = Math.max(sizeX, sizeY, sizeZ);
    var step = longest > maxDim ? longest / maxDim : 1;
    var nx = Math.max(1, Math.min(maxDim, Math.ceil(sizeX / step)));
    var ny = Math.max(1, Math.min(maxDim, Math.ceil(sizeY / step)));
    var nz = Math.max(1, Math.min(maxDim, Math.ceil(sizeZ / step)));
    // Recompute step so the bins cover the original extent (still ≤ maxDim).
    step = Math.max(sizeX / nx, sizeY / ny, sizeZ / nz);

    var sx = nx + 2, sy = ny + 2, sz = nz + 2;
    var field = new Uint8Array(sx * sy * sz);
    var strideY = sx, strideZ = sx * sy;
    for (i = 0; i < n; i++) {
      x = cells[i * 3]; y = cells[i * 3 + 1]; z = cells[i * 3 + 2];
      var bx = Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / step)));
      var by = Math.min(ny - 1, Math.max(0, Math.floor((y - minY) / step)));
      var bz = Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / step)));
      field[(bx + 1) + strideY * (by + 1) + strideZ * (bz + 1)] = 1;
    }

    var mc = march(field, sx, sy, sz, nx, ny, nz);
    if (!mc || mc.tris.length === 0) return null;

    var positions = mc.pos;
    var tris = mc.tris;
    var quads = null;
    var level;
    for (level = 0; level < subdiv; level++) {
      var sub = catmullClark(positions, tris);
      positions = sub.pos;
      tris = sub.tris;
      quads = sub.quads;
    }

    var count = positions.length / 3;
    var world = new Float32Array(positions.length);
    for (i = 0; i < count; i++) {
      var gx = positions[i * 3], gy = positions[i * 3 + 1], gz = positions[i * 3 + 2];
      world[i * 3] = (minX + (gx - 0.5) * step) * voxelSize;
      world[i * 3 + 1] = (minY + (gy - 0.5) * step) * voxelSize;
      world[i * 3 + 2] = (minZ + (gz - 0.5) * step) * voxelSize;
    }

    var oriented = orientOutward(world, tris, quads);
    return {
      positions: world,
      indices: oriented.indices,
      quads: oriented.quads,
      grid: { nx: nx, ny: ny, nz: nz, step: step },
      subdiv: subdiv,
      vertexCount: count,
      triangleCount: oriented.indices.length / 3,
      quadCount: oriented.quads ? oriented.quads.length / 4 : 0,
      surface: 'voxel'
    };
  }

  function march(field, sx, sy, sz, nx, ny, nz) {
    var strideY = sx, strideZ = sx * sy;
    var pos = [];
    var tris = [];
    var cache = new Map();
    var x, y, z, c, cube, bits, base, t, e0, e1, e2;

    function sample(ix, iy, iz) {
      return field[ix + strideY * iy + strideZ * iz];
    }

    function edgeKey(axis, ax, ay, az) {
      return axis + ((ax + ay * 80 + az * 6400) << 2);
    }

    function vertOnEdge(cx, cy, cz, edge) {
      var c0 = EDGE_CORNERS[edge][0];
      var c1 = EDGE_CORNERS[edge][1];
      var x0 = cx + CORNER[c0][0], y0 = cy + CORNER[c0][1], z0 = cz + CORNER[c0][2];
      var x1 = cx + CORNER[c1][0], y1 = cy + CORNER[c1][1], z1 = cz + CORNER[c1][2];
      var axis, ax, ay, az, key, id;
      if (x0 !== x1) { axis = 0; ax = x0 < x1 ? x0 : x1; ay = y0; az = z0; }
      else if (y0 !== y1) { axis = 1; ax = x0; ay = y0 < y1 ? y0 : y1; az = z0; }
      else { axis = 2; ax = x0; ay = y0; az = z0 < z1 ? z0 : z1; }
      key = edgeKey(axis, ax, ay, az);
      id = cache.get(key);
      if (id === undefined) {
        id = pos.length / 3;
        // Binary field: the isosurface sits on the midpoint of every crossing edge.
        pos.push((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
        cache.set(key, id);
      }
      return id;
    }

    for (z = 0; z < nz + 1; z++) {
      for (y = 0; y < ny + 1; y++) {
        for (x = 0; x < nx + 1; x++) {
          cube = 0;
          // Flag empty corners. Fully occupied and fully empty cells emit nothing,
          // so the triangles sit on the occupied/empty boundary. orientOutward fixes winding.
          if (sample(x, y, z) === 0) cube |= 1;
          if (sample(x + 1, y, z) === 0) cube |= 2;
          if (sample(x + 1, y + 1, z) === 0) cube |= 4;
          if (sample(x, y + 1, z) === 0) cube |= 8;
          if (sample(x, y, z + 1) === 0) cube |= 16;
          if (sample(x + 1, y, z + 1) === 0) cube |= 32;
          if (sample(x + 1, y + 1, z + 1) === 0) cube |= 64;
          if (sample(x, y + 1, z + 1) === 0) cube |= 128;
          bits = edgeTable[cube];
          if (bits === 0) continue;
          base = cube << 4;
          for (t = 0; triTable[base + t] !== -1; t += 3) {
            e0 = vertOnEdge(x, y, z, triTable[base + t]);
            e1 = vertOnEdge(x, y, z, triTable[base + t + 1]);
            e2 = vertOnEdge(x, y, z, triTable[base + t + 2]);
            if (e0 === e1 || e1 === e2 || e2 === e0) continue;
            tris.push(e0, e1, e2);
          }
        }
      }
    }
    return { pos: Float32Array.from(pos), tris: Uint32Array.from(tris) };
  }

  function edgeKeyVerts(a, b) {
    var lo = a < b ? a : b;
    var hi = a < b ? b : a;
    return lo * 0x100000 + hi;
  }

  function catmullClark(pos, tris) {
    var nV = pos.length / 3 | 0;
    var nF = tris.length / 3 | 0;
    var fpx = new Float32Array(nF);
    var fpy = new Float32Array(nF);
    var fpz = new Float32Array(nF);
    var faceOfVert = new Array(nV);
    var edgesOfVert = new Array(nV);
    var v;
    for (v = 0; v < nV; v++) { faceOfVert[v] = []; edgesOfVert[v] = []; }

    var edges = [];
    var edgeMap = new Map();
    function getEdge(a, b) {
      var key = edgeKeyVerts(a, b);
      var e = edgeMap.get(key);
      if (!e) {
        var lo = a < b ? a : b;
        var hi = a < b ? b : a;
        e = { a: lo, b: hi, f0: -1, f1: -1, id: edges.length };
        edges.push(e);
        edgeMap.set(key, e);
      }
      return e;
    }

    var fi, ia, ib, ic, e01, e12, e20;
    for (fi = 0; fi < nF; fi++) {
      ia = tris[fi * 3]; ib = tris[fi * 3 + 1]; ic = tris[fi * 3 + 2];
      fpx[fi] = (pos[ia * 3] + pos[ib * 3] + pos[ic * 3]) / 3;
      fpy[fi] = (pos[ia * 3 + 1] + pos[ib * 3 + 1] + pos[ic * 3 + 1]) / 3;
      fpz[fi] = (pos[ia * 3 + 2] + pos[ib * 3 + 2] + pos[ic * 3 + 2]) / 3;
      faceOfVert[ia].push(fi); faceOfVert[ib].push(fi); faceOfVert[ic].push(fi);
      e01 = getEdge(ia, ib); e12 = getEdge(ib, ic); e20 = getEdge(ic, ia);
      linkFace(e01, fi); linkFace(e12, fi); linkFace(e20, fi);
    }

    function linkFace(e, face) {
      if (e.f0 < 0) {
        e.f0 = face;
        edgesOfVert[e.a].push(e.id);
        edgesOfVert[e.b].push(e.id);
      } else if (e.f1 < 0 && e.f0 !== face) {
        e.f1 = face;
      }
    }

    var nE = edges.length;
    var baseE = nV;
    var baseF = nV + nE;
    var newPos = new Float32Array((nV + nE + nF) * 3);
    var ei, e, o, ax, ay, az, bx, by, bz;

    for (ei = 0; ei < nE; ei++) {
      e = edges[ei];
      ax = pos[e.a * 3]; ay = pos[e.a * 3 + 1]; az = pos[e.a * 3 + 2];
      bx = pos[e.b * 3]; by = pos[e.b * 3 + 1]; bz = pos[e.b * 3 + 2];
      o = (baseE + e.id) * 3;
      if (e.f1 < 0) {
        newPos[o] = (ax + bx) * 0.5;
        newPos[o + 1] = (ay + by) * 0.5;
        newPos[o + 2] = (az + bz) * 0.5;
      } else {
        newPos[o] = (ax + bx + fpx[e.f0] + fpx[e.f1]) * 0.25;
        newPos[o + 1] = (ay + by + fpy[e.f0] + fpy[e.f1]) * 0.25;
        newPos[o + 2] = (az + bz + fpz[e.f0] + fpz[e.f1]) * 0.25;
      }
    }

    for (fi = 0; fi < nF; fi++) {
      o = (baseF + fi) * 3;
      newPos[o] = fpx[fi];
      newPos[o + 1] = fpy[fi];
      newPos[o + 2] = fpz[fi];
    }

    for (v = 0; v < nV; v++) {
      var incF = faceOfVert[v];
      var incE = edgesOfVert[v];
      var n = incE.length;
      o = v * 3;
      if (n === 0) {
        newPos[o] = pos[o]; newPos[o + 1] = pos[o + 1]; newPos[o + 2] = pos[o + 2];
        continue;
      }
      var nB = 0, mbx = 0, mby = 0, mbz = 0;
      for (ei = 0; ei < n; ei++) {
        e = edges[incE[ei]];
        if (e.f1 < 0) {
          nB++;
          mbx += (pos[e.a * 3] + pos[e.b * 3]) * 0.5;
          mby += (pos[e.a * 3 + 1] + pos[e.b * 3 + 1]) * 0.5;
          mbz += (pos[e.a * 3 + 2] + pos[e.b * 3 + 2]) * 0.5;
        }
      }
      if (nB > 0) {
        var inv = 1 / nB;
        // Boundary rule: halfway from the vertex to the average of boundary-edge midpoints.
        newPos[o] = pos[o] * 0.5 + mbx * inv * 0.5;
        newPos[o + 1] = pos[o + 1] * 0.5 + mby * inv * 0.5;
        newPos[o + 2] = pos[o + 2] * 0.5 + mbz * inv * 0.5;
      } else {
        var fx = 0, fy = 0, fz = 0, nf = incF.length;
        for (ei = 0; ei < nf; ei++) {
          fx += fpx[incF[ei]]; fy += fpy[incF[ei]]; fz += fpz[incF[ei]];
        }
        var invF = 1 / nf;
        fx *= invF; fy *= invF; fz *= invF;
        var rx = 0, ry = 0, rz = 0;
        for (ei = 0; ei < n; ei++) {
          e = edges[incE[ei]];
          rx += (pos[e.a * 3] + pos[e.b * 3]) * 0.5;
          ry += (pos[e.a * 3 + 1] + pos[e.b * 3 + 1]) * 0.5;
          rz += (pos[e.a * 3 + 2] + pos[e.b * 3 + 2]) * 0.5;
        }
        var invE = 1 / n;
        rx *= invE; ry *= invE; rz *= invE;
        var k = n - 3;
        newPos[o] = (fx + 2 * rx + k * pos[o]) / n;
        newPos[o + 1] = (fy + 2 * ry + k * pos[o + 1]) / n;
        newPos[o + 2] = (fz + 2 * rz + k * pos[o + 2]) / n;
      }
    }

    // One quad per original corner. A triangle becomes 3 quads.
    var quads = new Uint32Array(nF * 12);
    var out = new Uint32Array(nF * 18);
    var q = 0;
    var qi = 0;
    var vs, i, vert, vNext, vPrev, epN, epP, fp;
    for (fi = 0; fi < nF; fi++) {
      vs = [tris[fi * 3], tris[fi * 3 + 1], tris[fi * 3 + 2]];
      fp = baseF + fi;
      for (i = 0; i < 3; i++) {
        vert = vs[i];
        vNext = vs[(i + 1) % 3];
        vPrev = vs[(i + 2) % 3];
        epN = baseE + edgeMap.get(edgeKeyVerts(vert, vNext)).id;
        epP = baseE + edgeMap.get(edgeKeyVerts(vPrev, vert)).id;
        quads[qi++] = vert; quads[qi++] = epN; quads[qi++] = fp; quads[qi++] = epP;
        out[q++] = vert; out[q++] = epN; out[q++] = fp;
        out[q++] = vert; out[q++] = fp; out[q++] = epP;
      }
    }
    return { pos: newPos, tris: out, quads: quads };
  }

  function signedVolume(pos, idx) {
    var v = 0, i, a, b, c, ax, ay, az, bx, by, bz, cx, cy, cz;
    for (i = 0; i < idx.length; i += 3) {
      a = idx[i] * 3; b = idx[i + 1] * 3; c = idx[i + 2] * 3;
      ax = pos[a]; ay = pos[a + 1]; az = pos[a + 2];
      bx = pos[b]; by = pos[b + 1]; bz = pos[b + 2];
      cx = pos[c]; cy = pos[c + 1]; cz = pos[c + 2];
      v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    }
    return v / 6;
  }

  function orientOutward(pos, tris, quads) {
    var idx = tris instanceof Uint32Array ? tris : Uint32Array.from(tris);
    if (signedVolume(pos, idx) < 0) {
      var i, tmp;
      for (i = 0; i < idx.length; i += 3) {
        tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp;
      }
      if (quads) {
        for (i = 0; i < quads.length; i += 4) {
          tmp = quads[i + 1]; quads[i + 1] = quads[i + 3]; quads[i + 3] = tmp;
        }
      }
    }
    return { indices: idx, quads: quads };
  }

  // --- Dragon-style tubular CAD -------------------------------------------------
  // Geometric idea only (no MATStruct, no solve): distance-ridge centerline,
  // smoothed spline, truncated SDF of a circular tube, sparse marching cubes.
  // Returns null when the occupied set is not a single tube so the caller can
  // keep the voxel isosurface.

  var TUBE_MAX_VOXELS = 8000;
  var TUBE_INF = 1e6;

  function buildCad(cells, options) {
    var tube = null;
    try {
      tube = buildTube(cells, options);
    } catch (err) {
      tube = null;
    }
    if (tube) return tube;
    var voxel = build(cells, options);
    return voxel;
  }

  function buildTube(cells, options) {
    options = options || {};
    var voxelSize = options.voxelSize == null ? 1 : options.voxelSize;
    if (!cells || cells.length < 3) return null;
    var n = cells.length / 3 | 0;
    if (n < 4 || n > TUBE_MAX_VOXELS) return null;

    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    var i, x, y, z;
    var seen = new Set();
    var uniq = [];
    for (i = 0; i < n; i++) {
      x = cells[i * 3] | 0; y = cells[i * 3 + 1] | 0; z = cells[i * 3 + 2] | 0;
      var sk = x + ',' + y + ',' + z;
      if (seen.has(sk)) continue;
      seen.add(sk);
      uniq.push(x, y, z);
      if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    n = uniq.length / 3 | 0;
    if (n < 4) return null;
    var sizeX = maxX - minX + 1;
    var sizeY = maxY - minY + 1;
    var sizeZ = maxZ - minZ + 1;
    // A filled blob is not a hose. Skip the skeleton pass and let CAD fall back.
    if (n > Math.max(sizeX, sizeY, sizeZ) * 28) return null;

    var sx = sizeX + 2, sy = sizeY + 2, sz = sizeZ + 2;
    if (sx * sy * sz > 1600000) return null;
    var grid = new Uint8Array(sx * sy * sz);
    var strideY = sx, strideZ = sx * sy;
    for (i = 0; i < n; i++) {
      x = uniq[i * 3] - minX + 1;
      y = uniq[i * 3 + 1] - minY + 1;
      z = uniq[i * 3 + 2] - minZ + 1;
      grid[x + strideY * y + strideZ * z] = 1;
    }

    var dist2 = distanceToBackground(grid, sx, sy, sz);
    var alive = thinToCurve(grid, dist2, sx, sy, sz);
    if (!alive) return null;
    dropCliqueExtras(alive, sx, sy, sz);
    pruneSpurs(alive, sx, sy, sz, 2);

    var curve = traceCurve(alive, sx, sy, sz);
    if (!curve) return null;
    for (i = 0; i < curve.pts.length; i += 3) {
      curve.pts[i] += minX - 1 + 0.5;
      curve.pts[i + 1] += minY - 1 + 0.5;
      curve.pts[i + 2] += minZ - 1 + 0.5;
    }
    var fitted = recenterAndRadius(curve.pts, curve.closed, uniq);
    if (!fitted) return null;
    curve.pts = fitted.pts;
    curve.r = fitted.r;
    curve.arc = fitted.arc;

    var meanR = 0;
    for (i = 0; i < curve.r.length; i++) meanR += curve.r[i];
    meanR /= curve.r.length;
    var shapeLen = Math.max(sizeX, sizeY, sizeZ);
    if (curve.pts.length / 3 < 6) return null;
    if (shapeLen < meanR * 3.2) return null;
    if (curve.arc < Math.max(6, meanR * 3.2)) return null;

    var spline = smoothSpline(curve.pts, curve.r, curve.closed);
    if (!spline || spline.pts.length < 8) return null;
    if (!tubeCovers(uniq, spline)) return null;
    spline.closed = curve.closed;

    var meshed = meshTube(spline, voxelSize);
    if (!meshed) return null;
    meshed.surface = 'tube';
    meshed.closed = curve.closed;
    meshed.centerline = spline.pts;
    meshed.centerRadius = spline.r;
    meshed.grid = { nx: sizeX, ny: sizeY, nz: sizeZ, step: 1 };
    meshed.subdiv = 0;
    return meshed;
  }

  function idx(x, y, z, sx, sy) {
    return x + sx * y + sx * sy * z;
  }

  function distanceToBackground(grid, sx, sy, sz) {
    var n = sx * sy * sz;
    var d = new Float64Array(n);
    var i;
    for (i = 0; i < n; i++) d[i] = grid[i] ? TUBE_INF : 0;
    edtAxisX(d, sx, sy, sz);
    edtAxisY(d, sx, sy, sz);
    edtAxisZ(d, sx, sy, sz);
    return d;
  }

  function edt1d(f, n, out) {
    var v = new Int32Array(n);
    var z = new Float64Array(n + 1);
    var k = 0;
    var q, s, vk, denom;
    v[0] = 0;
    z[0] = -1e20;
    z[1] = 1e20;
    for (q = 1; q < n; q++) {
      while (true) {
        vk = v[k];
        denom = (q - vk) * 2;
        s = (f[q] + q * q - f[vk] - vk * vk) / denom;
        if (k === 0 || s > z[k]) break;
        k--;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = 1e20;
    }
    k = 0;
    for (q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      vk = v[k];
      out[q] = (q - vk) * (q - vk) + f[vk];
    }
  }

  function edtAxisX(d, sx, sy, sz) {
    var g = new Float64Array(sx);
    var out = new Float64Array(sx);
    var y, z, x, base;
    for (z = 0; z < sz; z++) {
      for (y = 0; y < sy; y++) {
        base = sx * y + sx * sy * z;
        for (x = 0; x < sx; x++) g[x] = d[base + x];
        edt1d(g, sx, out);
        for (x = 0; x < sx; x++) d[base + x] = out[x];
      }
    }
  }

  function edtAxisY(d, sx, sy, sz) {
    var g = new Float64Array(sy);
    var out = new Float64Array(sy);
    var y, z, x, base;
    for (z = 0; z < sz; z++) {
      for (x = 0; x < sx; x++) {
        base = x + sx * sy * z;
        for (y = 0; y < sy; y++) g[y] = d[base + sx * y];
        edt1d(g, sy, out);
        for (y = 0; y < sy; y++) d[base + sx * y] = out[y];
      }
    }
  }

  function edtAxisZ(d, sx, sy, sz) {
    var g = new Float64Array(sz);
    var out = new Float64Array(sz);
    var stride = sx * sy;
    var y, z, x, base;
    for (y = 0; y < sy; y++) {
      for (x = 0; x < sx; x++) {
        base = x + sx * y;
        for (z = 0; z < sz; z++) g[z] = d[base + stride * z];
        edt1d(g, sz, out);
        for (z = 0; z < sz; z++) d[base + stride * z] = out[z];
      }
    }
  }

  var N26 = (function () {
    var o = [];
    var x, y, z;
    for (z = -1; z <= 1; z++) {
      for (y = -1; y <= 1; y++) {
        for (x = -1; x <= 1; x++) {
          if (x === 0 && y === 0 && z === 0) continue;
          o.push(x, y, z);
        }
      }
    }
    return o;
  })();

  var N18 = (function () {
    var o = [];
    var i;
    for (i = 0; i < N26.length; i += 3) {
      var ax = Math.abs(N26[i]) + Math.abs(N26[i + 1]) + Math.abs(N26[i + 2]);
      if (ax === 1 || ax === 2) o.push(N26[i], N26[i + 1], N26[i + 2]);
    }
    return o;
  })();

  var N6 = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];

  function thinToCurve(grid, dist2, sx, sy, sz) {
    var alive = new Uint8Array(grid);
    var pass, i, k, x, y, z, id, removed, left;
    for (pass = 0; pass < 8; pass++) {
      var pts = listAlive(alive, sx, sy, sz);
      if (pts.length / 3 < 4) return null;
      var order = [];
      for (i = 0; i < pts.length; i += 3) order.push(i / 3 | 0);
      order.sort(function (a, b) {
        var ia = idx(pts[a * 3], pts[a * 3 + 1], pts[a * 3 + 2], sx, sy);
        var ib = idx(pts[b * 3], pts[b * 3 + 1], pts[b * 3 + 2], sx, sy);
        return dist2[ia] - dist2[ib];
      });
      removed = 0;
      for (k = 0; k < order.length; k++) {
        i = order[k];
        x = pts[i * 3]; y = pts[i * 3 + 1]; z = pts[i * 3 + 2];
        id = idx(x, y, z, sx, sy);
        if (!alive[id]) continue;
        if (!hasEmpty6(alive, x, y, z, sx, sy)) continue;
        if (countFg26(alive, x, y, z, sx, sy) <= 1) continue;
        if (!isSimple(alive, x, y, z, sx, sy)) continue;
        alive[id] = 0;
        removed++;
      }
      if (!removed) break;
    }
    left = 0;
    for (i = 0; i < alive.length; i++) if (alive[i]) left++;
    if (left < 4) return null;
    return alive;
  }

  function sortByDist(border, dist2, sx, sy) {
    var m = border.length / 3 | 0;
    var order = new Array(m);
    var i;
    for (i = 0; i < m; i++) order[i] = i;
    order.sort(function (a, b) {
      var ia = idx(border[a * 3], border[a * 3 + 1], border[a * 3 + 2], sx, sy);
      var ib = idx(border[b * 3], border[b * 3 + 1], border[b * 3 + 2], sx, sy);
      return dist2[ia] - dist2[ib];
    });
    var out = new Int32Array(border.length);
    for (i = 0; i < m; i++) {
      var s = order[i] * 3;
      out[i * 3] = border[s];
      out[i * 3 + 1] = border[s + 1];
      out[i * 3 + 2] = border[s + 2];
    }
    return out;
  }

  function hasEmpty6(alive, x, y, z, sx, sy) {
    var i;
    for (i = 0; i < 18; i += 3) {
      if (!alive[idx(x + N6[i], y + N6[i + 1], z + N6[i + 2], sx, sy)]) return true;
    }
    return false;
  }

  function countFg26(alive, x, y, z, sx, sy) {
    var c = 0, i;
    for (i = 0; i < 78; i += 3) {
      if (alive[idx(x + N26[i], y + N26[i + 1], z + N26[i + 2], sx, sy)]) c++;
    }
    return c;
  }

  function isSimple(alive, x, y, z, sx, sy) {
    if (fgComponents26(alive, x, y, z, sx, sy) !== 1) return false;
    if (bgComponents18(alive, x, y, z, sx, sy) !== 1) return false;
    return true;
  }

  function fgComponents26(alive, x, y, z, sx, sy) {
    var ids = [];
    var i, j;
    for (i = 0; i < 78; i += 3) {
      var nx = x + N26[i], ny = y + N26[i + 1], nz = z + N26[i + 2];
      if (alive[idx(nx, ny, nz, sx, sy)]) ids.push(i / 3 | 0);
    }
    if (ids.length === 0) return 0;
    var seen = new Uint8Array(26);
    var comp = 0;
    for (i = 0; i < ids.length; i++) {
      var start = ids[i];
      if (seen[start]) continue;
      comp++;
      var stack = [start];
      seen[start] = 1;
      while (stack.length) {
        var a = stack.pop();
        var ax = N26[a * 3], ay = N26[a * 3 + 1], az = N26[a * 3 + 2];
        for (j = 0; j < ids.length; j++) {
          var b = ids[j];
          if (seen[b]) continue;
          var bx = N26[b * 3], by = N26[b * 3 + 1], bz = N26[b * 3 + 2];
          if (Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz)) <= 1) {
            seen[b] = 1;
            stack.push(b);
          }
        }
      }
    }
    return comp;
  }

  function bgComponents18(alive, x, y, z, sx, sy) {
    var ids = [];
    var i, j;
    for (i = 0; i < N18.length; i += 3) {
      var nx = x + N18[i], ny = y + N18[i + 1], nz = z + N18[i + 2];
      if (!alive[idx(nx, ny, nz, sx, sy)]) ids.push(i / 3 | 0);
    }
    if (ids.length === 0) return 0;
    var seen = new Uint8Array(18);
    var comp = 0;
    var n18 = N18.length / 3;
    for (i = 0; i < ids.length; i++) {
      var start = ids[i];
      if (seen[start]) continue;
      comp++;
      var stack = [start];
      seen[start] = 1;
      while (stack.length) {
        var a = stack.pop();
        var ax = N18[a * 3], ay = N18[a * 3 + 1], az = N18[a * 3 + 2];
        for (j = 0; j < ids.length; j++) {
          var b = ids[j];
          if (seen[b]) continue;
          var bx = N18[b * 3], by = N18[b * 3 + 1], bz = N18[b * 3 + 2];
          var manhattan = Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz);
          if (manhattan === 1) {
            seen[b] = 1;
            stack.push(b);
          }
        }
      }
    }
    return comp;
  }

  function neighborsOf(alive, x, y, z, sx, sy) {
    var out = [];
    var i;
    for (i = 0; i < 78; i += 3) {
      var nx = x + N26[i], ny = y + N26[i + 1], nz = z + N26[i + 2];
      if (alive[idx(nx, ny, nz, sx, sy)]) out.push(nx, ny, nz);
    }
    return out;
  }

  function listAlive(alive, sx, sy, sz) {
    var pts = [];
    var z, y, x;
    for (z = 1; z < sz - 1; z++) {
      for (y = 1; y < sy - 1; y++) {
        for (x = 1; x < sx - 1; x++) {
          if (alive[idx(x, y, z, sx, sy)]) pts.push(x, y, z);
        }
      }
    }
    return pts;
  }

  function dropCliqueExtras(alive, sx, sy, sz) {
    var changed = true;
    var guard = 0;
    while (changed && guard++ < 8) {
      changed = false;
      var pts = listAlive(alive, sx, sy, sz);
      var i, j, k;
      for (i = 0; i < pts.length; i += 3) {
        var x = pts[i], y = pts[i + 1], z = pts[i + 2];
        if (!alive[idx(x, y, z, sx, sy)]) continue;
        var nb = neighborsOf(alive, x, y, z, sx, sy);
        var deg = nb.length / 3 | 0;
        if (deg < 2) continue;
        var clique = true;
        for (j = 0; j < deg && clique; j++) {
          for (k = j + 1; k < deg; k++) {
            var dx = Math.abs(nb[j * 3] - nb[k * 3]);
            var dy = Math.abs(nb[j * 3 + 1] - nb[k * 3 + 1]);
            var dz = Math.abs(nb[j * 3 + 2] - nb[k * 3 + 2]);
            if (Math.max(dx, dy, dz) > 1) { clique = false; break; }
          }
        }
        if (!clique) continue;
        alive[idx(x, y, z, sx, sy)] = 0;
        changed = true;
      }
    }
  }

  function degreeAt(alive, x, y, z, sx, sy) {
    return countFg26(alive, x, y, z, sx, sy);
  }

  function pruneSpurs(alive, sx, sy, sz, maxLen) {
    var guard = 0;
    var changed = true;
    while (changed && guard++ < 6) {
      changed = false;
      var pts = listAlive(alive, sx, sy, sz);
      var doomed = [];
      var i;
      for (i = 0; i < pts.length; i += 3) {
        var x = pts[i], y = pts[i + 1], z = pts[i + 2];
        if (degreeAt(alive, x, y, z, sx, sy) < 3) continue;
        var nb = neighborsOf(alive, x, y, z, sx, sy);
        var b;
        for (b = 0; b < nb.length; b += 3) {
          var path = walkSpur(alive, x, y, z, nb[b], nb[b + 1], nb[b + 2], sx, sy, maxLen);
          if (!path) continue;
          var p;
          for (p = 0; p < path.length; p += 3) doomed.push(path[p], path[p + 1], path[p + 2]);
        }
      }
      for (i = 0; i < doomed.length; i += 3) {
        var id = idx(doomed[i], doomed[i + 1], doomed[i + 2], sx, sy);
        if (alive[id]) { alive[id] = 0; changed = true; }
      }
    }
  }

  function walkSpur(alive, jx, jy, jz, x, y, z, sx, sy, maxLen) {
    var path = [x, y, z];
    var prevx = jx, prevy = jy, prevz = jz;
    var guard = 0;
    while (guard++ < maxLen + 2) {
      var deg = degreeAt(alive, x, y, z, sx, sy);
      if (deg === 1 && path.length / 3 <= maxLen) return path;
      if (deg !== 2) return null;
      var nb = neighborsOf(alive, x, y, z, sx, sy);
      var nx = -1, ny = -1, nz = -1, found = 0;
      var i;
      for (i = 0; i < nb.length; i += 3) {
        if (nb[i] === prevx && nb[i + 1] === prevy && nb[i + 2] === prevz) continue;
        nx = nb[i]; ny = nb[i + 1]; nz = nb[i + 2];
        found++;
      }
      if (found !== 1) return null;
      if (path.length / 3 >= maxLen) return null;
      prevx = x; prevy = y; prevz = z;
      x = nx; y = ny; z = nz;
      if (degreeAt(alive, x, y, z, sx, sy) >= 3) return null;
      path.push(x, y, z);
    }
    return null;
  }

  function traceCurve(alive, sx, sy, sz) {
    var raw = listAlive(alive, sx, sy, sz);
    var n = raw.length / 3 | 0;
    if (n < 4 || n > 6000) return null;
    var keyAt = new Map();
    var i, b;
    for (i = 0; i < n; i++) {
      keyAt.set(raw[i * 3] + ',' + raw[i * 3 + 1] + ',' + raw[i * 3 + 2], i);
    }
    var adj = new Array(n);
    var deg1 = [];
    for (i = 0; i < n; i++) {
      var nb = neighborsOf(alive, raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2], sx, sy);
      var links = [];
      for (b = 0; b < nb.length; b += 3) {
        var id = keyAt.get(nb[b] + ',' + nb[b + 1] + ',' + nb[b + 2]);
        if (id === undefined || id === i) continue;
        links.push(id);
      }
      adj[i] = links;
      if (links.length === 0) return null;
      if (links.length === 1) deg1.push(i);
    }

    var ordered, closed;
    if (deg1.length === 0) {
      ordered = walkGreedy(raw, adj, 0);
      if (!ordered) return null;
      var last = ordered[ordered.length - 1];
      var back = false;
      for (b = 0; b < adj[last].length; b++) if (adj[last][b] === ordered[0]) back = true;
      var offL = offPathDistance(raw, ordered);
      if (!back || ordered.length < 8 || offL > 2.25) {
        return null;
      }
      closed = true;
    } else {
      var seed = deg1[0];
      var farA = farthest(adj, seed);
      var farB = farthest(adj, farA.id);
      ordered = farB.path;
      var offP = ordered ? offPathDistance(raw, ordered) : 99;
      if (!ordered || ordered.length < 6 || offP > 2.25) {
        return null;
      }
      closed = false;
    }

    var outPts = [];
    for (i = 0; i < ordered.length; i++) {
      var id = ordered[i];
      outPts.push(raw[id * 3], raw[id * 3 + 1], raw[id * 3 + 2]);
    }
    var arc = polylineLength(outPts, closed);
    return { pts: outPts, r: outPts.map(function () { return 0.5; }), closed: closed, arc: arc };
  }

  function offPathDistance(raw, ordered) {
    var n = raw.length / 3 | 0;
    var on = new Uint8Array(n);
    var i, j;
    for (i = 0; i < ordered.length; i++) on[ordered[i]] = 1;
    var maxD = 0;
    for (i = 0; i < n; i++) {
      if (on[i]) continue;
      var best = 1e9;
      for (j = 0; j < ordered.length; j++) {
        var id = ordered[j];
        var dx = raw[i * 3] - raw[id * 3];
        var dy = raw[i * 3 + 1] - raw[id * 3 + 1];
        var dz = raw[i * 3 + 2] - raw[id * 3 + 2];
        var d = dx * dx + dy * dy + dz * dz;
        if (d < best) best = d;
      }
      if (best > maxD) maxD = best;
    }
    return Math.sqrt(maxD);
  }

  function farthest(adj, start) {
    var prev = new Int32Array(adj.length);
    var i;
    for (i = 0; i < prev.length; i++) prev[i] = -2;
    prev[start] = -1;
    var q = [start];
    var qi = 0;
    var last = start;
    while (qi < q.length) {
      var cur = q[qi++];
      last = cur;
      var links = adj[cur];
      for (i = 0; i < links.length; i++) {
        var nb = links[i];
        if (prev[nb] !== -2) continue;
        prev[nb] = cur;
        q.push(nb);
      }
    }
    var path = [];
    var guard = 0;
    cur = last;
    while (cur >= 0 && guard++ < adj.length + 2) {
      path.push(cur);
      if (cur === start) break;
      cur = prev[cur];
    }
    path.reverse();
    return { id: last, path: path };
  }

  function walkGreedy(raw, adj, start) {
    var n = adj.length;
    var visited = new Uint8Array(n);
    var ordered = [start];
    visited[start] = 1;
    var cur = start;
    var dx = 1, dy = 0, dz = 0;
    var guard = 0;
    while (guard++ < n + 2) {
      var links = adj[cur];
      var best = -1;
      var bestScore = -1e9;
      var i;
      for (i = 0; i < links.length; i++) {
        var nb = links[i];
        if (visited[nb]) continue;
        var vx = raw[nb * 3] - raw[cur * 3];
        var vy = raw[nb * 3 + 1] - raw[cur * 3 + 1];
        var vz = raw[nb * 3 + 2] - raw[cur * 3 + 2];
        var score = vx * dx + vy * dy + vz * dz;
        if (score > bestScore) { bestScore = score; best = nb; }
      }
      if (best < 0) break;
      dx = raw[best * 3] - raw[cur * 3];
      dy = raw[best * 3 + 1] - raw[cur * 3 + 1];
      dz = raw[best * 3 + 2] - raw[cur * 3 + 2];
      ordered.push(best);
      visited[best] = 1;
      cur = best;
    }
    return ordered;
  }

  function polylineLength(pts, closed) {
    var n = pts.length / 3 | 0;
    var total = 0;
    var i, i1;
    var limit = closed ? n : n - 1;
    for (i = 0; i < limit; i++) {
      i1 = (i + 1) % n;
      var dx = pts[i1 * 3] - pts[i * 3];
      var dy = pts[i1 * 3 + 1] - pts[i * 3 + 1];
      var dz = pts[i1 * 3 + 2] - pts[i * 3 + 2];
      total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return total;
  }

  function recenterAndRadius(pts, closed, uniq) {
    var occ = new Set();
    var nU = uniq.length / 3 | 0;
    var i, dx, dy, dz;
    for (i = 0; i < nU; i++) occ.add(uniq[i * 3] + ',' + uniq[i * 3 + 1] + ',' + uniq[i * 3 + 2]);
    var n = pts.length / 3 | 0;
    var out = [];
    var outR = [];
    for (i = 0; i < n; i++) {
      var im = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
      var ip = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      var tx = pts[ip * 3] - pts[im * 3];
      var ty = pts[ip * 3 + 1] - pts[im * 3 + 1];
      var tz = pts[ip * 3 + 2] - pts[im * 3 + 2];
      var tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      var cx = pts[i * 3], cy = pts[i * 3 + 1], cz = pts[i * 3 + 2];
      var ix = Math.round(cx - 0.5), iy = Math.round(cy - 0.5), iz = Math.round(cz - 0.5);
      var sx = 0, sy = 0, sz = 0, c = 0;
      var reach = 0;
      for (dz = -2; dz <= 2; dz++) {
        for (dy = -2; dy <= 2; dy++) {
          for (dx = -2; dx <= 2; dx++) {
            var vx = ix + dx, vy = iy + dy, vz = iz + dz;
            if (!occ.has(vx + ',' + vy + ',' + vz)) continue;
            var px = vx + 0.5, py = vy + 0.5, pz = vz + 0.5;
            var axial = (px - cx) * tx + (py - cy) * ty + (pz - cz) * tz;
            if (Math.abs(axial) > 0.7) continue;
            var ddx = px - cx, ddy = py - cy, ddz = pz - cz;
            if (ddx * ddx + ddy * ddy + ddz * ddz > 3.4) continue;
            sx += px; sy += py; sz += pz; c++;
          }
        }
      }
      var nx = c ? sx / c : cx;
      var ny = c ? sy / c : cy;
      var nz = c ? sz / c : cz;
      // Circumscribe the local cross-section so the hose contains the voxels,
      // then the inscribed medial radius (distance to the nearest empty center).
      var radial = 0;
      if (c) {
        for (dz = -2; dz <= 2; dz++) {
          for (dy = -2; dy <= 2; dy++) {
            for (dx = -2; dx <= 2; dx++) {
              var vx2 = ix + dx, vy2 = iy + dy, vz2 = iz + dz;
              if (!occ.has(vx2 + ',' + vy2 + ',' + vz2)) continue;
              var px2 = vx2 + 0.5, py2 = vy2 + 0.5, pz2 = vz2 + 0.5;
              var axial2 = (px2 - cx) * tx + (py2 - cy) * ty + (pz2 - cz) * tz;
              if (Math.abs(axial2) > 0.7) continue;
              var rr = Math.sqrt((px2 - nx) * (px2 - nx) + (py2 - ny) * (py2 - ny) + (pz2 - nz) * (pz2 - nz));
              if (rr > radial) radial = rr;
            }
          }
        }
      }
      var inscribed = nearestEmptyRadius(nx, ny, nz, occ);
      // Medial (inscribed) radius, but never smaller than the voxel centers' spread
      // plus a little so a 1-voxel rope stays a hose of about half a cell.
      var radius = Math.max(inscribed, radial);
      if (radius < 0.45) radius = 0.45;
      out.push(nx, ny, nz);
      outR.push(radius);
    }
    return { pts: out, r: outR, arc: polylineLength(out, closed) };
  }

  function nearestEmptyRadius(cx, cy, cz, occ) {
    var best = 1e9;
    var R = 2;
    var found = false;
    while (R <= 7 && !found) {
      var x0 = Math.floor(cx - 0.5) - R;
      var y0 = Math.floor(cy - 0.5) - R;
      var z0 = Math.floor(cz - 0.5) - R;
      var x1 = Math.floor(cx - 0.5) + R;
      var y1 = Math.floor(cy - 0.5) + R;
      var z1 = Math.floor(cz - 0.5) + R;
      var x, y, z;
      for (z = z0; z <= z1; z++) {
        for (y = y0; y <= y1; y++) {
          for (x = x0; x <= x1; x++) {
            if (occ.has(x + ',' + y + ',' + z)) continue;
            var dx = cx - (x + 0.5), dy = cy - (y + 0.5), dz = cz - (z + 0.5);
            var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < best) best = d;
            found = true;
          }
        }
      }
      if (!found) R += 2;
    }
    if (!(best < 1e8)) return 0.5;
    return Math.max(0.45, best - 0.5);
  }

  function tubeCovers(uniq, spline) {
    var n = uniq.length / 3 | 0;
    var m = spline.pts.length / 3 | 0;
    var far = 0;
    var step = n > 2500 ? 2 : 1;
    var checked = 0;
    var i, j;
    for (i = 0; i < n; i += step) {
      var x = uniq[i * 3] + 0.5, y = uniq[i * 3 + 1] + 0.5, z = uniq[i * 3 + 2] + 0.5;
      var best = Infinity;
      var br = 0.5;
      for (j = 0; j < m; j++) {
        var dx = x - spline.pts[j * 3];
        var dy = y - spline.pts[j * 3 + 1];
        var dz = z - spline.pts[j * 3 + 2];
        var d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < best) { best = d2; br = spline.r[j]; }
      }
      checked++;
      if (Math.sqrt(best) - br > 0.9) far++;
    }
    return far / checked <= 0.08;
  }

  function smoothSpline(rawPts, rawR, closed) {
    var uniform = resampleLinear(rawPts, rawR, closed, 0.5);
    if (!uniform) return null;
    var sm = gaussianSmooth(uniform.pts, uniform.r, closed, 2.3 / 0.5);
    var dense = resampleLinear(sm.pts, sm.r, closed, 0.22);
    return dense;
  }

  function resampleLinear(pts, rad, closed, spacing) {
    var n = pts.length / 3 | 0;
    if (n < 2) return null;
    var seg = new Float64Array(n);
    var total = 0;
    var i, j;
    var limit = closed ? n : n - 1;
    for (i = 0; i < limit; i++) {
      var i1 = (i + 1) % n;
      var dx = pts[i1 * 3] - pts[i * 3];
      var dy = pts[i1 * 3 + 1] - pts[i * 3 + 1];
      var dz = pts[i1 * 3 + 2] - pts[i * 3 + 2];
      var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      seg[i] = len;
      total += len;
    }
    if (total < 1) return null;
    var count = Math.max(8, Math.min(4000, Math.round(total / spacing)));
    var ds = total / count;
    var out = new Float32Array(count * 3);
    var outR = new Float32Array(count);
    var acc = 0;
    var segIndex = 0;
    var segPos = 0;
    for (i = 0; i < count; i++) {
      var target = i * ds;
      if (!closed && target > total) target = total;
      while (segIndex < limit - 1 && acc + seg[segIndex] < target - 1e-8) {
        acc += seg[segIndex];
        segIndex++;
      }
      var sl = seg[segIndex] || 1e-6;
      var t = (target - acc) / sl;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      var i0 = segIndex;
      var i1 = (segIndex + 1) % n;
      for (j = 0; j < 3; j++) {
        out[i * 3 + j] = pts[i0 * 3 + j] + (pts[i1 * 3 + j] - pts[i0 * 3 + j]) * t;
      }
      outR[i] = rad[i0] + (rad[i1] - rad[i0]) * t;
    }
    return { pts: out, r: outR, length: total };
  }

  function gaussianSmooth(pts, rad, closed, sigma) {
    var n = pts.length / 3 | 0;
    var radius = Math.max(1, Math.ceil(sigma * 3));
    var w = new Float64Array(radius * 2 + 1);
    var k, sumw = 0;
    for (k = -radius; k <= radius; k++) {
      var g = Math.exp(-0.5 * (k / sigma) * (k / sigma));
      w[k + radius] = g;
      sumw += g;
    }
    var out = new Float32Array(pts.length);
    var outR = new Float32Array(n);
    var i, a;
    for (i = 0; i < n; i++) {
      var sx = 0, sy = 0, sz = 0, sr = 0, sw = 0;
      for (k = -radius; k <= radius; k++) {
        var j = i + k;
        if (closed) j = (j % n + n) % n;
        else if (j < 0 || j >= n) continue;
        var wk = w[k + radius];
        sx += pts[j * 3] * wk;
        sy += pts[j * 3 + 1] * wk;
        sz += pts[j * 3 + 2] * wk;
        sr += rad[j] * wk;
        sw += wk;
      }
      out[i * 3] = sx / sw;
      out[i * 3 + 1] = sy / sw;
      out[i * 3 + 2] = sz / sw;
      outR[i] = sr / sw;
    }
    // A second, lighter pass knocks down remaining voxel-scale ripple.
    var out2 = new Float32Array(pts.length);
    var outR2 = new Float32Array(n);
    var sigma2 = sigma * 0.65;
    var radius2 = Math.max(1, Math.ceil(sigma2 * 3));
    var w2 = new Float64Array(radius2 * 2 + 1);
    sumw = 0;
    for (k = -radius2; k <= radius2; k++) {
      w2[k + radius2] = Math.exp(-0.5 * (k / sigma2) * (k / sigma2));
      sumw += w2[k + radius2];
    }
    for (i = 0; i < n; i++) {
      var sx2 = 0, sy2 = 0, sz2 = 0, sr2 = 0, sw2 = 0;
      for (k = -radius2; k <= radius2; k++) {
        var j2 = i + k;
        if (closed) j2 = (j2 % n + n) % n;
        else if (j2 < 0 || j2 >= n) continue;
        var wk2 = w2[k + radius2];
        sx2 += out[j2 * 3] * wk2;
        sy2 += out[j2 * 3 + 1] * wk2;
        sz2 += out[j2 * 3 + 2] * wk2;
        sr2 += outR[j2] * wk2;
        sw2 += wk2;
      }
      out2[i * 3] = sx2 / sw2;
      out2[i * 3 + 1] = sy2 / sw2;
      out2[i * 3 + 2] = sz2 / sw2;
      outR2[i] = Math.max(0.4, sr2 / sw2);
    }
    return { pts: out2, r: outR2 };
  }

  function meshTube(spline, voxelSize) {
    var pts = spline.pts;
    var rad = spline.r;
    var m = pts.length / 3 | 0;
    var meanR = 0;
    var i;
    for (i = 0; i < m; i++) meanR += rad[i];
    meanR /= m;
    var maxR = 0;
    for (i = 0; i < m; i++) if (rad[i] > maxR) maxR = rad[i];
    // Measured marching-cubes edges run slightly longer than the grid step.
    // Start at 0.20 * radius (about a 0.20 edge). Long hoses may coarsen,
    // but stay at or under 0.235 * radius so edges remain in the 0.15-0.25
    // print band. That is FDM resolution, not a game-engine mesh.
    var h = Math.max(0.04, meanR * 0.20);
    var tau = h * 2.15;
    var est = estimateBand(pts, rad, h, tau);
    var guard = 0;
    var printCoarse = Math.max(h, meanR * 0.235);
    while (est > 360000 && h < printCoarse - 1e-9 && guard++ < 8) {
      h = Math.min(printCoarse, h * 1.15);
      tau = h * 2.15;
      est = estimateBand(pts, rad, h, tau);
    }
    // Only pathological lengths leave the print band, and only enough to finish.
    while (est > 900000 && h < meanR * 0.55 && guard++ < 12) {
      h *= 1.18;
      tau = h * 2.15;
      est = estimateBand(pts, rad, h, tau);
    }
    if (est > 1500000) return null;

    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (i = 0; i < m; i++) {
      var r = rad[i] + tau + h;
      var x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      if (x - r < minX) minX = x - r;
      if (y - r < minY) minY = y - r;
      if (z - r < minZ) minZ = z - r;
      if (x + r > maxX) maxX = x + r;
      if (y + r > maxY) maxY = y + r;
      if (z + r > maxZ) maxZ = z + r;
    }
    var originX = minX, originY = minY, originZ = minZ;
    var field = new Map();
    var B = 4096;
    var STR = 8192;
    var STR2 = STR * STR;
    function pack(ix, iy, iz) {
      return (ix + B) + (iy + B) * STR + (iz + B) * STR2;
    }
    function unpack(key) {
      var iz = Math.floor(key / STR2) - B;
      var rem = key - (iz + B) * STR2;
      var iy = Math.floor(rem / STR) - B;
      var ix = rem - (iy + B) * STR;
      return [ix, iy, iz];
    }

    // Distance to the polyline, not to sample points. Point stamps leave
    // spherical beads that read as voxel dents on a print.
    var closed = !!spline.closed;
    var segN = closed ? m : (m - 1);
    var ix, iy, iz;
    for (i = 0; i < segN; i++) {
      var i1 = (i + 1) % m;
      var ax = pts[i * 3], ay = pts[i * 3 + 1], az = pts[i * 3 + 2];
      var bx = pts[i1 * 3], by = pts[i1 * 3 + 1], bz = pts[i1 * 3 + 2];
      var ra = rad[i], rb = rad[i1];
      var rMax = ra > rb ? ra : rb;
      var rOut = rMax + tau;
      var abx = bx - ax, aby = by - ay, abz = bz - az;
      var ab2 = abx * abx + aby * aby + abz * abz;
      var mincx = ax < bx ? ax : bx;
      var mincy = ay < by ? ay : by;
      var mincz = az < bz ? az : bz;
      var maxcx = ax > bx ? ax : bx;
      var maxcy = ay > by ? ay : by;
      var maxcz = az > bz ? az : bz;
      var ix0 = Math.floor((mincx - rOut - originX) / h);
      var iy0 = Math.floor((mincy - rOut - originY) / h);
      var iz0 = Math.floor((mincz - rOut - originZ) / h);
      var ix1 = Math.ceil((maxcx + rOut - originX) / h);
      var iy1 = Math.ceil((maxcy + rOut - originY) / h);
      var iz1 = Math.ceil((maxcz + rOut - originZ) / h);
      for (iz = iz0; iz <= iz1; iz++) {
        var wz = originZ + iz * h;
        for (iy = iy0; iy <= iy1; iy++) {
          var wy = originY + iy * h;
          for (ix = ix0; ix <= ix1; ix++) {
            var wx = originX + ix * h;
            var apx = wx - ax, apy = wy - ay, apz = wz - az;
            var t = ab2 < 1e-12 ? 0 : (apx * abx + apy * aby + apz * abz) / ab2;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;
            var qx = ax + abx * t, qy = ay + aby * t, qz = az + abz * t;
            var dx = wx - qx, dy = wy - qy, dz = wz - qz;
            var d2 = dx * dx + dy * dy + dz * dz;
            var rHere = ra + (rb - ra) * t;
            var rOutS = rHere + tau;
            if (d2 > rOutS * rOutS) continue;
            var rInS = rHere - tau;
            if (rInS > 0 && d2 < rInS * rInS) continue;
            var sdf = Math.sqrt(d2) - rHere;
            var key = pack(ix, iy, iz);
            var prev = field.get(key);
            if (prev === undefined || sdf < prev) field.set(key, sdf);
          }
        }
      }
    }
    if (field.size < 16) return null;

    var cells = new Map();
    field.forEach(function (_v, key) {
      var c = unpack(key);
      var ox, oy, oz;
      for (oz = -1; oz <= 0; oz++) {
        for (oy = -1; oy <= 0; oy++) {
          for (ox = -1; ox <= 0; ox++) {
            cells.set(pack(c[0] + ox, c[1] + oy, c[2] + oz), 1);
          }
        }
      }
    });

    var pos = [];
    var tris = [];
    var cache = new Map();
    function cornerSdf(ix, iy, iz) {
      return field.get(pack(ix, iy, iz));
    }
    function edgeId(ax, ay, az, bx, by, bz) {
      var k1 = pack(ax, ay, az);
      var k2 = pack(bx, by, bz);
      var lo = k1 < k2 ? k1 : k2;
      var hi = k1 < k2 ? k2 : k1;
      // Mix into a string; numeric pairs can exceed 2^53.
      return lo + ':' + hi;
    }
    function vert(ix, iy, iz, jx, jy, jz, sa, sb) {
      var ek = edgeId(ix, iy, iz, jx, jy, jz);
      var id = cache.get(ek);
      if (id !== undefined) return id;
      var denom = sb - sa;
      var t = Math.abs(denom) < 1e-8 ? 0.5 : (0 - sa) / denom;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      var wx = (originX + ix * h) + ((jx - ix) * h) * t;
      var wy = (originY + iy * h) + ((jy - iy) * h) * t;
      var wz = (originZ + iz * h) + ((jz - iz) * h) * t;
      id = pos.length / 3;
      pos.push(wx * voxelSize, wy * voxelSize, wz * voxelSize);
      cache.set(ek, id);
      return id;
    }

    cells.forEach(function (_v, key) {
      var c = unpack(key);
      var cx = c[0], cy = c[1], cz = c[2];
      var s = new Array(8);
      var cube = 0;
      var ci;
      for (ci = 0; ci < 8; ci++) {
        var sxv = cornerSdf(cx + CORNER[ci][0], cy + CORNER[ci][1], cz + CORNER[ci][2]);
        if (sxv === undefined) return;
        s[ci] = sxv;
        if (sxv >= 0) cube |= (1 << ci);
      }
      var bits = edgeTable[cube];
      if (bits === 0) return;
      var base = cube << 4;
      var t;
      for (t = 0; triTable[base + t] !== -1; t += 3) {
        var eA = triTable[base + t];
        var eB = triTable[base + t + 1];
        var eC = triTable[base + t + 2];
        function edgeVert(e) {
          var c0 = EDGE_CORNERS[e][0];
          var c1 = EDGE_CORNERS[e][1];
          return vert(
            cx + CORNER[c0][0], cy + CORNER[c0][1], cz + CORNER[c0][2],
            cx + CORNER[c1][0], cy + CORNER[c1][1], cz + CORNER[c1][2],
            s[c0], s[c1]
          );
        }
        var ia = edgeVert(eA), ib = edgeVert(eB), ic = edgeVert(eC);
        if (ia === ib || ib === ic || ic === ia) continue;
        tris.push(ia, ib, ic);
      }
    });
    if (tris.length < 3) return null;
    var positions = Float32Array.from(pos);
    var indices = Uint32Array.from(tris);
    var oriented = orientOutward(positions, indices, null);
    return {
      positions: positions,
      indices: oriented.indices,
      quads: null,
      vertexCount: positions.length / 3,
      triangleCount: oriented.indices.length / 3,
      quadCount: 0,
      meshStep: h
    };
  }

  function estimateBand(pts, rad, h, tau) {
    var m = pts.length / 3 | 0;
    var length = 0;
    var meanR = 0;
    var i;
    for (i = 0; i < m; i++) meanR += rad[i];
    meanR /= m;
    for (i = 1; i < m; i++) {
      var dx = pts[i * 3] - pts[(i - 1) * 3];
      var dy = pts[i * 3 + 1] - pts[(i - 1) * 3 + 1];
      var dz = pts[i * 3 + 2] - pts[(i - 1) * 3 + 2];
      length += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    var area = Math.PI * Math.max(0, (meanR + tau) * (meanR + tau) - Math.max(0, meanR - tau) * Math.max(0, meanR - tau));
    return (length / h) * area / (h * h);
  }


  function fmt(n) {
    return (Math.round(n * 1e6) / 1e6).toString();
  }

  function toObj(mesh, options) {
    options = options || {};
    var scale = options.scale == null ? 1 : options.scale;
    var zUp = options.upAxis === 'Z';
    var pos = mesh.positions;
    var lines = ['o voxel_cad'];
    var i, x, y, z, yy;
    for (i = 0; i < pos.length; i += 3) {
      x = pos[i] * scale;
      y = pos[i + 1] * scale;
      z = pos[i + 2] * scale;
      if (zUp) { yy = z; z = -y; y = yy; }
      lines.push('v ' + fmt(x) + ' ' + fmt(y) + ' ' + fmt(z));
    }
    if (mesh.quads && mesh.quads.length) {
      var q = mesh.quads;
      for (i = 0; i < q.length; i += 4) {
        lines.push('f ' + (q[i] + 1) + ' ' + (q[i + 1] + 1) + ' ' + (q[i + 2] + 1) + ' ' + (q[i + 3] + 1));
      }
    } else {
      var t = mesh.indices;
      for (i = 0; i < t.length; i += 3) {
        lines.push('f ' + (t[i] + 1) + ' ' + (t[i + 1] + 1) + ' ' + (t[i + 2] + 1));
      }
    }
    return lines.join('\n') + '\n';
  }

  // Editor Y-up → Bambu Z-up. Identical to buildPaintMesh in index.html:
  // (x, -z, y) * scale. The STL dialog rotation (x, z, -y) sits upside down
  // once Bambu drops the mesh onto the bed.
  function toBambuXYZ(x, y, z, scale) {
    var s = scale == null ? 1 : scale;
    return [x * s, -z * s, y * s];
  }

  // One paint color per triangle: the occupied voxel whose center is nearest
  // the triangle centroid. The 3MF writer only stores a per-triangle token.
  function triangleColors(positions, indices, cells, colors, voxelSize) {
    if (!positions || !indices || !cells || !colors) return null;
    var n = cells.length / 3 | 0;
    var nTri = indices.length / 3 | 0;
    if (n === 0 || nTri === 0 || colors.length < n) return null;
    var vs = voxelSize == null ? 1 : voxelSize;
    if (!(vs > 0)) vs = 1;
    var buckets = new Map();
    var i;
    for (i = 0; i < n; i++) {
      var key = (cells[i * 3] | 0) + ',' + (cells[i * 3 + 1] | 0) + ',' + (cells[i * 3 + 2] | 0);
      if (!buckets.has(key)) buckets.set(key, i);
    }
    var out = new Array(nTri);
    for (var t = 0; t < nTri; t++) {
      var a = indices[t * 3] * 3;
      var b = indices[t * 3 + 1] * 3;
      var c = indices[t * 3 + 2] * 3;
      var px = (positions[a] + positions[b] + positions[c]) / 3;
      var py = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3;
      var pz = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
      out[t] = colors[nearestIndex(px, py, pz)];
    }
    return out;

    function nearestIndex(px, py, pz) {
      var ix = Math.floor(px / vs);
      var iy = Math.floor(py / vs);
      var iz = Math.floor(pz / vs);
      var direct = buckets.get(ix + ',' + iy + ',' + iz);
      if (direct !== undefined) return direct;
      var best = 0;
      var bestD = Infinity;
      var found = false;
      var r, dx, dy, dz, id, vx, vy, vz, ddx, ddy, ddz, d;
      for (r = 1; r <= 96; r++) {
        var stop = (r + 0.5) * vs;
        stop = stop * stop;
        for (dz = -r; dz <= r; dz++) {
          for (dy = -r; dy <= r; dy++) {
            var face = Math.abs(dz) === r || Math.abs(dy) === r;
            for (dx = -r; dx <= r; dx++) {
              if (!face && Math.abs(dx) !== r) continue;
              id = buckets.get((ix + dx) + ',' + (iy + dy) + ',' + (iz + dz));
              if (id === undefined) continue;
              found = true;
              vx = ((cells[id * 3] | 0) + 0.5) * vs;
              vy = ((cells[id * 3 + 1] | 0) + 0.5) * vs;
              vz = ((cells[id * 3 + 2] | 0) + 0.5) * vs;
              ddx = px - vx; ddy = py - vy; ddz = pz - vz;
              d = ddx * ddx + ddy * ddy + ddz * ddz;
              if (d < bestD) { bestD = d; best = id; }
            }
          }
        }
        if (found && bestD <= stop) return best;
      }
      return best;
    }
  }

  return {
    MAX_DIM: MAX_DIM,
    SUBDIV_LEVELS: SUBDIV_LEVELS,
    build: build,
    buildCad: buildCad,
    buildTube: buildTube,
    toObj: toObj,
    toBambuXYZ: toBambuXYZ,
    triangleColors: triangleColors,
    signedVolume: signedVolume
  };
});
