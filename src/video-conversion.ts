import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'

export const convertVideoToMp4 = async (file: File): Promise<File> => {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const ffmpeg = new FFmpeg()
  const inputPath = `input-${crypto.randomUUID()}.mkv`
  const outputPath = `output-${crypto.randomUUID()}.mp4`
  const log: string[] = []
  const collectLog = ({ message }: { message: string }) => {
    log.push(message)
    if (log.length > 8) log.shift()
  }

  ffmpeg.on('log', collectLog)
  try {
    await ffmpeg.load({ coreURL, wasmURL })
    await ffmpeg.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()))
    const exitCode = await ffmpeg.exec([
      '-i', inputPath,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath,
    ])
    if (exitCode !== 0) {
      const details = log.slice(-3).join(' ').trim()
      throw new Error(details || 'FFmpeg could not decode or convert this video.')
    }

    const output = await ffmpeg.readFile(outputPath)
    if (typeof output === 'string' || output.byteLength === 0) {
      throw new Error('FFmpeg produced an empty MP4 file.')
    }
    return new File([output], file.name.replace(/\.mkv$/i, '.mp4'), {
      type: 'video/mp4',
      lastModified: file.lastModified,
    })
  } finally {
    ffmpeg.off('log', collectLog)
    ffmpeg.terminate()
  }
}
