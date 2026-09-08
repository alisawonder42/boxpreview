import assert from 'node:assert/strict'
import { createSignalClock, DEFAULT_CRT } from '../src/viewer/analogCRT.ts'

let seed = 42
const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296 }
const signal = createSignalClock(random)
let calm = 0, active = 0
for (let i = 0; i < 6000; i++) {
  const { envelope } = signal(i / 60, DEFAULT_CRT)
  assert.ok(envelope >= 0 && envelope <= 1)
  if (envelope < 0.01) calm++
  else active++
}
assert.ok(calm > active * 3, 'default timing remains calm for most frames')
assert.ok(active > 0, 'intermittent bursts actually occur')
const disabled = createSignalClock(() => 0.5)
for (let i = 0; i < 200; i++) assert.equal(disabled(i / 60, { ...DEFAULT_CRT, burstRate: 0 }).envelope, 0)
assert.equal(signal(101, DEFAULT_CRT, true).envelope, 0, 'reduced motion stops bursts')

const event = createSignalClock(() => 0)
event(0, DEFAULT_CRT)
event(0.1, DEFAULT_CRT)
assert.equal(event(0.14, DEFAULT_CRT).envelope, 1, 'attack reaches a held peak')
const release = event(0.4, DEFAULT_CRT).envelope
assert.ok(release > 0 && release < 1, 'burst settles rather than stopping abruptly')
console.log(`Analog signal checks passed; ${Math.round(calm / 60)} of 100 simulated seconds calm.`)
