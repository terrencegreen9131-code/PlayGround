(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const mini = document.getElementById('minimap');
  const mctx = mini.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = { menu:$('menu'), hud:$('hud'), pause:$('pause-layer'), end:$('end-layer'), state:$('match-state'), kills:$('kills'), wave:$('wave'), timer:$('timer'), health:$('health-value'), healthFill:$('health-fill'), armorFill:$('armor-fill'), capFill:$('capture-fill'), objective:$('objective-status'), ammo:$('ammo'), reserve:$('reserve'), weapon:$('weapon-name'), weaponClass:$('weapon-class'), icon:$('weapon-icon'), toast:$('toast'), reload:$('reload-indicator'), hint:$('interact-hint'), vehicle:$('vehicle-readout'), vehicleLabel:$('vehicle-label'), vehicleTouch:$('vehicle-touch'), crosshair:$('crosshair') };
  const W = 1800, H = 1250;
  const zone = { x: 1190, y: 655, r: 118 };
  const keys = new Set();
  let vw=innerWidth, vh=innerHeight, dpr=1, last=0, elapsed=0, active=false, paused=false, finished=false;
  let cam={x:390,y:620}, aim=0, firing=false, moveTouch={x:0,y:0}, aimTouch={x:0,y:0}, activePointers=new Map();
  let toastTimer=0, soundOn=false, audio=null;
  const weapons=[
    {name:'VXR-9',class:'ASSAULT RIFLE',icon:'⌁',mag:30,reserve:150,damage:23,rate:.115,reload:1.28,speed:690,spread:.055,color:'#e6f263'},
    {name:'KITE-45',class:'COMPACT SMG',icon:'≋',mag:36,reserve:180,damage:13,rate:.065,reload:1.12,speed:630,spread:.105,color:'#72d4c2'},
    {name:'M7 LONGSHOT',class:'MARKSMAN RIFLE',icon:'╱',mag:12,reserve:60,damage:58,rate:.42,reload:1.55,speed:980,spread:.018,color:'#ffb36b'}
  ];
  let player, enemies=[], bullets=[], particles=[], pickups=[], props=[], vehicles=[], weaponIndex=0, capture=0, kills=0, reloadTime=0, fireCooldown=0, shake=0, matchStart=0, enemySpawn=0, vehicle=null;
  const rand=(a,b)=>a+Math.random()*(b-a), clamp=(n,a,b)=>Math.max(a,Math.min(b,n)), dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function resize(){vw=innerWidth;vh=innerHeight;dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.floor(vw*dpr);canvas.height=Math.floor(vh*dpr);canvas.style.width=vw+'px';canvas.style.height=vh+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
  addEventListener('resize',resize); resize();

  function makeMap(){
    props=[]; vehicles=[];
    // perimeter blocks / cover barriers
    for(let i=0;i<20;i++) props.push({type:'barrier',x:rand(105,1690),y:rand(110,1130),w:rand(38,70),h:rand(20,34),tone:i%3});
    // Fixed readable architecture and cover lanes
    props.push({type:'building',x:330,y:260,w:250,h:150,tone:0},{type:'building',x:820,y:175,w:205,h:126,tone:1},{type:'building',x:1425,y:270,w:225,h:153,tone:0},{type:'building',x:300,y:825,w:220,h:150,tone:1},{type:'building',x:840,y:930,w:255,h:145,tone:0},{type:'building',x:1450,y:900,w:210,h:142,tone:1});
    props.push({type:'crate',x:650,y:510,w:55,h:45},{type:'crate',x:740,y:720,w:52,h:47},{type:'crate',x:1300,y:485,w:55,h:42},{type:'crate',x:1070,y:780,w:55,h:48},{type:'crate',x:1550,y:680,w:46,h:42});
    vehicles=[{kind:'RANGER 4×4',x:700,y:355,a:.24,color:'#778b58',occupied:false},{kind:'DUST HAWK',x:1110,y:1010,a:-.22,color:'#66736a',occupied:false,heli:true}];
  }
  function reset(){
    makeMap(); player={x:390,y:620,a:0,hp:100,armor:55,ammo:30,reserve:150,radius:14,vehicle:false,invuln:0};
    enemies=[]; bullets=[]; particles=[]; pickups=[]; weaponIndex=0;capture=0;kills=0;reloadTime=0;fireCooldown=0;elapsed=0;finished=false;paused=false;vehicle=null;enemySpawn=0;cam={x:player.x,y:player.y};
    for(let i=0;i<6;i++) spawnEnemy(i);
    ui.health.textContent='100';ui.healthFill.style.width='100%';ui.armorFill.style.width='100%';ui.capFill.style.width='0%';updateWeapon();updateStats();
  }
  function spawnEnemy(i){
    const spots=[{x:1430,y:570},{x:1480,y:740},{x:1030,y:470},{x:980,y:800},{x:1270,y:920},{x:1600,y:560},{x:770,y:650},{x:1220,y:370}];
    const p=spots[(i+Math.floor(Math.random()*spots.length))%spots.length];
    enemies.push({x:p.x+rand(-38,38),y:p.y+rand(-35,35),a:Math.PI,hp:76,max:76,radius:13,speed:rand(60,82),cool:rand(.35,1.4),state:'hunt',name:['RAIDER','SCOUT','WARDEN','ROGUE'][i%4],color:['#ba6850','#b5754f','#9b6b57'][i%3],strafe:Math.random()<.5?-1:1});
  }
  function updateWeapon(){const w=weapons[weaponIndex];ui.weapon.textContent=w.name;ui.weaponClass.textContent=w.class;ui.icon.textContent=w.icon;ui.ammo.textContent=player.ammo;ui.reserve.textContent=player.reserve}
  function updateStats(){ui.kills.textContent=String(kills).padStart(2,'0');ui.wave.textContent=String(Math.floor(kills/6)+1).padStart(2,'0');const sec=Math.floor(elapsed);ui.timer.textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')}
  function toast(msg){ui.toast.textContent=msg;ui.toast.classList.add('show');toastTimer=2.2}
  function start(){reset();active=true;ui.menu.hidden=true;ui.end.hidden=true;ui.pause.hidden=true;ui.hud.hidden=false;ui.state.textContent='LIVE OPERATION';matchStart=performance.now();toast('OPERATOR DEPLOYED · SECURE THE RELAY');if(innerWidth>760)canvas.requestPointerLock?.()}
  function pause(){if(!active||finished)return;paused=true;ui.pause.hidden=false;document.exitPointerLock?.();}
  function resume(){paused=false;ui.pause.hidden=true;if(innerWidth>760)canvas.requestPointerLock?.()}
  function endGame(won){finished=true;active=false;document.exitPointerLock?.();ui.end.hidden=false;$('end-title').textContent=won?'SECTOR SECURED':'OPERATOR DOWN';$('end-copy').textContent=won?'Relay control restored. Dustline is back in friendly hands.':'Your fireteam is pulling you out. Run it back.';$('result-kills').textContent=kills;$('result-time').textContent=ui.timer.textContent;ui.state.textContent=won?'MISSION COMPLETE':'MISSION FAILED'}
  $('deploy-btn').addEventListener('click',start);$('resume-btn').addEventListener('click',resume);$('restart-btn').addEventListener('click',start);$('again-btn').addEventListener('click',start);
  $('sound-btn').addEventListener('click',()=>{soundOn=!soundOn;$('sound-btn').innerHTML=soundOn?'♫ <span>SOUND ON</span>':'♪ <span>SOUND</span>';if(soundOn){audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume()}});
  function sfx(freq=100,dur=.07,vol=.035){if(!soundOn||!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type='sawtooth';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.45,audio.currentTime+dur);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}

  addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys.add(k);if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(k==='escape'&&active){paused?resume():pause()}if(k==='r')reload();if(k==='e')interact();if(k==='1'||k==='2'||k==='3')switchWeapon(+k-1);if(k==='q')throwGrenade()});
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  canvas.addEventListener('mousemove',e=>{if(!player)return;if(document.pointerLockElement===canvas){aim+=e.movementX*.004}else{const p=screenToWorld(e.clientX,e.clientY);aim=Math.atan2(p.y-player.y,p.x-player.x)}});
  canvas.addEventListener('mousedown',e=>{if(e.button===0&&active&&!paused){firing=true;if(innerWidth>760&&!document.pointerLockElement)canvas.requestPointerLock?.()}});
  addEventListener('mouseup',e=>{if(e.button===0)firing=false});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  function switchWeapon(n){if(!player||n===weaponIndex)return;weaponIndex=n;const w=weapons[n];player.ammo=w.mag;player.reserve=w.reserve;reloadTime=0;updateWeapon();sfx(280,.045,.018)}
  function reload(){if(!active||paused||reloadTime>0)return;const w=weapons[weaponIndex];if(player.ammo>=w.mag||player.reserve<=0)return;reloadTime=w.reload;ui.reload.hidden=false;sfx(230,.08,.015)}
  function interact(){if(!active||paused)return;if(vehicle){vehicle.occupied=false;player.vehicle=false;vehicle=null;player.x+=Math.cos(player.a+Math.PI/2)*34;player.y+=Math.sin(player.a+Math.PI/2)*34;ui.vehicle.hidden=true;ui.vehicleTouch.hidden=true;toast('ON FOOT');return}const v=vehicles.find(o=>!o.occupied&&Math.hypot(o.x-player.x,o.y-player.y)<65);if(v){vehicle=v;v.occupied=true;player.vehicle=true;player.x=v.x;player.y=v.y;ui.vehicle.hidden=false;ui.vehicleTouch.hidden=false;ui.vehicleLabel.textContent=v.kind;toast(v.heli?'DUST HAWK READY':'RANGER SECURED');sfx(180,.1,.025)}}
  function throwGrenade(){if(!active||paused)return;const x=player.x+Math.cos(aim)*120,y=player.y+Math.sin(aim)*120;particles.push({type:'blast',x,y,t:.5,max:.5,r:145});sfx(65,.3,.06);for(const e of enemies){const d=Math.hypot(e.x-x,e.y-y);if(d<145)e.hp-=Math.round(100*(1-d/145))}toast('FRAG OUT')}
  function viewScale(){return Math.min(1.04,vw/980,vh/660)}
  function screenToWorld(sx,sy){const z=viewScale();return{x:cam.x+(sx-vw/2)/z,y:cam.y+(sy-vh/2)/z}}
  function setMoveTouch(x,y){moveTouch={x,y}}

  // Touch sticks are pointer-captured so the controls remain dependable on phones and tablets.
  function bindStick(zoneId,knobId,which){const z=$(zoneId),knob=$(knobId);let pointer=null;function move(e){const r=z.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=r.width*.34,d=Math.hypot(dx,dy);if(d>max){dx*=max/d;dy*=max/d}knob.style.transform=`translate(${dx}px,${dy}px)`;if(which==='move')moveTouch={x:dx/max,y:dy/max};else{aimTouch={x:dx/max,y:dy/max};if(Math.hypot(dx,dy)>8)aim=Math.atan2(dy,dx)}e.preventDefault()}function up(e){if(pointer!==e.pointerId)return;pointer=null;knob.style.transform='translate(0,0)';if(which==='move')moveTouch={x:0,y:0};else aimTouch={x:0,y:0};try{z.releasePointerCapture(e.pointerId)}catch{}}z.addEventListener('pointerdown',e=>{pointer=e.pointerId;z.setPointerCapture(pointer);move(e)});z.addEventListener('pointermove',e=>{if(pointer===e.pointerId)move(e)});z.addEventListener('pointerup',up);z.addEventListener('pointercancel',up)}
  bindStick('move-zone','move-knob','move');bindStick('aim-zone','aim-knob','aim');
  const fireButton=$('fire-touch');fireButton.addEventListener('pointerdown',e=>{e.preventDefault();firing=true;try{fireButton.setPointerCapture(e.pointerId)}catch{}});fireButton.addEventListener('pointerup',()=>firing=false);fireButton.addEventListener('pointercancel',()=>firing=false);fireButton.addEventListener('lostpointercapture',()=>firing=false);
  $('reload-touch').addEventListener('pointerdown',e=>{e.preventDefault();reload()});$('switch-touch').addEventListener('pointerdown',e=>{e.preventDefault();switchWeapon((weaponIndex+1)%weapons.length)});ui.vehicleTouch.addEventListener('pointerdown',e=>{e.preventDefault();interact()});

  function update(dt){
    if(!active||paused||finished)return;
    elapsed=(performance.now()-matchStart)/1000;fireCooldown=Math.max(0,fireCooldown-dt);toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show');
    player.invuln=Math.max(0,player.invuln-dt);if(reloadTime>0){reloadTime-=dt;if(reloadTime<=0){const w=weapons[weaponIndex],need=w.mag-player.ammo,load=Math.min(need,player.reserve);player.ammo+=load;player.reserve-=load;ui.reload.hidden=true;updateWeapon();sfx(360,.06,.02)}}
    let mx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+moveTouch.x;
    let my=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+moveTouch.y;
    const ml=Math.hypot(mx,my);if(ml>1){mx/=ml;my/=ml}
    if(vehicle){vehicle.a=aim;const speed=vehicle.heli?260:215;vehicle.x=clamp(vehicle.x+mx*speed*dt,55,W-55);vehicle.y=clamp(vehicle.y+my*speed*dt,55,H-55);player.x=vehicle.x;player.y=vehicle.y;player.a=aim}else{
      player.x=clamp(player.x+mx*190*dt,38,W-38);player.y=clamp(player.y+my*190*dt,38,H-38);player.a=aim;
      if(ml>.1&&Math.random()<dt*4)particles.push({type:'dust',x:player.x-rand(3,10),y:player.y+10,t:.38,max:.38,r:rand(3,8)});
    }
    if(firing&&fireCooldown<=0&&reloadTime<=0)shoot();
    let nearVehicle=false;for(const v of vehicles){if(!v.occupied&&Math.hypot(v.x-player.x,v.y-player.y)<65)nearVehicle=true}
    ui.hint.hidden=!nearVehicle||!!vehicle||innerWidth<=760;ui.vehicle.hidden=!vehicle;ui.vehicleTouch.hidden=!(nearVehicle||!!vehicle);ui.vehicleTouch.textContent=vehicle?'EXIT VEHICLE':'ENTER VEHICLE';
    // Capture only when the zone is clear of hostiles.
    const inZone=Math.hypot(player.x-zone.x,player.y-zone.y)<zone.r;
    const contested=enemies.some(e=>Math.hypot(e.x-zone.x,e.y-zone.y)<zone.r+22);
    if(inZone&&!contested){capture=clamp(capture+dt*.105,0,1);ui.objective.textContent=capture>=1?'Relay secured':'Relay control increasing'}else if(contested&&capture>0){capture=Math.max(0,capture-dt*.035);ui.objective.textContent='Hostiles contesting relay'}else if(!inZone)ui.objective.textContent='Move into the marked zone';
    ui.capFill.style.width=(capture*100)+'%';if(capture>=1){updateStats();endGame(true);return}
    for(const e of enemies){
      const d=Math.hypot(player.x-e.x,player.y-e.y)||1;e.a=Math.atan2(player.y-e.y,player.x-e.x);e.cool-=dt;
      let vx=0,vy=0;if(d>250){vx=Math.cos(e.a);vy=Math.sin(e.a)}else if(d<155){vx=-Math.cos(e.a)*.5;vy=-Math.sin(e.a)*.5}vx+=Math.cos(e.a+Math.PI/2)*e.strafe*.38;vy+=Math.sin(e.a+Math.PI/2)*e.strafe*.38;
      const n=Math.hypot(vx,vy)||1;e.x=clamp(e.x+vx/n*e.speed*dt,38,W-38);e.y=clamp(e.y+vy/n*e.speed*dt,38,H-38);
      if(d<540&&e.cool<=0){e.cool=rand(.8,1.4);enemyShot(e)}
    }
    for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.life<=0||b.x<0||b.x>W||b.y<0||b.y>H){bullets.splice(i,1);continue}
      if(b.team==='player'){let hit=null;for(const e of enemies){if(Math.hypot(e.x-b.x,e.y-b.y)<e.radius+4){hit=e;break}}if(hit){hit.hp-=b.damage;hit.flash=.12;particles.push({type:'hit',x:b.x,y:b.y,t:.2,max:.2,r:rand(3,6)});bullets.splice(i,1);if(hit.hp<=0){const ix=enemies.indexOf(hit);if(ix>=0)enemies.splice(ix,1);kills++;if(Math.random()<.42)pickups.push({x:hit.x,y:hit.y,type:Math.random()<.5?'ammo':'armor'});toast(kills%3===0?'HOSTILE ELIMINATED · '+kills:'HOSTILE ELIMINATED');if(kills>=6&&enemies.length<3){for(let j=0;j<3;j++)spawnEnemy(kills+j);toast('HOSTILE REINFORCEMENTS INBOUND')}updateStats()}}}
      else if(Math.hypot(player.x-b.x,player.y-b.y)<player.radius+5&&player.invuln<=0){bullets.splice(i,1);const dmg=12;if(player.armor>0)player.armor=Math.max(0,player.armor-dmg);else player.hp-=dmg;player.invuln=.24;shake=5;ui.health.textContent=Math.max(0,Math.ceil(player.hp));ui.healthFill.style.width=clamp(player.hp,0,100)+'%';ui.armorFill.style.width=clamp(player.armor/55*100,0,100)+'%';if(player.hp<=0)endGame(false)}
    }
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.t-=dt;if(p.t<=0)particles.splice(i,1)}
    for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];if(Math.hypot(p.x-player.x,p.y-player.y)<30){if(p.type==='ammo'){player.reserve=Math.min(240,player.reserve+36);toast('AMMO PICKED UP')}else{player.armor=Math.min(55,player.armor+24);ui.armorFill.style.width=(player.armor/55*100)+'%';toast('ARMOR PLATED')}pickups.splice(i,1);updateWeapon()}}
    const z=viewScale(),halfW=vw/(2*z),halfH=vh/(2*z);cam.x=clamp(cam.x+(player.x-cam.x)*Math.min(1,dt*5),halfW,W-halfW);cam.y=clamp(cam.y+(player.y-cam.y)*Math.min(1,dt*5),halfH,H-halfH);shake=Math.max(0,shake-dt*18);
    updateStats();
  }
  function shoot(){const w=weapons[weaponIndex];if(player.ammo<=0){reload();return}player.ammo--;updateWeapon();fireCooldown=w.rate;const spread=rand(-w.spread,w.spread),a=aim+spread;const ox=player.x+Math.cos(a)*20,oy=player.y+Math.sin(a)*20;bullets.push({x:ox,y:oy,vx:Math.cos(a)*w.speed,vy:Math.sin(a)*w.speed,life:1.35,team:'player',damage:w.damage,color:w.color});particles.push({type:'muzzle',x:ox,y:oy,a,t:.075,max:.075,r:rand(9,15)});sfx(weaponIndex===2?150:weaponIndex===1?260:190,.045,.02);shake=weaponIndex===2?2:1}
  function enemyShot(e){const a=Math.atan2(player.y-e.y,player.x-e.x)+rand(-.12,.12);bullets.push({x:e.x+Math.cos(a)*17,y:e.y+Math.sin(a)*17,vx:Math.cos(a)*440,vy:Math.sin(a)*440,life:1.2,team:'enemy',damage:11,color:'#ff8160'});particles.push({type:'muzzle',x:e.x+Math.cos(a)*17,y:e.y+Math.sin(a)*17,a,t:.07,max:.07,r:9});}

  function draw(){
    const z=viewScale(), sx=vw/2-cam.x*z+(shake?rand(-shake,shake):0), sy=vh/2-cam.y*z+(shake?rand(-shake,shake):0);
    ctx.setTransform(dpr*z,0,0,dpr*z,dpr*sx,dpr*sy);
    ctx.fillStyle='#28382e';ctx.fillRect(0,0,W,H);
    // Dustline terrain: broad sunbaked lanes, painted markings and field texture.
    ctx.fillStyle='#746c4e';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#7d7655';ctx.fillRect(55,55,W-110,H-110);
    ctx.fillStyle='#665f47';ctx.fillRect(0,570,W,100);ctx.fillRect(860,0,92,H);
    ctx.fillStyle='#817b5b';ctx.fillRect(895,0,24,H);ctx.fillRect(0,608,W,24);
    ctx.globalAlpha=.22;ctx.strokeStyle='#d5c996';ctx.lineWidth=2;ctx.setLineDash([22,22]);ctx.beginPath();ctx.moveTo(0,620);ctx.lineTo(W,620);ctx.moveTo(908,0);ctx.lineTo(908,H);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
    // Ground noise and scrub are deterministic and cheap to paint.
    for(let i=0;i<380;i++){const x=((i*197+31)%W),y=((i*317+97)%H),r=2+(i%4);ctx.fillStyle=i%3?'rgba(26,39,29,.18)':'rgba(220,192,124,.12)';ctx.beginPath();ctx.ellipse(x,y,r*1.6,r,((i*23)%100)/100,0,Math.PI*2);ctx.fill()}
    // Map perimeter and sector markings
    ctx.strokeStyle='#c9be89';ctx.lineWidth=6;ctx.strokeRect(54,54,W-108,H-108);ctx.lineWidth=2;ctx.strokeStyle='rgba(232,220,171,.32)';ctx.strokeRect(82,82,W-164,H-164);
    drawZone();
    for(const p of props)drawProp(p);
    for(const v of vehicles)drawVehicle(v);
    for(const p of pickups)drawPickup(p);
    // Sorted characters create a convincing ground-plane overlap.
    const actors=[...enemies.map(e=>({o:e,type:'enemy'})),{o:player,type:'player'}].sort((a,b)=>a.o.y-b.o.y);
    for(const a of actors){if(a.type==='enemy')drawActor(a.o,false);else drawActor(a.o,true)}
    for(const b of bullets){ctx.fillStyle=b.color;ctx.shadowColor=b.color;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(b.x,b.y,b.team==='player'?3.4:3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=b.color+'77';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(b.x-b.vx*.025,b.y-b.vy*.025);ctx.lineTo(b.x,b.y);ctx.stroke()}
    for(const p of particles)drawParticle(p);
    // Soft cinematic edge shade in screen space.
    ctx.setTransform(dpr,0,0,dpr,0,0);const vg=ctx.createRadialGradient(vw/2,vh/2,Math.min(vw,vh)*.25,vw/2,vh/2,Math.max(vw,vh)*.75);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(4,9,10,.34)');ctx.fillStyle=vg;ctx.fillRect(0,0,vw,vh);
    drawMinimap();
    if(active&&!paused&&!finished){ui.crosshair.style.left='50%';ui.crosshair.style.top='50%'}
  }
  function drawZone(){
    const pulse=.5+Math.sin(performance.now()*.003)*.08;
    ctx.fillStyle='rgba(192,225,68,.08)';ctx.beginPath();ctx.arc(zone.x,zone.y,zone.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle=capture>=1?'#e1f765':'rgba(213,244,81,.78)';ctx.lineWidth=3;ctx.setLineDash([12,8]);ctx.beginPath();ctx.arc(zone.x,zone.y,zone.r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    ctx.globalAlpha=pulse;ctx.strokeStyle='#e7f77c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(zone.x,zone.y,zone.r+7,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    // Relay mast + circular pad
    ctx.fillStyle='#3d4739';ctx.beginPath();ctx.ellipse(zone.x,zone.y,48,36,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#b8b88b';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(zone.x,zone.y,43,31,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#a5af8a';ctx.fillRect(zone.x-4,zone.y-42,8,66);ctx.fillStyle='#d8ef58';ctx.beginPath();ctx.moveTo(zone.x+4,zone.y-40);ctx.lineTo(zone.x+32,zone.y-31);ctx.lineTo(zone.x+4,zone.y-22);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(8,15,12,.8)';ctx.font='bold 11px monospace';ctx.textAlign='center';ctx.fillText('RELAY 07',zone.x,zone.y+56);ctx.textAlign='left';
  }
  function drawProp(p){
    if(p.type==='building'){
      const x=p.x,y=p.y,w=p.w,h=p.h;ctx.fillStyle='rgba(0,0,0,.24)';ctx.fillRect(x+12,y+15,w,h);
      ctx.fillStyle='#514e3d';ctx.fillRect(x,y+15,w,h);ctx.fillStyle=p.tone?'#8f8767':'#9b9271';ctx.fillRect(x,y,w,h);
      ctx.fillStyle='#b0a47b';ctx.fillRect(x+8,y+8,w-16,h-16);ctx.fillStyle='#68664f';ctx.fillRect(x+20,y+20,w-40,h-40);
      ctx.strokeStyle='rgba(226,214,164,.35)';ctx.lineWidth=3;ctx.strokeRect(x+7,y+7,w-14,h-14);
      ctx.fillStyle='#d4cda0';for(let j=0;j<3;j++){ctx.fillRect(x+24+j*28,y+5,12,4);ctx.fillRect(x+24+j*28,y+h-9,12,4)}
      // Roof detail
      ctx.fillStyle='#797357';ctx.fillRect(x+w*.58,y+h*.32,w*.22,h*.3);ctx.fillStyle='#a89d76';ctx.fillRect(x+w*.60,y+h*.34,w*.18,h*.26);
    }else if(p.type==='barrier'){
      const x=p.x,y=p.y,w=p.w,h=p.h;ctx.fillStyle='#4b4c3b';ctx.fillRect(x+4,y+6,w,h);ctx.fillStyle=p.tone===0?'#aaa17b':'#8c896c';ctx.fillRect(x,y,w,h);ctx.fillStyle='rgba(30,34,27,.3)';ctx.fillRect(x+4,y+3,w-8,4);ctx.strokeStyle='rgba(223,215,179,.32)';ctx.strokeRect(x+1,y+1,w-2,h-2);
    }else{const x=p.x,y=p.y,w=p.w,h=p.h;ctx.fillStyle='#444638';ctx.fillRect(x+5,y+7,w,h);ctx.fillStyle='#a28c62';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#d0b782';ctx.strokeRect(x+3,y+3,w-6,h-6);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y+h);ctx.moveTo(x+w,y);ctx.lineTo(x,y+h);ctx.stroke()}
  }
  function drawVehicle(v){
    ctx.save();ctx.translate(v.x,v.y);ctx.rotate(v.a);ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(3,8,v.heli?35:42,v.heli?22:25,0,0,Math.PI*2);ctx.fill();
    if(v.heli){ctx.fillStyle='#242b28';ctx.fillRect(-30,-4,60,8);ctx.fillRect(-4,-31,8,62);ctx.fillStyle=v.color;ctx.beginPath();ctx.ellipse(0,0,24,13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#a6b0a2';ctx.fillRect(-13,-7,26,14);ctx.fillStyle='#202724';ctx.fillRect(-44,-3,23,6);ctx.fillRect(22,-3,25,6);ctx.fillStyle='#c2ca9c';ctx.beginPath();ctx.arc(4,0,4,0,Math.PI*2);ctx.fill();
    }else{ctx.fillStyle='#202721';for(const x of [-25,25])for(const y of [-20,20]){ctx.fillRect(x-7,y-5,14,10)}ctx.fillStyle=v.color;ctx.fillRect(-31,-19,62,38);ctx.fillStyle='#b0b99a';ctx.fillRect(-17,-14,31,28);ctx.fillStyle='#465342';ctx.fillRect(11,-12,16,24);ctx.fillStyle='#d2c997';ctx.fillRect(29,-14,4,9);ctx.fillRect(29,5,4,9);ctx.fillStyle='#222820';ctx.fillRect(-6,-8,17,16)}
    if(v.occupied){ctx.strokeStyle='#d9f35a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,49,0,Math.PI*2);ctx.stroke()}ctx.restore();
    ctx.fillStyle='#e8dfb8';ctx.font='9px monospace';ctx.textAlign='center';ctx.fillText(v.heli?'DUST HAWK':'RANGER 4×4',v.x,v.y+42);ctx.textAlign='left';
  }
  function drawActor(a,isPlayer){
    ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.a);const r=a.radius;
    ctx.fillStyle='rgba(5,9,7,.38)';ctx.beginPath();ctx.ellipse(0,7,r*1.45,r*.8,0,0,Math.PI*2);ctx.fill();
    // legs, backpack, armored torso
    ctx.fillStyle=isPlayer?'#283c37':'#53392f';ctx.fillRect(-8,1,7,12);ctx.fillRect(2,1,7,12);
    ctx.fillStyle=isPlayer?'#61796a':a.color;ctx.beginPath();ctx.roundRect(-10,-10,20,19,5);ctx.fill();ctx.fillStyle=isPlayer?'#a4b498':'#c09576';ctx.fillRect(-5,-8,11,11);ctx.fillStyle=isPlayer?'#bdc9a6':'#b68b70';ctx.beginPath();ctx.arc(1,-12,7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=isPlayer?'#192823':'#2c2823';ctx.fillRect(3,-5,18,5);ctx.fillStyle='#181e1a';ctx.fillRect(15,-4,11,3);ctx.fillStyle='#cad2b6';ctx.fillRect(7,-7,4,2);
    if(isPlayer){ctx.fillStyle='#d5f451';ctx.fillRect(-4,7,8,3);ctx.strokeStyle='rgba(211,244,81,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,21,0,Math.PI*2);ctx.stroke();}
    else{ctx.fillStyle='#1b211c';ctx.fillRect(-14,-29,29,3);ctx.fillStyle=a.hp>35?'#f37c5a':'#d54d40';ctx.fillRect(-14,-29,29*clamp(a.hp/a.max,0,1),3);ctx.fillStyle='#e9d7c1';ctx.font='7px monospace';ctx.textAlign='center';ctx.fillText(a.name,0,-34);}
    if(a.flash){ctx.globalAlpha=.55;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,r+4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;a.flash=0}
    ctx.restore();
  }
  function drawPickup(p){ctx.save();ctx.translate(p.x,p.y);const pulse=1+Math.sin(performance.now()*.006)*.1;ctx.scale(pulse,pulse);ctx.fillStyle='rgba(0,0,0,.24)';ctx.beginPath();ctx.ellipse(0,7,13,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=p.type==='ammo'?'#d7f155':'#64c8dc';ctx.beginPath();ctx.roundRect(-10,-13,20,20,5);ctx.fill();ctx.fillStyle='#18221b';ctx.font='bold 14px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.type==='ammo'?'＋':'◆',0,-3);ctx.restore()}
  function drawParticle(p){const q=clamp(p.t/p.max,0,1);if(p.type==='dust'){ctx.fillStyle=`rgba(206,193,145,${q*.22})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1+(1-q)*1.5),0,Math.PI*2);ctx.fill()}else if(p.type==='muzzle'){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.fillStyle=`rgba(255,235,155,${q})`;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(p.r, -p.r*.38);ctx.lineTo(p.r*1.35,0);ctx.lineTo(p.r,p.r*.38);ctx.closePath();ctx.fill();ctx.restore()}else if(p.type==='hit'){ctx.strokeStyle=`rgba(255,220,155,${q})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1+(1-q)*2),0,Math.PI*2);ctx.stroke()}else if(p.type==='blast'){ctx.fillStyle=`rgba(255,137,67,${q*.25})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1-q*.5),0,Math.PI*2);ctx.fill();ctx.strokeStyle=`rgba(255,210,119,${q*.85})`;ctx.lineWidth=4;ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1-q*.5),0,Math.PI*2);ctx.stroke()}}
  function drawMinimap(){
    const w=mini.width,h=mini.height;mctx.clearRect(0,0,w,h);mctx.fillStyle='#394336';mctx.fillRect(0,0,w,h);mctx.fillStyle='#665f47';mctx.fillRect(0,h*.46,w,h*.09);mctx.fillRect(w*.48,0,w*.06,h);
    mctx.strokeStyle='rgba(229,219,170,.55)';mctx.lineWidth=1;mctx.strokeRect(4,4,w-8,h-8);
    for(const p of props)if(p.type==='building'){mctx.fillStyle='#9b9271';mctx.fillRect(p.x/W*w,p.y/H*h,p.w/W*w,p.h/H*h)}
    mctx.strokeStyle='#d5f451';mctx.lineWidth=1;mctx.beginPath();mctx.arc(zone.x/W*w,zone.y/H*h,zone.r/W*w,0,Math.PI*2);mctx.stroke();mctx.fillStyle='#d5f451';mctx.beginPath();mctx.arc(player.x/W*w,player.y/H*h,3,0,Math.PI*2);mctx.fill();
    for(const e of enemies){mctx.fillStyle='#ff7657';mctx.beginPath();mctx.arc(e.x/W*w,e.y/H*h,2,0,Math.PI*2);mctx.fill()}for(const v of vehicles){mctx.fillStyle='#c2c8a9';mctx.fillRect(v.x/W*w-2,v.y/H*h-1,4,3)}
  }
  function frame(now){const dt=Math.min(.033,(now-last)/1000||0);last=now;update(dt);draw();requestAnimationFrame(frame)}
  makeMap();reset();
  requestAnimationFrame(frame);
})();
