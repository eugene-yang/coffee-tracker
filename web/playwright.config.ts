import { defineConfig, devices } from '@playwright/test'

const PORT = 8765

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1, // tests share one server and database
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Real server + built frontend, fresh database each run
    command: `cd ../server && rm -rf .e2e-data && COFFEE_DATA_DIR=.e2e-data COFFEE_WEB_DIR=../web/dist COFFEE_EXTRACTION=fake COFFEE_EXTRACTION_SETTLE_S=1 COFFEE_EXTRACTION_POLL_S=0.5 uv run uvicorn app.main:app --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
  },
})
