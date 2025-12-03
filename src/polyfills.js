import process from 'process/browser'
import { Buffer } from 'buffer'

window.process = process
window.Buffer = Buffer
window.global = window

// Mock TTY for logging libraries
if (!window.process.stdout) {
  window.process.stdout = { isTTY: false }
}
if (!window.process.stderr) {
  window.process.stderr = { isTTY: false }
}