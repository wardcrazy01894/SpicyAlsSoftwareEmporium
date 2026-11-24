// Spicy Al's Software Emporium — small progressive enhancements.
// The page is complete without this file; it adds the theme toggle, the
// "Surprise me" button and a per-browser "played today" marker.
;(function () {
  'use strict'

  var store = {
    get: function (k) {
      try {
        return localStorage.getItem(k)
      } catch (e) {
        return null
      }
    },
    set: function (k, v) {
      try {
        localStorage.setItem(k, v)
      } catch (e) {
        /* private mode: carry on without persistence */
      }
    },
    del: function (k) {
      try {
        localStorage.removeItem(k)
      } catch (e) {
        /* ignore */
      }
    },
  }

  // Controls that only work with JavaScript ship hidden; reveal them now.
  document.querySelectorAll('[data-needs-js]').forEach(function (el) {
    el.hidden = false
  })

  // ---- theme: auto -> light -> dark -> auto ----
  var root = document.documentElement
  var toggle = document.querySelector('[data-theme-toggle]')
  var icon = document.querySelector('[data-theme-icon]')
  var ICONS = { auto: '🌗', light: '☀️', dark: '🌙' }
  var NEXT = { auto: 'light', light: 'dark', dark: 'auto' }

  function currentTheme() {
    var t = root.dataset.theme
    return t === 'light' || t === 'dark' ? t : 'auto'
  }
  function paintTheme() {
    var t = currentTheme()
    if (icon) icon.textContent = ICONS[t]
    if (toggle) toggle.setAttribute('aria-label', 'Color theme: ' + t)
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var t = NEXT[currentTheme()]
      if (t === 'auto') {
        delete root.dataset.theme
        store.del('emporium:theme')
      } else {
        root.dataset.theme = t
        store.set('emporium:theme', t)
      }
      paintTheme()
    })
  }
  paintTheme()

  // ---- played today (local calendar day, this browser only) ----
  function todayKey() {
    var d = new Date()
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
  }
  var cards = Array.prototype.slice.call(document.querySelectorAll('.game-card'))
  var daily = cards.filter(function (c) {
    return c.hasAttribute('data-daily')
  })
  var tally = document.querySelector('[data-tally]')

  function paintPlayed() {
    var today = todayKey()
    var n = 0
    daily.forEach(function (card) {
      var played = store.get('emporium:played:' + card.dataset.slug) === today
      card.classList.toggle('is-played', played)
      if (played) n++
    })
    if (tally && daily.length) {
      tally.hidden = n === 0
      tally.textContent =
        n === daily.length
          ? '🔥 All ' + daily.length + ' dailies played today. See you tomorrow.'
          : "You've played " + n + ' of ' + daily.length + ' dailies today'
    }
  }
  function markPlayed(card) {
    if (!card || !card.hasAttribute('data-daily')) return
    store.set('emporium:played:' + card.dataset.slug, todayKey())
    paintPlayed()
  }
  cards.forEach(function (card) {
    card.querySelectorAll('[data-play]').forEach(function (a) {
      a.addEventListener('click', function () {
        markPlayed(card)
      })
    })
  })
  paintPlayed()
  // A tab left open overnight should clear yesterday's badges.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) paintPlayed()
  })

  // ---- surprise me: a random game, preferring dailies not yet played ----
  var random = document.querySelector('[data-random]')
  if (random) {
    random.addEventListener('click', function () {
      var fresh = daily.filter(function (c) {
        return !c.classList.contains('is-played')
      })
      var pool = fresh.length ? fresh : cards
      var card = pool[Math.floor(Math.random() * pool.length)]
      var link = card && card.querySelector('.key-go')
      if (!link) return
      markPlayed(card)
      window.open(link.href, '_blank', 'noopener')
    })
  }

  // ---- report a bug ----
  // Without this the footer link simply opens a blank GitHub issue. With it,
  // that link and the header's 🐛 button open a dialog that posts to the
  // emporium-bug worker, which files the issue; no GitHub account needed. If the worker is not configured or
  // not answering, the reporter is handed a prefilled GitHub issue instead.
  var bugLinks = document.querySelectorAll('[data-bug-report]')
  var bugLink = bugLinks[0]
  var bugDialog = document.querySelector('[data-bug-dialog]')
  if (bugLink && bugDialog && typeof bugDialog.showModal === 'function') {
    var bugForm = bugDialog.querySelector('[data-bug-form]')
    var bugDone = bugDialog.querySelector('[data-bug-done]')
    var bugDoneText = bugDialog.querySelector('[data-bug-done-text]')
    var bugDoneLink = bugDialog.querySelector('[data-bug-done-link]')
    var bugError = bugDialog.querySelector('[data-bug-error]')
    var bugFallback = bugDialog.querySelector('[data-bug-fallback]')
    var bugSend = bugDialog.querySelector('[data-bug-send]')
    var bugMessage = bugForm.elements.message
    var bugEndpoint = bugDialog.getAttribute('data-bug-endpoint')
    var newIssueUrl = bugLink.href
    var sending = false
    var attempt = 0 // bumped on close, so a late answer cannot touch a reopened form
    var aborter = null

    var bugContext = function () {
      if (!bugForm.elements.diagnostics.checked) return {}
      return { url: location.href, userAgent: navigator.userAgent }
    }
    // encodeURIComponent throws on half of a surrogate pair, which slicing can leave.
    var encode = function (s) {
      try {
        return encodeURIComponent(s)
      } catch (e) {
        return encodeURIComponent(s.slice(0, -1))
      }
    }
    // A GitHub "new issue" page with the report already typed in.
    var prefilledIssue = function (message) {
      var ctx = bugContext()
      var footer = ['', '---', 'URL: ' + (ctx.url || ''), 'Browser: ' + (ctx.userAgent || '')]
      // GitHub rejects an over-long URL, and non-Latin text grows ninefold when
      // encoded, so shorten the copy of the message until the link is safe.
      var text = message
      while (text.length > 200 && encode(text).length > 4000) {
        text = text.slice(0, Math.floor(text.length * 0.8))
      }
      return (
        newIssueUrl +
        '?title=' +
        encode('[bug] ' + message.split('\n')[0].slice(0, 80)) +
        '&body=' +
        encode([text].concat(footer).join('\n'))
      )
    }
    var showDone = function (text, linkText, href) {
      bugDoneText.textContent = text
      bugDoneLink.textContent = linkText
      bugDoneLink.parentNode.hidden = !href
      if (href) bugDoneLink.href = href
      bugForm.hidden = true
      bugDone.hidden = false
      bugMessage.value = ''
      // The focused Send button was just hidden; keep focus inside the dialog.
      bugDone.querySelector('[data-bug-close]').focus()
    }
    var setSending = function (on) {
      sending = on
      bugSend.disabled = on
      bugSend.textContent = on ? 'Sending…' : 'Send report'
    }

    bugLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault()
        bugForm.hidden = false
        bugDone.hidden = true
        bugError.hidden = true
        bugDialog.showModal()
        bugMessage.focus()
      })
    })
    bugDialog.querySelectorAll('[data-bug-close]').forEach(function (b) {
      b.addEventListener('click', function () {
        bugDialog.close()
      })
    })
    // Closing mid-send (Cancel or Esc) cancels the request where it can, and
    // disowns its answer either way.
    bugDialog.addEventListener('close', function () {
      attempt++
      if (aborter) aborter.abort()
      aborter = null
      setSending(false)
    })
    bugForm.addEventListener('submit', function (e) {
      e.preventDefault()
      if (sending) return
      var message = bugMessage.value.trim()
      if (!message) {
        // Only whitespace: empty the box so the browser's own "required" hint shows.
        bugMessage.value = ''
        bugMessage.focus()
        if (bugForm.reportValidity) bugForm.reportValidity()
        return
      }
      if (!bugEndpoint) {
        var url = prefilledIssue(message)
        window.open(url, '_blank', 'noopener')
        showDone(
          'Almost there: finish filing it on the GitHub page that just opened.',
          "Open it here if it didn't",
          url,
        )
        return
      }
      bugError.hidden = true
      setSending(true)
      var mine = attempt
      aborter = typeof AbortController === 'function' ? new AbortController() : null
      fetch(bugEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, context: bugContext() }),
        signal: aborter ? aborter.signal : undefined,
      })
        .then(function (r) {
          if (!r.ok) throw new Error('bug endpoint HTTP ' + r.status)
          return r.json()
        })
        .then(function (data) {
          if (mine !== attempt) return
          // Only link to what is really a GitHub issue.
          var issue = data && typeof data.url === 'string' ? data.url : ''
          showDone(
            'Your report was sent.',
            'View the issue',
            issue.indexOf('https://github.com/') === 0 ? issue : '',
          )
        })
        .catch(function () {
          if (mine !== attempt) return
          bugFallback.href = prefilledIssue(message)
          bugError.hidden = false
        })
        .then(function () {
          if (mine === attempt) setSending(false)
        })
    })
  }
})()
