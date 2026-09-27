// Real WebGL world. Three.js is loaded as a normal browser script in
// index.html so this also works when the page is opened directly.
(() => {
  const THREE = window.THREE;
  const canvas = document.querySelector('#game-canvas');
  const wrap = document.querySelector('#game-canvas-wrap');
  const startPrompt = document.querySelector('#start-prompt');
  if (!THREE || !canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c9e2e2');
  scene.fog = new THREE.Fog('#c9e2e2', 28, 58);
  const camera = new THREE.PerspectiveCamera(70, 1, .05, 80);
  camera.rotation.order = 'YXZ';
  const world = new THREE.Group();
  const ghostWorld = new THREE.Group();
  scene.add(world, ghostWorld);

  scene.add(new THREE.HemisphereLight('#fff8e8', '#6b8d90', 2.4));
  const sun = new THREE.DirectionalLight('#fff3cf', 3.2);
  sun.position.set(-10, 18, 9); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun);

  const bounds = 11;
  const stud = .58;
  const palette = { red:'#e94a4d', blue:'#2284c6', yellow:'#f5c542', green:'#36a66d', orange:'#f1843d', white:'#f5f3ea', black:'#28313b', lavender:'#9a7bd1' };
  const parts = {
    brick2x4: { label:'Brick 2 × 4', meta:'2 × 4', w:2, d:4, h:1, kind:'brick' },
    brick2x2: { label:'Brick 2 × 2', meta:'2 × 2', w:2, d:2, h:1, kind:'brick' },
    plate4x4: { label:'Plate 4 × 4', meta:'4 × 4', w:4, d:4, h:.34, kind:'plate' },
    slope2x2: { label:'Slope 2 × 2', meta:'2 × 2', w:2, d:2, h:1, kind:'slope' },
    tnt: { label:'TNT Crate', meta:'2 × 2', w:2, d:2, h:1, kind:'tnt' }
  };
  let selectedPart = 'brick2x4', selectedColor = 'red', rotation = 0;
  let blocks = [], target = null, ghost = null, effects = [];
  let yaw = 0, pitch = -.12, focused = false, dragging = false, lastPointer = { x:0, y:0 }, shakeTime = 0;
  const keys = new Set();
  const cameraState = { x:0, y:3.4, z:15 };
  let verticalVelocity = 0;
  const stats = { placed:0, highest:0 };
  const raycaster = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const clock = new THREE.Clock();

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(bounds * 2 * stud, bounds * 2 * stud), new THREE.MeshStandardMaterial({ color:'#bad6d2', roughness:1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.isFloor = true; scene.add(floor);
  const grid = new THREE.GridHelper(bounds * 2 * stud, bounds * 2, '#83b3b1', '#a9cdca');
  grid.position.y = .012; grid.material.transparent = true; grid.material.opacity = .55; scene.add(grid);

  function resize() {
    const rect = wrap.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  function material(color, transparent = false) { return new THREE.MeshStandardMaterial({ color:palette[color], roughness:.72, transparent, opacity:transparent ? .35 : 1, depthWrite:!transparent }); }
  function makeStuds(data, mat) {
    const group = new THREE.Group(); const geometry = new THREE.CylinderGeometry(.115, .115, .055, 12);
    for (let x=0;x<data.w;x++) for (let z=0;z<data.d;z++) { const mesh = new THREE.Mesh(geometry, mat); mesh.position.set((x-(data.w-1)/2)*stud, data.h/2+.035, (z-(data.d-1)/2)*stud); mesh.castShadow = true; group.add(mesh); }
    return group;
  }
  function makePart(type, color, transparent = false) {
    const data = parts[type], root = new THREE.Group(), mat = material(color, transparent);
    const width = data.w*stud+.035, depth = data.d*stud+.035, h = data.h;
    let geometry;
    if(data.kind==='slope'){
      const w=width/2,d=depth/2;
      const vertices=[-w,-h/2,-d, w,-h/2,-d, w,-h/2,d, -w,-h/2,d, -w,h/2,-d, w,h/2,-d];
      const indices=[0,1,2, 0,2,3, 0,4,5, 0,5,1, 1,5,2, 2,5,4, 2,4,3, 3,4,0];
      geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    } else geometry=new THREE.BoxGeometry(width,h,depth);
    const body = new THREE.Mesh(geometry, mat);
    body.castShadow = !transparent; body.receiveShadow = !transparent; root.add(body);
    if(data.kind==='tnt') {
      const bandMat = new THREE.MeshStandardMaterial({ color:'#f5f3ea', transparent, opacity:transparent ? .35 : 1, depthWrite:!transparent });
      const band = new THREE.Mesh(new THREE.BoxGeometry(width+.025, h*.34, depth+.025), bandMat); band.position.y = 0; band.castShadow = !transparent; root.add(band);
      root.userData.fuseMaterial = mat;
    } else if(data.kind!=='slope') root.add(makeStuds(data, mat));
    root.userData.type = type; root.userData.height = data.h; root.userData.root = root;
    root.traverse(node=>{node.userData.root=root;});
    return root;
  }
  function setPosition(root, x, z, layer) {
    const data = parts[root.userData.type]; root.position.set((x+(data.w-1)/2)*stud, layer+data.h/2, (z+(data.d-1)/2)*stud); root.rotation.y = rotation * Math.PI/2; root.userData.x=x; root.userData.z=z; root.userData.layer=layer; root.userData.top=layer+data.h;
  }
  function addBlock(type, color, x, z, layer, count = true) { const root=makePart(type,color); setPosition(root,x,z,layer); world.add(root); blocks.push(root); if(count){stats.placed++;stats.highest=Math.max(stats.highest,Math.ceil(layer+parts[type].h));} if(type==='tnt'&&count){root.userData.fuseEnd=performance.now()+2600;showToast('TNT fuse lit!');setTimeout(()=>explode(root),2600);} return root; }
  function starter() {
    stats.placed=0; stats.highest=0; updateStats();
  }
  function updateStats(){ document.querySelector('#brick-count').textContent=stats.placed; document.querySelector('#height-count').textContent=stats.highest; }
  function setPart(type){ if(!parts[type])return;selectedPart=type;document.querySelectorAll('.part-card').forEach(card=>card.classList.toggle('active',card.dataset.part===type));document.querySelector('#current-piece-name').textContent=parts[type].label;document.querySelector('#current-piece-meta').textContent=`${selectedColor[0].toUpperCase()+selectedColor.slice(1)} · ${parts[type].meta}`;makeGhost(); }
  function setColor(color){if(!palette[color])return;selectedColor=color;document.querySelectorAll('.color-swatch').forEach(swatch=>swatch.classList.toggle('active',swatch.dataset.color===color));document.querySelector('#current-piece-meta').textContent=`${color[0].toUpperCase()+color.slice(1)} · ${parts[selectedPart].meta}`;makeGhost();}
  function makeGhost(){ghostWorld.clear();ghost=makePart(selectedPart,selectedColor,true);ghost.visible=false;ghostWorld.add(ghost);}
  function clampStart(value,size){return Math.max(-bounds,Math.min(bounds-size,value));}
  function findTarget(){
    raycaster.setFromCamera(center,camera); const hits=raycaster.intersectObjects([floor,world],true).filter(hit=>hit.object.userData.isFloor||hit.object.userData.root); if(!hits.length)return null;
    const hit=hits[0], data=parts[selectedPart]; let layer=0; if(hit.object.userData.root){const root=hit.object.userData.root;layer=root.userData.top;}
    let x=Math.floor(hit.point.x/stud-data.w/2+.5), z=Math.floor(hit.point.z/stud-data.d/2+.5); x=clampStart(x,data.w);z=clampStart(z,data.d); return {x,z,layer};
  }
  function updateGhost(){ if(!ghost)return; target=findTarget(); if(!target){ghost.visible=false;return;} ghost.visible=true; setPosition(ghost,target.x,target.z,target.layer); }
  function place(){if(!target)return;addBlock(selectedPart,selectedColor,target.x,target.z,target.layer,true);updateStats();if(selectedPart!=='tnt')showToast(`${parts[selectedPart].label} placed`);}
  function spawnEffect(mesh, velocity, life, update){scene.add(mesh);effects.push({mesh,velocity:velocity||new THREE.Vector3(),life:0,maxLife:life,update});}
  function explode(tnt){if(!tnt.parent)return;const centerPoint=tnt.position.clone();shakeTime=.9;
    const flash=new THREE.Mesh(new THREE.SphereGeometry(.45,24,16),new THREE.MeshBasicMaterial({color:'#fff1a8',transparent:true,opacity:.95,blending:THREE.AdditiveBlending}));flash.position.copy(centerPoint);spawnEffect(flash,new THREE.Vector3(),.42,e=>{const p=1-e.life/e.maxLife;e.mesh.scale.setScalar(1+5*(1-p));e.mesh.material.opacity=p;});
    const ring=new THREE.Mesh(new THREE.RingGeometry(.25,.42,32),new THREE.MeshBasicMaterial({color:'#ff8e35',transparent:true,opacity:.9,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(centerPoint.x,.05,centerPoint.z);spawnEffect(ring,new THREE.Vector3(),.65,e=>{const p=e.life/e.maxLife;e.mesh.scale.setScalar(1+7*p);e.mesh.material.opacity=1-p;});
    const light=new THREE.PointLight('#ff7838',12,9);light.position.copy(centerPoint);spawnEffect(light,new THREE.Vector3(),.55,e=>{e.mesh.intensity=12*(1-e.life/e.maxLife);});
    for(let i=0;i<26;i++){const spark=new THREE.Mesh(new THREE.SphereGeometry(.055+Math.random()*.06,8,6),new THREE.MeshBasicMaterial({color:i%3?'#ffb52e':'#f5f3ea',transparent:true,opacity:1}));spark.position.copy(centerPoint);const velocity=new THREE.Vector3((Math.random()-.5)*4,1.5+Math.random()*4,(Math.random()-.5)*4);spawnEffect(spark,velocity,.8+Math.random()*.55,e=>{e.velocity.y-=7*.016;e.mesh.material.opacity=1-e.life/e.maxLife;});}
    for(let i=0;i<9;i++){const smoke=new THREE.Mesh(new THREE.SphereGeometry(.18+Math.random()*.16,10,8),new THREE.MeshBasicMaterial({color:'#6c7775',transparent:true,opacity:.45}));smoke.position.copy(centerPoint);smoke.position.x+=(Math.random()-.5)*.5;smoke.position.z+=(Math.random()-.5)*.5;spawnEffect(smoke,new THREE.Vector3((Math.random()-.5)*.35,.6+Math.random()*.7,(Math.random()-.5)*.35),1.3,e=>{e.mesh.scale.addScalar(.025);e.mesh.material.opacity=.45*(1-e.life/e.maxLife);});}
    const radius=7*stud;blocks.slice().forEach(block=>{if(block===tnt)return;const dx=block.position.x-centerPoint.x,dz=block.position.z-centerPoint.z;if(Math.hypot(dx,dz)<radius&&Math.abs(block.position.y-centerPoint.y)<3.5){world.remove(block);const index=blocks.indexOf(block);if(index>=0)blocks.splice(index,1);}});world.remove(tnt);const index=blocks.indexOf(tnt);if(index>=0)blocks.splice(index,1);stats.placed=blocks.length;stats.highest=blocks.length?Math.max(...blocks.map(block=>Math.ceil(block.userData.top))):0;updateStats();showToast('BOOM!');}
  function updateEffects(dt){for(let i=effects.length-1;i>=0;i--){const effect=effects[i];effect.life+=dt;if(effect.update)effect.update(effect);if(effect.mesh.position)effect.mesh.position.addScaledVector(effect.velocity,dt);if(effect.life>=effect.maxLife){scene.remove(effect.mesh);effects.splice(i,1);}}}
  function remove(){raycaster.setFromCamera(center,camera);const hit=raycaster.intersectObjects(world.children,true)[0];if(!hit)return;const root=hit.object.userData.root;if(!root)return;world.remove(root);const i=blocks.indexOf(root);if(i>=0)blocks.splice(i,1);stats.placed=Math.max(0,stats.placed-1);stats.highest=blocks.length?Math.max(...blocks.map(block=>Math.ceil(block.userData.top))):0;updateStats();showToast('Piece removed');}
  function showToast(message){const toast=document.querySelector('#toast');toast.textContent=message;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),1200);}
  function reset(){blocks.slice().forEach(block=>world.remove(block));blocks=[];effects.forEach(effect=>scene.remove(effect.mesh));effects=[];shakeTime=0;verticalVelocity=0;cameraState.x=0;cameraState.y=3.4;cameraState.z=15;yaw=0;pitch=-.12;rotation=0;stats.placed=0;stats.highest=0;starter();showToast('Fresh canvas ready.');}
  function collides(x,z){return blocks.some(block=>{const data=parts[block.userData.type],pad=.7;return x>block.userData.x*stud-pad&&x<(block.userData.x+data.w)*stud+pad&&z>block.userData.z*stud-pad&&z<(block.userData.z+data.d)*stud+pad&&block.userData.top>.5;});}
  function jump(){if(cameraState.y<=3.401&&verticalVelocity<=0)verticalVelocity=5.2;}
  function move(dt){if(!focused&&!document.pointerLockElement)return;const speed=3.2*dt,forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),next=new THREE.Vector3(cameraState.x,cameraState.y,cameraState.z);if(keys.has('KeyW'))next.addScaledVector(forward,speed);if(keys.has('KeyS'))next.addScaledVector(forward,-speed);if(keys.has('KeyA'))next.addScaledVector(right,-speed);if(keys.has('KeyD'))next.addScaledVector(right,speed);if(!collides(next.x,next.z))cameraState.x=next.x,cameraState.z=next.z;verticalVelocity-=14*dt;cameraState.y+=verticalVelocity*dt;if(cameraState.y<=3.4){cameraState.y=3.4;verticalVelocity=0;}cameraState.x=THREE.MathUtils.clamp(cameraState.x,-bounds*stud,bounds*stud);cameraState.z=THREE.MathUtils.clamp(cameraState.z,-bounds*stud,bounds*stud+3);if(keys.has('ArrowUp'))pitch=Math.min(.65,pitch+.015);if(keys.has('ArrowDown'))pitch=Math.max(-.65,pitch-.015);}

  window.addEventListener('brickcraft:part',event=>setPart(event.detail)); window.addEventListener('brickcraft:color',event=>setColor(event.detail)); window.addEventListener('brickcraft:reset',reset);
  canvas.addEventListener('pointerdown',event=>{
    if(event.button===2){event.preventDefault();focused=true;startPrompt.classList.add('hidden');remove();return;}
    focused=true;dragging=true;lastPointer={x:event.clientX,y:event.clientY};startPrompt.classList.add('hidden');canvas.setPointerCapture?.(event.pointerId);canvas.requestPointerLock?.();
  });
  canvas.addEventListener('pointerup',()=>dragging=false);
  canvas.addEventListener('pointermove',event=>{if(document.pointerLockElement!==canvas&&!dragging)return;const dx=document.pointerLockElement===canvas?event.movementX:event.clientX-lastPointer.x,dy=document.pointerLockElement===canvas?event.movementY:event.clientY-lastPointer.y;lastPointer={x:event.clientX,y:event.clientY};yaw-=dx*.0022;pitch=THREE.MathUtils.clamp(pitch-dy*.0022,-.65,.65);});
  canvas.addEventListener('click',event=>{if(event.button===0)place();}); canvas.addEventListener('contextmenu',event=>event.preventDefault());
  document.addEventListener('keydown',event=>{keys.add(event.code);if(event.code==='Space'){event.preventDefault();jump();}if(event.code==='KeyQ'){rotation=(rotation+3)%4;makeGhost();}if(event.code==='KeyE'){rotation=(rotation+1)%4;makeGhost();}if(event.code==='Escape'){focused=false;dragging=false;}}); document.addEventListener('keyup',event=>keys.delete(event.code));

  camera.position.set(cameraState.x,cameraState.y,cameraState.z); starter(); makeGhost();
  function frame(){requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.05);move(dt);const now=performance.now();blocks.forEach(block=>{if(block.userData.fuseEnd){const remaining=block.userData.fuseEnd-now;if(remaining>0&&block.userData.fuseMaterial){const flash=Math.sin(remaining*.018)>0;block.userData.fuseMaterial.emissive.set(flash?'#ff5b32':'#000000');block.userData.fuseMaterial.emissiveIntensity=flash?1.2:0;}}});updateEffects(dt);shakeTime=Math.max(0,shakeTime-dt);const shake=shakeTime/.9;camera.position.set(cameraState.x+(Math.random()-.5)*.3*shake,cameraState.y+(Math.random()-.5)*.18*shake,cameraState.z+(Math.random()-.5)*.3*shake);camera.rotation.set(pitch+(Math.random()-.5)*.07*shake,yaw+(Math.random()-.5)*.07*shake,(Math.random()-.5)*.05*shake);updateGhost();renderer.render(scene,camera);} frame();
})();
