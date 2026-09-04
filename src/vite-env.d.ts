/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

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
