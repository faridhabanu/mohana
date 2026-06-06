/* ============================================================
   Li-Fi SYSTEM — script.js
   Vanilla JavaScript ES6 | Session Storage | Charts | Dashboard
   ============================================================ */

'use strict';

// ─── STATE ────────────────────────────────────────────────────────────────────
const State = {
  transmitting: false,
  intervalId: null,
  chartInterval: null,
  totalSent: 0,
  totalRecv: 0,
  successCount: 0,
  failCount: 0,
  dataRate: 0,
  signalStrength: 0,
  ber: 0,
  psr: 0,
  transferTime: 0,
  optPower: 0,
  speedHistory: [],
  signalHistory: [],
  successHistory: [],
  failHistory: [],
  labels: [],
  maxPoints: 12,
};

// ─── SESSION STORAGE ──────────────────────────────────────────────────────────
const Session = {
  key: 'lifi_tx_messages',
  save(messages) {
    try { sessionStorage.setItem(this.key, JSON.stringify(messages)); } catch (_) {}
  },
  load() {
    try { return JSON.parse(sessionStorage.getItem(this.key) || '[]'); } catch (_) { return []; }
  },
  clear() {
    try { sessionStorage.removeItem(this.key); } catch (_) {}
  }
};

// ─── COMPONENT DATA ───────────────────────────────────────────────────────────
const ComponentData = {
  led: {
    title: 'LED Transmitter',
    sub: 'High-Power White LED Array',
    desc: 'The LED transmitter converts electrical signals from the driver circuit into modulated light pulses. A high-brightness white LED (or IR LED at 850nm) is driven at frequencies up to 200 MHz for data encoding using On-Off Keying (OOK) or more advanced OFDM schemes.',
    specs: [
      ['Type', 'White LED / 850nm IR'],
      ['Power Rating', '5W – 10W'],
      ['Modulation Freq', 'Up to 200 MHz'],
      ['Half Angle', '±15° Beam'],
      ['Forward Voltage', '3.2 – 3.6V'],
      ['Luminous Flux', '400 – 800 lm'],
    ]
  },
  driver: {
    title: 'Driver Circuit',
    sub: 'MOSFET Gate Driver — IRF540N',
    desc: 'The driver circuit amplifies the low-power PWM signal from the microcontroller to drive the high-power LED. An N-channel MOSFET (IRF540N) acts as a high-speed switch controlled by a gate driver IC, enabling nanosecond-level switching for high-frequency data modulation.',
    specs: [
      ['MOSFET', 'IRF540N (100V, 33A)'],
      ['Gate Driver IC', 'TC4420/TC4422'],
      ['Switching Speed', '< 10ns rise time'],
      ['Supply Voltage', '5V – 12V DC'],
      ['Max Current', '33A peak pulse'],
      ['Protection', 'TVS Diode, Schottky'],
    ]
  },
  channel: {
    title: 'Optical Channel',
    sub: 'Free-Space Optical Medium',
    desc: 'The optical channel is the transmission medium — free-space air through which light travels from the LED to the photodiode. The channel characteristics include atmospheric attenuation, multipath effects from reflections, and ambient light noise which must be filtered at the receiver.',
    specs: [
      ['Medium', 'Free-Space Air'],
      ['Wavelength Range', '400 – 700 THz (visible)'],
      ['Range', 'Up to 10 meters (LOS)'],
      ['Attenuation', '~0.02 dB/m (clear air)'],
      ['Multipath', 'Indoor reflections'],
      ['Noise Source', 'Ambient light / sunlight'],
    ]
  },
  photodiode: {
    title: 'Photodiode Receiver',
    sub: 'BPW34 Silicon PIN Photodiode',
    desc: 'The photodiode converts incident light into a proportional photocurrent. A transimpedance amplifier (TIA) converts this tiny current into a usable voltage signal. The BPW34 offers excellent spectral response across 400–1100nm with a fast rise time suitable for high-bandwidth Li-Fi reception.',
    specs: [
      ['Model', 'BPW34 / OPT101'],
      ['Responsivity', '0.62 A/W @ 850nm'],
      ['Active Area', '7.5 mm²'],
      ['Rise Time', '< 20 ns'],
      ['Dark Current', '2 nA max'],
      ['Bandwidth', 'DC to 100 MHz'],
    ]
  },
  mcu: {
    title: 'Microcontroller Unit',
    sub: 'ESP32 / ATmega328P',
    desc: 'The microcontroller orchestrates the entire Li-Fi system — encoding data into modulated PWM signals for the LED transmitter, and decoding received waveforms from the ADC into recoverable data at the receiver. The ESP32 offers dual-core 240MHz performance with hardware timers for precise modulation.',
    specs: [
      ['MCU', 'ESP32 (dual-core 240MHz)'],
      ['Flash', '4 MB SPI Flash'],
      ['Interfaces', 'UART, SPI, I2C, PWM'],
      ['ADC Resolution', '12-bit SAR ADC'],
      ['Operating Voltage', '3.3V / 5V tolerant'],
      ['Timer Precision', '1 μs hardware timer'],
    ]
  },
  display: {
    title: 'Display Module',
    sub: '0.96" OLED SSD1306 / 16×2 LCD',
    desc: 'The display module provides real-time feedback on transmission status, data rate, received messages, and system diagnostics. A 0.96" SSD1306 OLED module communicates via I2C at address 0x3C, rendering up to 8 lines of monospace characters plus graphical signal strength indicators.',
    specs: [
      ['Display', '0.96" OLED SSD1306'],
      ['Resolution', '128 × 64 pixels'],
      ['Interface', 'I2C (0x3C address)'],
      ['Supply', '3.3V or 5V'],
      ['View Angle', '160° wide'],
      ['Characters', '21 chars × 8 lines'],
    ]
  }
};

// ─── CHARTS ───────────────────────────────────────────────────────────────────
let speedChart, signalChart, packetChart;

function initCharts() {
  // Minimal canvas-based chart renderer
  const charts = [
    { id: 'speedChart', type: 'line' },
    { id: 'signalChart', type: 'line' },
    { id: 'packetChart', type: 'bar' },
  ];
  charts.forEach(c => {
    const canvas = document.getElementById(c.id);
    if (canvas) {
      canvas.width = canvas.offsetWidth || 400;
      canvas.height = canvas.offsetHeight || 200;
    }
  });
  drawAllCharts();
}

function drawChart(canvasId, data, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || canvas.width;
  const h = canvas.offsetHeight || canvas.height;
  canvas.width = w;
  canvas.height = h;

  const pad = { top: 16, right: 16, bottom: 28, left: 40 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  // Get CSS vars for theming
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue('--accent').trim() || '#00c8ff';
  const accent2 = cs.getPropertyValue('--accent-2').trim() || '#7c4dff';
  const green = cs.getPropertyValue('--green').trim() || '#00e676';
  const red = cs.getPropertyValue('--red').trim() || '#ff1744';
  const textColor = cs.getPropertyValue('--text-3').trim() || '#3d6080';
  const borderColor = cs.getPropertyValue('--border').trim() || 'rgba(0,200,255,0.12)';

  ctx.clearRect(0, 0, w, h);

  const labels = State.labels;
  const datasets = data;
  if (!datasets || !datasets.length) return;

  const allVals = datasets.flatMap(d => d.values);
  const maxVal = Math.max(...allVals, options.max || 10, 1);
  const minVal = options.type === 'bar' ? 0 : Math.min(...allVals, 0);

  const toX = i => pad.left + (i / Math.max(State.maxPoints - 1, 1)) * chartW;
  const toY = v => pad.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;

  // Grid lines
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = '10px Share Tech Mono, monospace';
    ctx.textAlign = 'right';
    const val = maxVal - (i / 4) * maxVal;
    ctx.fillText(val.toFixed(1), pad.left - 4, y + 4);
  }

  // X labels
  ctx.textAlign = 'center';
  ctx.fillStyle = textColor;
  const step = Math.max(1, Math.floor(labels.length / 6));
  labels.forEach((lbl, i) => {
    if (i % step === 0) {
      ctx.fillText(lbl, toX(i), pad.top + chartH + 18);
    }
  });

  // Datasets
  const colors = [accent, accent2, green, red];
  datasets.forEach((ds, di) => {
    const color = ds.color || colors[di] || accent;
    const vals = ds.values;

    if (options.type === 'bar') {
      const barW = Math.max(4, (chartW / Math.max(vals.length, 1)) * 0.6);
      vals.forEach((v, i) => {
        const x = toX(i) - barW / 2;
        const barH = ((v - minVal) / (maxVal - minVal)) * chartH;
        const y = pad.top + chartH - barH;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    } else {
      // Area fill
      if (vals.length > 1) {
        ctx.beginPath();
        ctx.moveTo(toX(0), toY(vals[0]));
        vals.forEach((v, i) => { if (i > 0) ctx.lineTo(toX(i), toY(v)); });
        ctx.lineTo(toX(vals.length - 1), pad.top + chartH);
        ctx.lineTo(toX(0), pad.top + chartH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
        grad.addColorStop(0, color + '30');
        grad.addColorStop(1, color + '00');
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.moveTo(toX(0), toY(vals[0]));
        vals.forEach((v, i) => { if (i > 0) ctx.lineTo(toX(i), toY(v)); });
        ctx.stroke();

        // Dots
        ctx.fillStyle = color;
        vals.forEach((v, i) => {
          ctx.beginPath();
          ctx.arc(toX(i), toY(v), 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  });
}

function drawAllCharts() {
  drawChart('speedChart', [
    { values: State.speedHistory, color: null },
    { values: State.speedHistory.map(v => v * 1.15), color: null },
  ], { max: 100 });

  drawChart('signalChart', [
    { values: State.signalHistory.map(v => Math.abs(v)), color: getComputedStyle(document.documentElement).getPropertyValue('--green').trim() },
  ], { max: 100 });

  drawChart('packetChart', [
    { values: State.successHistory, color: getComputedStyle(document.documentElement).getPropertyValue('--green').trim() },
    { values: State.failHistory, color: getComputedStyle(document.documentElement).getPropertyValue('--red').trim() },
  ], { type: 'bar', max: Math.max(...State.successHistory, ...State.failHistory, 10) });
}

// ─── SIMULATE METRICS ─────────────────────────────────────────────────────────
function simulateMetrics() {
  const noise = () => (Math.random() - 0.5) * 0.1;

  State.dataRate = Math.min(100, Math.max(0, 42 + Math.sin(Date.now() / 3000) * 18 + noise() * 5));
  State.signalStrength = Math.min(100, Math.max(10, 72 + Math.cos(Date.now() / 4000) * 15 + noise() * 3));
  State.ber = Math.max(0, 0.002 + Math.random() * 0.005);
  State.psr = Math.min(100, 94 + Math.random() * 5);
  State.transferTime = Math.max(10, 120 + Math.random() * 80);
  State.optPower = Math.min(500, 240 + Math.sin(Date.now() / 2000) * 80 + Math.random() * 20);

  updateMetricDisplays();

  const now = new Date();
  const timeLabel = `${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

  if (State.labels.length >= State.maxPoints) {
    State.labels.shift(); State.speedHistory.shift();
    State.signalHistory.shift(); State.successHistory.shift(); State.failHistory.shift();
  }
  State.labels.push(timeLabel);
  State.speedHistory.push(+State.dataRate.toFixed(2));
  State.signalHistory.push(+State.signalStrength.toFixed(1));
  State.successHistory.push(State.successCount);
  State.failHistory.push(State.failCount);

  drawAllCharts();
  updateSignalBars();
}

function updateMetricDisplays() {
  setEl('dataRateVal', State.dataRate.toFixed(2) + ' Mbps');
  setEl('signalVal', (State.signalStrength * 0.9 - 85).toFixed(1) + ' dBm');
  setEl('berVal', (State.ber * 100).toFixed(4) + '%');
  setEl('psrVal', State.psr.toFixed(1) + '%');
  setEl('transferTimeVal', State.transferTime.toFixed(0) + ' ms');
  setEl('optPowerVal', State.optPower.toFixed(1) + ' mW');
  setEl('berDisplay', (State.ber * 100).toFixed(4) + '%');
  setEl('snrDisplay', (20 + State.signalStrength / 5).toFixed(1) + ' dB');

  setWidth('dataRateMeter', State.dataRate + '%');
  setWidth('signalMeter', State.signalStrength + '%');
  setWidth('berMeter', Math.min(100, State.ber * 1000) + '%');
  setWidth('psrMeter', State.psr + '%');
  setWidth('timeMeter', Math.min(100, State.transferTime / 50) + '%');
  setWidth('optMeter', (State.optPower / 5) + '%');
}

function updateSignalBars() {
  const level = Math.round(State.signalStrength / 25);
  for (let i = 1; i <= 4; i++) {
    const bars = document.querySelectorAll('#txSignal .b' + i + ', #rxSignal .b' + i);
    bars.forEach(b => {
      b.classList.toggle('active', i <= level);
    });
  }
}

function updateStatCards() {
  animateCounter('totalSent', State.totalSent);
  animateCounter('totalRecv', State.totalRecv);
  animateCounter('successCount', State.successCount);
  animateCounter('failCount', State.failCount);

  const total = State.totalSent || 1;
  setWidth('sentFill', Math.min(100, State.totalSent / total * 100) + '%');
  setWidth('recvFill', Math.min(100, State.totalRecv / total * 100) + '%');
  setWidth('successFill', Math.min(100, State.successCount / total * 100) + '%');
  setWidth('failFill', Math.min(100, State.failCount / total * 100) + '%');
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  const step = Math.ceil((target - current) / 5);
  el.textContent = Math.min(current + step, target);
}

// ─── TRANSMISSION CONTROL ─────────────────────────────────────────────────────
function startTransmission() {
  if (State.transmitting) return;
  State.transmitting = true;

  setEl('statusText', 'Transmitting...');
  document.getElementById('statusLed').className = 'status-led transmitting';
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;

  State.chartInterval = setInterval(simulateMetrics, 1200);
  showToast('✅ Transmission started — Li-Fi channel active', 'success');
}

function stopTransmission() {
  if (!State.transmitting) return;
  State.transmitting = false;

  clearInterval(State.chartInterval);
  State.chartInterval = null;

  setEl('statusText', 'System Ready');
  document.getElementById('statusLed').className = 'status-led';
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;

  showToast('⏹ Transmission stopped', 'info');
}

function clearData() {
  State.totalSent = 0; State.totalRecv = 0;
  State.successCount = 0; State.failCount = 0;
  State.speedHistory = []; State.signalHistory = [];
  State.successHistory = []; State.failHistory = [];
  State.labels = [];

  Session.clear();
  document.getElementById('txHistory').innerHTML = '<div class="history-empty">No transmissions yet</div>';
  document.getElementById('rxHistory').innerHTML = '<div class="history-empty">No messages received</div>';

  const rxScreen = document.getElementById('rxScreen');
  rxScreen.innerHTML = '<div class="rx-cursor"></div><div class="rx-placeholder">Awaiting light signal...</div>';
  rxScreen.classList.remove('has-data');

  setEl('packetsRecvDisplay', '0');
  setEl('decodingScheme', '—');
  setEl('integrityDisplay', '—');
  document.getElementById('integrityDisplay').className = '';

  updateStatCards();
  drawAllCharts();
  showToast('🗑 All data cleared', 'info');
}

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
function sendMessage() {
  const input = document.getElementById('messageInput');
  const msg = input.value.trim();
  const validationMsg = document.getElementById('validationMsg');

  // Validation
  if (!msg) {
    validationMsg.textContent = '⚠ Message cannot be empty';
    input.classList.add('error');
    shakeElement(input);
    return;
  }
  if (msg.length > 500) {
    validationMsg.textContent = '⚠ Exceeds 500 character limit';
    input.classList.add('error');
    return;
  }

  validationMsg.textContent = '';
  input.classList.remove('error');

  const encoding = document.querySelector('input[name="encoding"]:checked')?.value || 'OOK';
  const timestamp = new Date().toLocaleTimeString();
  const packets = Math.ceil(msg.length / 4);
  const failed = Math.random() < 0.05;

  // Update state
  State.totalSent += packets;
  if (!failed) {
    State.totalRecv += packets;
    State.successCount++;
  } else {
    State.failCount++;
  }

  // Update stat cards
  updateStatCards();

  // Animate channel
  animateTransmission(!failed);

  // Store in session
  const stored = Session.load();
  stored.push({ msg, timestamp, encoding, failed });
  if (stored.length > 50) stored.shift();
  Session.save(stored);

  // TX History
  addHistoryItem('txHistory', msg, timestamp, false);

  // Simulate reception with delay
  setTimeout(() => {
    if (!failed) {
      updateReceiverPanel(msg, encoding, packets);
      addHistoryItem('rxHistory', msg, timestamp, true);
    }
    if (!State.transmitting) simulateMetrics();
  }, 800 + Math.random() * 600);

  // Start auto-transmit if not already running
  if (!State.transmitting) startTransmission();

  // Clear input
  input.value = '';
  document.getElementById('charCount').textContent = '0 / 500 chars';

  showToast(failed
    ? `❌ Packet lost! (${packets} packets dropped)`
    : `⚡ Transmitted "${msg.substring(0,30)}${msg.length > 30 ? '…' : ''}"`,
    failed ? 'error' : 'success'
  );
}

function animateTransmission(success) {
  const ledSource = document.getElementById('ledSource');
  const beamLine = document.getElementById('beamLine');
  const travelingBits = document.getElementById('travelingBits');

  // Flash LED
  ledSource.style.filter = 'drop-shadow(0 0 20px rgba(255,200,0,1)) brightness(1.5)';
  setTimeout(() => { ledSource.style.filter = ''; }, 600);

  // Create traveling bit packets
  travelingBits.innerHTML = '';
  const bitCount = 5;
  for (let i = 0; i < bitCount; i++) {
    setTimeout(() => {
      const bit = document.createElement('div');
      bit.className = 't-bit';
      bit.style.background = success ? 'var(--accent)' : 'var(--red)';
      travelingBits.appendChild(bit);
      setTimeout(() => bit.remove(), 1000);
    }, i * 160);
  }

  // Glow beam
  beamLine.style.opacity = '1';
  beamLine.style.background = 'linear-gradient(180deg, rgba(255,200,0,0.9), rgba(255,200,0,0.3))';
  setTimeout(() => {
    beamLine.style.background = '';
    beamLine.style.opacity = '';
  }, 1200);
}

function updateReceiverPanel(msg, encoding, packets) {
  const rxScreen = document.getElementById('rxScreen');
  rxScreen.classList.add('has-data');
  rxScreen.innerHTML = `<span style="color:var(--green)">${msg}</span><span class="rx-cursor"></span>`;

  setEl('decodingScheme', encoding);
  setEl('packetsRecvDisplay', State.totalRecv);

  const integrity = document.getElementById('integrityDisplay');
  integrity.textContent = 'CRC OK ✓';
  integrity.className = 'good';

  // Glow effect on receiver
  const pd = document.getElementById('photodiodeRecv');
  pd.style.filter = 'drop-shadow(0 0 16px rgba(0,230,118,0.8)) brightness(1.3)';
  setTimeout(() => { pd.style.filter = ''; }, 800);
}

function addHistoryItem(listId, msg, timestamp, isRx) {
  const list = document.getElementById(listId);
  const empty = list.querySelector('.history-empty');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = `history-item${isRx ? ' rx-item' : ''}`;
  item.innerHTML = `
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(msg)}</span>
    <span class="hi-time">${timestamp}</span>
  `;
  list.prepend(item);

  // Keep max 8 items
  const items = list.querySelectorAll('.history-item');
  if (items.length > 8) items[items.length - 1].remove();
}

// ─── EXPORT REPORT ────────────────────────────────────────────────────────────
function exportReport() {
  const stored = Session.load();
  const report = {
    generated: new Date().toISOString(),
    system: 'Li-Fi Embedded Data Transfer System',
    session: {
      totalSent: State.totalSent,
      totalReceived: State.totalRecv,
      successfulTransfers: State.successCount,
      failedTransfers: State.failCount,
      avgDataRate: (State.speedHistory.reduce((a,b)=>a+b,0) / Math.max(State.speedHistory.length, 1)).toFixed(2) + ' Mbps',
      avgSignal: (State.signalHistory.reduce((a,b)=>a+b,0) / Math.max(State.signalHistory.length, 1)).toFixed(1),
    },
    transmissions: stored,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lifi_report_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('📄 Report exported as JSON', 'success');
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function showComponentDetail(key) {
  const data = ComponentData[key];
  if (!data) return;

  const content = document.getElementById('modalContent');
  content.innerHTML = `
    <h3>${data.title}</h3>
    <div class="modal-sub">${data.sub}</div>
    <p>${data.desc}</p>
    <div class="modal-specs">
      ${data.specs.map(([k, v]) => `
        <div class="spec-row">
          <span class="spec-key">${k}</span>
          <span class="spec-val">${v}</span>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('componentModal').classList.add('active');
}

function closeModal() {
  document.getElementById('componentModal').classList.remove('active');
}

// ─── THEME TOGGLE ─────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('lifi_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('themeIcon').textContent = saved === 'dark' ? '☀️' : '🌙';
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('themeIcon').textContent = next === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('lifi_theme', next);
  setTimeout(drawAllCharts, 100);
});

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 350);
  }, 3200);
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const links = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('section[id]');

  window.addEventListener('scroll', () => {
    navbar.style.background = window.scrollY > 20
      ? (document.documentElement.getAttribute('data-theme') === 'dark'
          ? 'rgba(8,13,20,0.97)' : 'rgba(238,244,250,0.97)')
      : '';

    let current = '';
    sections.forEach(s => {
      if (window.scrollY >= s.offsetTop - 120) current = s.getAttribute('id');
    });
    links.forEach(l => {
      l.classList.toggle('active', l.getAttribute('href') === '#' + current);
    });
  });

  // Hamburger
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.querySelector('.nav-links');
  hamburger.addEventListener('click', () => {
    navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
    navLinks.style.flexDirection = 'column';
    navLinks.style.position = 'absolute';
    navLinks.style.top = '68px';
    navLinks.style.left = '0'; navLinks.style.right = '0';
    navLinks.style.background = 'var(--bg-2)';
    navLinks.style.padding = '16px';
    navLinks.style.zIndex = '999';
    navLinks.style.borderBottom = '1px solid var(--border)';
  });
}

// ─── CHAR COUNT & VALIDATION ──────────────────────────────────────────────────
function initCharCount() {
  const input = document.getElementById('messageInput');
  const counter = document.getElementById('charCount');
  input.addEventListener('input', () => {
    const len = input.value.length;
    counter.textContent = `${len} / 500 chars`;
    counter.style.color = len > 450 ? 'var(--red)' : len > 400 ? 'var(--yellow)' : '';
    if (len > 0) {
      document.getElementById('validationMsg').textContent = '';
      input.classList.remove('error');
    }
  });
}

// ─── SCROLL REVEAL ────────────────────────────────────────────────────────────
function initScrollReveal() {
  const revealEls = document.querySelectorAll(
    '.ov-card, .arch-block, .comp-card, .stat-card, .meter-card, .chart-card, .app-card'
  );
  revealEls.forEach(el => el.classList.add('reveal'));

  const observer = new IntersectionObserver(entries => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 60);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(el => observer.observe(el));
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && e.ctrlKey) sendMessage();
  });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' && (e.key === 'Enter' && e.ctrlKey)) {
      sendMessage();
    }
  });

  // Modal close on overlay click
  document.getElementById('componentModal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
}

// ─── RESTORE SESSION ──────────────────────────────────────────────────────────
function restoreSession() {
  const stored = Session.load();
  if (!stored.length) return;

  stored.forEach(item => {
    if (!item.failed) {
      State.successCount++;
      State.totalRecv++;
    } else {
      State.failCount++;
    }
    State.totalSent++;
    addHistoryItem('txHistory', item.msg, item.timestamp || '—', false);
    if (!item.failed) addHistoryItem('rxHistory', item.msg, item.timestamp || '—', true);
  });

  updateStatCards();
  const last = stored[stored.length - 1];
  if (last && !last.failed) {
    const rxScreen = document.getElementById('rxScreen');
    rxScreen.classList.add('has-data');
    rxScreen.innerHTML = `<span style="color:var(--green)">${escapeHtml(last.msg)}</span><span class="rx-cursor"></span>`;
    setEl('decodingScheme', last.encoding || 'OOK');
    setEl('packetsRecvDisplay', State.totalRecv);
    const integrity = document.getElementById('integrityDisplay');
    integrity.textContent = 'CRC OK ✓';
    integrity.className = 'good';
  }

  if (stored.length) showToast(`🔄 Restored ${stored.length} session records`, 'info');
}

// ─── UTILITY ──────────────────────────────────────────────────────────────────
function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function setWidth(id, width) {
  const el = document.getElementById(id);
  if (el) el.style.width = width;
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function shakeElement(el) {
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake 0.4s ease';
}

// Inject shake keyframe
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`;
document.head.appendChild(shakeStyle);

// ─── WINDOW RESIZE ────────────────────────────────────────────────────────────
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { drawAllCharts(); }, 200);
});

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNavbar();
  initCharCount();
  initScrollReveal();
  initKeyboardShortcuts();
  restoreSession();

  // Charts init after fonts load
  setTimeout(() => {
    initCharts();
    // Seed with some initial idle data for visual interest
    for (let i = 0; i < 6; i++) {
      const now = new Date(Date.now() - (5 - i) * 2000);
      State.labels.push(`${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`);
      State.speedHistory.push(0);
      State.signalHistory.push(0);
      State.successHistory.push(State.successCount);
      State.failHistory.push(State.failCount);
    }
    drawAllCharts();
  }, 300);

  // Background idle simulation (gentle)
  let idleTimer = setInterval(() => {
    if (!State.transmitting) {
      State.dataRate = 0; State.signalStrength = 0;
      updateMetricDisplays();
    }
  }, 5000);

  console.log('%c Li-Fi System Initialized ', 'background:#00c8ff;color:#000;font-weight:bold;padding:4px 8px;border-radius:4px;');
  console.log('Ctrl+Enter in textarea to transmit quickly!');
});
