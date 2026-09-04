<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <h1>🎬 СкоростьВидео</h1>
      <span class="version">v1.0.2</span>
      <button class="about-btn" @click="showAbout = true">ℹ</button>
    </header>

    <!-- About dialog -->
    <div v-if="showAbout" class="about-overlay" @click.self="showAbout = false">
      <div class="about-dialog">
        <div class="about-logo">🎬</div>
        <h2 class="about-title">СкоростьВидео V1</h2>
        <p class="about-subtitle">сохранение видео с другой выбранной скоростью</p>
        <hr class="about-divider" />
        <div class="about-info">
          <p><span class="about-label">Разработчик:</span> Андраник Алавердян (AndranikFutureLabs)</p>
          <p><span class="about-label">Поддержка:</span> @AndranikFutureLabs</p>
          <p><span class="about-label">Канал:</span> @AndranikFutureLabsChannel</p>
          <p><span class="about-label">Сайт:</span> <a href="https://andranik-future-labs.ru" @click.prevent="openLink">andranik-future-labs.ru</a></p>
          <p><span class="about-label">GitHub:</span> <a href="https://github.com/AndranikFutureLabs/SpeedVideo" @click.prevent="openLink">github.com/AndranikFutureLabs/SpeedVideo</a></p>
        </div>
        <hr class="about-divider" />
        <p class="about-copy">© 2026 AndranikFutureLabs</p>
        <button class="about-close" @click="showAbout = false">Закрыть</button>
      </div>
    </div>

    <!-- No video loaded -->
    <div v-if="!videoPath" class="drop-zone" @click="selectVideo">
      <div class="drop-content">
        <div class="drop-icon">📁</div>
        <p class="drop-title">Нажмите чтобы выбрать видео</p>
        <p class="drop-subtitle">MP4, AVI, MKV, MOV, WebM, FLV, WMV</p>
      </div>
    </div>

    <!-- Video loaded -->
    <div v-else class="player-section">
      <!-- Video player -->
      <div class="video-wrap" ref="videoWrapEl" @wheel.prevent="onWheel">
        <video
          ref="videoEl"
          :src="videoUrl"
          @loadedmetadata="onVideoLoaded"
          class="video-player"
          controls
          @ratechange="onRateChange"
        ></video>
      </div>

      <!-- Speed control panel -->
      <div class="controls">
        <div class="speed-display">
          <span class="speed-value">{{ speedPct.toFixed(0) }}%</span>
          <span class="speed-label">скорость воспроизведения</span>
        </div>

        <!-- Slider -->
        <div class="slider-wrap">
          <input
            type="range"
            min="10"
            max="300"
            step="1"
            v-model.number="speedPct"
            class="slider"
            @input="onSpeedChange"
          />
          <div class="slider-labels">
            <span>10%</span>
            <span>50%</span>
            <span>100%</span>
            <span>200%</span>
            <span>300%</span>
          </div>
        </div>

        <!-- Quick presets -->
        <div class="presets">
          <button @click="setSpeed(25)" :class="{ active: speedPct === 25 }">0.25×</button>
          <button @click="setSpeed(50)" :class="{ active: speedPct === 50 }">0.5×</button>
          <button @click="setSpeed(75)" :class="{ active: speedPct === 75 }">0.75×</button>
          <button @click="setSpeed(100)" :class="{ active: speedPct === 100 }">1×</button>
          <button @click="setSpeed(150)" :class="{ active: speedPct === 150 }">1.5×</button>
          <button @click="setSpeed(200)" :class="{ active: speedPct === 200 }">2×</button>
          <button @click="setSpeed(300)" :class="{ active: speedPct === 300 }">3×</button>
        </div>

        <!-- Scroll hint -->
        <div class="scroll-hint">
          💡 <strong>Скрол</strong> над видео = менять скорость. Shift+скрол = точная настройка (±1%).
        </div>

        <!-- Actions -->
        <div class="actions">
          <button class="btn-secondary" @click="selectVideo">
            📂 Другое видео
          </button>
          <button class="btn-primary" @click="saveVideo" :disabled="rendering">
            {{ rendering ? '⏳ Рендеринг...' : '💾 Сохранить с этой скоростью' }}
          </button>
        </div>

        <!-- Render progress -->
        <div v-if="rendering" class="progress-bar">
          <div class="progress-fill" :style="{ width: renderProgressPct + '%' }"></div>
          <span class="progress-text">{{ renderStatusText }}</span>
        </div>

        <!-- Result -->
        <div v-if="renderResult" class="result" :class="{ error: renderResult.error }">
          {{ renderResult.message }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const showAbout = ref(false)
const videoPath = ref<string | null>(null)
const videoUrl = ref<string>('')
const videoEl = ref<HTMLVideoElement | null>(null)
const videoWrapEl = ref<HTMLElement | null>(null)
const speedPct = ref<number>(100)
const videoDuration = ref<number>(0)

const rendering = ref(false)
const renderProgressSec = ref(0)
const renderResult = ref<{ message: string; error?: boolean } | null>(null)

const renderProgressPct = computed(() => {
  if (videoDuration.value <= 0) return 0
  const pct = (renderProgressSec.value / (videoDuration.value / (speedPct.value / 100))) * 100
  return Math.min(100, Math.max(0, pct))
})

const renderStatusText = computed(() => {
  if (renderProgressPct.value > 0) {
    return `Рендеринг: ${renderProgressPct.value.toFixed(1)}%`
  }
  return 'Рендеринг...'
})

// API from preload
declare global {
  interface Window {
    api: {
      openVideo: () => Promise<string | null>
      getVideoUrl: (filePath: string) => Promise<string>
      openExternal: (url: string) => Promise<void>
      saveVideo: (defaultName: string) => Promise<string | null>
      probeVideo: (filePath: string) => Promise<{ duration: number }>
      renderVideo: (inputPath: string, outputPath: string, speedPct: number) => Promise<{ success: boolean; outputPath: string }>
      getFfmpegPath: () => Promise<{ ffmpeg: string; ffprobe: string }>
      onRenderProgress: (callback: (sec: number) => void) => void
    }
  }
}

function openLink(e: MouseEvent) {
  e.preventDefault()
  const href = (e.currentTarget as HTMLAnchorElement).href
  if (href) window.api.openExternal(href)
}

// --- Select video ---
async function selectVideo() {
  const path = await window.api.openVideo()
  if (!path) return
  videoPath.value = path
  // Get proper file:// URL via main process (handles Windows paths)
  const url = await window.api.getVideoUrl(path)
  videoUrl.value = url
  speedPct.value = 100
  renderResult.value = null
  renderProgressSec.value = 0
}

// --- Video loaded ---
async function onVideoLoaded() {
  if (videoEl.value) {
    videoDuration.value = videoEl.value.duration
  }
  // Probe for accurate duration (for render progress)
  if (videoPath.value) {
    try {
      const info = await window.api.probeVideo(videoPath.value)
      videoDuration.value = info.duration
    } catch (e) {
      // fallback to video element duration
    }
  }
}

// --- Speed change from slider ---
function onSpeedChange() {
  if (videoEl.value) {
    videoEl.value.playbackRate = speedPct.value / 100
  }
}

// --- Preset buttons ---
function setSpeed(pct: number) {
  speedPct.value = pct
  if (videoEl.value) {
    videoEl.value.playbackRate = pct / 100
  }
}

// --- Rate change from video element (e.g. browser menu) ---
function onRateChange() {
  if (videoEl.value) {
    const rate = videoEl.value.playbackRate
    speedPct.value = Math.round(rate * 100)
  }
}

// --- Scroll over video = change speed ---
function onWheel(e: WheelEvent) {
  if (!videoPath.value || rendering.value) return
  e.preventDefault()
  const step = e.shiftKey ? 1 : 5
  const delta = e.deltaY < 0 ? step : -step
  speedPct.value = Math.min(300, Math.max(10, speedPct.value + delta))
  if (videoEl.value) {
    videoEl.value.playbackRate = speedPct.value / 100
  }
}

// --- Save video with chosen speed ---
async function saveVideo() {
  if (!videoPath.value) return
  renderResult.value = null
  rendering.value = true
  renderProgressSec.value = 0

  // Generate default name: original_name_150pct.mp4
  const origName = videoPath.value.replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '')
  const defaultName = `${origName}_${speedPct.value}pct.mp4`

  const outputPath = await window.api.saveVideo(defaultName)
  if (!outputPath) {
    rendering.value = false
    return
  }

  try {
    const result = await window.api.renderVideo(videoPath.value, outputPath, speedPct.value)
    rendering.value = false
    renderResult.value = {
      message: `✅ Видео сохранено: ${result.outputPath}`,
    }
  } catch (e: any) {
    rendering.value = false
    renderResult.value = {
      message: `❌ Ошибка: ${e.message || e}`,
      error: true,
    }
  }
}

// --- Mount ---
// (wheel listener is attached via @wheel.prevent on videoWrapEl in template)
</script>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  background: #1a1a2e;
  border-bottom: 1px solid #0be0b833;
}
.header h1 {
  font-size: 22px;
  margin: 0;
  color: #0be0b8;
}
.version {
  font-size: 12px;
  color: #888;
}
.drop-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  margin: 24px;
  border: 2px dashed #0be0b855;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.drop-zone:hover {
  border-color: #0be0b8;
  background: #0be0b808;
}
.drop-content {
  text-align: center;
}
.drop-icon {
  font-size: 64px;
  margin-bottom: 16px;
}
.drop-title {
  font-size: 20px;
  color: #e0e0e0;
  margin: 0 0 8px 0;
}
.drop-subtitle {
  font-size: 14px;
  color: #888;
  margin: 0;
}
.player-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}
.video-wrap {
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  max-height: 500px;
  display: flex;
  justify-content: center;
}
.video-player {
  max-width: 100%;
  max-height: 500px;
}
.controls {
  background: #1a1a2e;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.speed-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.speed-value {
  font-size: 48px;
  font-weight: 700;
  color: #0be0b8;
  font-family: 'Courier New', monospace;
  line-height: 1;
}
.speed-label {
  font-size: 14px;
  color: #888;
}
.slider-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.slider {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(to right, #0be0b833, #0be0b866, #0be0b833);
  outline: none;
  cursor: pointer;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #0be0b8;
  cursor: pointer;
  border: 3px solid #1a1a2e;
  box-shadow: 0 0 8px #0be0b8;
}
.slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #0be0b8;
  cursor: pointer;
  border: 3px solid #1a1a2e;
}
.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #666;
  padding: 0 2px;
}
.presets {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
.presets button {
  padding: 8px 16px;
  border: 1px solid #333;
  background: #161628;
  color: #ccc;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}
.presets button:hover {
  border-color: #0be0b8;
  color: #0be0b8;
}
.presets button.active {
  background: #0be0b822;
  border-color: #0be0b8;
  color: #0be0b8;
}
.scroll-hint {
  font-size: 13px;
  color: #888;
  text-align: center;
  padding: 8px 0;
}
.scroll-hint strong {
  color: #0be0b8;
}
.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.btn-secondary {
  padding: 12px 24px;
  border: 1px solid #444;
  background: #222;
  color: #ccc;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  transition: all 0.15s;
}
.btn-secondary:hover {
  border-color: #666;
}
.btn-primary {
  padding: 12px 24px;
  border: none;
  background: #0be0b8;
  color: #1a1a2e;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  transition: all 0.15s;
}
.btn-primary:hover {
  background: #0bd0a8;
  box-shadow: 0 0 12px #0be0b866;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.progress-bar {
  position: relative;
  height: 30px;
  background: #111;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #333;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0be0b8, #0bd0a8);
  transition: width 0.3s;
  border-radius: 8px 0 0 8px;
}
.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 13px;
  color: #fff;
  font-weight: 500;
}
.result {
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  background: #0be0b822;
  border: 1px solid #0be0b844;
  color: #0be0b8;
  word-break: break-all;
}
.result.error {
  background: #ff444422;
  border-color: #ff444444;
  color: #ff6666;
}

/* About dialog */
.about-btn {
  margin-left: auto;
  width: 32px;
  height: 32px;
  border: 1px solid #333;
  background: #161628;
  color: #0be0b8;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.about-btn:hover {
  border-color: #0be0b8;
  box-shadow: 0 0 8px #0be0b844;
}
.about-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.about-dialog {
  background: #1a1a2e;
  border: 1px solid #0be0b844;
  border-radius: 16px;
  padding: 32px 40px;
  max-width: 420px;
  width: 90%;
  text-align: center;
  box-shadow: 0 0 40px #0be0b822;
}
.about-logo {
  font-size: 48px;
  margin-bottom: 12px;
}
.about-title {
  font-size: 24px;
  color: #0be0b8;
  margin: 0 0 4px 0;
}
.about-subtitle {
  font-size: 14px;
  color: #888;
  margin: 0 0 20px 0;
}
.about-divider {
  border: none;
  border-top: 1px solid #222;
  margin: 16px 0;
}
.about-info {
  text-align: left;
  font-size: 14px;
  line-height: 2;
  color: #ccc;
}
.about-info p {
  margin: 0;
}
.about-label {
  color: #666;
  display: inline-block;
  width: 110px;
}
.about-info a {
  color: #0be0b8;
  text-decoration: none;
}
.about-info a:hover {
  text-decoration: underline;
}
.about-copy {
  font-size: 12px;
  color: #555;
  margin: 8px 0 16px 0;
}
.about-close {
  padding: 10px 32px;
  border: none;
  background: #0be0b8;
  color: #1a1a2e;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  transition: all 0.15s;
}
.about-close:hover {
  background: #0bd0a8;
  box-shadow: 0 0 12px #0be0b866;
}
</style>
