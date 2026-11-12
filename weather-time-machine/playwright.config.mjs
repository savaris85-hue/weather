import {defineConfig} from "@playwright/test";
export default defineConfig({
  testDir:".",
  testMatch:"browser.spec.mjs",
  timeout:60000,
  expect:{timeout:30000},
  workers:1,
  retries:0,
  reporter:[["list"]],
  outputDir:"./test-results",
  use:{
    baseURL:"http://127.0.0.1:4173",
    browserName:"chromium",
    viewport:{width:1600,height:1050},
    screenshot:"only-on-failure",
    trace:"retain-on-failure"
  },
  webServer:{
    command:"python3 -m http.server 4173 --bind 127.0.0.1",
    url:"http://127.0.0.1:4173/weather-time-machine/",
    reuseExistingServer:!process.env.CI,
    timeout:20000
  }
});
