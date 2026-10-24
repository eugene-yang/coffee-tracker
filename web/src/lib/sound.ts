// Short beeps for timer cues. iOS only plays audio after a user gesture, so unlock() runs on the Start tap.
let ctx: AudioContext | null = null

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
  } catch {
    ctx = null
  }
}

export function beep(times = 1, freq = 880): void {
  if (!ctx) return
  for (let i = 0; i < times; i++) {
    const t = ctx.currentTime + i * 0.22
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.16)
  }
}
