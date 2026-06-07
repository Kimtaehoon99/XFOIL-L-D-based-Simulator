export const LD_POLAR = {
  baseline: [
    { aoa: -6.0153, ld: -8.3172 },
    { aoa: -4.953, ld: -14.704 },
    { aoa: -3.9724, ld: -10.402 },
    { aoa: -2.9305, ld: -0.917 },
    { aoa: -1.8954, ld: 10.7796 },
    { aoa: -0.8738, ld: 29.0182 },
    { aoa: 0.2022, ld: 50.3364 },
    { aoa: 1.1556, ld: 77.4769 },
    { aoa: 2.2179, ld: 92.5104 },
    { aoa: 3.2531, ld: 98.5904 },
    { aoa: 4.2814, ld: 87.155 },
    { aoa: 5.2893, ld: 79.5223 },
    { aoa: 6.3041, ld: 72.9712 },
    { aoa: 7.3461, ld: 66.9891 },
    { aoa: 8.3677, ld: 60.3335 },
    { aoa: 9.3961, ld: 51.7912 },
    { aoa: 10.4246, ld: 43.1012 },
    { aoa: 11.3986, ld: 33.6998 }
  ],
  optimized: [
    { aoa: -5, ld: -13.9808 },
    { aoa: -4.5, ld: -9.0511 },
    { aoa: -4, ld: -3.4725 },
    { aoa: -3.5, ld: 2.5296 },
    { aoa: -3, ld: 8.7785 },
    { aoa: -2.5, ld: 14.836 },
    { aoa: -2, ld: 20.9032 },
    { aoa: -1.5, ld: 27.738 },
    { aoa: -1, ld: 34.9536 },
    { aoa: -0.5, ld: 42.6322 },
    { aoa: 0, ld: 50.975 },
    { aoa: 1, ld: 79.6698 },
    { aoa: 1.5, ld: 91.4286 },
    { aoa: 2, ld: 112.0426 },
    { aoa: 2.5, ld: 117.5862 },
    { aoa: 3, ld: 113.4477 },
    { aoa: 3.5, ld: 98.0359 },
    { aoa: 4, ld: 91.5306 },
    { aoa: 4.5, ld: 83.144 },
    { aoa: 5.5, ld: 72.2952 },
    { aoa: 6, ld: 72.1481 },
    { aoa: 6.5, ld: 71.9303 },
    { aoa: 7, ld: 71.5507 },
    { aoa: 7.5, ld: 69.6406 },
    { aoa: 8, ld: 67.4899 },
    { aoa: 8.5, ld: 64.9892 },
    { aoa: 9, ld: 62.0738 },
    { aoa: 9.5, ld: 58.7644 },
    { aoa: 10, ld: 54.9328 },
    { aoa: 10.5, ld: 50.9443 },
    { aoa: 11, ld: 46.4736 },
    { aoa: 11.5, ld: 41.7829 },
    { aoa: 12, ld: 36.5543 },
    { aoa: 12.5, ld: 31.1673 },
    { aoa: 13, ld: 26.0226 },
    { aoa: 13.5, ld: 20.9197 },
    { aoa: 14, ld: 16.4374 },
    { aoa: 14.5, ld: 13.1485 },
    { aoa: 15, ld: 10.2655 }
  ]
};

export function getMaxLd(points) {
  return points.reduce((best, point) => (point.ld > best.ld ? point : best), points[0]);
}

export const LD_STATS = {
  baselineMax: getMaxLd(LD_POLAR.baseline),
  optimizedMax: getMaxLd(LD_POLAR.optimized)
};

LD_STATS.gainPct = (LD_STATS.optimizedMax.ld / LD_STATS.baselineMax.ld - 1) * 100;
