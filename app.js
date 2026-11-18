/**
 * 랜덤 발표 순서 뽑기 - 학급 추첨 시스템 (8학급 지원)
 */

const STORAGE_KEY = 'random_presentation_picker_v1';

// 로또 공 색상 팔레트 (번호대별 색상 구분)
const BALL_PALETTES = [
  { main: '#f59e0b', dark: '#b45309', light: '#fde68a' }, // 노랑/골드 (1~5번)
  { main: '#3b82f6', dark: '#1d4ed8', light: '#93c5fd' }, // 파랑 (6~10번)
  { main: '#f43f5e', dark: '#be123c', light: '#fda4af' }, // 레드/로즈 (11~15번)
  { main: '#10b981', dark: '#047857', light: '#6ee7b7' }, // 에메랄드 (16~20번)
  { main: '#8b5cf6', dark: '#5b21b6', light: '#c4b5fd' }, // 퍼플 (21번~)
];

function getBallColor(num) {
  const n = parseInt(num, 10) || 1;
  const idx = Math.min(Math.floor((n - 1) / 5), BALL_PALETTES.length - 1);
  return BALL_PALETTES[Math.max(0, idx)];
}

// 8학급용 기본 샘플 이름 풀 (18~25명 사이로 학급별 다양하게 구성)
const SAMPLE_SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍', '유', '고', '문', '양', '손'];
const SAMPLE_GIVEN = [
  '민준', '서연', '도윤', '서윤', '시우', '지우', '주원', '하윤', '예준', '하은',
  '유준', '민서', '건우', '지유', '현우', '채원', '우진', '지민', '선우', '수아',
  '서진', '지아', '연우', '다은', '정우', '은서', '승현', '예은', '지훈', '수빈',
  '준혁', '소율', '은우', '예원', '시현', '지원', '민재', '소윤', '현준', '유진'
];

function generateSampleRoster(classIndex) {
  // 학급당 18명 ~ 25명 사이로 생성
  const counts = [22, 24, 20, 25, 19, 23, 21, 24];
  const count = counts[classIndex % counts.length];
  const students = [];
  for (let i = 1; i <= count; i++) {
    const surname = SAMPLE_SURNAMES[(i * 3 + classIndex * 2) % SAMPLE_SURNAMES.length];
    const given = SAMPLE_GIVEN[(i * 5 + classIndex * 7) % SAMPLE_GIVEN.length];
    students.push({
      id: `c${classIndex + 1}_s${i}`,
      num: String(i),
      name: `${surname}${given}`,
      excluded: false,
    });
  }
  return students;
}

function studentsToRawText(students) {
  return students.map((s) => `${s.num}\t${s.name}`).join('\n');
}

/**
 * 엑셀 복사/붙여넣기 파서
 * 지원 포맷:
 * - "1\t김민준" (엑셀 두 열 복사)
 * - "1 김민준" / "1. 김민준" / "1,김민준"
 * - "번호\t이름" 헤더 행 자동 스킵
 * - 이름만 한 줄에 하나씩 있는 경우 자동 번호 부여
 */
function parseExcelRosterText(rawText, classId = 1) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result = [];
  let autoNum = 1;

  for (const line of lines) {
    // 헤더 줄(번호, 이름, 성명, 학번 등)이면 건너뛰기
    if (/^(번호|학번|순번|no\.?)[\s,\t/|]+(이름|성명|학생명|name)/i.test(line)) {
      continue;
    }
    if (/^(번호|이름|성명)$/i.test(line)) {
      continue;
    }

    // 탭, 콤마, 파이프, 공백 등으로 분리 시도
    // 패턴 1: 앞쪽에 숫자(또는 학번) + 구분자 + 이름
    const match = line.match(/^(\d+)[\s\t,./|-]+(.+)$/);
    if (match) {
      const num = match[1].trim();
      const name = match[2].trim();
      result.push({
        id: `c${classId}_${num}_${name}_${result.length}`,
        num,
        name,
        excluded: false,
      });
      autoNum = Math.max(autoNum, parseInt(num, 10) + 1);
    } else {
      // 번호 없이 이름만 있는 경우
      result.push({
        id: `c${classId}_${autoNum}_${line}_${result.length}`,
        num: String(autoNum),
        name: line,
        excluded: false,
      });
      autoNum++;
    }
  }
  return result;
}

// ==========================================
// Web Audio API Synthesizer (효과음)
// ==========================================
class SoundEffects {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTick(freq = 520) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.055);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.06);
  }

  playWinnerPop() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);
      gain.gain.setValueAtTime(0.14, now + idx * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.065 + 0.32);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.35);
    });
  }

  playCompleteFanfare() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5];
    chord.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const start = now + idx * 0.08;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.65);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.68);
    });
  }

  playDomeShakeSound(durationMs = 700) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const hits = Math.max(5, Math.floor(durationMs / 65));
    for (let i = 0; i < hits; i++) {
      const t = now + i * 0.06 + Math.random() * 0.025;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      // 플라스틱 로또 공들이 원통 벽에 부딪히는 경쾌한 통통 소리
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      const baseFreq = 260 + ((i * 85) % 420) + Math.random() * 90;
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.55, t + 0.048);

      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.052);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.055);
    }
  }
}

const sfx = new SoundEffects();

// ==========================================
// Confetti Particle System
// ==========================================
class ConfettiManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.running = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  burst(count = 80) {
    const colors = ['#fbbf24', '#38bdf8', '#f43f5e', '#34d399', '#a78bfa', '#f97316'];
    const cx = this.canvas.width * 0.42;
    const cy = this.canvas.height * 0.48;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 14;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: 6 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.25,
        alpha: 1,
      });
    }

    if (!this.running) {
      this.running = true;
      requestAnimationFrame(() => this.loop());
    }
  }

  loop() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // gravity
      p.vx *= 0.985;
      p.rot += p.vRot;
      p.alpha -= 0.012;

      if (p.alpha <= 0 || p.y > this.canvas.height + 30) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, p.alpha);
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rot);
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      requestAnimationFrame(() => this.loop());
    } else {
      this.running = false;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

// ==========================================
// 2D Physics Lottery Ball Dome Engine
// ==========================================
class LotteryDomeEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.balls = [];
    this.turbulence = 1; // 1 = gentle idle, 6 = vigorous mixing
    this.shakeEndTime = 0;
    this.shakePhase = 0;
    this.vortexAngle = 0;
    this.highlightStudentId = null;
    this.startLoop();
  }

  syncStudents(remainingStudents) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const maxR = this.canvas.width / 2 - 34;

    // 기존 공 위치를 유지하면서 남아있는 학생만 동기화하여 자연스러운 물리 움직임 유지
    const existingMap = new Map(this.balls.map((b) => [b.student.id, b]));

    this.balls = remainingStudents.map((st, idx) => {
      const prev = existingMap.get(st.id);
      const r = remainingStudents.length > 22 ? 24 : 27;
      const palette = getBallColor(st.num);
      if (prev) {
        prev.student = st;
        prev.r = r;
        prev.palette = palette;
        return prev;
      }
      const angle = (idx / Math.max(1, remainingStudents.length)) * Math.PI * 2 + Math.random() * 0.3;
      const dist = Math.random() * (maxR * 0.65);
      return {
        student: st,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 3.2,
        vy: (Math.random() - 0.5) * 3.2,
        r,
        palette,
      };
    });
  }

  setTurbulence(level) {
    this.turbulence = level;
  }

  /**
   * 원통을 물리적으로 강하게 흔들어 공들에 관성 충격파와 회오리 힘을 전달합니다.
   */
  triggerCylinderShake(durationMs = 780) {
    const now = performance.now();
    this.shakeEndTime = Math.max(this.shakeEndTime, now + durationMs);
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    // 즉시 강한 초기 충격파 + 회전 소용돌이 가속도 부여
    this.balls.forEach((b) => {
      const dx = b.x - cx;
      const dy = b.y - cy;
      const tangentialAngle = Math.atan2(dy, dx) + Math.PI / 2;
      const burstSpeed = 9 + Math.random() * 11;
      b.vx += Math.cos(tangentialAngle) * burstSpeed + (Math.random() - 0.5) * 14;
      b.vy += Math.sin(tangentialAngle) * burstSpeed - (4 + Math.random() * 10);
    });

    // 렌더링 순서도 섞어 공들이 입체적으로 뒤섞이는 효과
    for (let i = this.balls.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.balls[i], this.balls[j]] = [this.balls[j], this.balls[i]];
    }
  }

  startLoop() {
    const step = () => {
      this.update();
      this.draw();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  update() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const domeRadius = W / 2 - 14;
    const now = performance.now();
    const isShaking = now < this.shakeEndTime;

    if (isShaking) {
      this.shakePhase += 0.45;
      this.vortexAngle += 0.16;
    } else if (this.turbulence > 1.5) {
      this.vortexAngle += 0.1;
    } else {
      this.vortexAngle += 0.015;
    }

    // 원통이 좌우/상하로 흔들릴 때 내부 공들이 받는 관성 가속도
    const shakeForceX = isShaking ? Math.sin(this.shakePhase * 1.7) * 4.2 : 0;
    const shakeForceY = isShaking ? Math.cos(this.shakePhase * 2.3) * 3.6 : 0;

    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];

      if (isShaking) {
        // 원통 흔들림 관성력 + 회오리 소용돌이 힘
        const dx = b.x - cx;
        const dy = b.y - cy;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const tx = -dy / dist;
        const ty = dx / dist;

        b.vx += shakeForceX + tx * 1.65 + (Math.random() - 0.5) * 3.8;
        b.vy += shakeForceY + ty * 1.65 + (Math.random() - 0.52) * 3.8;
      } else if (this.turbulence > 1.5) {
        // Strong air jet mixing during draw
        b.vx += (Math.random() - 0.5) * 2.4 * this.turbulence;
        b.vy += (Math.random() - 0.52) * 2.4 * this.turbulence;
      } else {
        // Gentle floating / air blower at bottom
        b.vy += 0.18;
        if (b.y > cy + domeRadius * 0.45) {
          b.vy -= 0.48 + Math.random() * 0.35;
          b.vx += (Math.random() - 0.5) * 0.6;
        }
      }

      // Clamp velocity
      const maxSpeed = isShaking ? 19 : this.turbulence > 1.5 ? 15 : 3.8;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > maxSpeed) {
        b.vx = (b.vx / speed) * maxSpeed;
        b.vy = (b.vy / speed) * maxSpeed;
      }

      b.x += b.vx;
      b.y += b.vy;

      // Circular Dome Boundary Collision
      const dx = b.x - cx;
      const dy = b.y - cy;
      const dist = Math.hypot(dx, dy);
      const limit = domeRadius - b.r;

      if (dist > limit && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        b.x = cx + nx * limit;
        b.y = cy + ny * limit;

        // Reflect velocity
        const dot = b.vx * nx + b.vy * ny;
        b.vx -= 1.85 * dot * nx;
        b.vy -= 1.85 * dot * ny;
      }
    }

    // Ball-to-Ball elastic collision
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i];
        const b = this.balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r + 2;

        if (dist < minDist && dist > 0) {
          const overlap = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          // Exchange impulse
          const kx = a.vx - b.vx;
          const ky = a.vy - b.vy;
          const p = 2 * (nx * kx + ny * ky) / 2;
          a.vx -= p * nx * 0.85;
          a.vy -= p * ny * 0.85;
          b.vx += p * nx * 0.85;
          b.vy += p * ny * 0.85;
        }
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Draw subtle grid ring & swirling wind inside dome
    const isShaking = performance.now() < this.shakeEndTime || this.turbulence > 1.5;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(this.vortexAngle);
    ctx.strokeStyle = isShaking ? 'rgba(251, 191, 36, 0.28)' : 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = isShaking ? 3 : 2;
    ctx.setLineDash(isShaking ? [28, 18] : []);
    ctx.beginPath();
    ctx.arc(0, 0, W / 2 - 42, 0, Math.PI * 2);
    ctx.stroke();

    if (isShaking) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([18, 24]);
      ctx.beginPath();
      ctx.arc(0, 0, W / 2 - 82, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (this.balls.length === 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '800 20px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('추첨 완료! 🎉', W / 2, H / 2);
      ctx.restore();
      return;
    }

    for (const b of this.balls) {
      ctx.save();

      // 3D Sphere Gradient
      const grad = ctx.createRadialGradient(
        b.x - b.r * 0.32,
        b.y - b.r * 0.32,
        b.r * 0.12,
        b.x,
        b.y,
        b.r
      );
      grad.addColorStop(0, b.palette.light);
      grad.addColorStop(0.55, b.palette.main);
      grad.addColorStop(1, b.palette.dark);

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // White inner number circle like real lotto balls
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.68, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fill();

      // Number & Name inside ball
      ctx.fillStyle = '#0f172a';
      ctx.font = `900 ${b.r > 25 ? 11 : 10}px Pretendard, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${b.student.num}번`, b.x, b.y - 5);

      ctx.font = `800 ${b.r > 25 ? 11 : 10}px Pretendard, sans-serif`;
      ctx.fillText(b.student.name.slice(0, 4), b.x, b.y + 7);

      ctx.restore();
    }
  }
}

// ==========================================
// Main Application State & Controller
// ==========================================
const state = {
  presentationTitle: '자유 주제 발표',
  currentClassIdx: 0, // 0 to 7 (1반 ~ 8반)
  modalClassIdx: 0,
  animMode: 'ball', // 'ball' | 'slot' | 'card'
  chipClickMode: 'exclude', // 'exclude' (결석/제외) | 'done' (지난 시간 발표완료 체크)
  hasUnsavedUsbDraws: false,
  isDrawing: false,
  autoDrawRunning: false,
  classes: [], // Array of 8 class objects
};

function createInitialState() {
  const classes = [];
  for (let i = 0; i < 8; i++) {
    const students = generateSampleRoster(i);
    classes.push({
      classNum: i + 1,
      className: `${i + 1}반`,
      rawText: studentsToRawText(students),
      students,
      pickedOrder: [], // array of student objects in picked sequence
      drawnAt: null,
    });
  }
  return classes;
}

const ROSTER_FILE_NAME = 'roster_data.js';

function buildRosterJsContent(payload) {
  return (
    `/**\n` +
    ` * 랜덤 발표 순서 뽑기 - 휴대용 학급 명단 및 상태 데이터 파일\n` +
    ` * 이 파일이 index.html과 같은 폴더에 있으면 다른 컴퓨터로 옮겨도 명단이 그대로 유지됩니다.\n` +
    ` */\n` +
    `window.USB_SAVED_STATE = ${JSON.stringify(payload, null, 2)};\n`
  );
}

function parseRosterFileText(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return null;
  // JSON 형태이거나 window.USB_SAVED_STATE = { ... }; 형태 모두 지원
  const jsonMatch = trimmed.match(/window\.USB_SAVED_STATE\s*=\s*([\s\S]+?);?\s*$/);
  const jsonStr = jsonMatch ? jsonMatch[1] : trimmed;
  return JSON.parse(jsonStr);
}

function applyLoadedPayload(parsed) {
  if (!parsed || !Array.isArray(parsed.classes) || parsed.classes.length !== 8) {
    return false;
  }
  state.classes = parsed.classes;
  state.presentationTitle = parsed.presentationTitle || '자유 주제 발표';
  state.currentClassIdx =
    typeof parsed.currentClassIdx === 'number' ? parsed.currentClassIdx : 0;
  state.updatedAt = parsed.updatedAt || 0;
  return true;
}

function loadState() {
  let localParsed = null;
  let usbParsed = null;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const p = JSON.parse(saved);
      if (p && Array.isArray(p.classes) && p.classes.length === 8) {
        localParsed = p;
      }
    }
  } catch (e) {
    console.warn('브라우저 저장소 상태 읽기 실패:', e);
  }

  try {
    if (
      window.USB_SAVED_STATE &&
      Array.isArray(window.USB_SAVED_STATE.classes) &&
      window.USB_SAVED_STATE.classes.length === 8
    ) {
      usbParsed = window.USB_SAVED_STATE;
    }
  } catch (e) {
    console.warn('USB 명단 파일 읽기 실패:', e);
  }

  // USB 폴더의 roster_data.js와 브라우저 localStorage 중 더 최신 데이터를 우선 적용
  // (다른 컴퓨터에 처음 꽂았을 때는 localParsed가 없으므로 usbParsed가 즉시 적용됨)
  const localTime = localParsed?.updatedAt || 0;
  const usbTime = usbParsed?.updatedAt || 0;

  if (usbParsed && (!localParsed || usbTime >= localTime)) {
    applyLoadedPayload(usbParsed);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(usbParsed));
    } catch (_) {}
    return;
  }

  if (localParsed) {
    applyLoadedPayload(localParsed);
    return;
  }

  state.classes = createInitialState();
  state.updatedAt = 0;
}

function saveState() {
  const payload = {
    updatedAt: Date.now(),
    presentationTitle: state.presentationTitle,
    currentClassIdx: state.currentClassIdx,
    classes: state.classes,
  };
  state.updatedAt = payload.updatedAt;
  window.USB_SAVED_STATE = payload;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('상태 저장 실패:', e);
  }

  // 연결된 USB 폴더 또는 로컬 실행기 서버가 있으면 roster_data.js 파일에도 즉시 자동 동기화
  syncRosterToUsbFolder(payload, false).then((savedToUsb) => {
    state.hasUnsavedUsbDraws = !savedToUsb;
    updateSaveProgressBtnUI();
  });
}

function updateSaveProgressBtnUI() {
  const btn = document.getElementById('btn-save-progress');
  if (!btn) return;
  const cls = getCurrentClass();
  const hasPicked = cls && cls.pickedOrder.length > 0;
  if (hasPicked && state.hasUnsavedUsbDraws && !localUsbServerReady) {
    btn.classList.add('needs-save');
    btn.textContent = '⏸️ 이어하기 저장 ●';
  } else {
    btn.classList.remove('needs-save');
    btn.textContent = '⏸️ 이어하기 저장';
  }
}

function getCurrentClass() {
  return state.classes[state.currentClassIdx];
}

function getRemainingStudents(cls) {
  const pickedIds = new Set(cls.pickedOrder.map((s) => s.id));
  return cls.students.filter((s) => !s.excluded && !pickedIds.has(s.id));
}

function getActiveStudents(cls) {
  return cls.students.filter((s) => !s.excluded);
}

function formatKoreanDateTime(isoStr) {
  const d = isoStr ? new Date(isoStr) : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}. ${mm}. ${dd}. ${hh}:${min}`;
}

function showToast(msg) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 2600);
}

// ==========================================
// UI Rendering & Synchronization
// ==========================================
let domeEngine = null;
let confetti = null;

function renderClassTabs() {
  const nav = document.getElementById('class-tabs');
  nav.innerHTML = '';

  state.classes.forEach((cls, idx) => {
    const activeCount = getActiveStudents(cls).length;
    const pickedCount = cls.pickedOrder.length;
    const isDone = activeCount > 0 && pickedCount >= activeCount;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `class-tab-btn ${idx === state.currentClassIdx ? 'active' : ''} ${isDone ? 'done' : ''}`;
    btn.innerHTML = `
      <span>${cls.className}</span>
      <span class="class-tab-count">${isDone ? '완료✓' : `${pickedCount}/${activeCount}`}</span>
    `;
    btn.addEventListener('click', () => {
      if (state.isDrawing) return;
      stopAutoDraw();
      state.currentClassIdx = idx;
      saveState();
      hideWinnerSpotlight();
      updateAllUI();
    });
    nav.appendChild(btn);
  });
}

function updateStatsAndPool() {
  const cls = getCurrentClass();
  const total = cls.students.length;
  const active = getActiveStudents(cls).length;
  const drawn = cls.pickedOrder.length;
  const remain = Math.max(0, active - drawn);

  document.getElementById('current-class-badge').textContent = cls.className;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-drawn').textContent = drawn;
  document.getElementById('stat-remain').textContent = remain;

  // Render Pool Chips
  const poolContainer = document.getElementById('pool-chips');
  poolContainer.innerHTML = '';
  poolContainer.classList.toggle('done-mode-active', state.chipClickMode === 'done');
  const pickedIds = new Set(cls.pickedOrder.map((s) => s.id));

  cls.students.forEach((st) => {
    const isDrawn = pickedIds.has(st.id);
    const chip = document.createElement('span');
    chip.className = `student-chip ${isDrawn ? 'drawn' : ''} ${st.excluded ? 'excluded' : ''}`;
    chip.title = isDrawn
      ? '이미 발표 완료(추첨됨) — 우측 리스트에서 ✕ 버튼으로 취소 가능'
      : state.chipClickMode === 'done'
      ? '클릭하여 지난 시간 발표 완료자로 즉시 등록 (결석 처리가 아닌 발표 순서에 추가)'
      : '클릭: 결석/제외 토글 · Shift+클릭(또는 우클릭): 지난 시간 발표 완료자로 즉시 추가';
    chip.innerHTML = `<span class="chip-num">${st.num}번</span><span>${st.name}</span>`;

    if (!isDrawn) {
      const markAsAlreadyPresented = () => {
        if (state.isDrawing) return;
        st.excluded = false;
        cls.pickedOrder.push({
          id: st.id,
          num: st.num,
          name: st.name,
          excluded: false,
        });
        cls.drawnAt = new Date().toISOString();
        saveState();
        updateAllUI();
        showToast(
          `✅ [${st.num}번 ${st.name}] 학생을 발표 완료(${cls.pickedOrder.length}번)로 등록했습니다.`
        );
      };

      chip.addEventListener('click', (e) => {
        if (state.isDrawing) return;
        if (e.shiftKey || state.chipClickMode === 'done') {
          markAsAlreadyPresented();
          return;
        }
        st.excluded = !st.excluded;
        saveState();
        updateAllUI();
        showToast(
          st.excluded
            ? `🚫 ${st.num}번 ${st.name} 학생이 오늘 추첨에서 제외(결석)되었습니다.`
            : `🙌 ${st.num}번 ${st.name} 학생이 추첨 대상에 포함되었습니다.`
        );
      });

      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        markAsAlreadyPresented();
      });
    }
    poolContainer.appendChild(chip);
  });

  // Update Buttons state
  const btnOne = document.getElementById('btn-draw-one');
  const btnAuto = document.getElementById('btn-draw-auto');
  const btnAll = document.getElementById('btn-draw-all');
  const btnOneText = document.getElementById('btn-draw-one-text');

  if (remain === 0 && active > 0) {
    btnOne.disabled = true;
    btnAll.disabled = true;
    btnOneText.textContent = '추첨 완료! (전체 결과 보기)';
  } else {
    btnOne.disabled = state.isDrawing;
    btnAll.disabled = state.isDrawing;
    btnOneText.textContent = `${drawn + 1}번째 발표자 뽑기 (Space)`;
  }

  if (domeEngine) {
    domeEngine.syncStudents(getRemainingStudents(cls));
  }
}

function renderSidebarPickedList() {
  const cls = getCurrentClass();
  const listEl = document.getElementById('picked-list');
  const emptyEl = document.getElementById('empty-list-state');
  const metaEl = document.getElementById('sidebar-meta');
  const activeCount = getActiveStudents(cls).length;

  listEl.innerHTML = '';

  if (cls.pickedOrder.length === 0) {
    emptyEl.style.display = 'flex';
    metaEl.textContent = `${cls.className} · 총 ${activeCount}명 대기 중`;
    return;
  }

  emptyEl.style.display = 'none';
  metaEl.textContent = `${cls.className} · ${cls.pickedOrder.length}/${activeCount}명 추첨 (${formatKoreanDateTime(cls.drawnAt)})`;

  cls.pickedOrder.forEach((st, idx) => {
    const li = document.createElement('li');
    const isLatest = idx === cls.pickedOrder.length - 1;
    li.className = `picked-item ${isLatest ? 'latest' : ''}`;

    const palette = getBallColor(st.num);
    li.innerHTML = `
      <div class="picked-left">
        <span class="order-badge">${idx + 1}순번</span>
        <span class="picked-name">${st.name}</span>
      </div>
      <div class="picked-right">
        <div class="picked-num-ball" style="background: radial-gradient(circle at 30% 30%, ${palette.light}, ${palette.main} 65%, ${palette.dark});">
          ${st.num}
        </div>
        <button type="button" class="picked-remove-btn" title="${st.name} 학생을 발표 리스트에서 빼고 대기열로 되돌리기">✕</button>
      </div>
    `;
    const removeBtn = li.querySelector('.picked-remove-btn');
    removeBtn.addEventListener('click', () => {
      if (state.isDrawing) return;
      cls.pickedOrder.splice(idx, 1);
      saveState();
      hideWinnerSpotlight();
      updateAllUI();
      showToast(`↩ [${st.num}번 ${st.name}] 학생을 다시 추첨 대기열로 되돌렸습니다.`);
    });
    listEl.appendChild(li);
  });

  // Scroll to bottom so latest picked student is visible
  const container = document.getElementById('picked-list-container');
  container.scrollTop = container.scrollHeight;
}

function renderFullscreenResultBoard() {
  const cls = getCurrentClass();
  const titleVal = document.getElementById('presentation-title').value.trim() || '발표 순서';

  document.getElementById('board-class-tag').textContent = cls.className;
  document.getElementById('board-main-title').textContent = `${titleVal} 순서표`;
  document.getElementById('board-date-val').textContent = formatKoreanDateTime(cls.drawnAt);
  document.getElementById('board-count-val').textContent = `총 ${cls.pickedOrder.length}명`;

  const excludedList = cls.students.filter((s) => s.excluded);
  document.getElementById('board-excluded-info').textContent =
    excludedList.length > 0
      ? `결석/제외 (${excludedList.length}명): ${excludedList.map((s) => `${s.num}번 ${s.name}`).join(', ')}`
      : '결석/제외 인원: 없음 (전원 참여)';

  const grid = document.getElementById('board-grid');
  grid.innerHTML = '';

  // Adjust columns dynamically based on student count (18~25 fits 5 columns x 4~5 rows)
  const count = cls.pickedOrder.length;
  const cols = count <= 16 ? 4 : 5;
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  cls.pickedOrder.forEach((st, idx) => {
    const orderNum = idx + 1;
    const palette = getBallColor(st.num);
    const cell = document.createElement('div');
    cell.className = `board-cell ${orderNum <= 3 ? `rank-${orderNum}` : ''}`;

    cell.innerHTML = `
      <div class="cell-left">
        <span class="cell-order">${orderNum}번째 발표</span>
        <span class="cell-name">${st.name}</span>
      </div>
      <div class="cell-ball" style="background: radial-gradient(circle at 30% 30%, ${palette.light}, ${palette.main} 65%, ${palette.dark});">
        ${st.num}
      </div>
    `;
    grid.appendChild(cell);
  });
}

function updateAllUI() {
  document.getElementById('presentation-title').value = state.presentationTitle;
  renderClassTabs();
  updateStatsAndPool();
  renderSidebarPickedList();
  renderFullscreenResultBoard();
  updateSaveProgressBtnUI();
}

function showFullResultView() {
  renderFullscreenResultBoard();
  document.getElementById('draw-view').classList.add('hidden');
  document.getElementById('full-result-view').classList.remove('hidden');
}

function showDrawView() {
  document.getElementById('full-result-view').classList.add('hidden');
  document.getElementById('draw-view').classList.remove('hidden');
}

// ==========================================
// Lottery Draw Logic & Animations
// ==========================================
let spotlightTimer = null;

function hideWinnerSpotlight() {
  if (spotlightTimer) clearTimeout(spotlightTimer);
  document.getElementById('winner-spotlight').classList.add('hidden');
}

function showWinnerSpotlight(student, orderNumber, clsName) {
  const spot = document.getElementById('winner-spotlight');
  const palette = getBallColor(student.num);

  document.getElementById('winner-order-badge').textContent = `🎉 ${orderNumber}번째 발표자 당첨!`;
  document.getElementById('winner-num').textContent = student.num;
  document.getElementById('winner-name').textContent = student.name;
  document.getElementById('winner-sub').textContent = `${clsName} · ${student.num}번`;

  const ballEl = document.getElementById('winner-ball');
  ballEl.style.background = `radial-gradient(circle at 30% 30%, ${palette.light}, ${palette.main} 65%, ${palette.dark})`;

  spot.classList.remove('hidden');
  // Re-trigger animation
  spot.style.animation = 'none';
  void spot.offsetWidth;
  spot.style.animation = '';
}

async function drawNextStudent() {
  if (state.isDrawing) return;

  const cls = getCurrentClass();
  const remaining = getRemainingStudents(cls);
  if (remaining.length === 0) {
    showFullResultView();
    return;
  }

  state.isDrawing = true;
  hideWinnerSpotlight();
  updateStatsAndPool();

  const speedMode = document.getElementById('speed-select').value;
  // Cryptographically strong random index if available
  const randArray = new Uint32Array(1);
  window.crypto.getRandomValues(randArray);
  const winnerIdx = randArray[0] % remaining.length;
  const winner = remaining[winnerIdx];
  const nextOrder = cls.pickedOrder.length + 1;

  const duration =
    speedMode === 'instant' ? 60 : speedMode === 'fast' ? 550 : 1450;

  if (duration > 100) {
    await runLotteryAnimation(remaining, winner, nextOrder, duration);
  }

  // Commit picked student
  cls.pickedOrder.push(winner);
  cls.drawnAt = new Date().toISOString();
  saveState();

  state.isDrawing = false;
  updateAllUI();

  // Effects
  const isAllDone = getRemainingStudents(cls).length === 0;
  if (isAllDone) {
    sfx.playCompleteFanfare();
    confetti.burst(150);
    showWinnerSpotlight(winner, nextOrder, cls.className);
    stopAutoDraw();
    // Auto transition to full result view after brief pause so class sees the last pick
    setTimeout(() => {
      hideWinnerSpotlight();
      showFullResultView();
      showToast(`🎊 ${cls.className} 전원 추첨이 완료되어 전체 순서표로 전환되었습니다!`);
    }, 1500);
  } else {
    sfx.playWinnerPop();
    confetti.burst(55);
    showWinnerSpotlight(winner, nextOrder, cls.className);
  }
}

let domeShakeVisualTimer = null;

function triggerDomeVisualShake(durationMs = 780) {
  const domeWrap = document.getElementById('dome-wrapper');
  if (domeWrap) {
    domeWrap.classList.remove('shaking');
    void domeWrap.offsetWidth;
    domeWrap.classList.add('shaking');
    if (domeShakeVisualTimer) clearTimeout(domeShakeVisualTimer);
    domeShakeVisualTimer = setTimeout(() => {
      domeWrap.classList.remove('shaking');
    }, durationMs);
  }
  if (domeEngine) {
    domeEngine.triggerCylinderShake(durationMs);
  }
  sfx.playDomeShakeSound(durationMs);
}

function shakeLotteryDomeManually() {
  const cls = getCurrentClass();
  const remaining = getRemainingStudents(cls);
  if (remaining.length === 0) {
    showToast('⚠️ 현재 원통 안에 남은 학생 공이 없습니다!');
    return;
  }
  hideWinnerSpotlight();
  triggerDomeVisualShake(760);
  showToast(`🌪️ 로또 원통을 신나게 흔들어 ${remaining.length}개의 공을 다시 섞었습니다!`);
}

async function handleSaveProgressForNextClass() {
  const cls = getCurrentClass();
  const payload = {
    updatedAt: Date.now(),
    presentationTitle: state.presentationTitle,
    currentClassIdx: state.currentClassIdx,
    classes: state.classes,
  };
  state.updatedAt = payload.updatedAt;
  window.USB_SAVED_STATE = payload;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}

  const savedToUsb = await syncRosterToUsbFolder(payload, true);
  if (savedToUsb) {
    state.hasUnsavedUsbDraws = false;
    updateSaveProgressBtnUI();
    showToast(
      `💾 [${cls.className} ${cls.pickedOrder.length}명 완료 기록]이 USB 앱 폴더(roster_data.js)에 저장되었습니다! 다음 시간에 이어서 뽑을 수 있습니다.`
    );
    return;
  }

  // 만약 폴더 선택 API가 지원되지 않는 브라우저라면 roster_data.js 파일 다운로드 폴백 제공
  if (typeof window.showDirectoryPicker !== 'function') {
    const jsContent = buildRosterJsContent(payload);
    const blob = new Blob([jsContent], { type: 'application/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ROSTER_FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`💾 [${ROSTER_FILE_NAME}] 파일이 다운로드되었습니다. 앱 폴더에 덮어쓰면 다음 시간에 이어집니다!`);
  } else {
    showToast('⚠️ 폴더 선택이 취소되었습니다. 다른 컴퓨터에서도 이어하려면 앱이 있는 USB 폴더를 선택해 주세요.');
  }
}

function runLotteryAnimation(remaining, winner, nextOrder, duration) {
  return new Promise((resolve) => {
    const startTime = performance.now();
    let lastTick = 0;

    // Mode specific prep
    if (state.animMode === 'ball' && domeEngine) {
      domeEngine.setTurbulence(6.5);
      triggerDomeVisualShake(Math.min(duration, 920));
    }

    const flipCard = document.getElementById('flip-card');
    if (state.animMode === 'card') {
      flipCard.classList.remove('flipped');
      flipCard.classList.add('spinning');
    }

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Tick sound & roulette cycling at decelerating intervals
      const tickInterval = 45 + progress * 140;
      if (now - lastTick >= tickInterval) {
        lastTick = now;
        const randomCandidate =
          remaining[Math.floor(Math.random() * remaining.length)];
        sfx.playTick(420 + Math.floor(progress * 320));

        // Update Slot Machine Windows
        document.getElementById('slot-order-val').textContent = `${nextOrder}번째`;
        document.getElementById('slot-num-val').textContent = `${randomCandidate.num}번`;
        document.getElementById('slot-name-val').textContent = randomCandidate.name;
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        // Finish animation on exact winner
        if (domeEngine) domeEngine.setTurbulence(1);

        document.getElementById('slot-order-val').textContent = `${nextOrder}번째`;
        document.getElementById('slot-num-val').textContent = `${winner.num}번`;
        document.getElementById('slot-name-val').textContent = winner.name;

        if (state.animMode === 'card') {
          flipCard.classList.remove('spinning');
          document.getElementById('card-order-val').textContent = `${nextOrder}번째 발표자`;
          document.getElementById('card-num-val').textContent = winner.num;
          document.getElementById('card-name-val').textContent = winner.name;
          flipCard.classList.add('flipped');
        }

        resolve();
      }
    };

    requestAnimationFrame(step);
  });
}

// Auto-Draw Loop
let autoDrawTimer = null;

function toggleAutoDraw() {
  if (state.autoDrawRunning) {
    stopAutoDraw();
  } else {
    const cls = getCurrentClass();
    if (getRemainingStudents(cls).length === 0) {
      showFullResultView();
      return;
    }
    state.autoDrawRunning = true;
    const btn = document.getElementById('btn-draw-auto');
    btn.classList.add('running');
    document.getElementById('btn-draw-auto-text').textContent = '자동 추첨 일시정지';
    runAutoDrawStep();
  }
}

function stopAutoDraw() {
  state.autoDrawRunning = false;
  if (autoDrawTimer) {
    clearTimeout(autoDrawTimer);
    autoDrawTimer = null;
  }
  const btn = document.getElementById('btn-draw-auto');
  if (btn) {
    btn.classList.remove('running');
    document.getElementById('btn-draw-auto-text').textContent = '연속 자동 뽑기';
  }
}

async function runAutoDrawStep() {
  if (!state.autoDrawRunning) return;
  const cls = getCurrentClass();
  if (getRemainingStudents(cls).length === 0) {
    stopAutoDraw();
    return;
  }
  await drawNextStudent();
  if (state.autoDrawRunning && getRemainingStudents(cls).length > 0) {
    const speedMode = document.getElementById('speed-select').value;
    const pauseMs = speedMode === 'instant' ? 220 : speedMode === 'fast' ? 650 : 1200;
    autoDrawTimer = setTimeout(runAutoDrawStep, pauseMs);
  }
}

// Instant Draw All Remaining
function drawAllRemainingInstantly() {
  if (state.isDrawing) return;
  stopAutoDraw();

  const cls = getCurrentClass();
  const remaining = [...getRemainingStudents(cls)];
  if (remaining.length === 0) {
    showFullResultView();
    return;
  }

  // Fisher-Yates shuffle with crypto random
  for (let i = remaining.length - 1; i > 0; i--) {
    const rand = new Uint32Array(1);
    window.crypto.getRandomValues(rand);
    const j = rand[0] % (i + 1);
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }

  cls.pickedOrder.push(...remaining);
  cls.drawnAt = new Date().toISOString();
  saveState();
  hideWinnerSpotlight();
  updateAllUI();

  sfx.playCompleteFanfare();
  confetti.burst(140);
  showFullResultView();
  showToast(`⚡ ${cls.className} 남은 ${remaining.length}명 전원의 발표 순서가 완성되었습니다!`);
}

// ==========================================
// High-Resolution Canvas Image Exporter & Clipboard Copy
// ==========================================
function renderResultToCanvas(cls) {
  const titleVal = document.getElementById('presentation-title').value.trim() || '발표 순서';
  const dateStr = formatKoreanDateTime(cls.drawnAt);
  const picked = cls.pickedOrder;
  const excludedList = cls.students.filter((s) => s.excluded);

  // Full HD 1920x1080 Canvas
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  // 1. Deep Gradient Background
  const bgGrad = ctx.createLinearGradient(0, 0, 1920, 1080);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.5, '#131c38');
  bgGrad.addColorStop(1, '#090d1a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1920, 1080);

  // Subtle decorative glow circles
  const glow1 = ctx.createRadialGradient(300, 150, 20, 300, 150, 500);
  glow1.addColorStop(0, 'rgba(99, 102, 241, 0.22)');
  glow1.addColorStop(1, 'transparent');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, 1920, 1080);

  // 2. Header Area
  // Class Badge
  ctx.fillStyle = '#f59e0b';
  roundRect(ctx, 70, 52, 130, 64, 16);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 32px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cls.className, 135, 84);

  // Title
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 44px Pretendard, sans-serif';
  ctx.fillText(`${titleVal} 순서표`, 224, 84);

  // Meta Info (Right side)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 20px Pretendard, sans-serif';
  ctx.fillText(`추첨 일시: ${dateStr}   |   참여 인원: 총 ${picked.length}명`, 1850, 84);

  // Header Divider
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, 140);
  ctx.lineTo(1850, 140);
  ctx.stroke();

  // 3. Grid of Picked Students (Up to 25+ students neatly fitted)
  const cols = picked.length <= 16 ? 4 : 5;
  const rows = Math.max(4, Math.ceil(picked.length / cols));
  const gridLeft = 70;
  const gridTop = 170;
  const gridWidth = 1780;
  const gridHeight = 810;
  const gapX = 22;
  const gapY = 20;

  const cellW = (gridWidth - gapX * (cols - 1)) / cols;
  const cellH = (gridHeight - gapY * (rows - 1)) / rows;

  picked.forEach((st, idx) => {
    const orderNum = idx + 1;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = gridLeft + col * (cellW + gapX);
    const y = gridTop + row * (cellH + gapY);

    // Card Background
    ctx.save();
    if (orderNum === 1) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
    } else if (orderNum === 2) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.65)';
    } else if (orderNum === 3) {
      ctx.fillStyle = 'rgba(217, 119, 6, 0.18)';
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.6)';
    } else {
      ctx.fillStyle = 'rgba(30, 41, 75, 0.85)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    }

    ctx.lineWidth = 2;
    roundRect(ctx, x, y, cellW, cellH, 20);
    ctx.fill();
    ctx.stroke();

    // Order Label
    ctx.fillStyle = '#fbbf24';
    ctx.font = '800 20px Pretendard, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${orderNum}번째 발표`, x + 24, y + cellH * 0.34);

    // Student Name
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px Pretendard, sans-serif';
    ctx.fillText(st.name, x + 24, y + cellH * 0.68);

    // Student Number Ball
    const palette = getBallColor(st.num);
    const ballR = Math.min(32, cellH * 0.28);
    const bx = x + cellW - ballR - 22;
    const by = y + cellH / 2;

    const ballGrad = ctx.createRadialGradient(bx - 8, by - 8, 4, bx, by, ballR);
    ballGrad.addColorStop(0, palette.light);
    ballGrad.addColorStop(0.6, palette.main);
    ballGrad.addColorStop(1, palette.dark);

    ctx.beginPath();
    ctx.arc(bx, by, ballR, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 24px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${st.num}`, bx, by);

    ctx.restore();
  });

  // 4. Footer Info
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 18px Pretendard, sans-serif';
  ctx.textAlign = 'left';
  const exclText =
    excludedList.length > 0
      ? `결석/제외 (${excludedList.length}명): ${excludedList.map((s) => `${s.num}번 ${s.name}`).join(', ')}`
      : '결석/제외 인원: 없음 (전원 참여)';
  ctx.fillText(exclText, 70, 1028);

  ctx.textAlign = 'right';
  ctx.fillText('랜덤 발표 순서 뽑기 시스템', 1850, 1028);

  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
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

// ==========================================
// USB Portable Folder Save Manager ('뽑기 결과' 폴더 생성 및 저장)
// ==========================================
const RESULT_FOLDER_NAME = '뽑기 결과';
const IDB_NAME = 'random_picker_usb_fs_db';
const IDB_STORE = 'dir_handles';
const IDB_KEY_APP_DIR = 'usb_app_dir_handle';

let usbAppDirHandle = null;      // 사용자가 선택한 앱 폴더 핸들
let resultSubDirHandle = null;   // 앱 폴더 내부의 '뽑기 결과' 폴더 핸들
let localUsbServerReady = false; // 로컬 USB 런처 서버 연결 여부

function sanitizeFilename(str) {
  return String(str || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
}

function getLocalDateString(isoStr) {
  const d = isoStr ? new Date(isoStr) : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function updateSaveFolderBadge(isLinked, labelOverride) {
  const btn = document.getElementById('btn-set-save-folder');
  const txt = document.getElementById('save-folder-text');
  if (!btn || !txt) return;

  if (isLinked) {
    btn.classList.add('folder-linked');
    txt.textContent = labelOverride || `저장폴더: ${RESULT_FOLDER_NAME} ✓`;
  } else {
    btn.classList.remove('folder-linked');
    txt.textContent = labelOverride || `저장폴더: ${RESULT_FOLDER_NAME}`;
  }
}

function openHandleDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDirHandleToIDB(handle) {
  try {
    const db = await openHandleDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, IDB_KEY_APP_DIR);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    // file:// 환경 등에서 IDB 핸들 저장이 제한될 경우 세션 메모리 핸들만 사용
  }
}

async function loadDirHandleFromIDB() {
  try {
    const db = await openHandleDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY_APP_DIR);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

async function initUsbSaveSystem() {
  // 1) 로컬 USB 실행기 서버가 동작 중인지 확인 (HTTP 환경인 경우)
  if (location.protocol.startsWith('http')) {
    try {
      const res = await fetch('/api/usb-status', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          localUsbServerReady = true;
          updateSaveFolderBadge(true, `자동저장: ${RESULT_FOLDER_NAME} ✓`);
          return;
        }
      }
    } catch (_) {
      // 정적 서버이거나 일반 실행 환경
    }
  }

  // 2) 브라우저 File System Access API에 저장된 앱 폴더 핸들 복원 시도
  const savedHandle = await loadDirHandleFromIDB();
  if (savedHandle) {
    usbAppDirHandle = savedHandle;
    try {
      const perm = await usbAppDirHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        resultSubDirHandle =
          usbAppDirHandle.name === RESULT_FOLDER_NAME
            ? usbAppDirHandle
            : await usbAppDirHandle.getDirectoryHandle(RESULT_FOLDER_NAME, { create: true });
        updateSaveFolderBadge(true, `저장폴더: ${RESULT_FOLDER_NAME} ✓`);
        await syncOrReadRosterFromDirHandle(usbAppDirHandle);
      } else {
        updateSaveFolderBadge(false, `저장폴더: ${RESULT_FOLDER_NAME} (권한확인)`);
      }
    } catch (_) {
      updateSaveFolderBadge(false);
    }
  }
}

async function syncOrReadRosterFromDirHandle(dirHandle) {
  if (!dirHandle || dirHandle.name === RESULT_FOLDER_NAME) return;
  try {
    const fileHandle = await dirHandle.getFileHandle(ROSTER_FILE_NAME, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    const parsed = parseRosterFileText(text);
    if (parsed && (parsed.updatedAt || 0) > (state.updatedAt || 0)) {
      if (applyLoadedPayload(parsed)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        updateAllUI();
      }
    }
  } catch (_) {
    // 아직 roster_data.js가 없거나 읽기 전인 경우 현재 상태를 기록
  }
}

async function syncRosterToUsbFolder(payload, promptIfDisconnected = false) {
  const jsContent = buildRosterJsContent(payload);

  // 1) 로컬 USB 실행기 서버가 켜져 있으면 서버를 통해 앱 폴더 내 roster_data.js 즉시 갱신
  if (localUsbServerReady) {
    try {
      const res = await fetch('/api/save-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsContent }),
      });
      if (res.ok) return true;
    } catch (e) {
      console.warn('로컬 서버 명단 저장 실패:', e);
    }
  }

  // 2) 브라우저 File System Access API로 앱 폴더 내 roster_data.js 직접 기록
  if (typeof window.showDirectoryPicker === 'function') {
    try {
      if (!usbAppDirHandle && promptIfDisconnected) {
        await ensureResultDirectoryHandle(false);
      }
      if (usbAppDirHandle) {
        let perm = await usbAppDirHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted' && promptIfDisconnected) {
          perm = await usbAppDirHandle.requestPermission({ mode: 'readwrite' });
        }
        if (perm === 'granted') {
          const fileHandle = await usbAppDirHandle.getFileHandle(ROSTER_FILE_NAME, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(jsContent);
          await writable.close();
          return true;
        }
      }
    } catch (e) {
      if (promptIfDisconnected) {
        console.warn('USB 폴더에 roster_data.js 직접 저장 실패:', e);
      }
    }
  }
  return false;
}

/**
 * 사용자가 선택한 앱 폴더 안에 '뽑기 결과' 폴더를 자동 생성(create: true)하고 핸들을 반환합니다.
 */
async function ensureResultDirectoryHandle(forcePickNewFolder = false) {
  if (typeof window.showDirectoryPicker !== 'function') {
    return null;
  }

  // 이미 핸들이 있고 재선택 요청이 아닌 경우 권한 확인 후 '뽑기 결과' 폴더 확보
  if (usbAppDirHandle && !forcePickNewFolder) {
    try {
      let perm = await usbAppDirHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        perm = await usbAppDirHandle.requestPermission({ mode: 'readwrite' });
      }
      if (perm === 'granted') {
        resultSubDirHandle =
          usbAppDirHandle.name === RESULT_FOLDER_NAME
            ? usbAppDirHandle
            : await usbAppDirHandle.getDirectoryHandle(RESULT_FOLDER_NAME, { create: true });
        updateSaveFolderBadge(true, `저장폴더: ${RESULT_FOLDER_NAME} ✓`);
        return resultSubDirHandle;
      }
    } catch (e) {
      console.warn('기존 폴더 접근 실패, 새 폴더 선택으로 전환합니다:', e);
    }
  }

  // 폴더 선택 창 열기 (앱이 있는 USB 폴더를 선택하면 내부에 '뽑기 결과' 폴더 자동 생성)
  showToast(`📂 앱이 있는 USB 폴더를 선택해 주세요! 폴더 안에 [${RESULT_FOLDER_NAME}] 폴더를 자동 생성합니다.`);
  const pickedDir = await window.showDirectoryPicker({
    id: 'random_presentation_usb_dir',
    mode: 'readwrite',
  });

  usbAppDirHandle = pickedDir;
  await saveDirHandleToIDB(pickedDir);

  if (pickedDir.name === RESULT_FOLDER_NAME) {
    resultSubDirHandle = pickedDir;
  } else {
    resultSubDirHandle = await pickedDir.getDirectoryHandle(RESULT_FOLDER_NAME, { create: true });
  }

  updateSaveFolderBadge(true, `저장폴더: ${RESULT_FOLDER_NAME} ✓`);
  return resultSubDirHandle;
}

async function handleSelectSaveFolderButton() {
  if (localUsbServerReady) {
    showToast(`✅ 현재 앱 폴더 내 [${RESULT_FOLDER_NAME}] 폴더로 즉시 자동 저장되고 있습니다.`);
    return;
  }
  if (typeof window.showDirectoryPicker !== 'function') {
    showToast(`⚠️ 현재 브라우저는 폴더 직접 접근을 지원하지 않습니다. 크롬/엣지 브라우저 또는 USB_실행하기 파일을 사용해 주세요.`);
    return;
  }
  try {
    await ensureResultDirectoryHandle(true);
    await syncOrReadRosterFromDirHandle(usbAppDirHandle);
    await syncRosterToUsbFolder(
      {
        updatedAt: state.updatedAt || Date.now(),
        presentationTitle: state.presentationTitle,
        currentClassIdx: state.currentClassIdx,
        classes: state.classes,
      },
      false
    );
    showToast(`✅ 선택한 폴더 안에 [${RESULT_FOLDER_NAME}] 폴더 및 명단 파일(roster_data.js)이 연결되었습니다!`);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      showToast('폴더 지정이 취소되었습니다.');
    } else {
      console.warn('폴더 설정 오류:', err);
      showToast('⚠️ 폴더 권한 설정 중 오류가 발생했습니다.');
    }
  }
}

async function downloadResultImage() {
  const cls = getCurrentClass();
  if (cls.pickedOrder.length === 0) {
    showToast('⚠️ 아직 추첨된 발표 순서가 없습니다!');
    return;
  }

  const canvas = renderResultToCanvas(cls);
  const titleVal = document.getElementById('presentation-title').value.trim() || '발표순서';
  const today = getLocalDateString(cls.drawnAt);
  const safeClass = sanitizeFilename(cls.className) || `${cls.classNum}반`;
  const safeTitle = sanitizeFilename(titleVal) || '발표순서';
  const filename = `${safeClass}_${safeTitle}_추첨결과_${today}.png`;

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;

  // 1순위: USB 로컬 실행기 서버가 켜져 있는 경우 -> 앱 폴더/뽑기 결과/ 에 무중단 즉시 저장
  if (localUsbServerReady) {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const res = await fetch('/api/save-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: RESULT_FOLDER_NAME,
          filename,
          dataUrl,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        showToast(`💾 [${RESULT_FOLDER_NAME}/${result.filename || filename}] 폴더에 이미지가 저장되었습니다!`);
        return;
      }
    } catch (e) {
      console.warn('로컬 서버 저장 실패, 브라우저 폴더 저장으로 전환합니다:', e);
    }
  }

  // 2순위: 브라우저 File System Access API로 앱 폴더 내 '뽑기 결과' 폴더 자동 생성 및 직접 저장
  if (typeof window.showDirectoryPicker === 'function') {
    try {
      const targetDirHandle = await ensureResultDirectoryHandle(false);
      if (targetDirHandle) {
        const fileHandle = await targetDirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast(`💾 [${RESULT_FOLDER_NAME}/${filename}] 폴더에 이미지 파일이 저장되었습니다!`);
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        showToast('⚠️ 폴더 선택이 취소되어 이미지 저장을 중단했습니다.');
        return;
      }
      console.warn('폴더 직접 저장 실패, 일반 다운로드로 대체합니다:', err);
    }
  }

  // 3순위: 폴더 API를 지원하지 않는 브라우저(사파리/파이어폭스 등)용 기본 다운로드 폴백
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`💾 [${filename}] 이미지가 다운로드되었습니다.`);
}

async function copyResultImageToClipboard() {
  const cls = getCurrentClass();
  if (cls.pickedOrder.length === 0) {
    showToast('⚠️ 아직 추첨된 발표 순서가 없습니다!');
    return;
  }

  const canvas = renderResultToCanvas(cls);
  canvas.toBlob(async (blob) => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      showToast('📸 결과 표 이미지가 클립보드에 복사되었습니다! (메신저/문서에 바로 붙여넣기 가능)');
    } catch (err) {
      console.warn('이미지 클립보드 복사 실패:', err);
      downloadResultImage();
    }
  }, 'image/png');
}

async function copyResultTextToClipboard() {
  const cls = getCurrentClass();
  if (cls.pickedOrder.length === 0) {
    showToast('⚠️ 아직 추첨된 발표 순서가 없습니다!');
    return;
  }

  const titleVal = document.getElementById('presentation-title').value.trim() || '발표 순서';
  const dateStr = formatKoreanDateTime(cls.drawnAt);
  const lines = [
    `[${cls.className} ${titleVal} 추첨 결과]`,
    `추첨 일시: ${dateStr}`,
    `참여 인원: ${cls.pickedOrder.length}명`,
    `--------------------------------`,
    `발표순서\t번호\t이름`,
  ];

  cls.pickedOrder.forEach((st, idx) => {
    lines.push(`${idx + 1}번째\t${st.num}번\t${st.name}`);
  });

  const excludedList = cls.students.filter((s) => s.excluded);
  if (excludedList.length > 0) {
    lines.push(`--------------------------------`);
    lines.push(
      `결석/제외: ${excludedList.map((s) => `${s.num}번 ${s.name}`).join(', ')}`
    );
  }

  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showToast('📋 발표 순서 텍스트가 클립보드에 복사되었습니다! (엑셀/한글/메신저 붙여넣기 가능)');
  } catch (err) {
    showToast('⚠️ 클립보드 복사에 실패했습니다.');
  }
}

// ==========================================
// Roster Management Modal (Excel Copy-Paste)
// ==========================================
let tempModalClasses = [];

function openRosterModal() {
  stopAutoDraw();
  // Deep clone classes for editing
  tempModalClasses = JSON.parse(JSON.stringify(state.classes));
  state.modalClassIdx = state.currentClassIdx;

  renderModalTabs();
  loadModalClassEditor(state.modalClassIdx);

  const dialog = document.getElementById('roster-modal');
  dialog.showModal();
}

function renderModalTabs() {
  const wrap = document.getElementById('modal-class-tabs');
  wrap.innerHTML = '';

  tempModalClasses.forEach((cls, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `class-tab-btn ${idx === state.modalClassIdx ? 'active' : ''}`;
    btn.innerHTML = `
      <span>${cls.className}</span>
      <span class="class-tab-count">${cls.students.length}명</span>
    `;
    btn.addEventListener('click', () => {
      syncCurrentModalEditorToTemp();
      state.modalClassIdx = idx;
      renderModalTabs();
      loadModalClassEditor(idx);
    });
    wrap.appendChild(btn);
  });
}

function loadModalClassEditor(idx) {
  const cls = tempModalClasses[idx];
  document.getElementById('class-custom-name').value = cls.className;
  document.getElementById('roster-textarea').value = cls.rawText;
  updateModalPreview(cls);
}

function syncCurrentModalEditorToTemp() {
  const cls = tempModalClasses[state.modalClassIdx];
  if (!cls) return;
  const customName = document.getElementById('class-custom-name').value.trim();
  cls.className = customName || `${cls.classNum}반`;
  cls.rawText = document.getElementById('roster-textarea').value;

  // Preserve excluded flags when re-parsing if num+name matches
  const oldExcludedMap = new Map(
    cls.students.map((s) => [`${s.num}_${s.name}`, s.excluded])
  );
  const parsed = parseExcelRosterText(cls.rawText, cls.classNum);
  parsed.forEach((s) => {
    const key = `${s.num}_${s.name}`;
    if (oldExcludedMap.has(key)) {
      s.excluded = oldExcludedMap.get(key);
    }
  });
  cls.students = parsed;
}

function updateModalPreview(cls) {
  const countBadge = document.getElementById('modal-parsed-count');
  countBadge.textContent = `현재 ${cls.students.length}명 인식됨 (권장: 18~25명)`;

  const tbody = document.getElementById('roster-preview-tbody');
  tbody.innerHTML = '';

  cls.students.forEach((st) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" ${!st.excluded ? 'checked' : ''} aria-label="${st.name} 참여 여부" /></td>
      <td><strong>${st.num}번</strong></td>
      <td>${st.name}</td>
    `;
    const checkbox = tr.querySelector('input');
    checkbox.addEventListener('change', () => {
      st.excluded = !checkbox.checked;
    });
    tbody.appendChild(tr);
  });
}

async function saveRosterModal() {
  syncCurrentModalEditorToTemp();

  // Reconcile pickedOrder if students changed
  tempModalClasses.forEach((newCls, idx) => {
    const oldCls = state.classes[idx];
    const oldRosterSig = oldCls.students.map((s) => `${s.num}:${s.name}`).join('|');
    const newRosterSig = newCls.students.map((s) => `${s.num}:${s.name}`).join('|');

    if (oldRosterSig !== newRosterSig) {
      // Roster changed -> reset pickedOrder for this class
      newCls.pickedOrder = [];
      newCls.drawnAt = null;
    } else {
      // Filter out any newly excluded students from pickedOrder
      const activeIds = new Set(newCls.students.filter((s) => !s.excluded).map((s) => s.id));
      newCls.pickedOrder = oldCls.pickedOrder.filter((s) => activeIds.has(s.id));
    }
  });

  state.classes = tempModalClasses;
  saveState();
  updateAllUI();

  const payload = {
    updatedAt: state.updatedAt || Date.now(),
    presentationTitle: state.presentationTitle,
    currentClassIdx: state.currentClassIdx,
    classes: state.classes,
  };

  // USB 앱 폴더의 roster_data.js 파일에 직접 기록 (미연결 시 폴더 선택창 안내)
  const savedToFile = await syncRosterToUsbFolder(payload, true);
  document.getElementById('roster-modal').close();

  if (savedToFile) {
    showToast('✅ 8개 학급 명단이 앱 폴더(roster_data.js)에 저장되었습니다! 다른 컴퓨터에 복사해도 그대로 유지됩니다.');
  } else {
    showToast('✅ 명단이 현재 브라우저에 저장되었습니다. (상단 [저장폴더] 버튼으로 앱 폴더를 연결하면 다른 PC에서도 유지됩니다)');
  }
}

function handleImportRosterFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = parseRosterFileText(reader.result);
      if (!parsed || !Array.isArray(parsed.classes) || parsed.classes.length !== 8) {
        showToast('⚠️ 올바른 8학급 명단 파일이 아닙니다.');
        return;
      }
      tempModalClasses = JSON.parse(JSON.stringify(parsed.classes));
      if (parsed.presentationTitle) {
        state.presentationTitle = parsed.presentationTitle;
      }
      renderModalTabs();
      loadModalClassEditor(state.modalClassIdx);
      showToast('📂 파일에서 8개 학급 명단을 불러왔습니다. [USB 폴더에 저장 및 적용하기]를 눌러 확정하세요!');
    } catch (e) {
      console.warn('명단 파일 파싱 오류:', e);
      showToast('⚠️ 명단 파일을 읽는 중 오류가 발생했습니다.');
    }
  };
  reader.readAsText(file, 'utf-8');
}

// ==========================================
// Initialization & Event Listeners
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  initUsbSaveSystem();

  const domeCanvas = document.getElementById('lottery-dome-canvas');
  domeEngine = new LotteryDomeEngine(domeCanvas);

  const confettiCanvas = document.getElementById('confetti-canvas');
  confetti = new ConfettiManager(confettiCanvas);

  updateAllUI();

  // Presentation Title Change
  document.getElementById('presentation-title').addEventListener('input', (e) => {
    state.presentationTitle = e.target.value;
    saveState();
    renderFullscreenResultBoard();
  });

  // Animation Mode Selector (Ball / Slot / Card)
  document.querySelectorAll('.mode-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.animMode = btn.dataset.mode;

      document.querySelectorAll('.anim-stage').forEach((s) => s.classList.remove('active'));
      document.getElementById(`stage-${state.animMode}`).classList.add('active');
      hideWinnerSpotlight();
    });
  });

  // Draw Actions
  document.getElementById('btn-draw-one').addEventListener('click', () => {
    stopAutoDraw();
    drawNextStudent();
  });

  document.getElementById('btn-draw-auto').addEventListener('click', () => {
    toggleAutoDraw();
  });

  document.getElementById('btn-draw-all').addEventListener('click', () => {
    drawAllRemainingInstantly();
  });

  // Undo Last Pick
  document.getElementById('btn-undo').addEventListener('click', () => {
    if (state.isDrawing) return;
    stopAutoDraw();
    const cls = getCurrentClass();
    if (cls.pickedOrder.length === 0) {
      showToast('취소할 추첨 내역이 없습니다.');
      return;
    }
    const popped = cls.pickedOrder.pop();
    saveState();
    hideWinnerSpotlight();
    updateAllUI();
    showToast(`↩ 방금 뽑힌 [${popped.num}번 ${popped.name}] 학생의 추첨을 취소했습니다.`);
  });

  // Reset Class Draw
  const handleResetClass = () => {
    if (state.isDrawing) return;
    stopAutoDraw();
    const cls = getCurrentClass();
    if (cls.pickedOrder.length === 0) {
      showToast('이미 초기 상태입니다.');
      return;
    }
    cls.pickedOrder = [];
    cls.drawnAt = null;
    saveState();
    hideWinnerSpotlight();
    showDrawView();
    updateAllUI();
    showToast(`🔄 ${cls.className} 발표 순서가 초기화되었습니다.`);
  };

  document.getElementById('btn-reset').addEventListener('click', handleResetClass);
  document.getElementById('btn-result-reset').addEventListener('click', handleResetClass);

  // Switch between Draw View and Fullscreen Result View
  document.getElementById('btn-show-full').addEventListener('click', () => {
    stopAutoDraw();
    hideWinnerSpotlight();
    showFullResultView();
  });

  document.getElementById('btn-back-draw').addEventListener('click', () => {
    showDrawView();
  });

  // Export & Copy Buttons
  document.getElementById('btn-side-copy').addEventListener('click', copyResultTextToClipboard);
  document.getElementById('btn-copy-text').addEventListener('click', copyResultTextToClipboard);
  document.getElementById('btn-copy-img').addEventListener('click', copyResultImageToClipboard);
  document.getElementById('btn-side-image').addEventListener('click', downloadResultImage);
  document.getElementById('btn-save-png').addEventListener('click', downloadResultImage);

  const btnSaveProgress = document.getElementById('btn-save-progress');
  if (btnSaveProgress) {
    btnSaveProgress.addEventListener('click', handleSaveProgressForNextClass);
  }

  const btnDomeShake = document.getElementById('btn-dome-shake');
  if (btnDomeShake) {
    btnDomeShake.addEventListener('click', (e) => {
      e.stopPropagation();
      shakeLotteryDomeManually();
    });
  }

  const domeWrapper = document.getElementById('dome-wrapper');
  if (domeWrapper) {
    domeWrapper.addEventListener('click', () => {
      if (!state.isDrawing) {
        shakeLotteryDomeManually();
      }
    });
  }

  document.querySelectorAll('.chip-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip-mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.chipClickMode = btn.dataset.chipMode || 'exclude';
      updateStatsAndPool();
      if (state.chipClickMode === 'done') {
        showToast('✅ [지난 시간 발표완료 체크 모드] 학생 이름을 클릭하면 결석이 아닌 발표 완료 순번으로 즉시 추가됩니다.');
      } else {
        showToast('🚫 [결석/제외 체크 모드] 학생 이름을 클릭하면 오늘 추첨에서 제외(결석)합니다.');
      }
    });
  });

  const btnSetFolder = document.getElementById('btn-set-save-folder');
  if (btnSetFolder) {
    btnSetFolder.addEventListener('click', handleSelectSaveFolderButton);
  }

  // Sound Toggle
  document.getElementById('btn-sound-toggle').addEventListener('click', () => {
    sfx.enabled = !sfx.enabled;
    document.getElementById('sound-icon').textContent = sfx.enabled ? '🔊' : '🔇';
    document.getElementById('sound-text').textContent = sfx.enabled ? '효과음 ON' : '효과음 OFF';
    showToast(sfx.enabled ? '🔊 추첨 효과음이 켜졌습니다.' : '🔇 추첨 효과음이 꺼졌습니다.');
  });

  // Fullscreen Toggle
  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Click on winner spotlight dismisses it
  document.getElementById('winner-spotlight').addEventListener('click', () => {
    hideWinnerSpotlight();
  });

  // Roster Modal Controls
  document.getElementById('btn-open-roster').addEventListener('click', openRosterModal);
  document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('roster-modal').close();
  });
  document.getElementById('btn-modal-cancel').addEventListener('click', () => {
    document.getElementById('roster-modal').close();
  });
  document.getElementById('btn-modal-save').addEventListener('click', saveRosterModal);

  const btnImportRoster = document.getElementById('btn-import-roster');
  const rosterFileInput = document.getElementById('roster-file-input');
  if (btnImportRoster && rosterFileInput) {
    btnImportRoster.addEventListener('click', () => rosterFileInput.click());
    rosterFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleImportRosterFile(file);
      rosterFileInput.value = '';
    });
  }

  document.getElementById('roster-textarea').addEventListener('input', () => {
    syncCurrentModalEditorToTemp();
    renderModalTabs();
    updateModalPreview(tempModalClasses[state.modalClassIdx]);
  });

  document.getElementById('class-custom-name').addEventListener('input', () => {
    syncCurrentModalEditorToTemp();
    renderModalTabs();
  });

  document.getElementById('btn-fill-sample').addEventListener('click', () => {
    const idx = state.modalClassIdx;
    const sample = generateSampleRoster(idx);
    tempModalClasses[idx].students = sample;
    tempModalClasses[idx].rawText = studentsToRawText(sample);
    loadModalClassEditor(idx);
    renderModalTabs();
    showToast(`${tempModalClasses[idx].className}에 샘플 명단이 채워졌습니다.`);
  });

  document.getElementById('btn-fill-all-samples').addEventListener('click', () => {
    tempModalClasses.forEach((cls, idx) => {
      const sample = generateSampleRoster(idx);
      cls.students = sample;
      cls.rawText = studentsToRawText(sample);
    });
    loadModalClassEditor(state.modalClassIdx);
    renderModalTabs();
    showToast('🏫 1반~8반 전체 학급에 샘플 명단(19~25명)이 채워졌습니다.');
  });

  // Keyboard Shortcuts (Space = Draw 1, A = Auto Draw, Escape = Hide Spotlight)
  window.addEventListener('keydown', (e) => {
    const modal = document.getElementById('roster-modal');
    if (modal.open) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      stopAutoDraw();
      drawNextStudent();
    } else if (e.key === 's' || e.key === 'S' || e.key === 'ㄴ') {
      e.preventDefault();
      if (!state.isDrawing && state.animMode === 'ball') {
        shakeLotteryDomeManually();
      }
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      toggleAutoDraw();
    } else if (e.key === 'Escape') {
      hideWinnerSpotlight();
    }
  });
});
