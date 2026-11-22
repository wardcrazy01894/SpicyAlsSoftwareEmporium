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
})()
