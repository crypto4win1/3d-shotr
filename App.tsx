import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Shield, Heart, Flame, Maximize2, Play, RotateCcw, Award, Compass, HelpCircle, X } from 'lucide-react';
import { BattleRoyaleEngine, WEAPONS } from './game/engine';
import { HudState, WeaponId } from './game/types';

const INITIAL_HUD: HudState = {
  phase: 'lobby',
  hp: 100,
  maxHp: 100,
  armor: 50,
  helmet: 50,
  lives: 2,
  kills: 0,
  aliveCount: 19,
  weapon: 'rifle',
  ammo: 30,
  reserveAmmo: 180,
  medkits: 2,
  grenades: 2,
  isZoomed: false,
  inVehicle: false,
  nearInteractable: null,
  zoneRadius: 240,
  zoneTimeLeft: 300,
  zoneShrinking: false,
  playerPos: { x: 0, z: 0, yaw: 0 },
  zoneCenter: { x: 0, z: 0 },
  airdropPos: null,
  caves: [],
  victory: false,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BattleRoyaleEngine | null>(null);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [showHelp, setShowHelp] = useState(false);

  // Touch joystick & look tracking
  const joyTouchId = useRef<number | null>(null);
  const joyCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const lookTouchId = useRef<number | null>(null);
  const lastLook = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!mountRef.current) return;
    const engine = new BattleRoyaleEngine(mountRef.current, (nextHud) => setHud(nextHud));
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleJoyStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    joyTouchId.current = t.identifier;
    joyCenter.current = { x: t.clientX, y: t.clientY };
    setJoyKnob({ x: 0, y: 0 });
  };

  const handleJoyMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyTouchId.current) {
        const dx = t.clientX - joyCenter.current.x;
        const dy = t.clientY - joyCenter.current.y;
        const maxR = 42;
        const dist = Math.min(maxR, Math.hypot(dx, dy));
        const ang = Math.atan2(dy, dx);
        const kx = Math.cos(ang) * dist;
        const ky = Math.sin(ang) * dist;
        setJoyKnob({ x: kx, y: ky });
        engineRef.current?.setMoveInput(kx / maxR, -ky / maxR);
      }
    }
  };

  const handleJoyEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchId.current) {
        joyTouchId.current = null;
        setJoyKnob({ x: 0, y: 0 });
        engineRef.current?.setMoveInput(0, 0);
      }
    }
  };

  const handleLookStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    lookTouchId.current = t.identifier;
    lastLook.current = { x: t.clientX, y: t.clientY };
  };

  const handleLookMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === lookTouchId.current) {
        const dx = t.clientX - lastLook.current.x;
        const dy = t.clientY - lastLook.current.y;
        lastLook.current = { x: t.clientX, y: t.clientY };
        engineRef.current?.addLookDelta(dx, dy);
      }
    }
  };

  const handleLookEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId.current) {
        lookTouchId.current = null;
      }
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-slate-950">
      {/* 3D Canvas Container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Top-Right Fullscreen & Help */}
      <div className="absolute top-3 left-3 z-30 flex gap-2">
        <button
          onClick={toggleFullscreen}
          className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white active:scale-95 shadow-lg"
          title="ملء الشاشة"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
        <button
          onClick={() => setShowHelp(true)}
          className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-amber-400 active:scale-95 shadow-lg"
          title="التعليمات"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      {/* LOBBY SCREEN */}
      {hud.phase === 'lobby' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-transparent p-6 text-center">
          <div className="px-4 py-1.5 mb-3 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-bold tracking-wider">
            BATTLE ROYALE 3D • REALISTIC EDITION
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white drop-shadow-lg mb-3">
            ساحة المعركة الملكية
          </h1>
          <p className="text-slate-200 max-w-md text-sm md:text-base mb-8">
            انزل بالمظلة، استكشف الكهوف الأربعة والمباني متعددة الطوابق، قُد السيارات، وابقَ داخل الزون الآمن لتكون الناجي الأخير!
          </p>
          <button
            onClick={() => engineRef.current?.startMatch()}
            className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xl shadow-[0_8px_30px_rgba(245,158,11,0.45)] active:scale-95 transition"
          >
            <Play className="w-6 h-6 fill-current" />
            ابدأ المعركة الآن
          </button>
        </div>
      )}

      {/* IN-GAME HUD */}
      {(hud.phase === 'parachuting' || hud.phase === 'playing') && (
        <>
          {/* Touch Look Area (Right Half of Screen) */}
          <div
            onTouchStart={handleLookStart}
            onTouchMove={handleLookMove}
            onTouchEnd={handleLookEnd}
            className="absolute inset-y-0 right-0 w-1/2 z-10"
          />

          {/* Top Center: Alive, Kills & Safe Zone Status */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-950/80 border border-slate-700/80 backdrop-blur-md text-xs md:text-sm">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span>الأحياء:</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-white">{hud.aliveCount}</span>
            </div>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center gap-1.5 text-rose-400 font-bold">
              <span>القتل:</span>
              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-white">{hud.kills}</span>
            </div>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center gap-1.5 text-sky-400 font-bold">
              <Compass className="w-4 h-4" />
              <span>{hud.zoneShrinking ? 'الزون يتقلص!' : `الزون: ${formatTime(hud.zoneTimeLeft)}`}</span>
              <span className="text-slate-400">({hud.zoneRadius}m)</span>
            </div>
          </div>

          {/* Top Right: Radar Minimap (Caves, Zone, Airdrop, Player) */}
          <div className="absolute top-3 right-3 z-20 w-28 h-28 md:w-32 md:h-32 rounded-full bg-slate-900/85 border-2 border-slate-600 overflow-hidden shadow-xl">
            <div className="relative w-full h-full">
              {/* Safe Zone Circle */}
              <div
                className="absolute rounded-full border border-sky-400 bg-sky-400/10 -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${50 + (hud.zoneCenter.x / 460) * 100}%`,
                  top: `${50 + (hud.zoneCenter.z / 460) * 100}%`,
                  width: `${(hud.zoneRadius * 2 / 460) * 100}%`,
                  height: `${(hud.zoneRadius * 2 / 460) * 100}%`,
                }}
              />
              {/* 4 Caves markers */}
              {hud.caves.map((c, idx) => (
                <div
                  key={idx}
                  className="absolute w-2 h-2 rounded-full bg-amber-400 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${50 + (c.x / 460) * 100}%`,
                    top: `${50 + (c.z / 460) * 100}%`,
                  }}
                />
              ))}
              {/* Airdrop marker */}
              {hud.airdropPos && (
                <div
                  className="absolute w-2.5 h-2.5 bg-rose-500 rotate-45 -translate-x-1/2 -translate-y-1/2 animate-pulse"
                  style={{
                    left: `${50 + (hud.airdropPos.x / 460) * 100}%`,
                    top: `${50 + (hud.airdropPos.z / 460) * 100}%`,
                  }}
                />
              )}
              {/* Player Dot */}
              <div
                className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${50 + (hud.playerPos.x / 460) * 100}%`,
                  top: `${50 + (hud.playerPos.z / 460) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Center Crosshair */}
          {hud.phase === 'playing' && !hud.inVehicle && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
              <Crosshair className={`transition-all ${hud.isZoomed ? 'w-10 h-10 text-rose-400 scale-110' : 'w-6 h-6 text-white/85'}`} />
            </div>
          )}

          {/* Parachute Banner */}
          {hud.phase === 'parachuting' && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full bg-amber-500/90 text-slate-950 font-bold text-sm animate-bounce">
              هبوط بالمظلة • وجّه حركتك للهبوط الآمن
            </div>
          )}

          {/* Interact Prompt Button (F) */}
          {hud.nearInteractable && (
            <button
              onClick={() => engineRef.current?.interact()}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-10 z-30 px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-sm shadow-lg active:scale-95"
            >
              {hud.nearInteractable}
            </button>
          )}

          {/* Left Virtual Joystick */}
          <div
            onTouchStart={handleJoyStart}
            onTouchMove={handleJoyMove}
            onTouchEnd={handleJoyEnd}
            className="absolute bottom-8 left-8 z-20 w-28 h-28 rounded-full bg-slate-900/50 border-2 border-slate-500/50 flex items-center justify-center backdrop-blur-sm"
          >
            <div
              className="w-12 h-12 rounded-full bg-white/80 shadow-lg transition-transform duration-75"
              style={{ transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)` }}
            />
          </div>

          {/* Bottom Center: HP, Armor, Lives & Weapon Selector */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 w-72 md:w-96">
            {/* Health & Armor Bars */}
            <div className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 backdrop-blur-md">
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="flex items-center gap-1 text-emerald-400">
                  <Heart className="w-3.5 h-3.5 fill-current" /> {hud.hp}/{hud.maxHp}
                </span>
                <span className="flex items-center gap-1 text-sky-400">
                  <Shield className="w-3.5 h-3.5" /> درع {hud.armor}%
                </span>
                <span className="text-amber-400">الفرص: {hud.lives}</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all"
                  style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }}
                />
              </div>
            </div>

            {/* Weapon Switcher */}
            <div className="flex gap-1.5 overflow-x-auto max-w-full">
              {(Object.keys(WEAPONS) as WeaponId[]).map((wId) => (
                <button
                  key={wId}
                  onClick={() => engineRef.current?.switchWeapon(wId)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                    hud.weapon === wId
                      ? 'bg-amber-500 text-slate-950 border-amber-300'
                      : 'bg-slate-900/80 text-slate-300 border-slate-700'
                  }`}
                >
                  {WEAPONS[wId].name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Right Action Controls: Fire, Zoom Toggle, Reload, Medkit, Grenade */}
          <div className="absolute bottom-6 right-6 z-20 flex flex-col items-end gap-3">
            <div className="flex gap-2">
              <button
                onClick={() => engineRef.current?.useMedkit()}
                className="px-3 py-2 rounded-xl bg-emerald-600/90 border border-emerald-400 text-white text-xs font-bold shadow-lg active:scale-95"
              >
                + إسعاف ({hud.medkits})
              </button>
              <button
                onClick={() => engineRef.current?.throwGrenade()}
                className="px-3 py-2 rounded-xl bg-orange-600/90 border border-orange-400 text-white text-xs font-bold shadow-lg active:scale-95 flex items-center gap-1"
              >
                <Flame className="w-3.5 h-3.5" /> قنبلة ({hud.grenades})
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => engineRef.current?.reloadWeapon()}
                className="w-12 h-12 rounded-full bg-slate-800/90 border-2 border-slate-500 text-white text-xs font-bold shadow-lg active:scale-95"
              >
                تلقيم
              </button>
              <button
                onClick={() => engineRef.current?.toggleZoom()}
                className={`w-14 h-14 rounded-full border-2 font-bold text-xs shadow-lg active:scale-95 ${
                  hud.isZoomed
                    ? 'bg-sky-500 border-white text-slate-950'
                    : 'bg-slate-900/90 border-sky-400 text-sky-300'
                }`}
              >
                زوم
              </button>
              <button
                onTouchStart={() => engineRef.current?.setFiring(true)}
                onTouchEnd={() => engineRef.current?.setFiring(false)}
                onMouseDown={() => engineRef.current?.setFiring(true)}
                onMouseUp={() => engineRef.current?.setFiring(false)}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-500 to-red-700 border-4 border-rose-300 text-white font-black text-sm shadow-[0_0_25px_rgba(244,63,94,0.6)] active:scale-90 flex flex-col items-center justify-center"
              >
                <span>إطلاق</span>
                <span className="text-[10px] font-normal">
                  {hud.ammo}/{hud.reserveAmmo}
                </span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* GAME OVER / VICTORY SCREEN */}
      {hud.phase === 'gameover' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md p-6 text-center">
          <Award className={`w-16 h-16 mb-3 ${hud.victory ? 'text-amber-400' : 'text-rose-500'}`} />
          <h2 className="text-4xl font-black text-white mb-2">
            {hud.victory ? 'نصر ملكي ساحق! #1' : 'انتهت المعركة'}
          </h2>
          <p className="text-slate-300 mb-6">
            عدد الإقصاءات: <span className="text-amber-400 font-bold">{hud.kills}</span> • المركز النهائي:{' '}
            <span className="text-emerald-400 font-bold">#{hud.aliveCount}</span>
          </p>

          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {hud.kills >= 5 && (
              <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 text-xs font-bold">
                ميدالية القناص المحترف
              </span>
            )}
            {hud.victory && (
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-xs font-bold">
                ميدالية الناجي الأخير
              </span>
            )}
            <span className="px-3 py-1 rounded-full bg-sky-500/20 border border-sky-400 text-sky-300 text-xs font-bold">
              ميدالية الشجاعة القتالية
            </span>
          </div>

          <button
            onClick={() => engineRef.current?.startMatch()}
            className="flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-lg active:scale-95"
          >
            <RotateCcw className="w-5 h-5" />
            العب مجدداً
          </button>
        </div>
      )}

      {/* INSTRUCTIONS MODAL */}
      {showHelp && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 text-right">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-black text-amber-400">دليل التحكم واللعب</h3>
              <button onClick={() => setShowHelp(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ul className="space-y-2 text-sm text-slate-200 list-disc pr-5">
              <li>التحرك عبر عصا التحكم اليسرى (أو مفاتيح WASD على الكمبيوتر).</li>
              <li>توجيه الكاميرا بالسحب على النصف الأيمن من الشاشة.</li>
              <li>زر الزوم يعمل بنظام التثبيت (Toggle) مع مساعد تصويب ذكي حتى 26 متراً.</li>
              <li>زر التفاعل (F) لقيادة السيارات وفتح صناديق الكهوف الأربعة والإيردروب.</li>
              <li>لديك فرصتان (حياتان) في كل مباراة؛ بعد الموت الأول تعود بالمظلة تلقائياً.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
