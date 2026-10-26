import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { setActor } from './lib/db/local'
import { device } from './lib/state/device.svelte'
import { startRouter } from './lib/state/router.svelte'
import { startSync, syncFasterWhile } from './lib/state/sync.svelte'
import { bags, extractions } from './lib/state/live.svelte'
import { refreshPushOwner } from './lib/push'

setActor(() => device.userId)
// Ask the browser not to evict local data (installed Home Screen apps are exempt anyway)
navigator.storage?.persist?.().catch(() => {})
startRouter()
startSync()
refreshPushOwner(device.userId)
syncFasterWhile(() =>
  bags.rows.some((b) => b.review_state === 'needs_review' && !['done', 'error'].includes(extractions.get(b.id)?.status ?? '')),
)

export default mount(App, { target: document.getElementById('app')! })
