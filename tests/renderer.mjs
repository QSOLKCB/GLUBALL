import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../gluball-core.js');
const renderer = require('../renderer.js');
const mesh = core.buildMesh(), data = renderer.prepareMesh(mesh);
const { uSegments: u, vSegments: v } = mesh.config;
assert.equal(data.positions.length, u*v*3);
assert.equal(data.triangles.length, u*v*6);
const edges = new Map();
for (let k=0;k<data.triangles.length;k+=3) {
  const ids = [...data.triangles.slice(k,k+3)];
  for(let j=0;j<3;j++) {
    const a=ids[j],b=ids[(j+1)%3];
    assert.ok(a<u*v && b<u*v);
    const key=[Math.min(a,b),Math.max(a,b)].join(':');
    const edge=edges.get(key)||{count:0,orientation:0};
    edge.count++;edge.orientation+=a<b?1:-1;edges.set(key,edge);
  }
}
for(const edge of edges.values()) assert.deepEqual(edge,{count:2,orientation:0},'closed oriented mesh including both periodic seams');
for(let i=0;i<u;i++)for(let j=0;j<v;j++) {
  const k=(i*v+j)*3,p=mesh.vertices[i][j].point,c=core.centerline(core.TAU*i/u);
  for(const [axis,key] of ['x','y','z'].entries()) assert.equal(data.positions[k+axis],Math.fround(p[key]));
  assert.ok(Math.abs(Math.hypot(...data.normals.slice(k,k+3))-1)<1e-6);
  const radial=[p.x-c.x,p.y-c.y,p.z-c.z];
  assert.ok(radial.reduce((sum,x,n)=>sum+x*data.normals[k+n],0)>.99*mesh.config.tubeRadius,'outward lighting normal');
}
// Compare matrix rotation with the independent original scalar transform.
for(const tick of [0,1,231,900,12345]) {
 const pose=core.tickPose(tick),m=renderer.rotation(pose);
 for(const p of [{x:1,y:0,z:0},{x:0,y:1,z:0},{x:.4,y:-2,z:3}]) {
  const x=Math.cos(pose.yaw)*p.x-Math.sin(pose.yaw)*p.z;
  const z=Math.sin(pose.yaw)*p.x+Math.cos(pose.yaw)*p.z;
  const y=Math.cos(pose.pitch)*p.y-Math.sin(pose.pitch)*z;
  const expected=[Math.cos(pose.roll)*x-Math.sin(pose.roll)*y,Math.sin(pose.roll)*x+Math.cos(pose.roll)*y,Math.sin(pose.pitch)*p.y+Math.cos(pose.pitch)*z];
  for(let a=0;a<3;a++) assert.ok(Math.abs(m[a]*p.x+m[a+3]*p.y+m[a+6]*p.z-expected[a])<3e-7);
 }
}
const guide=renderer.guides(core);
assert.ok([...guide.host,...guide.centre].every(Number.isFinite));
for(let i=0;i<guide.centre.length;i+=6) {
 const p=core.centerline(i/6*core.TAU/384);
 assert.deepEqual([...guide.centre.slice(i,i+3)],[p.x,p.y,p.z].map(Math.fround));
}
// Verify WebGL uploads once, then issues bounded draw calls without mesh rebuilds.
const calls={uploads:0,draws:0};
const gl=new Proxy({}, {get(_,key){
 if(key==='getShaderParameter'||key==='getProgramParameter') return ()=>true;
 if(key==='getAttribLocation') return (_,name)=>name==='position'?0:1;
 if(key==='getUniformLocation') return (_,name)=>name;
 if(key==='bufferData') return ()=>calls.uploads++;
 if(key==='drawElements'||key==='drawArrays') return ()=>calls.draws++;
 if(key.startsWith('create')) return ()=>({});
 if(key===key.toUpperCase()) return key;
 return ()=>{};
}});
const events={};
const canvas={width:960,height:620,getContext:()=>gl,addEventListener:(n,fn)=>events[n]=fn};
let lost=0,restored=0;
const gpu=renderer.createWebGL(canvas,data,guide,()=>lost++,()=>restored++);
const view={mode:'sculpture',wire:false,host:false,zoom:1,projection:'perspective'};
const uploads=calls.uploads;
for(let tick=0;tick<100;tick++)gpu.draw(core.tickPose(tick),view);
assert.equal(calls.uploads,uploads);assert.equal(calls.draws,100);
events.webglcontextlost({preventDefault(){}});gpu.draw(core.tickPose(0),view);assert.equal(calls.draws,100);assert.equal(lost,1);
events.webglcontextrestored();assert.equal(restored,1);assert.equal(calls.uploads,uploads*2);
gpu.draw(core.tickPose(0),{...view,mode:'atlas',host:true});assert.equal(calls.draws,103);
console.log('GLUBALL renderer: PASS (geometry, seams, transforms, static buffers, context recovery)');
