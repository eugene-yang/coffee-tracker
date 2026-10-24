import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initDb, setActor } from './lib/db/local'
import { device } from './lib/state/device.svelte'
import { startRouter } from './lib/state/router.svelte'
import { startSync } from './lib/state/sync.svelte'

initDb()
setActor(() => device.userId)
// Ask the browser not to evict local data (installed Home Screen apps are exempt anyway)
navigator.storage?.persist?.().catch(() => {})
startRouter()
startSync()

export default mount(App, { target: document.getElementById('app')! })
