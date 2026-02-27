/**
 * Creates a desktop shortcut for BMAD Agent GUI on Windows
 * Also generates a simple .ico icon file
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_DIR = path.resolve(__dirname);
const ELECTRON_EXE = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
const ICON_PATH = path.join(APP_DIR, 'assets', 'bmad-icon.ico');
const LAUNCH_BAT = path.join(APP_DIR, 'launch.bat');

// ─── Generate a simple .ico file (32x32, 16-color brain emoji style) ────────

function generateIco() {
  // Minimal 32x32 ICO with a purple/blue gradient brain-like pattern
  // ICO header: 6 bytes
  // ICO directory entry: 16 bytes
  // BMP header: 40 bytes
  // Palette: 5 colors * 4 bytes = 20 bytes
  // Pixel data: 32x32 = 1024 pixels at 4bpp = 512 bytes
  // AND mask: 32x32/8 = 128 bytes

  const width = 32, height = 32;

  // ICO Header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);    // Reserved
  header.writeUInt16LE(1, 2);    // ICO type
  header.writeUInt16LE(1, 4);    // 1 image

  // BMP info header
  const bmpHeader = Buffer.alloc(40);
  bmpHeader.writeUInt32LE(40, 0);        // Header size
  bmpHeader.writeInt32LE(width, 4);      // Width
  bmpHeader.writeInt32LE(height * 2, 8); // Height (doubled for AND mask)
  bmpHeader.writeUInt16LE(1, 12);        // Planes
  bmpHeader.writeUInt16LE(24, 14);       // Bits per pixel (24-bit RGB)
  bmpHeader.writeUInt32LE(0, 16);        // Compression
  bmpHeader.writeUInt32LE(0, 20);        // Image size (0 = auto)

  // 24-bit pixel data (BGR, bottom-up)
  const rowSize = Math.ceil((width * 3) / 4) * 4; // Row padded to 4 bytes
  const pixelData = Buffer.alloc(rowSize * height);

  // Colors
  const BG = [26, 15, 15];           // #0f0f1a (BGR)
  const PURPLE = [237, 58, 124];     // #7c3aed
  const PURPLE_L = [250, 139, 167];  // #a78bfa
  const BLUE = [246, 130, 59];       // #3b82f6
  const GREEN = [129, 185, 16];      // #10b981
  const WHITE = [224, 224, 224];     // #e0e0e0

  // Draw a brain/circuit icon pattern
  const drawPixel = (x, y, color) => {
    const row = (height - 1 - y); // bottom-up
    const offset = row * rowSize + x * 3;
    pixelData[offset] = color[0];     // B
    pixelData[offset + 1] = color[1]; // G
    pixelData[offset + 2] = color[2]; // R
  };

  // Fill background
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      drawPixel(x, y, BG);
    }
  }

  // Draw a rounded rectangle border
  for (let x = 4; x < 28; x++) {
    drawPixel(x, 4, PURPLE);
    drawPixel(x, 27, PURPLE);
  }
  for (let y = 4; y < 28; y++) {
    drawPixel(4, y, PURPLE);
    drawPixel(27, y, PURPLE);
  }
  // Corners
  drawPixel(5, 5, PURPLE); drawPixel(26, 5, PURPLE);
  drawPixel(5, 26, PURPLE); drawPixel(26, 26, PURPLE);

  // Draw "B" letter for BMAD (large, centered)
  const bShape = [
    // Vertical bar
    [10,8],[10,9],[10,10],[10,11],[10,12],[10,13],[10,14],[10,15],[10,16],[10,17],[10,18],[10,19],[10,20],[10,21],[10,22],[10,23],
    [11,8],[11,9],[11,10],[11,11],[11,12],[11,13],[11,14],[11,15],[11,16],[11,17],[11,18],[11,19],[11,20],[11,21],[11,22],[11,23],
    // Top horizontal
    [12,8],[13,8],[14,8],[15,8],[16,8],[17,8],[18,8],
    [12,9],[13,9],[14,9],[15,9],[16,9],[17,9],[18,9],
    // Middle horizontal
    [12,15],[13,15],[14,15],[15,15],[16,15],[17,15],[18,15],
    [12,16],[13,16],[14,16],[15,16],[16,16],[17,16],[18,16],
    // Bottom horizontal
    [12,22],[13,22],[14,22],[15,22],[16,22],[17,22],[18,22],[19,22],
    [12,23],[13,23],[14,23],[15,23],[16,23],[17,23],[18,23],[19,23],
    // Top right curve
    [19,8],[19,9],[20,9],[20,10],[20,11],[20,12],[20,13],[20,14],[19,14],[19,15],
    [19,10],[19,11],[19,12],[19,13],
    // Bottom right curve
    [19,16],[19,17],[20,16],[20,17],[20,18],[20,19],[20,20],[20,21],[21,19],[21,20],
    [19,18],[19,19],[19,20],[19,21],[21,17],[21,18],
  ];

  bShape.forEach(([x, y]) => drawPixel(x, y, PURPLE_L));

  // Draw small dots/nodes (circuit feel)
  [[7,7],[24,7],[7,24],[24,24]].forEach(([x,y]) => {
    drawPixel(x, y, BLUE);
    drawPixel(x+1, y, BLUE);
    drawPixel(x, y+1, BLUE);
    drawPixel(x+1, y+1, BLUE);
  });

  // Small accent dots
  [[15,6],[16,6],[15,25],[16,25]].forEach(([x,y]) => drawPixel(x, y, GREEN));

  // AND mask (all transparent = all zeros)
  const andMask = Buffer.alloc(Math.ceil(width / 8) * height);

  // ICO directory entry
  const dirEntry = Buffer.alloc(16);
  const imageSize = bmpHeader.length + pixelData.length + andMask.length;
  dirEntry.writeUInt8(width, 0);         // Width
  dirEntry.writeUInt8(height, 1);        // Height
  dirEntry.writeUInt8(0, 2);             // Color palette
  dirEntry.writeUInt8(0, 3);             // Reserved
  dirEntry.writeUInt16LE(1, 4);          // Color planes
  dirEntry.writeUInt16LE(24, 6);         // Bits per pixel
  dirEntry.writeUInt32LE(imageSize, 8);  // Size of image data
  dirEntry.writeUInt32LE(6 + 16, 12);    // Offset to image data

  const ico = Buffer.concat([header, dirEntry, bmpHeader, pixelData, andMask]);

  fs.mkdirSync(path.dirname(ICON_PATH), { recursive: true });
  fs.writeFileSync(ICON_PATH, ico);
  console.log(`Icon created: ${ICON_PATH}`);
}

// ─── Create desktop shortcut ────────────────────────────────────────────────

function createShortcut() {
  // Get desktop path
  const desktopPath = execSync('powershell -Command "[Environment]::GetFolderPath(\'Desktop\')"', { encoding: 'utf8' }).trim();
  const shortcutPath = path.join(desktopPath, 'BMAD Agent GUI.lnk');

  // PowerShell script to create .lnk shortcut
  const escapedShortcut = shortcutPath.replace(/\\/g, '\\\\');
  const escapedExe = ELECTRON_EXE.replace(/\\/g, '\\\\');
  const escapedDir = APP_DIR.replace(/\\/g, '\\\\');
  const escapedIcon = ICON_PATH.replace(/\\/g, '\\\\');

  const ps = [
    `$ws = New-Object -ComObject WScript.Shell`,
    `$s = $ws.CreateShortcut('${escapedShortcut}')`,
    `$s.TargetPath = '${escapedExe}'`,
    `$s.Arguments = '.'`,
    `$s.WorkingDirectory = '${escapedDir}'`,
    `$s.IconLocation = '${escapedIcon}'`,
    `$s.Description = 'BMAD Agent GUI - Manage BMAD agents, sessions and workflows'`,
    `$s.Save()`
  ].join('; ');

  execSync(`powershell -Command "${ps}"`, { stdio: 'inherit' });
  console.log(`Desktop shortcut created: ${shortcutPath}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

try {
  console.log('=== BMAD Agent GUI — Desktop Setup ===\n');

  // Step 1: Generate icon
  console.log('1. Generating icon...');
  generateIco();

  // Step 2: Ensure build exists
  if (!fs.existsSync(path.join(APP_DIR, 'build', 'index.html'))) {
    console.log('2. Building React app (first time)...');
    execSync('npx react-scripts build', { cwd: APP_DIR, stdio: 'inherit' });
  } else {
    console.log('2. Build already exists ✓');
  }

  // Step 3: Create shortcut
  console.log('3. Creating desktop shortcut...');
  createShortcut();

  console.log('\n✅ Done! Double-click "BMAD Agent GUI" on your desktop to launch.');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
