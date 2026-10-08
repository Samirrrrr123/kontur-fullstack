import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
process.chdir(resolve(fileURLToPath(new URL('..', import.meta.url))))
const port = process.env.PORT || 3000
const address = `http://127.0.0.1:${port}`
async function healthy() {
  try { const response = await fetch(address + '/api/health', { signal: AbortSignal.timeout(1000) }); return response.ok && (await response.json()).status === 'ok' } catch { return false }
}
const open = () => { if (process.platform === 'win32') spawn('cmd.exe', ['/c', 'start', '', address], { windowsHide: true, stdio: 'ignore' }) }
if (await healthy()) { open(); console.log(`Контур уже запущен: ${address}`) }
else {
  await import('../backend/server.js')
  for (let i = 0; i < 20; i++) { if (await healthy()) { open(); break } await new Promise(resolve => setTimeout(resolve, 250)) }
  console.log('Не закрывайте это окно во время показа сайта. Для остановки нажмите Ctrl+C.')
}
