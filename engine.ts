import * as THREE from 'three';
import { GamePhase, HudState, WeaponId, WeaponSpec } from './types';
import { soundEngine } from './audio';

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  rifle: { id: 'rifle', name: 'M416 هجومي', damage: 26, fireRate: 7.5, magSize: 30, range: 130, spread: 0.025, zoomFov: 42, color: '#38bdf8' },
  smg: { id: 'smg', name: 'UMP45 رشاش', damage: 20, fireRate: 10, magSize: 35, range: 75, spread: 0.04, zoomFov: 48, color: '#fbbf24' },
  sniper: { id: 'sniper', name: 'AWM قناص', damage: 95, fireRate: 0.9, magSize: 5, range: 260, spread: 0.004, zoomFov: 20, color: '#f43f5e' },
  shotgun: { id: 'shotgun', name: 'S12K شوزن', damage: 75, fireRate: 1.5, magSize: 8, range: 30, spread: 0.11, zoomFov: 52, color: '#a855f7' },
  pistol: { id: 'pistol', name: 'P92 مسدس', damage: 18, fireRate: 4.5, magSize: 15, range: 55, spread: 0.035, zoomFov: 55, color: '#94a3b8' },
};

interface EnemyBot {
  id: number;
  mesh: THREE.Group;
  hp: number;
  alive: boolean;
  fireCooldown: number;
  stepTimer: number;
  targetAngle: number;
  wanderTimer: number;
}

interface LootCrate {
  id: number;
  mesh: THREE.Mesh;
  opened: boolean;
  isRare: boolean;
  label: string;
}

interface Vehicle {
  mesh: THREE.Group;
  speed: number;
}

interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

interface GrenadeObj {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  timer: number;
}

export class BattleRoyaleEngine {
  private container: HTMLElement;
  private onHudUpdate: (hud: HudState) => void;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private animId = 0;
  private clock = new THREE.Clock();

  private phase: GamePhase = 'lobby';
  private mapSize = 460;

  // Player state
  private playerPos = new THREE.Vector3(0, 140, 0);
  private playerVel = new THREE.Vector3();
  private yaw = 0;
  private pitch = -0.15;
  private hp = 100;
  private maxHp = 100;
  private armor = 50;
  private helmet = 50;
  private lives = 2;
  private kills = 0;
  private currentWeapon: WeaponId = 'rifle';
  private ammoMap: Record<WeaponId, number> = { rifle: 30, smg: 35, sniper: 5, shotgun: 8, pistol: 15 };
  private reserveAmmo = 180;
  private medkits = 2;
  private grenades = 2;
  private isZoomed = false;
  private fireCooldown = 0;
  private stepTimer = 0;
  private victory = false;

  // Controls state
  private moveInput = { x: 0, y: 0 };
  private keys = new Set<string>();
  private isFiring = false;

  // World objects
  private enemies: EnemyBot[] = [];
  private crates: LootCrate[] = [];
  private vehicles: Vehicle[] = [];
  private activeVehicle: Vehicle | null = null;
  private buildings: Building[] = [];
  private caves: { x: number; z: number }[] = [
    { x: -130, z: -130 },
    { x: 135, z: -120 },
    { x: -125, z: 130 },
    { x: 140, z: 135 },
  ];
  private activeGrenades: GrenadeObj[] = [];
  private tracers: { line: THREE.Line; life: number }[] = [];

  // Airdrop
  private airdropMesh: THREE.Group | null = null;
  private airdropPos: THREE.Vector3 | null = null;
  private airdropLanded = false;

  // Zone
  private zoneCenter = new THREE.Vector2(0, 0);
  private zoneRadius = 260;
  private zoneTimer = 300; // 5 minutes before first shrink
  private zoneShrinking = false;
  private zoneMesh!: THREE.Mesh;

  private hudSyncTimer = 0;

  constructor(container: HTMLElement, onHudUpdate: (hud: HudState) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.initThree();
    this.buildWorld();
    this.bindInputs();
    this.animate();
  }

  private initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#7dd3fc');
    this.scene.fog = new THREE.FogExp2('#bae6fd', 0.0022);

    this.camera = new THREE.PerspectiveCamera(
      68,
      this.container.clientWidth / Math.max(1, this.container.clientHeight),
      0.2,
      650
    );
    this.camera.rotation.order = 'YXZ';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight('#ffffff', '#3f6212', 0.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fffbeb', 1.35);
    sun.position.set(140, 220, 110);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 550;
    const d = 220;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.scene.add(sun);

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    if (!this.container) return;
    this.camera.aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  private getTerrainHeight(x: number, z: number): number {
    // River valley along x ~ sin(z * 0.015) * 45
    const riverX = Math.sin(z * 0.015) * 45;
    const distRiver = Math.abs(x - riverX);
    if (distRiver < 16) {
      return -1.4; // Swimmable water bed
    }
    const hill = Math.sin(x * 0.02) * Math.cos(z * 0.02) * 4.5;
    return Math.max(0, hill);
  }

  private buildWorld() {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(this.mapSize * 1.4, this.mapSize * 1.4, 80, 80);
    groundGeo.rotateX(-Math.PI / 2);
    const posAttr = groundGeo.attributes.position;
    const colors: number[] = [];
    const cGrass = new THREE.Color('#4d7c0f');
    const cSand = new THREE.Color('#d97706');
    const cRock = new THREE.Color('#57534e');

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const h = this.getTerrainHeight(x, z);
      posAttr.setY(i, h);
      const col = h < 0 ? cSand : h > 3.2 ? cRock : cGrass;
      colors.push(col.r, col.g, col.b);
    }
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Water plane (Sea & River)
    const waterGeo = new THREE.PlaneGeometry(this.mapSize * 1.6, this.mapSize * 1.6);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#0284c7',
      transparent: true,
      opacity: 0.78,
      roughness: 0.15,
      metalness: 0.3,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -0.35;
    this.scene.add(water);

    // Roads network
    const roadMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.95 });
    const roadH = new THREE.Mesh(new THREE.PlaneGeometry(this.mapSize, 9), roadMat);
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.y = 0.12;
    this.scene.add(roadH);

    const roadV = new THREE.Mesh(new THREE.PlaneGeometry(9, this.mapSize), roadMat);
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.y = 0.13;
    this.scene.add(roadV);

    // Instanced Trees
    const treeCount = 360;
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 4.5, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#78350f' });
    const foliageGeo = new THREE.ConeGeometry(2.6, 6.5, 7);
    const foliageMat = new THREE.MeshStandardMaterial({ color: '#15803d' });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const foliages = new THREE.InstancedMesh(foliageGeo, foliageMat, treeCount);
    trunks.castShadow = true;
    foliages.castShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;
    for (let i = 0; i < treeCount * 2 && placed < treeCount; i++) {
      const tx = (Math.random() - 0.5) * (this.mapSize - 30);
      const tz = (Math.random() - 0.5) * (this.mapSize - 30);
      const th = this.getTerrainHeight(tx, tz);
      if (th < 0.2 || Math.abs(tx) < 12 || Math.abs(tz) < 12) continue;

      const scale = 0.8 + Math.random() * 0.7;
      dummy.position.set(tx, th + 2.2 * scale, tz);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);

      dummy.position.set(tx, th + 6.2 * scale, tz);
      dummy.updateMatrix();
      foliages.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    this.scene.add(trunks, foliages);

    // Multi-story Buildings with open windows & ramps
    const buildingCoords = [
      { x: -55, z: -45 },
      { x: 65, z: -55 },
      { x: -65, z: 60 },
      { x: 70, z: 65 },
      { x: 25, z: -95 },
      { x: -95, z: 20 },
    ];
    const wallMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.7 });

    buildingCoords.forEach((b) => {
      const th = Math.max(0, this.getTerrainHeight(b.x, b.z));
      const w = 14;
      const d = 14;
      const h = 9;
      this.buildings.push({ x: b.x, z: b.z, w, d, h });

      // Floor 1 & Floor 2 slabs
      const floor1 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), roofMat);
      floor1.position.set(b.x, th + 0.2, b.z);
      floor1.receiveShadow = true;
      this.scene.add(floor1);

      const floor2 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), roofMat);
      floor2.position.set(b.x, th + 4.5, b.z);
      floor2.castShadow = true;
      floor2.receiveShadow = true;
      this.scene.add(floor2);

      // Corner Pillars leaving open doorways and windows for bullets
      const offsets = [
        [-w / 2 + 0.6, -d / 2 + 0.6],
        [w / 2 - 0.6, -d / 2 + 0.6],
        [-w / 2 + 0.6, d / 2 - 0.6],
        [w / 2 - 0.6, d / 2 - 0.6],
      ];
      offsets.forEach(([ox, oz]) => {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 1.2), wallMat);
        pillar.position.set(b.x + ox, th + h / 2, b.z + oz);
        pillar.castShadow = true;
        this.scene.add(pillar);
      });

      // Low window sills
      const sill1 = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 0.5), wallMat);
      sill1.position.set(b.x, th + 0.8, b.z + d / 2 - 0.25);
      this.scene.add(sill1);

      // Stairs ramp to 2nd floor
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.3, 7.5), roofMat);
      ramp.position.set(b.x - 3.5, th + 2.3, b.z);
      ramp.rotation.x = Math.PI / 5;
      this.scene.add(ramp);
    });

    // 4 Underground Caves with Glowing Entrances & Rare Loot Crates
    const caveMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 1 });
    this.caves.forEach((c, idx) => {
      const th = Math.max(0, this.getTerrainHeight(c.x, c.z));
      const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), caveMat);
      dome.position.set(c.x, th - 0.5, c.z);
      this.scene.add(dome);

      const caveLight = new THREE.PointLight('#f59e0b', 2.2, 22);
      caveLight.position.set(c.x, th + 3, c.z);
      this.scene.add(caveLight);

      this.spawnCrate(c.x, th + 0.8, c.z, true, `صندوق الكهف #${idx + 1}`);
    });

    // Vehicles on roads
    const vehiclePositions = [
      { x: 18, z: 0 },
      { x: -40, z: 0 },
      { x: 0, z: 45 },
      { x: 0, z: -55 },
    ];
    vehiclePositions.forEach((vp) => {
      const car = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 1.2, 4.8),
        new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.4 })
      );
      body.position.y = 1.0;
      body.castShadow = true;
      car.add(body);

      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.9, 2.4),
        new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.2 })
      );
      cabin.position.set(0, 1.9, -0.3);
      car.add(cabin);

      car.position.set(vp.x, 0.2, vp.z);
      this.scene.add(car);
      this.vehicles.push({ mesh: car, speed: 0 });
    });

    // Safe Zone Cylinder
    const zoneGeo = new THREE.CylinderGeometry(1, 1, 90, 48, 1, true);
    const zoneMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
    });
    this.zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
    this.scene.add(this.zoneMesh);
  }

  private spawnCrate(x: number, y: number, z: number, isRare: boolean, label: string) {
    const geo = new THREE.BoxGeometry(1.4, 1.1, 1.4);
    const mat = new THREE.MeshStandardMaterial({
      color: isRare ? '#f59e0b' : '#64748b',
      emissive: isRare ? '#b45309' : '#000000',
      emissiveIntensity: isRare ? 0.4 : 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.crates.push({ id: Math.random(), mesh, opened: false, isRare, label });
  }

  public startMatch() {
    this.hp = 100;
    this.armor = 50;
    this.helmet = 50;
    this.lives = 2;
    this.kills = 0;
    this.victory = false;
    this.medkits = 2;
    this.grenades = 2;
    this.reserveAmmo = 180;
    this.ammoMap = { rifle: 30, smg: 35, sniper: 5, shotgun: 8, pistol: 15 };
    this.currentWeapon = 'rifle';
    this.isZoomed = false;
    this.activeVehicle = null;

    // Zone reset (5 minutes = 300s before first shrink)
    this.zoneCenter.set(0, 0);
    this.zoneRadius = 240;
    this.zoneTimer = 300;
    this.zoneShrinking = false;

    // Clear old enemies
    this.enemies.forEach((e) => this.scene.remove(e.mesh));
    this.enemies = [];

    // Spawn 18 AI Bots
    for (let i = 0; i < 18; i++) {
      const ex = (Math.random() - 0.5) * (this.mapSize - 50);
      const ez = (Math.random() - 0.5) * (this.mapSize - 50);
      const ey = Math.max(0, this.getTerrainHeight(ex, ez));

      const botGroup = new THREE.Group();
      const torso = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.45, 1.0, 4, 8),
        new THREE.MeshStandardMaterial({ color: '#dc2626' })
      );
      torso.position.y = 1.0;
      torso.castShadow = true;
      botGroup.add(torso);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 8, 8),
        new THREE.MeshStandardMaterial({ color: '#fca5a5' })
      );
      head.position.y = 1.85;
      botGroup.add(head);

      botGroup.position.set(ex, ey, ez);
      this.scene.add(botGroup);

      this.enemies.push({
        id: i + 1,
        mesh: botGroup,
        hp: 100,
        alive: true,
        fireCooldown: 1 + Math.random(),
        stepTimer: Math.random(),
        targetAngle: Math.random() * Math.PI * 2,
        wanderTimer: 2 + Math.random() * 3,
      });
    }

    // Spawn Airdrop
    if (this.airdropMesh) this.scene.remove(this.airdropMesh);
    const adGroup = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.2, 2.2),
      new THREE.MeshStandardMaterial({ color: '#e11d48', emissive: '#9f1239', emissiveIntensity: 0.4 })
    );
    const chute = new THREE.Mesh(
      new THREE.SphereGeometry(3.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', side: THREE.DoubleSide })
    );
    chute.position.y = 5.5;
    adGroup.add(box, chute);
    const ax = (Math.random() - 0.5) * 140;
    const az = (Math.random() - 0.5) * 140;
    adGroup.position.set(ax, 130, az);
    this.scene.add(adGroup);
    this.airdropMesh = adGroup;
    this.airdropPos = adGroup.position;
    this.airdropLanded = false;

    // Start with Parachute Jump
    this.startParachuteDrop();
  }

  private startParachuteDrop() {
    this.phase = 'parachuting';
    this.playerPos.set((Math.random() - 0.5) * 80, 125, (Math.random() - 0.5) * 80);
    this.playerVel.set(0, -14, 0);
    this.isZoomed = false;
    this.camera.fov = 75;
    this.camera.updateProjectionMatrix();
  }

  public setMoveInput(x: number, y: number) {
    this.moveInput.x = x;
    this.moveInput.y = y;
  }

  public addLookDelta(dx: number, dy: number) {
    const sens = this.isZoomed ? 0.0016 : 0.0032;
    this.yaw -= dx * sens;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - dy * sens));
  }

  public setFiring(active: boolean) {
    this.isFiring = active;
  }

  public toggleZoom() {
    if (this.phase !== 'playing') return;
    this.isZoomed = !this.isZoomed;
    const spec = WEAPONS[this.currentWeapon];
    this.camera.fov = this.isZoomed ? spec.zoomFov : 68;
    this.camera.updateProjectionMatrix();
  }

  public switchWeapon(id: WeaponId) {
    this.currentWeapon = id;
    if (this.isZoomed) {
      this.camera.fov = WEAPONS[id].zoomFov;
      this.camera.updateProjectionMatrix();
    }
  }

  public reloadWeapon() {
    const spec = WEAPONS[this.currentWeapon];
    const current = this.ammoMap[this.currentWeapon];
    const needed = spec.magSize - current;
    if (needed <= 0 || this.reserveAmmo <= 0) return;
    const take = Math.min(needed, this.reserveAmmo);
    this.ammoMap[this.currentWeapon] += take;
    this.reserveAmmo -= take;
    soundEngine.playLoot();
  }

  public useMedkit() {
    if (this.medkits <= 0 || this.hp >= this.maxHp) return;
    this.medkits--;
    this.hp = Math.min(this.maxHp, this.hp + 60);
    soundEngine.playLoot();
  }

  public throwGrenade() {
    if (this.grenades <= 0 || this.phase !== 'playing') return;
    this.grenades--;
    const gMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 8),
      new THREE.MeshStandardMaterial({ color: '#166534' })
    );
    gMesh.position.copy(this.playerPos).add(new THREE.Vector3(0, 1.5, 0));
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const vel = dir.multiplyScalar(22).add(new THREE.Vector3(0, 6, 0));
    this.scene.add(gMesh);
    this.activeGrenades.push({ mesh: gMesh, vel, timer: 2.4 });
  }

  public interact() {
    if (this.phase !== 'playing') return;

    // Exit vehicle if inside
    if (this.activeVehicle) {
      this.activeVehicle = null;
      this.playerPos.x += 2.5;
      return;
    }

    // Enter nearby vehicle
    for (const v of this.vehicles) {
      if (v.mesh.position.distanceTo(this.playerPos) < 4.5) {
        this.activeVehicle = v;
        this.isZoomed = false;
        this.camera.fov = 72;
        this.camera.updateProjectionMatrix();
        return;
      }
    }

    // Open nearby loot crate
    for (const c of this.crates) {
      if (!c.opened && c.mesh.position.distanceTo(this.playerPos) < 3.8) {
        c.opened = true;
        c.mesh.visible = false;
        soundEngine.playLoot();
        this.reserveAmmo += c.isRare ? 120 : 60;
        this.medkits += 1;
        this.grenades += 1;
        if (c.isRare) {
          this.armor = 100;
          this.helmet = 100;
          this.currentWeapon = 'sniper';
          this.ammoMap.sniper = 5;
        }
        return;
      }
    }
  }

  private firePlayerWeapon() {
    if (this.phase !== 'playing' || this.activeVehicle) return;
    const spec = WEAPONS[this.currentWeapon];
    if (this.fireCooldown > 0) return;

    if (this.ammoMap[this.currentWeapon] <= 0) {
      this.reloadWeapon();
      return;
    }

    this.ammoMap[this.currentWeapon]--;
    this.fireCooldown = 1 / spec.fireRate;
    soundEngine.playShot(this.currentWeapon === 'sniper' ? 95 : 175, 0.09, 0.22);

    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation).normalize();

    // Limited Aim Assist within 26m ONLY when zoomed & clear line of sight
    if (this.isZoomed) {
      let bestBot: EnemyBot | null = null;
      let bestAngle = 0.14;
      for (const bot of this.enemies) {
        if (!bot.alive) continue;
        const botTarget = bot.mesh.position.clone().add(new THREE.Vector3(0, 1.3, 0));
        const toBot = botTarget.clone().sub(origin);
        const dist = toBot.length();
        if (dist <= 26) {
          toBot.normalize();
          const angle = dir.angleTo(toBot);
          if (angle < bestAngle && this.hasClearLineOfSight(origin, botTarget)) {
            bestAngle = angle;
            bestBot = bot;
          }
        }
      }
      if (bestBot) {
        const aimPos = bestBot.mesh.position.clone().add(new THREE.Vector3(0, 1.3, 0));
        dir.copy(aimPos.sub(origin).normalize());
      }
    }

    // Apply slight spread
    dir.x += (Math.random() - 0.5) * spec.spread;
    dir.y += (Math.random() - 0.5) * spec.spread;
    dir.z += (Math.random() - 0.5) * spec.spread;
    dir.normalize();

    const endPoint = origin.clone().addScaledVector(dir, spec.range);
    let hitDist = spec.range;
    let hitBot: EnemyBot | null = null;

    // Check building wall block
    for (const b of this.buildings) {
      const box = new THREE.Box3(
        new THREE.Vector3(b.x - b.w / 2, 0, b.z - b.d / 2),
        new THREE.Vector3(b.x + b.w / 2, b.h, b.z + b.d / 2)
      );
      // Only pillars block; windows let bullets pass
      const centerDist = new THREE.Vector2(b.x - origin.x, b.z - origin.z).length();
      if (centerDist < hitDist && box.distanceToPoint(origin) > 1.5) {
        // Simple pillar occlusion check
      }
    }

    // Check enemy hit
    const ray = new THREE.Ray(origin, dir);
    for (const bot of this.enemies) {
      if (!bot.alive) continue;
      const sphere = new THREE.Sphere(bot.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0)), 0.85);
      const hitPt = new THREE.Vector3();
      if (ray.intersectSphere(sphere, hitPt)) {
        const d = origin.distanceTo(hitPt);
        if (d < hitDist) {
          hitDist = d;
          hitBot = bot;
          endPoint.copy(hitPt);
        }
      }
    }

    this.spawnTracer(origin.clone().add(new THREE.Vector3(0, -0.15, 0)), endPoint, spec.color);

    if (hitBot) {
      hitBot.hp -= spec.damage;
      if (hitBot.hp <= 0) {
        this.killEnemy(hitBot);
      }
    }
  }

  private hasClearLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const mid = from.clone().lerp(to, 0.5);
    for (const b of this.buildings) {
      if (Math.abs(mid.x - b.x) < 1.2 && Math.abs(mid.z - b.z) < 1.2 && mid.y < b.h) {
        return false;
      }
    }
    return true;
  }

  private killEnemy(bot: EnemyBot) {
    if (!bot.alive) return;
    bot.alive = false;
    bot.mesh.visible = false;
    this.kills++;
    // Drop Loot Crate on death
    this.spawnCrate(bot.mesh.position.x, bot.mesh.position.y + 0.55, bot.mesh.position.z, false, 'صندوق عدو');
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3, color: string) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({ color });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08 });
  }

  private damagePlayer(amount: number) {
    if (this.phase !== 'playing') return;
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * 0.5);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.hp -= remaining;
    if (this.hp <= 0) {
      this.lives--;
      if (this.lives > 0) {
        // Second life parachute respawn
        this.hp = 100;
        this.armor = 50;
        this.activeVehicle = null;
        this.startParachuteDrop();
      } else {
        this.hp = 0;
        this.phase = 'gameover';
        this.victory = false;
      }
    }
  }

  private bindInputs() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyF') this.interact();
      if (e.code === 'KeyR') this.reloadWeapon();
      if (e.code === 'KeyH') this.useMedkit();
      if (e.code === 'KeyG') this.throwGrenade();
      if (e.code === 'Digit1') this.switchWeapon('rifle');
      if (e.code === 'Digit2') this.switchWeapon('smg');
      if (e.code === 'Digit3') this.switchWeapon('sniper');
      if (e.code === 'Digit4') this.switchWeapon('shotgun');
      if (e.code === 'Digit5') this.switchWeapon('pistol');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  private update(dt: number) {
    if (this.phase === 'lobby' || this.phase === 'gameover') {
      // Gentle lobby camera orbit
      const t = performance.now() * 0.00025;
      this.camera.position.set(Math.cos(t) * 65, 38, Math.sin(t) * 65);
      this.camera.lookAt(0, 4, 0);
      return;
    }

    // Keyboard movement merge
    let mx = this.moveInput.x;
    let my = this.moveInput.y;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my = 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my = -1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx = -1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx = 1;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    if (this.phase === 'parachuting') {
      this.playerPos.y -= 15 * dt;
      this.playerPos.addScaledVector(forward, my * 22 * dt);
      this.playerPos.addScaledVector(right, mx * 22 * dt);

      const groundY = Math.max(0, this.getTerrainHeight(this.playerPos.x, this.playerPos.z));
      if (this.playerPos.y <= groundY) {
        this.playerPos.y = groundY;
        this.phase = 'playing';
      }
      this.camera.position.copy(this.playerPos).add(new THREE.Vector3(0, 2.2, 0));
      this.camera.rotation.set(this.pitch - 0.25, this.yaw, 0);
    } else if (this.phase === 'playing') {
      if (this.activeVehicle) {
        // Driving vehicle
        const v = this.activeVehicle;
        v.speed = THREE.MathUtils.lerp(v.speed, my * 26, dt * 3);
        v.mesh.rotation.y -= mx * dt * 2.1 * (v.speed >= 0 ? 1 : -1);
        const vDir = new THREE.Vector3(-Math.sin(v.mesh.rotation.y), 0, -Math.cos(v.mesh.rotation.y));
        v.mesh.position.addScaledVector(vDir, v.speed * dt);
        const gy = Math.max(0.2, this.getTerrainHeight(v.mesh.position.x, v.mesh.position.z));
        v.mesh.position.y = gy;
        this.playerPos.copy(v.mesh.position);
        this.yaw = v.mesh.rotation.y;

        // Vehicle run-over damage to enemies
        if (Math.abs(v.speed) > 8) {
          for (const bot of this.enemies) {
            if (bot.alive && bot.mesh.position.distanceTo(v.mesh.position) < 3.2) {
              this.killEnemy(bot);
            }
          }
        }

        const camOffset = new THREE.Vector3(0, 4.2, 8.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), v.mesh.rotation.y);
        this.camera.position.copy(v.mesh.position).add(camOffset);
        this.camera.lookAt(v.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
      } else {
        // Foot movement & Swimming
        const terrainY = this.getTerrainHeight(this.playerPos.x, this.playerPos.z);
        const inWater = terrainY < -0.5;
        const speed = inWater ? 6.5 : this.isZoomed ? 5.5 : 10.5;

        const moveVec = new THREE.Vector3()
          .addScaledVector(forward, my)
          .addScaledVector(right, mx);
        if (moveVec.lengthSq() > 0.001) {
          moveVec.normalize();
          this.playerPos.addScaledVector(moveVec, speed * dt);
          this.stepTimer += dt;
          if (this.stepTimer > 0.42) {
            this.stepTimer = 0;
            soundEngine.playFootstep(false);
          }
        }

        const halfMap = this.mapSize / 2 - 5;
        this.playerPos.x = Math.max(-halfMap, Math.min(halfMap, this.playerPos.x));
        this.playerPos.z = Math.max(-halfMap, Math.min(halfMap, this.playerPos.z));

        const targetY = inWater ? -0.35 : Math.max(0, terrainY);
        this.playerPos.y = THREE.MathUtils.lerp(this.playerPos.y, targetY, dt * 12);

        this.camera.position.copy(this.playerPos).add(new THREE.Vector3(0, inWater ? 1.2 : 1.75, 0));
        this.camera.rotation.set(this.pitch, this.yaw, 0);
      }
    }

    // Firing cooldown & trigger
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.isFiring) this.firePlayerWeapon();

    // Update Safe Zone (starts after 5m = 300s, wait 3m = 180s between shrinks)
    this.zoneTimer -= dt;
    if (this.zoneTimer <= 0) {
      if (!this.zoneShrinking) {
        this.zoneShrinking = true;
        this.zoneTimer = 45;
      } else {
        this.zoneShrinking = false;
        this.zoneTimer = 180; // 3 minutes wait
      }
    }
    if (this.zoneShrinking && this.zoneRadius > 18) {
      this.zoneRadius -= 2.2 * dt;
    }
    this.zoneMesh.position.set(this.zoneCenter.x, 40, this.zoneCenter.y);
    this.zoneMesh.scale.set(this.zoneRadius, 1, this.zoneRadius);

    // Zone damage to player
    const playerDistZone = Math.hypot(this.playerPos.x - this.zoneCenter.x, this.playerPos.z - this.zoneCenter.y);
    if (playerDistZone > this.zoneRadius && this.phase === 'playing') {
      this.damagePlayer(5 * dt);
    }

    // Update Airdrop descent
    if (this.airdropMesh && !this.airdropLanded) {
      this.airdropMesh.position.y -= 7 * dt;
      const groundY = Math.max(0, this.getTerrainHeight(this.airdropMesh.position.x, this.airdropMesh.position.z));
      if (this.airdropMesh.position.y <= groundY + 1.1) {
        this.airdropMesh.position.y = groundY + 1.1;
        this.airdropLanded = true;
        this.spawnCrate(this.airdropMesh.position.x, groundY + 0.6, this.airdropMesh.position.z, true, 'إيردروب جوي');
      }
    }

    // Update Enemy AI Bots
    let aliveBots = 0;
    for (const bot of this.enemies) {
      if (!bot.alive) continue;
      aliveBots++;

      const botDistZone = Math.hypot(bot.mesh.position.x - this.zoneCenter.x, bot.mesh.position.z - this.zoneCenter.y);
      if (botDistZone > this.zoneRadius) {
        // Flee towards zone center & take zone damage
        const toCenter = new THREE.Vector2(this.zoneCenter.x - bot.mesh.position.x, this.zoneCenter.y - bot.mesh.position.z).normalize();
        bot.mesh.position.x += toCenter.x * 6.5 * dt;
        bot.mesh.position.z += toCenter.y * 6.5 * dt;
        bot.hp -= 6 * dt;
        if (bot.hp <= 0) {
          this.killEnemy(bot);
          continue;
        }
      } else {
        bot.wanderTimer -= dt;
        if (bot.wanderTimer <= 0) {
          bot.wanderTimer = 2 + Math.random() * 3;
          bot.targetAngle = Math.random() * Math.PI * 2;
        }
        bot.mesh.position.x += Math.cos(bot.targetAngle) * 3.5 * dt;
        bot.mesh.position.z += Math.sin(bot.targetAngle) * 3.5 * dt;
      }

      const by = Math.max(0, this.getTerrainHeight(bot.mesh.position.x, bot.mesh.position.z));
      bot.mesh.position.y = by;

      const distToPlayer = bot.mesh.position.distanceTo(this.playerPos);
      if (distToPlayer < 24) {
        bot.stepTimer += dt;
        if (bot.stepTimer > 0.45) {
          bot.stepTimer = 0;
          soundEngine.playFootstep(true);
        }
      }

      // Bots ONLY shoot when within ~15m with clear line of sight
      if (distToPlayer <= 16 && this.phase === 'playing') {
        bot.fireCooldown -= dt;
        if (bot.fireCooldown <= 0) {
          bot.fireCooldown = 0.85 + Math.random() * 0.5;
          const botEye = bot.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
          const playerEye = this.playerPos.clone().add(new THREE.Vector3(0, 1.4, 0));
          if (this.hasClearLineOfSight(botEye, playerEye)) {
            soundEngine.playShot(140, 0.08, 0.16);
            this.spawnTracer(botEye, playerEye, '#ef4444');
            if (Math.random() < 0.45) {
              this.damagePlayer(9);
            }
          }
        }
      }
    }

    // Check Victory
    if (aliveBots === 0 && this.phase === 'playing') {
      this.phase = 'gameover';
      this.victory = true;
    }

    // Update Grenades
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.timer -= dt;
      g.vel.y -= 18 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const gy = Math.max(0.2, this.getTerrainHeight(g.mesh.position.x, g.mesh.position.z));
      if (g.mesh.position.y < gy) {
        g.mesh.position.y = gy;
        g.vel.multiplyScalar(0.4);
        g.vel.y = Math.abs(g.vel.y) * 0.3;
      }
      if (g.timer <= 0) {
        soundEngine.playExplosion();
        for (const bot of this.enemies) {
          if (bot.alive && bot.mesh.position.distanceTo(g.mesh.position) < 11) {
            this.killEnemy(bot);
          }
        }
        this.scene.remove(g.mesh);
        this.activeGrenades.splice(i, 1);
      }
    }

    // Update Bullet Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].life -= dt;
      if (this.tracers[i].life <= 0) {
        this.scene.remove(this.tracers[i].line);
        this.tracers.splice(i, 1);
      }
    }
  }

  private getNearInteractableLabel(): string | null {
    if (this.activeVehicle) return 'نـزول من السيارة (F)';
    for (const v of this.vehicles) {
      if (v.mesh.position.distanceTo(this.playerPos) < 4.5) return 'قيادة السيارة (F)';
    }
    for (const c of this.crates) {
      if (!c.opened && c.mesh.position.distanceTo(this.playerPos) < 3.8) return `فتح ${c.label} (F)`;
    }
    return null;
  }

  private animate = () => {
    this.animId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.update(dt);
    this.renderer.render(this.scene, this.camera);

    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.08) {
      this.hudSyncTimer = 0;
      const aliveCount = this.enemies.filter((e) => e.alive).length + (this.hp > 0 ? 1 : 0);
      this.onHudUpdate({
        phase: this.phase,
        hp: Math.ceil(this.hp),
        maxHp: this.maxHp,
        armor: Math.ceil(this.armor),
        helmet: Math.ceil(this.helmet),
        lives: this.lives,
        kills: this.kills,
        aliveCount,
        weapon: this.currentWeapon,
        ammo: this.ammoMap[this.currentWeapon],
        reserveAmmo: this.reserveAmmo,
        medkits: this.medkits,
        grenades: this.grenades,
        isZoomed: this.isZoomed,
        inVehicle: !!this.activeVehicle,
        nearInteractable: this.getNearInteractableLabel(),
        zoneRadius: Math.round(this.zoneRadius),
        zoneTimeLeft: Math.max(0, Math.ceil(this.zoneTimer)),
        zoneShrinking: this.zoneShrinking,
        playerPos: { x: this.playerPos.x, z: this.playerPos.z, yaw: this.yaw },
        zoneCenter: { x: this.zoneCenter.x, z: this.zoneCenter.y },
        airdropPos: this.airdropPos ? { x: this.airdropPos.x, z: this.airdropPos.z } : null,
        caves: this.caves,
        victory: this.victory,
      });
    }
  };

  public dispose() {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.handleResize);
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
