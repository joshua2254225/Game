// gamelogic.js
// Usage: import { startGame } from './gamelogic.js'
// then call startGame(canvas, levelConfig)

const DEFAULTS = {
  gravity: 0.45,
  jumpStrength: -8.5,
  pipeGap: 140,
  pipeWidth: 52,
  pipeSpacing: 160,
  speed: 2.2,
  spawnInterval: 90
};

export function startGame(canvas, levelConfig = {}) {
  const cfg = {...DEFAULTS, ...levelConfig};
  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;
  const W = 400;
  const H = 600;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(DPR, DPR);

  let bird = { x: 80, y: H/2, vy: 0, radius: 12, rotation: 0 };
  let pipes = [];
  let frame = 0;
  let score = 0;
  let best = Number(localStorage.getItem('flappy_best') || 0);
  let running = false;
  let gameOver = false;
  let spawnTimer = 0;

  function reset(){
    bird = { x: 80, y: H/2, vy: 0, radius: 12, rotation: 0 };
    pipes = [];
    frame = 0;
    score = 0;
    running = false;
    gameOver = false;
    spawnTimer = 0;
  }

  function spawnPipe(){
    const min = 80;
    const max = H - 160;
    const top = Math.floor(Math.random() * (max - min) + min);
    pipes.push({ x: W + 20, top: top, passed: false });
  }

  function update(){
    frame++;
    if(!gameOver && running){
      bird.vy += cfg.gravity;
      bird.y += bird.vy;
      bird.rotation = Math.max(-0.6, Math.min(1.2, bird.vy / 10));

      spawnTimer++;
      if(spawnTimer >= cfg.spawnInterval){
        spawnTimer = 0;
        spawnPipe();
      }

      // move pipes
      for(let p of pipes){
        p.x -= cfg.speed;
        // scoring
        if(!p.passed && p.x + cfg.pipeWidth < bird.x){
          p.passed = true;
          score++;
          if(score > best){ best = score; localStorage.setItem('flappy_best', best); }
        }
      }
      // remove offscreen
      pipes = pipes.filter(p => p.x + cfg.pipeWidth > -20);

      // collisions with ground or ceiling
      if(bird.y + bird.radius > H - 40 || bird.y - bird.radius < 0){
        gameOver = true;
      }

      // collisions with pipes
      for(let p of pipes){
        const pipeTop = p.top;
        const pipeBottom = p.top + cfg.pipeGap;
        const withinX = bird.x + bird.radius > p.x && bird.x - bird.radius < p.x + cfg.pipeWidth;
        if(withinX && (bird.y - bird.radius < pipeTop || bird.y + bird.radius > pipeBottom)){
          gameOver = true;
        }
      }

      if(gameOver) running = false;
    }
  }

  function draw(){
    // clear
    ctx.clearRect(0,0,W,H);

    // sky background
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, '#70c5ce');
    g.addColorStop(1, '#9be7f0');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    // pipes
    ctx.fillStyle = '#2ea44f';
    for(let p of pipes){
      // top pipe
      ctx.fillRect(p.x, 0, cfg.pipeWidth, p.top);
      // bottom pipe
      ctx.fillRect(p.x, p.top + cfg.pipeGap, cfg.pipeWidth, H - (p.top + cfg.pipeGap) - 40);
    }

    // ground
    ctx.fillStyle = '#dcae6b';
    ctx.fillRect(0, H - 40, W, 40);

    // bird
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rotation);
    ctx.fillStyle = '#ffdd57';
    ctx.beginPath();
    ctx.ellipse(0,0,bird.radius,bird.radius*0.85,0,0,Math.PI*2);
    ctx.fill();
    // eye
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(6, -3, 3, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = '20px system-ui, Arial';
    ctx.fillText('Score: ' + score, 12, 28);
    ctx.fillText('Best: ' + best, 12, 54);

    if(!running && !gameOver){
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(W/2 - 120, H/2 - 40, 240, 80);
      ctx.fillStyle = '#fff';
      ctx.font = '18px system-ui, Arial';
      ctx.fillText('Click or press Space to start', W/2 - 110, H/2);
    }

    if(gameOver){
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(W/2 - 140, H/2 - 80, 280, 160);
      ctx.fillStyle = '#fff';
      ctx.font = '26px system-ui, Arial';
      ctx.fillText('Game Over', W/2 - 70, H/2 - 20);
      ctx.font = '18px system-ui, Arial';
      ctx.fillText('Score: ' + score, W/2 - 40, H/2 + 6);
      ctx.fillText('Click or press R to restart', W/2 - 110, H/2 + 40);
    }
  }

  function loop(){
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // input
  function flap(){
    if(gameOver){
      // do nothing; wait for restart
      return;
    }
    bird.vy = cfg.jumpStrength;
    running = true;
  }

  function onKey(e){
    if(e.code === 'Space' || e.code === 'ArrowUp'){
      e.preventDefault();
      flap();
    } else if(e.key.toLowerCase() === 'r'){
      reset();
    }
  }

  function onClick(){
    if(gameOver){
      reset();
    } else {
      flap();
    }
  }

  // attach events
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('mousedown', onClick);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onClick(); }, {passive:false});

  // start loop
  loop();

  // return control object for level page
  return {
    reset,
    getState: () => ({score, best, running, gameOver}),
    stop: () => {
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('mousedown', onClick);
    }
  };
}
