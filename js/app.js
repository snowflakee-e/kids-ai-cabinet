'use strict';

var STORAGE_KEY = 'bloop-cabinet-v1';
var REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

var $ = function (sel, root) { return (root || document).querySelector(sel); };
var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

function esc(text) {
  return String(text).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

function shuffle(list) {
  var a = list.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

var app = {
  state: null,
  quiz: null,

  init: function () {
    this.state = this.load();
    this.bind();
    if (this.state) {
      this.render();
    } else {
      this.state = Game.newState();
      this.render();
      this.openWelcome();
    }
  },

  // ---------- Хранилище ----------
  load: function () {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? Object.assign(Game.newState(), JSON.parse(raw)) : null;
    } catch (e) {
      return null;
    }
  },

  save: function () {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch (e) { /* без хранилища прогресс живёт до перезагрузки */ }
  },

  bobik: function (pose, palette) {
    return renderBobik(pose, PALETTES[palette || this.state.palette]);
  },

  today: function () { return Game.dayKey(); },

  // ---------- Главный экран ----------
  render: function () {
    var s = this.state;
    var lvl = Game.levelFor(s.xp);
    var st = Game.stats(s);

    $('#logo-bobik').innerHTML = this.bobik('neutral');
    if (!this.petting) $('#hero-bobik').innerHTML = this.bobik(st.lessonsDone ? 'joy' : 'hello');
    $('#chip-name').textContent = s.name;
    $('#chip-level').textContent = 'Lv ' + lvl.level;
    $('#hello').textContent = 'Hi, ' + s.name + '!';
    $('#level-title').textContent = 'Level ' + lvl.level + ' · ' + lvl.title;
    $('#level-badge').textContent = lvl.level;
    $('#xp-fill').style.width = Math.round(lvl.progress * 100) + '%';
    $('#xpbar').setAttribute('aria-valuenow', Math.round(lvl.progress * 100));
    $('#xp-text').textContent = lvl.to ? (s.xp + ' / ' + lvl.to + ' XP') : (s.xp + ' XP · max level');
    $('#chip-streak').textContent = Game.currentStreak(s, this.today());
    $('#chip-stars').textContent = st.stars;
    $('#chip-courses').textContent = st.coursesDone + '/' + COURSES.length;

    this.renderStats(st);
    this.renderCourses();
    this.renderBadges();
    this.renderDaily();
    this.renderWeek();
    this.renderSwatches();
  },

  renderStats: function (st) {
    var s = this.state;
    var tiles = [
      ['💎', s.xp, 'total XP'],
      ['🎯', s.answered ? Math.round(st.accuracy * 100) + '%' : '—', 'correct answers'],
      ['📚', st.lessonsDone, 'lessons passed'],
      ['🔥', s.bestCombo, 'best answer streak']
    ];
    $('#stats').innerHTML = tiles.map(function (t) {
      return '<div class="stat"><span class="stat__icon" aria-hidden="true">' + t[0] + '</span>' +
        '<b class="stat__value">' + t[1] + '</b><span class="stat__label">' + t[2] + '</span></div>';
    }).join('');
  },

  renderCourses: function () {
    var self = this, s = this.state;
    $('#course-list').innerHTML = COURSES.map(function (c) {
      var cs = Game.courseStatus(s, c);
      var nodes = c.lessons.map(function (l, i) {
        var rec = s.lessons[l.id];
        var stars = rec ? rec.stars : 0;
        var unlocked = Game.isLessonUnlocked(s, c, i);
        var current = unlocked && stars === 0;
        var cls = stars > 0 ? 'is-done' : current ? 'is-current' : 'is-locked';
        var icon = stars > 0 ? (stars === 3 ? '👑' : '✓') : unlocked ? (i + 1) : '🔒';
        var label = l.title + (stars ? ', ' + stars + ' of 3 stars' : unlocked ? ', ready to start' : ', locked');
        return '<li class="node ' + cls + '">' +
          '<button type="button" class="node__btn" data-course="' + c.id + '" data-lesson="' + i + '"' +
          (unlocked ? '' : ' disabled') + ' aria-label="' + esc(label) + '">' + icon + '</button>' +
          '<span class="node__stars" aria-hidden="true">' + self.starIcons(stars) + '</span>' +
          '<span class="node__title">' + esc(l.title) + '</span></li>';
      }).join('');

      var action = cs.done
        ? '<span class="course__done">🎓 Completed</span>'
        : '<button class="btn btn--primary" type="button" data-course="' + c.id + '" data-lesson="' + cs.nextLesson + '">' +
          (cs.passed ? 'Continue' : 'Start') + '</button>';

      return '<article class="course' + (cs.done ? ' is-complete' : '') + '">' +
        '<div class="course__head">' +
          '<div class="course__thumb" style="--thumb:' + c.thumb + '">' + self.bobik(cs.done ? 'victory' : c.pose, c.palette) + '</div>' +
          '<div class="course__info">' +
            '<span class="course__age">' + c.age + '</span>' +
            '<h3>' + esc(c.title) + '</h3>' +
            '<div class="course__meta"><span>' + cs.passed + '/' + cs.total + ' lessons</span><span>⭐ ' + cs.stars + '/' + cs.maxStars + '</span></div>' +
            '<div class="bar"><div class="bar__fill" style="width:' + Math.round(cs.progress * 100) + '%"></div></div>' +
          '</div>' +
          '<div class="course__action">' + action + '</div>' +
        '</div>' +
        '<ol class="path">' + nodes + '</ol>' +
      '</article>';
    }).join('');
  },

  starIcons: function (n) {
    var out = '';
    for (var i = 0; i < 3; i++) out += '<i class="' + (i < n ? 'on' : '') + '">★</i>';
    return out;
  },

  renderBadges: function () {
    var s = this.state, got = 0;
    $('#badge-list').innerHTML = ACHIEVEMENTS.map(function (a) {
      var date = s.achievements[a.id];
      if (date) got++;
      return '<div class="badge' + (date ? '' : ' is-locked') + '">' +
        '<span class="badge__icon" aria-hidden="true">' + a.icon + '</span>' +
        '<h3>' + a.title + '</h3><p>' + a.desc + '</p>' +
        '<span class="sr-only">' + (date ? 'Unlocked' : 'Locked') + '</span></div>';
    }).join('');
    $('#badge-count').textContent = got + '/' + ACHIEVEMENTS.length;
  },

  renderDaily: function () {
    var xp = this.state.xpByDay[this.today()] || 0;
    var p = Math.min(1, xp / DAILY_GOAL);
    var len = 2 * Math.PI * 50;
    var ring = $('#ring-fill');
    ring.style.strokeDasharray = len;
    ring.style.strokeDashoffset = len * (1 - p);
    $('#daily-xp').textContent = xp;
    $('#daily-goal').textContent = '/ ' + DAILY_GOAL + ' XP';
    $('#daily-note').textContent = p >= 1 ? 'Goal reached! Bobik is proud of you 🎉' : (DAILY_GOAL - xp) + ' XP to reach today’s goal';
    $('.daily').classList.toggle('is-done', p >= 1);
  },

  renderWeek: function () {
    var today = this.today();
    var week = Game.weekXp(this.state, today, 7);
    var max = Math.max(DAILY_GOAL, Math.max.apply(null, week.map(function (d) { return d.xp; })));
    var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    $('#week').innerHTML = week.map(function (d) {
      var p = d.day.split('-').map(Number);
      var name = names[new Date(p[0], p[1] - 1, p[2]).getDay()];
      return '<div class="week__col' + (d.day === today ? ' is-today' : '') + '">' +
        '<span class="week__xp">' + (d.xp || '') + '</span>' +
        '<div class="week__bar"><div style="height:' + Math.round(d.xp / max * 100) + '%"></div></div>' +
        '<span class="week__day">' + name + '</span></div>';
    }).join('');
  },

  renderSwatches: function () {
    var pal = this.state.palette;
    $$('.swatch').forEach(function (sw) { sw.setAttribute('aria-checked', String(sw.dataset.palette === pal)); });
  },

  // ---------- Знакомство и настройки ----------
  openWelcome: function () {
    var dlg = $('#welcome');
    var form = $('#welcome-form');
    form.elements.name.value = this.state.lessons && Object.keys(this.state.lessons).length ? this.state.name : '';
    $('#welcome-bobik').innerHTML = this.bobik('hello');
    if (!dlg.open) dlg.showModal();
  },

  setPalette: function (name) {
    this.state.palette = name;
    this.save();
    this.render();
    if ($('#welcome').open) $('#welcome-bobik').innerHTML = this.bobik('delight');
  },

  resetProgress: function () {
    if (!window.confirm('Reset all XP, stars and badges? This cannot be undone.')) return;
    var keep = this.state;
    this.state = Game.newState(keep.name, keep.palette);
    this.save();
    this.render();
    this.toast('🔄', 'Progress reset', 'A fresh start with Bobik!');
  },

  // ---------- Урок ----------
  startLesson: function (courseId, index) {
    var course = Game.findCourse(courseId);
    if (!course || !Game.isLessonUnlocked(this.state, course, index)) return;
    var lesson = course.lessons[index];
    this.quiz = {
      course: course,
      index: index,
      lesson: lesson,
      questions: lesson.questions.map(function (q) {
        return {
          q: q.q, explain: q.explain,
          options: shuffle(q.options.map(function (text, k) { return { text: text, correct: k === 0 }; }))
        };
      }),
      i: 0,
      answers: [],
      combo: 0,
      answered: false
    };
    this.renderQuestion();
    var dlg = $('#quiz');
    if (!dlg.open) dlg.showModal();
  },

  quizTop: function () {
    var qz = this.quiz;
    var segs = qz.questions.map(function (_, k) {
      var cls = k < qz.answers.length ? (qz.answers[k] ? 'ok' : 'bad') : k === qz.i ? 'cur' : '';
      return '<span class="' + cls + '"></span>';
    }).join('');
    return '<div class="quiz__top">' +
      '<button class="quiz__close" type="button" data-quiz="close" aria-label="Leave lesson">✕</button>' +
      '<div class="quiz__progress" aria-label="Question ' + (qz.i + 1) + ' of ' + qz.questions.length + '">' + segs + '</div>' +
      '<span class="quiz__combo' + (qz.combo >= 2 ? ' is-on' : '') + '">🔥 ' + qz.combo + '</span>' +
    '</div>';
  },

  renderQuestion: function () {
    var qz = this.quiz, q = qz.questions[qz.i];
    qz.answered = false;
    $('#quiz-inner').innerHTML = this.quizTop() +
      '<p class="quiz__lesson">' + esc(qz.course.title) + ' · ' + esc(qz.lesson.title) + '</p>' +
      '<div class="quiz__ask">' +
        '<div class="quiz__bot" id="quiz-bobik">' + this.bobik('think') + '</div>' +
        '<h2 class="quiz__q" id="quiz-title">' + esc(q.q) + '</h2>' +
      '</div>' +
      '<div class="options" role="group" aria-label="Answers">' +
        q.options.map(function (o, k) {
          return '<button type="button" class="option" data-option="' + k + '">' +
            '<span class="option__key">' + (k + 1) + '</span><span>' + esc(o.text) + '</span></button>';
        }).join('') +
      '</div>' +
      '<div class="feedback" id="feedback" aria-live="polite"></div>';
    var first = $('.option', $('#quiz-inner'));
    if (first) first.focus();
  },

  answer: function (k) {
    var qz = this.quiz;
    if (!qz || qz.answered) return;
    qz.answered = true;
    var q = qz.questions[qz.i];
    var ok = q.options[k].correct;
    qz.answers.push(ok);
    qz.combo = ok ? qz.combo + 1 : 0;

    $$('.option', $('#quiz-inner')).forEach(function (btn, idx) {
      btn.disabled = true;
      if (q.options[idx].correct) btn.classList.add('is-correct');
      else if (idx === k) btn.classList.add('is-wrong');
    });

    var xp = ok ? XP_RULES.correct + (qz.combo >= XP_RULES.comboFrom ? XP_RULES.combo : 0) : 0;
    var praise = ['Great job!', 'Awesome!', 'You got it!', 'Super smart!', 'Brilliant!'];
    var title = ok ? praise[Math.floor(Math.random() * praise.length)] : 'Not quite!';
    var comboLine = ok && qz.combo >= XP_RULES.comboFrom ? '<span class="feedback__combo">🔥 ' + qz.combo + ' in a row! +' + XP_RULES.combo + ' bonus</span>' : '';
    var last = qz.i === qz.questions.length - 1;

    $('#quiz-bobik').innerHTML = this.bobik(ok ? (qz.combo >= 3 ? 'delight' : 'joy') : 'sad');
    $('#quiz-inner').querySelector('.quiz__top').outerHTML = this.quizTop();
    var fb = $('#feedback');
    fb.className = 'feedback is-shown ' + (ok ? 'is-ok' : 'is-bad');
    fb.innerHTML =
      '<div class="feedback__text">' +
        '<b>' + title + (xp ? ' <span class="feedback__xp">+' + xp + ' XP</span>' : '') + '</b>' +
        comboLine +
        '<p>' + esc(q.explain) + '</p>' +
      '</div>' +
      '<button class="btn ' + (ok ? 'btn--green' : 'btn--primary') + '" type="button" data-quiz="next">' + (last ? 'See results' : 'Next') + '</button>';
    $('[data-quiz="next"]').focus();
  },

  next: function () {
    var qz = this.quiz;
    if (!qz || !qz.answered) return;
    if (qz.i < qz.questions.length - 1) {
      qz.i++;
      this.renderQuestion();
    } else {
      this.finish();
    }
  },

  finish: function () {
    var qz = this.quiz;
    var r = Game.applyLesson(this.state, qz.course.id, qz.lesson.id, qz.answers, this.today());
    this.state = r.state;
    this.save();
    qz.result = r;
    qz.done = true;

    var x = r.xp;
    var pose = r.stars === 3 ? 'victory' : r.stars > 0 ? 'joy' : 'sad';
    var heading = r.stars === 3 ? 'Perfect lesson!' : r.stars > 0 ? 'Lesson passed!' : 'Almost there!';
    var sub = r.stars > 0
      ? x.correct + ' of ' + qz.answers.length + ' answers right'
      : 'Get at least ' + Math.ceil(qz.answers.length / 2) + ' right to pass. You can do it!';

    var rows = [
      ['Correct answers', x.base],
      ['Answer streak bonus', x.combo],
      ['Lesson passed', x.done],
      ['Perfect lesson', x.perfect]
    ].filter(function (row) { return row[1] > 0; });

    var breakdown = rows.map(function (row) { return '<li><span>' + row[0] + '</span><b>+' + row[1] + '</b></li>'; }).join('');
    if (r.isReplay && r.lessonEarned < x.total) {
      breakdown += '<li class="muted"><span>Already earned before</span><b>−' + (x.total - r.lessonEarned) + '</b></li>';
    }
    if (r.courseBonus) breakdown += '<li class="hot"><span>🎓 Course completed!</span><b>+' + r.courseBonus + '</b></li>';

    var extras = '';
    if (r.levelUp) {
      extras += '<div class="levelup">⬆️ <b>Level ' + r.levelUp.level + '!</b> You are now a ' + r.levelUp.title + '</div>';
    }
    if (r.unlocked.length) {
      extras += '<div class="unlocked"><p>New badges</p>' + r.unlocked.map(function (a) {
        return '<span class="unlocked__badge"><span aria-hidden="true">' + a.icon + '</span> ' + a.title + '</span>';
      }).join('') + '</div>';
    }

    var hasNext = qz.index + 1 < qz.course.lessons.length && Game.isLessonUnlocked(this.state, qz.course, qz.index + 1);
    var mainBtn = r.stars > 0 && hasNext
      ? '<button class="btn btn--primary" type="button" data-quiz="next-lesson">Next lesson →</button>'
      : r.stars > 0
        ? '<button class="btn btn--primary" type="button" data-quiz="close">Back to cabinet</button>'
        : '<button class="btn btn--primary" type="button" data-quiz="retry">Try again</button>';
    var secondBtn = r.stars > 0
      ? '<button class="btn btn--white" type="button" data-quiz="retry">Play again</button>'
      : '<button class="btn btn--white" type="button" data-quiz="close">Back to cabinet</button>';

    $('#quiz-inner').innerHTML =
      '<div class="quiz__top"><button class="quiz__close" type="button" data-quiz="close" aria-label="Close">✕</button></div>' +
      '<div class="result">' +
        '<div class="result__bot">' + this.bobik(pose) + '</div>' +
        '<div class="result__stars" aria-label="' + r.stars + ' of 3 stars">' + this.starIcons(r.stars) + '</div>' +
        '<h2 id="quiz-title">' + heading + '</h2>' +
        '<p class="result__sub">' + sub + '</p>' +
        '<div class="result__xp"><span>+' + r.earned + '</span> XP</div>' +
        (breakdown ? '<ul class="breakdown">' + breakdown + '</ul>' : '') +
        extras +
        '<div class="result__actions">' + secondBtn + mainBtn + '</div>' +
      '</div>';

    if (r.stars >= 2 || r.levelUp) this.confetti();
    this.render();
  },

  closeQuiz: function () {
    var qz = this.quiz;
    if (qz && !qz.done && qz.answers.length && !window.confirm('Leave the lesson? Your answers in this lesson will not be saved.')) return;
    var unlocked = qz && qz.result ? qz.result.unlocked : [];
    $('#quiz').close();
    this.quiz = null;
    var self = this;
    unlocked.forEach(function (a, i) {
      setTimeout(function () { self.toast(a.icon, 'Badge unlocked!', a.title); }, 300 + i * 600);
    });
  },

  // ---------- Эффекты ----------
  toast: function (icon, title, text) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span class="toast__icon" aria-hidden="true">' + icon + '</span><div><b>' + esc(title) + '</b><p>' + esc(text) + '</p></div>';
    $('#toasts').appendChild(el);
    setTimeout(function () { el.classList.add('is-out'); }, 3200);
    setTimeout(function () { el.remove(); }, 3700);
  },

  confetti: function () {
    if (REDUCED_MOTION) return;
    var box = $('#quiz').open ? $('#quiz') : $('#confetti');
    var colors = ['#FFD36E', '#7AD3C1', '#F59DB0', '#8EC5FF', '#B7A6F2', '#FFB28E'];
    for (var i = 0; i < 60; i++) {
      var p = document.createElement('i');
      p.className = 'confetti__piece';
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.4 + 's';
      p.style.animationDuration = 1.6 + Math.random() * 1.2 + 's';
      p.style.setProperty('--drift', (Math.random() * 160 - 80) + 'px');
      p.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
      box.appendChild(p);
      setTimeout(p.remove.bind(p), 3400);
    }
  },

  // ---------- События ----------
  bind: function () {
    var self = this;

    document.addEventListener('click', function (e) {
      var start = e.target.closest('[data-course][data-lesson]');
      if (start && !start.disabled) self.startLesson(start.dataset.course, Number(start.dataset.lesson));

      var sw = e.target.closest('.swatch');
      if (sw) self.setPalette(sw.dataset.palette);
    });

    $('#quiz').addEventListener('click', function (e) {
      var opt = e.target.closest('[data-option]');
      if (opt) return self.answer(Number(opt.dataset.option));
      var act = e.target.closest('[data-quiz]');
      if (!act) return;
      var a = act.dataset.quiz, qz = self.quiz;
      if (a === 'next') self.next();
      if (a === 'close') self.closeQuiz();
      if (a === 'retry') self.startLesson(qz.course.id, qz.index);
      if (a === 'next-lesson') {
        var unlocked = qz.result.unlocked;
        self.startLesson(qz.course.id, qz.index + 1);
        unlocked.forEach(function (b) { self.toast(b.icon, 'Badge unlocked!', b.title); });
      }
    });

    // Esc закрывает урок через closeQuiz (с подтверждением), а не мгновенно
    $('#quiz').addEventListener('cancel', function (e) { e.preventDefault(); self.closeQuiz(); });

    // Клавиатура в уроке: 1–4 — ответ, Enter на кнопке — дальше
    $('#quiz').addEventListener('keydown', function (e) {
      if (!self.quiz || self.quiz.done) return;
      var n = Number(e.key);
      if (n >= 1 && n <= self.quiz.questions[self.quiz.i].options.length && !self.quiz.answered) self.answer(n - 1);
    });

    $('#welcome-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = e.target.elements.name.value.trim();
      if (!name) return;
      self.state.name = name;
      self.save();
      self.render();
      $('#welcome').close();
      self.toast('👋', 'Nice to meet you, ' + name + '!', 'Start your first lesson below.');
    });
    $('#welcome').addEventListener('cancel', function () { self.save(); });

    $('#profile-chip').addEventListener('click', function () { self.openWelcome(); });
    $('#rename-btn').addEventListener('click', function () { self.openWelcome(); });
    $('#reset-btn').addEventListener('click', function () { self.resetProgress(); });

    $('#hero-bobik').addEventListener('click', function () {
      var moods = ['joy', 'surprise', 'delight', 'wink', 'victory'];
      self.petting = true;
      $('#hero-bobik').innerHTML = self.bobik(moods[Math.floor(Math.random() * moods.length)]);
      clearTimeout(self.petTimer);
      self.petTimer = setTimeout(function () { self.petting = false; self.render(); }, 1300);
    });
  }
};

document.addEventListener('DOMContentLoaded', function () { app.init(); });
