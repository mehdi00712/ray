/* ====== CONFIG ====== */
const TOTAL_CANDLES = 21;
const BLOW_THRESHOLD = 0.12;     // mic loudness threshold (0..1)
const BLOW_RATE_MS   = 400;      // extinguish pace while above threshold
const STARTUP_HINT_MS = 300;     // initial grace before measuring

/* ====== ELEMENTS ====== */
const cake = document.getElementById('cake');
const micBtn = document.getElementById('micBtn');
const remainingEl = document.getElementById('remaining').querySelector('strong');
const levelBar = document.getElementById('level');
const overlay = document.getElementById('overlay');
const resetBtn = document.getElementById('resetBtn');
const confettiCanvas = document.getElementById('confetti');
const ctxConfetti = confettiCanvas.getContext('2d');

/* ====== BUILD CANDLES ====== */
function buildCandles(){
  cake.innerHTML = '';
  // tray to place candles neatly
  const row = document.createElement('div');
  row.className = 'candles';
  for(let i=0;i<TOTAL_CANDLES;i++){
    const c = document.createElement('button');
    c.className = 'candle';
    c.setAttribute('aria-pressed','false');
    c.setAttribute('title','Candle ' + (i+1));
    c.dataset.index = String(i);

    const stick = document.createElement('div'); stick.className='stick';
    const wick  = document.createElement('div'); wick.className='wick';
    const flame = document.createElement('div'); flame.className='flame';

    c.appendChild(stick); c.appendChild(wick); c.appendChild(flame);
    // allow click fallback to blow single candle
    c.addEventListener('click', ()=> extinguishOne());
    row.appendChild(c);
  }
  cake.appendChild(row);
  remainingEl.textContent = TOTAL_CANDLES;
}
buildCandles();

/* ====== STATE ====== */
let candlesOut = 0;
let blowing = false;
let audio;
let analyser;
let dataArray;
let lastExtinguish = 0;

function candlesLeft(){ return TOTAL_CANDLES - candlesOut; }

function updateRemaining(){
  remainingEl.textContent = String(candlesLeft());
  if(candlesLeft() === 0){
    celebrate();
  }
}

function extinguishOne(){
  const list = [...document.querySelectorAll('.candle:not(.out)')];
  if(list.length === 0) return;
  const c = list[0];  // extinguish from left to right
  c.classList.add('out');
  c.setAttribute('aria-pressed','true');
  candlesOut++;
  updateRemaining();
}

/* ====== AUDIO / MIC ====== */
async function enableMic(){
  try{
    micBtn.disabled = true;
    micBtn.textContent = '🎤 Listening…';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true }, video:false });

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audio = new AudioCtx();
    const source = audio.createMediaStreamSource(stream);
    analyser = audio.createAnalyser();
    analyser.fftSize = 2048;
    const bufferLength = analyser.fftSize;
    dataArray = new Uint8Array(bufferLength);
    source.connect(analyser);

    setTimeout(loop, STARTUP_HINT_MS);
  }catch(err){
    console.error(err);
    micBtn.disabled = false;
    micBtn.textContent = '🎤 Enable Microphone';
    alert('Microphone permission is required to blow out the candles.\nYou can still click candles to turn them off one by one.');
  }
}

function loop(){
  if(!analyser) return;
  analyser.getByteTimeDomainData(dataArray);

  // compute normalized loudness (RMS-like)
  let sum = 0;
  for(let i=0;i<dataArray.length;i++){
    const v = (dataArray[i] - 128) / 128; // -1..1
    sum += v*v;
  }
  const rms = Math.sqrt(sum / dataArray.length); // 0..~1
  const now = performance.now();

  // Update level bar
  const pct = Math.min(100, Math.floor(rms * 200)); // more responsive
  levelBar.style.setProperty('--w', pct + '%');
  levelBar.style.setProperty('width', '140px');
  levelBar.style.setProperty('height', '10px');
  levelBar.style.setProperty('borderRadius', '999px');
  levelBar.style.setProperty('background', '#ffffff14');
  levelBar.style.setProperty('position', 'relative');
  levelBar.style.setProperty('overflow', 'hidden');
  levelBar.style.setProperty('--pct', pct);
  levelBar.style.setProperty('--pctText', `"${pct}%"`);
  levelBar.style.setProperty('--label', `"Mic Level"`);

  levelBar.style.setProperty('--afterWidth', pct + '%');
  levelBar.style.setProperty('--afterText', pct + '%');
  levelBar.style.setProperty('--afterBg', 'linear-gradient(90deg, #6ee7ff, #ffd166)');
  levelBar.style.setProperty('--afterShadow', 'none');
  levelBar.style.setProperty('--afterTrans', 'width .08s linear');
  levelBar.style.setProperty('--afterBorder', 'none');
  levelBar.style.setProperty('--afterRadius', '999px');
  levelBar.style.setProperty('--afterPos', '0');

  levelBar.style.setProperty('--glow', pct);

  levelBar.style.setProperty('--ring', Math.min(1,pct/100));

  levelBar.style.setProperty('--progress', pct);

  // Extinguish cadence while above threshold
  if(rms > BLOW_THRESHOLD){
    blowing = true;
    if(now - lastExtinguish > BLOW_RATE_MS){
      extinguishOne();
      lastExtinguish = now;
    }
  }else{
    blowing = false;
  }
  requestAnimationFrame(loop);
}

// fix CSS meter fill using ::after width (set here to avoid extra CSS complexity)
const lvlObserver = new MutationObserver(() => {
  const pct = getComputedStyle(levelBar).getPropertyValue('--afterWidth') || '0%';
  levelBar.style.setProperty('position','relative');
  if(!levelBar.querySelector('.fill')){
    const fill = document.createElement('span');
    fill.className = 'fill';
    Object.assign(fill.style, {
      content: '""', position: 'absolute', left: '0', top:'0', bottom:'0',
      width: '0%', background: 'linear-gradient(90deg,#6ee7ff,#ffd166)',
      borderRadius: '999px', transition: 'width .08s linear'
    });
    levelBar.appendChild(fill);
  }
  levelBar.querySelector('.fill').style.width = pct;
});
lvlObserver.observe(levelBar, {attributes:true, attributeFilter:['style']});

/* ====== RESULT & CONFETTI ====== */
function celebrate(){
  overlay.hidden = false;
  startConfetti();
}
function resetAll(){
  overlay.hidden = true;
  candlesOut = 0;
  buildCandles();
}
resetBtn?.addEventListener('click', resetAll);

/* Simple confetti */
let confettiPieces = [];
function startConfetti(){
  const w = confettiCanvas.width = overlay.clientWidth;
  const h = confettiCanvas.height = overlay.clientHeight;

  confettiPieces = Array.from({length: 200}).map(()=> ({
    x: Math.random()*w,
    y: -Math.random()*h,
    r: 2 + Math.random()*4,
    s: 1 + Math.random()*3,
    a: Math.random()*Math.PI,
    w: 6 + Math.random()*10
  }));

  function tick(){
    ctxConfetti.clearRect(0,0,w,h);
    confettiPieces.forEach(p=>{
      p.y += p.s;
      p.x += Math.sin(p.a+=0.02)*0.8;
      if(p.y > h+10){ p.y = -10; p.x = Math.random()*w; }
      ctxConfetti.beginPath();
      ctxConfetti.rect(p.x, p.y, p.w, p.r);
      ctxConfetti.fillStyle = ['#ffd166','#7df9ff','#ff5d8f','#7dffb0','#c7a6ff'][p.w|0 % 5];
      ctxConfetti.fill();
    });
    if(!overlay.hidden) requestAnimationFrame(tick);
  }
  tick();
}

/* ====== EVENTS ====== */
micBtn.addEventListener('click', enableMic);

/* Accessibility: space/enter on cake to “click” a candle if no mic */
cake.addEventListener('keydown', (e)=>{
  if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); extinguishOne(); }
});

/* Resize confetti canvas with overlay */
window.addEventListener('resize', ()=>{
  if(!overlay.hidden){ startConfetti(); }
});
