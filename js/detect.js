// Vendor IDs
export const EPSON_VID = 0x04B8;
export const CANON_VID = 0x04A9;

export const EPSON_MODELS = {
  0x08A1: "Epson L100 / L200 / L350",
  0x08A8: "Epson L300 / L355",
  0x08A9: "Epson L455",
  0x08B0: "Epson L1300",
  0x08B4: "Epson L3050 / L3060 / L3070",
  0x08CD: "Epson L3100 / L3101",
  0x08CE: "Epson L3110",
  0x08CF: "Epson L3150",
  0x08D1: "Epson L3160",
  0x0852: "Epson L210",
  0x0854: "Epson L110 / L111",
  0x0856: "Epson L310",
  0x0857: "Epson L360 / L362 / L365 / L366",
  0x085C: "Epson L382",
  0x0870: "Epson L486",
  0x0873: "Epson L550 / L555",
  0x087B: "Epson L565",
  0x087C: "Epson L605",
  0x087D: "Epson L655",
  0x0889: "Epson L805",
  0x088A: "Epson L850",
  0x0A87: "Epson XP-2100 / XP-2105",
  0x0A89: "Epson XP-3100 / XP-3105",
  0x0A8B: "Epson XP-4100 / XP-4105",
  0x0901: "Epson XP-600 / XP-605",
  0x0902: "Epson XP-700",
  0x0903: "Epson XP-800",
  0x110B: "Epson ET-2700 / ET-2750",
  0x110C: "Epson ET-3700 / ET-3750",
  0x1110: "Epson ET-2810 / ET-2815",
};

export const CANON_MODELS = {
  0x1094: "Canon PIXMA iP2700 / iP2702",
  0x1096: "Canon PIXMA MP230 / MP235",
  0x10B4: "Canon PIXMA MG2400 / MG2450 / MG2500 / MG2550",
  0x10B5: "Canon PIXMA MG2910 / MG2940 / MG2950",
  0x10C0: "Canon PIXMA MG3040 / MG3050 / MG3053",
  0x10C4: "Canon PIXMA MG3600 / MG3620 / MG3630 / MG3640",
  0x10CF: "Canon PIXMA MG3700 / MG3710 / MG3720 / MG3730",
  0x10D3: "Canon PIXMA MG5700 / MG5710 / MG5720 / MG5730",
  0x10D7: "Canon PIXMA MG6800 / MG6820 / MG6850 / MG6851",
  0x17AF: "Canon PIXMA G1000 / G1100 / G1200 / G1300 / G1500",
  0x17B0: "Canon PIXMA G2000 / G2100 / G2200 / G2300 / G2500",
  0x17B1: "Canon PIXMA G3000 / G3100 / G3200 / G3300 / G3500",
  0x17B3: "Canon PIXMA G4000 / G4100 / G4200 / G4300 / G4500",
  0x17C8: "Canon PIXMA G1010 / G1020",
  0x17C9: "Canon PIXMA G2010 / G2020",
  0x17CA: "Canon PIXMA G3010 / G3020",
  0x17CB: "Canon PIXMA G4010 / G4020",
  0x1882: "Canon PIXMA G1430",
  0x1883: "Canon PIXMA G2430 / G2470",
  0x1884: "Canon PIXMA G3430 / G3470",
  0x1885: "Canon PIXMA G4430 / G4470",
  0x10A9: "Canon PIXMA iP7200 / iP7220 / iP7250",
  0x10AC: "Canon PIXMA iP8700 / iP8720 / iP8750",
  0x1097: "Canon PIXMA MP490 / MP495",
  0x109A: "Canon PIXMA MP510 / MP520",
};

// G-серия Canon (EcoTank / MegaTank)
export const CANON_G_SERIES = new Set([
  0x17AF, 0x17B0, 0x17B1, 0x17B3,
  0x17C8, 0x17C9, 0x17CA, 0x17CB,
  0x1882, 0x1883, 0x1884, 0x1885,
]);

export function printerName(vendorId, productId) {
  if (vendorId === EPSON_VID)
    return EPSON_MODELS[productId] ?? `Epson (PID ${hex(productId)})`;
  if (vendorId === CANON_VID)
    return CANON_MODELS[productId] ?? `Canon (PID ${hex(productId)})`;
  return `Unknown (VID ${hex(vendorId)}, PID ${hex(productId)})`;
}

function hex(n) {
  return `0x${n.toString(16).padStart(4, '0').toUpperCase()}`;
}

export async function requestPrinter() {
  return navigator.usb.requestDevice({
    filters: [
      { vendorId: EPSON_VID },
      { vendorId: CANON_VID },
    ],
  });
}

export async function getConnectedPrinters() {
  const devices = await navigator.usb.getDevices();
  return devices.filter(
    d => d.vendorId === EPSON_VID || d.vendorId === CANON_VID
  );
}
