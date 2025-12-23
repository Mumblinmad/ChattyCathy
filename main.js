console.log("Process type:", process.type);
console.log("Electron version:", process.versions.electron);

const electron = require("electron");
console.log("require('electron') type:", typeof electron);
console.log("require('electron') value:", electron);

const { app, BrowserWindow } = electron;

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600
  });

  win.loadURL("data:text/html,<h1>Electron 39 Works</h1>");
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
