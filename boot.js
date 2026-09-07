/* GitHub still Jekyll-deploys the repo root after the Vite Pages job.
   That leftover page points at /src/main.ts, which never runs, so the
   footer stays on "Looking for a scan…". Boot the last committed bundle instead. */
;(function () {
  function already() {
    return Boolean(window.__BOXPREVIEW_BOOTED)
  }

  function hasBuiltEntry() {
    const scripts = document.querySelectorAll('script[src]')
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].getAttribute('src') || ''
      if (src.indexOf('assets/viewer.js') !== -1) return true
    }
    return false
  }

  function boot() {
    if (already() || hasBuiltEntry() || document.querySelector('script[data-boxpreview-boot]')) return
    if (!document.querySelector('link[data-boxpreview-style]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = new URL('./assets/style.css', document.baseURI).href
      link.dataset.boxpreviewStyle = '1'
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.type = 'module'
    script.dataset.boxpreviewBoot = '1'
    script.src = new URL('./assets/viewer.js', document.baseURI).href
    document.head.appendChild(script)
  }

  window.addEventListener('error', function (event) {
    const file = event.filename || ''
    if (file.indexOf('main.ts') !== -1) boot()
  })

  const entry = document.querySelector('script[src*="main.ts"]')
  if (entry) entry.addEventListener('error', boot)

  window.setTimeout(function () {
    if (!already() && !hasBuiltEntry()) boot()
  }, 800)
})()
