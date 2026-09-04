import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from 'electron'
import { join, dirname } from 'path'
import { spawn } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import ffprobePath from 'ffprobe-static'
import { existsSync, mkdirSync, realpathSync } from 'fs'
import { pathToFileURL } from 'url'

// --- Resolve real paths for binaries (asar → asar.unpacked) ---
function resolveBinaryPath(p: string | null | undefined): string {
  if (!p) return ''
  // Replace app.asar with app.asar.unpacked — spawn() can't read inside asar
  if (p.includes('app.asar')) {
    return p.replace('app.asar', 'app.asar.unpacked')
  }
  return p
}

const ffmpegBin = resolveBinaryPath(ffmpegPath as unknown as string)
const ffprobeBin = resolveBinaryPath(ffprobePath?.path as string | undefined)

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'SpeedVideo',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow file:// video playback
    },
  })

  // Dev: load from Vite dev server; Prod: load from built files
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

// --- IPC: Select video file ---
ipcMain.handle('dialog:openVideo', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Выберите видео',
    filters: [
      { name: 'Видео', extensions: ['mp4', 'avi', 'mkv', 'mov', 'webm', 'flv', 'wmv', 'm4v'] },
    ],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// --- IPC: Get video URL for playback ---
ipcMain.handle('video:getUrl', async (_event, filePath: string) => {
  return pathToFileURL(filePath).href
})

// --- IPC: Open external link ---
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  await shell.openExternal(url)
})

// --- IPC: Select save location ---
ipcMain.handle('dialog:saveVideo', async (_event, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Сохранить видео',
    defaultPath: defaultName,
    filters: [{ name: 'MP4 видео', extensions: ['mp4'] }],
  })
  if (result.canceled) return null
  return result.filePath
})

// --- IPC: Probe video duration ---
ipcMain.handle('video:probe', async (_event, filePath: string) => {
  return new Promise((resolve, reject) => {
    const ffprobe = ffprobeBin
    const proc = spawn(ffprobe, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      filePath,
    ])
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${stderr}`))
        return
      }
      try {
        const data = JSON.parse(stdout)
        resolve({ duration: parseFloat(data.format.duration) })
      } catch (e) {
        reject(new Error(`Parse error: ${e}`))
      }
    })
    proc.on('error', reject)
  })
})

// --- IPC: Render video with speed adjustment ---
// speedPct = 100 means normal speed, 200 = 2x faster, 50 = half speed
ipcMain.handle('video:render', async (event, inputPath: string, outputPath: string, speedPct: number) => {
  const speed = speedPct / 100 // 0.1 to 3.0

  // Video PTS: setpts = 1/speed * PTS
  const videoFilter = `setpts=${(1 / speed).toFixed(6)}*PTS`

  // Audio: atempo can do 0.5-2.0 per filter. Chain for extreme values.
  // For speed < 0.5 we need atempo=0.5,atempo=0.5*2... For speed > 2 we chain atempo=2,atempo=2*...
  const audioFilters = buildAtempoChain(speed)

  const args = [
    '-i', inputPath,
    '-filter:v', videoFilter,
  ]

  if (audioFilters) {
    args.push('-filter:a', audioFilters)
  } else {
    // No audio or very extreme — just copy
    args.push('-an')
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-y',
    outputPath
  )

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, args)
    let stderr = ''

    proc.stderr.on('data', (d) => {
      stderr += d.toString()
      // Parse progress from ffmpeg stderr
      const timeMatch = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/g)
      if (timeMatch && timeMatch.length > 0) {
        const last = timeMatch[timeMatch.length - 1]
        const m = last.match(/time=(\d+):(\d+):(\d+\.\d+)/)
        if (m) {
          const sec = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
          event.sender.send('render:progress', sec)
        }
      }
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}\n${stderr.slice(-500)}`))
      } else {
        resolve({ success: true, outputPath })
      }
    })

    proc.on('error', (e) => reject(new Error(`ffmpeg spawn error: ${e.message}`)))
  })
})

// --- IPC: Get ffmpeg path (for debugging) ---
ipcMain.handle('ffmpeg:path', () => {
  return { ffmpeg: ffmpegBin, ffprobe: ffprobeBin }
})

// --- Build atempo chain for audio speed ---
// atempo accepts 0.5..2.0. For values outside, chain multiple.
function buildAtempoChain(speed: number): string {
  if (speed <= 0 || !isFinite(speed)) return ''

  const filters: string[] = []
  let remaining = speed

  while (remaining > 2.0) {
    filters.push('atempo=2.0')
    remaining /= 2.0
  }

  while (remaining < 0.5) {
    filters.push('atempo=0.5')
    remaining /= 0.5
  }

  // Final adjustment within 0.5-2.0
  if (remaining >= 0.5 && remaining <= 2.0) {
    filters.push(`atempo=${remaining.toFixed(6)}`)
  }

  return filters.join(',')
}

// --- App lifecycle ---
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
