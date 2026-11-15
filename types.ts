export type GamePhase = 'lobby' | 'parachuting' | 'playing' | 'gameover';

export type WeaponId = 'rifle' | 'smg' | 'sniper' | 'shotgun' | 'pistol';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  damage: number;
  fireRate: number; // shots per second
  magSize: number;
  range: number;
  spread: number;
  zoomFov: number;
  color: string;
}

export interface HudState {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  armor: number;
  helmet: number;
  lives: number;
  kills: number;
  aliveCount: number;
  weapon: WeaponId;
  ammo: number;
  reserveAmmo: number;
  medkits: number;
  grenades: number;
  isZoomed: boolean;
  inVehicle: boolean;
  nearInteractable: string | null;
  zoneRadius: number;
  zoneTimeLeft: number;
  zoneShrinking: boolean;
  playerPos: { x: number; z: number; yaw: number };
  zoneCenter: { x: number; z: number };
  airdropPos: { x: number; z: number } | null;
  caves: { x: number; z: number }[];
  victory: boolean;
}
