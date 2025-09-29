/* ========= CONFIG tuned for phones ========= */
const TOTAL_CANDLES = 21;

/* These get refined after auto-calibration */
let THRESH_EASY   = 0.06;  // default fallback (pretty easy)
let THRESH_NORMAL = 0.10;  // default fallback (still easier than before)

const BLOW_RATE_MS = 240;  // extinguish cadence while above threshold

/* ========= Elements ========= */
const cake = document.getElementById('cake');
const micBtn = document.getElementById('micBtn');
const remainingEl = document.getElementById('remaining').querySelector('strong');
const statusEl = document.getElementById('status').querySelector('strong');
const levelBar = document.getElementById('level');
const overlay = document.getElementById('overlay');
const resetBtn = document.getElementById('resetBtn');
const confettiCanvas = document.getElementById('confetti');
const sensSel = document.getElementById('sens');
let ctxConfetti;

/* ========= Build Candles ========= */
function buildCandles(){
  cake.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'candles';
  for(let i=0;i<TOTAL_CANDLES;i++){
    const c = document.createElement('button');
    c.className = 'candle';
    c.type = 'button';
    c.setAttribute('aria-pressed','false');
    c.dataset.index = String(i);

    const stick = document.createElement('div'); stick.className='stick';
    const wick  = document.createElement('div'); wick.className='wick';
    const flame = document.createElement('div'); flame.className='flame';

    c.appendChild(stick); c.appendChild(wick); c.appendChild(flame);
    // Click/tap fallback to blow one
    c.addEventListener('click', extinguishOne, {passive:true});
    row.appendChild(c);
  }
  cake.appendChild(row);
  candlesOut = 0;
  remainingEl.textContent = TOTAL_CANDLES;
}
buildCandles();

/* ========= State ========= */
let candlesOut = 0;
let audio, analyser, dataArray;
let lastExtinguish = 0;
let calibrated = false;
let baseline = 0;

/* ========= Helpers ========= */
function candlesLeft(){ return TOTAL_CANDLES - candlesOut; }
function updateRemaining(){
  remainingEl.textContent = candlesLeft();
  if(candlesLeft() === 0){ celebrate(); }
}
function extinguishOne(){
  const next = document.querySelector('.candle:not(.out)');
  if(!next) return;
  next.classList.add('out');
  next.setAttribute('aria-pressed','true');
  candlesOut++;
  updateRemaining();
}

/* ========= Microphone ========= */
async function enableMic(){
  try{
    // iOS Safari needs a user gesture + resume()
    micBtn.disabled = true;
    micBtn.textContent = '🎤 Asking permission…';
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // Mobile-friendly hints (ignored if not supported)
        sampleRate: 44100,
        channelCount: 1
      },
      video: false
    });

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audio = new AudioCtx();
    if(audio.state === 'suspended'){ await audio.resume(); }

    const source = audio.createMediaStreamSource(stream);
    analyser = audio.createAnalyser();
    analyser.fftSize = 2048;
    const bufferLength = analyser.fftSize;
    dataArray = new Uint8Array(bufferLength);
    source.connect(analyser);

    statusEl.textContent = 'Calibrating…';
    micBtn.textContent = '🎤 Listening';
    // First, gather ~600ms of ambient noise to pick an easy threshold
    await calibrate(600);
    statusEl.textContent = 'Listening';
    loop();
  }catch(err){
    console.error(err);
    micBtn.disabled = false;
    micBtn.textContent = '🎤 Enable Microphone';
    statusEl.textContent = 'Permission needed';
    alert('Please allow microphone access. You can still tap candles to blow them out.');
  }
}

function rmsFromData(){
  analyser.getByteTimeDomainData(dataArray);
  let sum=0;
  for(let i=0;i<dataArray.length;i++){
    const v = (dataArray[i] - 128) / 128;
    sum += v*v;
  }
  return Math.sqrt(sum / dataArray.length); // ~0..1
}

async function calibrate(ms=600){
  const start = performance.now();
  let accum = 0, count = 0;
  while(performance.now() - start < ms){
    const r = rmsFromData();
    accum += r; count++;
    await new Promise(r => requestAnimationFrame(r));
  }
  baseline = (count ? accum / count : 0.015); // typical quiet room
  // Set thresholds a bit above baseline, capped to easy values
  THRESH_EASY   = Math.min(0.08, baseline * 3.2 + 0.03);
  THRESH_NORMAL = Math.min(0.12, baseline * 4.0 + 0.05);
  calibrated = true;
}

function activeThreshold(){
  return (sensSel.value === 'easy') ? THRESH_EASY : THRESH_NORMAL;
}

function loop(){
  if(!analyser) return;
  const r = rmsFromData();

  // Update meter
  updateMeter(r);

  // Blow logic — easier on phones (adaptive threshold)
  const threshold = activeThreshold();
  const now = performance.now();
  if(r > threshold && now - lastExtinguish > BLOW_RATE_MS){
    extinguishOne();
    lastExtinguish = now;
  }

  requestAnimationFrame(loop);
}

/* ========= UI Meter ========= */
function ensureFill(){
  if(!levelBar.querySelector('.fill')){
    const fill = document.createElement('span');
    fill.className = 'fill';
    levelBar.appendChild(fill);
  }
}
function updateMeter(value){
  ensureFill();
  const pct = Math.max(0, Math.min(100, Math.round(value * 260))); // more responsive
  levelBar.querySelector('.fill').style.width = pct + '%';
}

/* ========= Result & Confetti ========= */
function celebrate(){
  overlay.hidden = false;
  startConfetti();
}
function resetAll(){
  overlay.hidden = true;
  buildCandles();
}
resetBtn?.addEventListener('click', resetAll);

function startConfetti(){
  const canvas = confettiCanvas;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(overlay.clientWidth * dpr);
  canvas.height = Math.floor(overlay.clientHeight * dpr);
  canvas.style.width = overlay.clientWidth + 'px';
  canvas.style.height = overlay.clientHeight + 'px';
  ctxConfetti = canvas.getContext('2d');
  ctxConfetti.scale(dpr, dpr);

  const w = overlay.clientWidth;
  const h = overlay.clientHeight;
  let pieces = Array.from({length: 160}).map(()=> ({
    x: Math.random()*w,
    y: -Math.random()*h,
    r: 2 + Math.random()*4,
    s: 1 + Math.random()*3,
    a: Math.random()*Math.PI,
    w: 6 + Math.random()*10,
    col: ['#ffd166','#7df9ff','#ff5d8f','#7dffb0','#c7a6ff'][Math.floor(Math.random()*5)]
  }));

  function tick(){
    ctxConfetti.clearRect(0,0,w,h);
    pieces.forEach(p=>{
      p.y += p.s;
      p.x += Math.sin(p.a+=0.03)*0.95;
      if(p.y > h+10){ p.y = -10; p.x = Math.random()*w; }
      ctxConfetti.beginPath();
      ctxConfetti.rect(p.x, p.y, p.w, p.r);
      ctxConfetti.fillStyle = p.col;
      ctxConfetti.fill();
    });
    if(!overlay.hidden) requestAnimationFrame(tick);
  }
  tick();
}
window.addEventListener('resize', ()=>{
  if(!overlay.hidden){ startConfetti(); }
});

/* ========= Events ========= */
micBtn.addEventListener('click', async ()=>{
  // Some mobile browsers suspend AudioContext until a gesture
  if(!analyser){ await enableMic(); }
  else if(audio?.state === 'suspended'){ await audio.resume(); }
});
sensSel.addEventListener('change', ()=>{/* threshold changes automatically */});

/* Keyboard fallback for accessibility */
cake.addEventListener('keydown', (e)=>{
  if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); extinguishOne(); }
});
