'use strict';

/* ============================================================
   Replay2048Visualizer — core class
   ============================================================ */
class Replay2048Visualizer {
  constructor() {
    // Data
    this.replays    = [];   // array of replay objects (supports multiple epochs)
    this.current    = null; // active replay object
    this.stepIndex  = 0;

    // Playback
    this.playing    = false;
    this.speed      = 1;           // multiplier
    this.BASE_DELAY = 600;         // ms at 1x
    this._timer     = null;

    // DOM refs
    this.boardEl     = document.getElementById('board');
    this.sliderEl    = document.getElementById('stepSlider');
    this.btnPlay     = document.getElementById('btnPlay');
    this.btnNext     = document.getElementById('btnNext');
    this.btnPrev     = document.getElementById('btnPrev');
    this.epochSel    = document.getElementById('epochSelect');
    this.fileInput   = document.getElementById('fileInput');
    this.fileStatus  = document.getElementById('fileStatus');
    this.arrowEl     = document.getElementById('actionArrow');
    this.recEl       = document.getElementById('recIndicator');
    this.exportBtn   = document.getElementById('btnExport');
    this.scoreCanvas = document.getElementById('scoreChart');
    this.tileCanvas  = document.getElementById('tileChart');
    this.exportCanvas= document.getElementById('exportCanvas');

    // Metrics
    this.mEpoch   = document.getElementById('mEpoch');
    this.mEpisode = document.getElementById('mEpisode');
    this.mScore   = document.getElementById('mScore');
    this.mMaxTile = document.getElementById('mMaxTile');
    this.mStep    = document.getElementById('mStep');
    this.mAction  = document.getElementById('mAction');

    // Video export state
    this._recording   = false;
    this._mediaRec    = null;
    this._recChunks   = [];

    // Tile color map (matches CSS)
    this.TILE_COLORS = {
      0:    '#cdc1b4',
      2:    '#eee4da',
      4:    '#ede0c8',
      8:    '#f2b179',
      16:   '#f59563',
      32:   '#f67c5f',
      64:   '#f65e3b',
      128:  '#edcf72',
      256:  '#edcc61',
      512:  '#edc850',
      1024: '#edc53f',
      2048: '#edc22e',
    };
    this.TILE_TEXT_COLORS = {
      0: 'transparent', 2: '#776e65', 4: '#776e65',
    };

    this._bindUI();
    this._buildEmptyBoard();
  }

  /* -------- UI BINDING -------- */
  _bindUI() {
    this.fileInput.addEventListener('change', e => this._handleFile(e));
    this.btnPlay.addEventListener('click', () => this.playing ? this.pause() : this.play());
    this.btnNext.addEventListener('click', () => { this.pause(); this.nextStep(); });
    this.btnPrev.addEventListener('click', () => { this.pause(); this.prevStep(); });
    this.epochSel.addEventListener('change', () => this._selectEpoch());
    this.sliderEl.addEventListener('input',  () => {
      this.pause();
      this.stepIndex = parseInt(this.sliderEl.value, 10);
      this._render();
    });
    this.exportBtn.addEventListener('click', () => this.exportVideo());

    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.setSpeed(parseFloat(btn.dataset.speed));
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === ' ')           { e.preventDefault(); this.playing ? this.pause() : this.play(); }
      if (e.key === 'ArrowRight')  { e.preventDefault(); this.pause(); this.nextStep(); }
      if (e.key === 'ArrowLeft')   { e.preventDefault(); this.pause(); this.prevStep(); }
    });
  }

  /* -------- FILE HANDLING -------- */
  _handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const raw = JSON.parse(ev.target.result);
        // Support single replay object OR array of replays
        this.replays = Array.isArray(raw) ? raw : [raw];
        this.fileStatus.textContent = `Loaded: ${file.name} (${this.replays.length} replay${this.replays.length > 1 ? 's' : ''})`;
        this._populateEpochSelector();
        this._loadReplayAt(0);
      } catch (err) {
        this.fileStatus.textContent = 'Error: invalid JSON — ' + err.message;
        console.error(err);
      }
    };
    reader.onerror = () => { this.fileStatus.textContent = 'Error reading file.'; };
    reader.readAsText(file);
    // reset so same file can be reloaded
    e.target.value = '';
  }

  _populateEpochSelector() {
    const sel = this.epochSel;
    sel.innerHTML = '';
    this.replays.forEach((r, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      const label = r.epoch !== undefined ? `Epoch ${r.epoch}` : `Replay ${i + 1}`;
      opt.textContent = label + (r.episode !== undefined ? ` / Ep ${r.episode}` : '');
      sel.appendChild(opt);
    });
    sel.disabled = this.replays.length <= 1;
  }

  _selectEpoch() {
    const idx = parseInt(this.epochSel.value, 10);
    if (!isNaN(idx)) this._loadReplayAt(idx);
  }

  /* -------- LOAD REPLAY -------- */
  loadReplay(jsonData) {
    this.replays = Array.isArray(jsonData) ? jsonData : [jsonData];
    this._populateEpochSelector();
    this._loadReplayAt(0);
  }

  _loadReplayAt(idx) {
    this.pause();
    this.current   = this.replays[idx];
    this.stepIndex = 0;

    const steps = this.current.steps || [];
    this.sliderEl.min   = 0;
    this.sliderEl.max   = Math.max(0, steps.length - 1);
    this.sliderEl.value = 0;

    this._updateMetaMetrics();
    this._render();
    this.drawScoreChart(this.scoreCanvas, steps);
    this.drawTileDistChart(this.tileCanvas, steps);
  }

  /* -------- PLAYBACK -------- */
  play() {
    if (!this.current) return;
    if (this.stepIndex >= (this.current.steps.length - 1)) {
      this.stepIndex = 0;
    }
    this.playing = true;
    this.btnPlay.innerHTML = '&#9646;&#9646;'; // pause icon
    this._scheduleNext();
  }

  pause() {
    this.playing = false;
    this.btnPlay.innerHTML = '&#9654;'; // play icon
    clearTimeout(this._timer);
  }

  nextStep() {
    if (!this.current) return;
    if (this.stepIndex < this.current.steps.length - 1) {
      this.stepIndex++;
      this._render();
    }
  }

  prevStep() {
    if (!this.current) return;
    if (this.stepIndex > 0) {
      this.stepIndex--;
      this._render();
    }
  }

  setSpeed(multiplier) {
    this.speed = multiplier;
    if (this.playing) {
      clearTimeout(this._timer);
      this._scheduleNext();
    }
  }

  _scheduleNext() {
    const delay = this.BASE_DELAY / this.speed;
    this._timer = setTimeout(() => {
      if (!this.playing) return;
      if (this.stepIndex < this.current.steps.length - 1) {
        this.stepIndex++;
        this._render();
        this._scheduleNext();
      } else {
        this.pause();
      }
    }, delay);
  }

  /* -------- RENDER -------- */
  _render() {
    if (!this.current) return;
    const steps = this.current.steps;
    if (!steps || steps.length === 0) return;

    const step = steps[this.stepIndex];
    this.renderBoard(step, steps[this.stepIndex - 1] || null);
    this._updateStepMetrics(step);
    this.sliderEl.value = this.stepIndex;

    // Highlight score progress on chart
    this._drawChartCursor(this.scoreCanvas, steps, this.stepIndex);
  }

  renderBoard(step, prevStep) {
    const board   = step.board;
    const prevBoard = prevStep ? prevStep.board : null;
    const cells   = this.boardEl.querySelectorAll('.cell');

    board.forEach((row, r) => {
      row.forEach((val, c) => {
        const cell = cells[r * 4 + c];
        const prevVal = prevBoard ? prevBoard[r][c] : null;
        const isNew = prevVal !== null && prevVal !== val;

        cell.dataset.val = val;
        cell.className   = 'cell' + (val > 2048 ? ' super' : '') + (isNew && val !== 0 ? ' new-tile' : '');

        const numEl = cell.querySelector('.tile-num');
        numEl.textContent = val === 0 ? '' : val;

        // Reset animation
        if (isNew && val !== 0) {
          void cell.offsetWidth; // reflow to restart animation
        }
      });
    });

    // Action arrow
    const ACTION_LABELS = { 0: '⬆ Up', 1: '⬇ Down', 2: '⬅ Left', 3: '➡ Right' };
    const ACTION_SYMBOLS = { 0: '↑', 1: '↓', 2: '←', 3: '→' };
    if (step.action !== undefined && step.action !== null) {
      const label = ACTION_LABELS[step.action] || `Action ${step.action}`;
      this.arrowEl.textContent = label;
      this.arrowEl.style.opacity = '1';
    } else {
      this.arrowEl.textContent = '';
      this.arrowEl.style.opacity = '0';
    }
  }

  /* -------- METRICS -------- */
  _updateMetaMetrics() {
    const r = this.current;
    this.mEpoch.textContent   = r.epoch   !== undefined ? r.epoch   : '—';
    this.mEpisode.textContent = r.episode !== undefined ? r.episode : '—';
    this.mMaxTile.textContent = r.max_tile !== undefined ? r.max_tile : '—';
  }

  _updateStepMetrics(step) {
    const ACTION_NAMES = { 0: 'Up', 1: 'Down', 2: 'Left', 3: 'Right' };
    this.mScore.textContent  = step.score !== undefined ? step.score  : '—';
    this.mStep.textContent   = `${this.stepIndex + 1} / ${this.current.steps.length}`;
    this.mAction.textContent = step.action !== undefined ? (ACTION_NAMES[step.action] || step.action) : '—';

    // compute live max tile from board
    if (step.board) {
      const flat = step.board.flat();
      const max  = Math.max(...flat);
      if (max > 0) this.mMaxTile.textContent = max;
    }
  }

  /* -------- BOARD DOM CONSTRUCTION -------- */
  _buildEmptyBoard() {
    this.boardEl.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.val = '0';
      const num = document.createElement('span');
      num.className = 'tile-num';
      cell.appendChild(num);
      this.boardEl.appendChild(cell);
    }
  }

  /* -------- SCORE CHART -------- */
  drawScoreChart(canvas, steps) {
    this._drawScoreChartOnly(canvas, steps);
    this._drawChartCursor(canvas, steps, this.stepIndex);
  }

  _drawScoreChartOnly(canvas, steps) {
    if (!steps || steps.length === 0) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const scores = steps.map(s => s.score || 0);
    const maxS   = Math.max(...scores, 1);
    const padL = 40, padR = 10, padT = 10, padB = 20;
    const gW = W - padL - padR;
    const gH = H - padT - padB;

    // Background
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (gH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + gW, y); ctx.stroke();
    }

    // Y axis labels
    ctx.fillStyle = '#8888aa';
    ctx.font      = '9px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val  = maxS - (maxS / 4) * i;
      const y    = padT + (gH / 4) * i;
      ctx.fillText(Math.round(val), padL - 4, y + 3);
    }

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#e4a830';
    ctx.lineWidth   = 2;
    scores.forEach((s, i) => {
      const x = padL + (i / (scores.length - 1 || 1)) * gW;
      const y = padT + gH - (s / maxS) * gH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under
    const lastX = padL + gW, firstX = padL;
    ctx.lineTo(lastX, padT + gH);
    ctx.lineTo(firstX, padT + gH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(228,168,48,0.15)';
    ctx.fill();

    this._chartMeta = { padL, padR, padT, padB, gW, gH, scores, maxS, W, H };
  }

  _drawChartCursor(canvas, steps, idx) {
    if (!this._chartMeta || !steps || steps.length < 2) return;
    const { padL, padT, gW, gH, scores, maxS, W, H } = this._chartMeta;
    const ctx = canvas.getContext('2d');

    // Redraw chart cleanly first, then draw cursor on top
    this._drawScoreChartOnly(canvas, steps);

    // Cursor line
    const x = padL + (idx / (scores.length - 1 || 1)) * gW;
    const y = padT + gH - (scores[idx] / maxS) * gH;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + gH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#fff';
    ctx.strokeStyle = '#e4a830';
    ctx.lineWidth   = 2;
    ctx.fill();
    ctx.stroke();
  }

  /* -------- TILE DISTRIBUTION CHART -------- */
  drawTileDistChart(canvas, steps) {
    if (!steps || steps.length === 0) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, W, H);

    // Count how often each tile value appears (last step)
    const lastStep = steps[steps.length - 1];
    if (!lastStep || !lastStep.board) return;
    const flat = lastStep.board.flat().filter(v => v > 0);
    const counts = {};
    flat.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    const vals = Object.keys(counts).map(Number).sort((a, b) => a - b);
    if (vals.length === 0) return;

    const barW = (W - 20) / vals.length;
    const maxC = Math.max(...Object.values(counts));
    const padT = 10, padB = 20;
    const gH   = H - padT - padB;

    vals.forEach((v, i) => {
      const x   = 10 + i * barW;
      const cnt = counts[v];
      const h   = (cnt / maxC) * gH;
      const col = this.TILE_COLORS[v] || '#f7c948';

      ctx.fillStyle = col;
      ctx.fillRect(x + 2, padT + gH - h, barW - 4, h);

      ctx.fillStyle = '#aaa';
      ctx.font      = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(v >= 1024 ? `${v/1024}k` : v, x + barW / 2, H - 4);
    });
  }

  /* -------- CANVAS TILE RENDERER (for export) -------- */
  _tileColor(val) {
    return this.TILE_COLORS[val] || '#f7c948';
  }

  _tileFontColor(val) {
    if (val === 0) return 'transparent';
    if (val === 2 || val === 4) return '#776e65';
    return '#f9f6f2';
  }

  _renderBoardToCanvas(ctx, board, cw, ch) {
    const GAP   = 10;
    const PAD   = 12;
    const BOARD_BG = '#bbada0';
    const EMPTY    = '#cdc1b4';
    const CELL_W   = (cw - PAD * 2 - GAP * 3) / 4;
    const CELL_H   = (ch - PAD * 2 - GAP * 3) / 4;

    ctx.fillStyle = BOARD_BG;
    this._roundRect(ctx, 0, 0, cw, ch, 12);
    ctx.fill();

    board.forEach((row, r) => {
      row.forEach((val, c) => {
        const x = PAD + c * (CELL_W + GAP);
        const y = PAD + r * (CELL_H + GAP);

        if (val > 2048) {
          const grad = ctx.createLinearGradient(x, y, x + CELL_W, y + CELL_H);
          grad.addColorStop(0, '#f7c948');
          grad.addColorStop(1, '#e4901a');
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = val === 0 ? EMPTY : this._tileColor(val);
        }
        this._roundRect(ctx, x, y, CELL_W, CELL_H, 6);
        ctx.fill();

        if (val !== 0) {
          ctx.fillStyle  = this._tileFontColor(val);
          const fontSize = val >= 1024 ? CELL_W * 0.28 : CELL_W * 0.36;
          ctx.font       = `bold ${fontSize}px sans-serif`;
          ctx.textAlign  = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(val), x + CELL_W / 2, y + CELL_H / 2);
        }
      });
    });
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* -------- VIDEO EXPORT -------- */
  exportVideo() {
    if (!this.current || !this.current.steps || this.current.steps.length === 0) {
      alert('No replay loaded.');
      return;
    }
    if (this._recording) {
      alert('Recording already in progress.');
      return;
    }
    if (!window.MediaRecorder) {
      alert('MediaRecorder not supported in this browser. Try Chrome.');
      return;
    }

    const canvas = this.exportCanvas;
    const ctx    = canvas.getContext('2d');
    const stream = canvas.captureStream(30);

    // Choose best supported codec
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    let mimeType = '';
    for (const m of mimeTypes) {
      if (MediaRecorder.isTypeSupported(m)) { mimeType = m; break; }
    }

    this._recChunks = [];
    this._mediaRec  = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    this._mediaRec.ondataavailable = e => { if (e.data.size > 0) this._recChunks.push(e.data); };
    this._mediaRec.onstop = () => this._finalizeVideo();

    this._recording = true;
    this.recEl.className = 'rec-visible';
    this.exportBtn.textContent = 'Recording…';

    this._mediaRec.start();

    // Animate frames onto the export canvas
    const steps    = this.current.steps;
    const delay    = this.BASE_DELAY / Math.max(this.speed, 1);
    const ACTION_LABELS = { 0: '↑ Up', 1: '↓ Down', 2: '← Left', 3: '→ Right' };
    let frameIdx   = 0;

    const drawFrame = () => {
      if (!this._recording) return;
      const cw = canvas.width, ch = canvas.height;

      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, cw, ch);

      if (frameIdx < steps.length) {
        const step = steps[frameIdx];

        // Board
        this._renderBoardToCanvas(ctx, step.board, cw, ch - 60);

        // Info bar
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, ch - 55, cw, 55);

        ctx.fillStyle = '#e4a830';
        ctx.font      = 'bold 15px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Score: ${step.score || 0}`, 12, ch - 48);
        ctx.fillText(`Step: ${frameIdx + 1}/${steps.length}`, 12, ch - 28);

        ctx.textAlign = 'right';
        ctx.fillText(ACTION_LABELS[step.action] || '', cw - 12, ch - 48);
        if (this.current.epoch !== undefined) {
          ctx.fillText(`Epoch ${this.current.epoch}`, cw - 12, ch - 28);
        }

        // REC badge
        ctx.fillStyle = '#ff4444';
        ctx.font      = 'bold 13px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('● REC', cw - 10, 10);

        frameIdx++;
        setTimeout(drawFrame, delay);
      } else {
        // Done
        this._mediaRec.stop();
        this._recording = false;
        this.recEl.className = 'rec-hidden';
        this.exportBtn.textContent = '⬤ Export Video (.webm)';
      }
    };

    drawFrame();
  }

  _finalizeVideo() {
    const blob = new Blob(this._recChunks, { type: 'video/webm' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `replay_epoch${this.current.epoch || 0}_ep${this.current.episode || 0}.webm`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

/* ============================================================
   Bootstrap
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const viz = new Replay2048Visualizer();

  // Expose globally for debugging
  window._viz = viz;

  // Demo: if a ?demo query param is present, load a synthetic replay
  if (location.search.includes('demo')) {
    const demoReplay = generateDemoReplay();
    viz.loadReplay(demoReplay);
  }
});

/* -------- Demo generator (activated via ?demo in URL) -------- */
function generateDemoReplay() {
  const ACTIONS = [0, 1, 2, 3];
  let board = [[0,0,0,0],[0,0,0,2],[0,0,0,0],[0,0,2,0]];
  let score = 0;
  const steps = [];

  const compress = (row) => {
    let r = row.filter(v => v !== 0);
    for (let i = 0; i < r.length - 1; i++) {
      if (r[i] === r[i + 1]) { r[i] *= 2; score += r[i]; r.splice(i + 1, 1); }
    }
    while (r.length < 4) r.push(0);
    return r;
  };

  const rotate90 = b => b[0].map((_, c) => b.map(row => row[c]).reverse());

  const moveLeft  = b => b.map(row => compress([...row]));
  const moveRight = b => b.map(row => compress([...row].reverse()).reverse());
  const moveUp    = b => { let t = rotate90(b); t = moveLeft(t); return rotate90(rotate90(rotate90(t))); };
  const moveDown  = b => { let t = rotate90(rotate90(rotate90(b))); t = moveLeft(t); return rotate90(t); };
  const moves     = [moveUp, moveDown, moveLeft, moveRight];

  const addTile = b => {
    const empty = [];
    b.forEach((row, r) => row.forEach((v, c) => { if (v === 0) empty.push([r, c]); }));
    if (empty.length === 0) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    b[r][c] = Math.random() < 0.9 ? 2 : 4;
  };

  for (let i = 0; i < 120; i++) {
    const action = ACTIONS[Math.floor(Math.random() * 4)];
    steps.push({ board: board.map(r => [...r]), score, action });
    const nb = moves[action](board);
    board = nb;
    addTile(board);
  }

  return { epoch: 999, episode: 42, score, max_tile: Math.max(...board.flat()), steps };
}
