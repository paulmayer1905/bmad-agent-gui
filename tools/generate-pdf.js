/**
 * Génère docs/presentation.pdf depuis docs/presentation.html
 * en utilisant l'instance Electron/Chromium déjà installée.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const htmlPath = path.join(__dirname, '..', 'docs', 'presentation.html');
  const pdfPath  = path.join(__dirname, '..', 'docs', 'presentation.pdf');

  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: { javascript: true }
  });

  await win.loadFile(htmlPath);

  // Laisser les polices/images se charger
  await new Promise(r => setTimeout(r, 3000));

  const pdf = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    marginsType: 1,          // minimum margins
    landscape: false,
  });

  fs.writeFileSync(pdfPath, pdf);
  console.log('PDF généré :', pdfPath);
  app.quit();
});
