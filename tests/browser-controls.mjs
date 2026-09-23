import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),core=require('../gluball-core.js'),phase2=require('../phase2-core.js');
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function harness({reduced=false,fallback=false,restored={}}={}) {
 let time=0,id=0;const queue=new Map(),elements=new Map(),draws=[],exports=[];
 class Element {
  constructor(name){this.name=name;this.events={};this.attributes={};this.dataset={};this.value='1';this.checked=false;this.width=1200;this.height=760;}
  addEventListener(n,f){this.events[n]=f;}
  setAttribute(n,v){this.attributes[n]=v;}
  getBoundingClientRect(){return {width:960,height:620};}
  cloneNode(){return new Element(this.name);}
  replaceWith(e){elements.set(this.name,e);}
  setPointerCapture(){}
  click(){return this.events.click?.();}
  remove(){}
 }
 const el=n=>{if(!elements.has(n))elements.set(n,new Element(n));return elements.get(n);};
 el('projection').value='perspective';
 for(const [name,properties] of Object.entries(restored)) Object.assign(el(name),properties);
 const modes=['sculpture','atlas'].map(n=>{const e=new Element(n);e.dataset.mode=n;return e;});
 const doc={hidden:false,events:{},getElementById:el,querySelectorAll:()=>modes,addEventListener(n,f){this.events[n]=f;},createElement:()=>new Element('a'),body:{appendChild(){}}};
 const motion={matches:reduced,addEventListener(n,f){this.change=f;}};
 let lose,restore;
 const api={VERSION:'1.1.0',prepareMesh:()=>({}),guides:()=>({}),createWebGL(c,d,g,l,r){lose=l;restore=r;if(fallback)throw Error('no WebGL');return {name:'WebGL',draw(p,v){draws.push({pose:{...p},view:{...v}});}};},createCanvas(){return {name:'Canvas 2D',draw(p,v){draws.push({pose:{...p},view:{...v}});}};}};
 const window={GluballCore:core,GluballPhase2:phase2,GluballRenderer:api,devicePixelRatio:2,events:{},addEventListener(n,f){this.events[n]=f;},alert(message){throw Error(message);}};
 const context={window,document:doc,matchMedia:()=>motion,performance:{now:()=>time},requestAnimationFrame(fn){queue.set(++id,fn);return id;},cancelAnimationFrame(id){queue.delete(id);},ResizeObserver:class{observe(){}},navigator:{userAgent:'test',platform:'test'},Blob,URL:{createObjectURL(blob){exports.push(blob);return 'blob:test';},revokeObjectURL(){}},console};
 vm.runInNewContext(source,context);
 function advance(ms){time+=ms;const batch=[...queue.values()];queue.clear();for(const fn of batch)fn(time);}
 return {el,doc,window,motion,draws,exports,queue,modes,advance,lose:()=>lose(),restore:()=>restore()};
}
const h=harness();assert.equal(h.draws.length,1);h.advance(5);assert.equal(h.draws.length,1,'no duplicate >60 Hz redraw');h.advance(15);assert.equal(h.el('tick').textContent,'1');
h.el('play').click();h.advance(100);assert.equal(h.queue.size,0,'paused RAF stops');
const count=h.draws.length;h.advance(10000);assert.equal(h.draws.length,count);
h.el('step').click();h.advance(1);assert.equal(h.el('tick').textContent,'2');
h.el('step60').click();h.advance(1);assert.equal(h.el('tick').textContent,'62');
h.el('reset').click();h.advance(1);assert.equal(h.el('tick').textContent,'0');
h.el('gluball-canvas').events.keydown({key:'ArrowLeft',preventDefault(){}});h.advance(1);assert.equal(h.el('tick').textContent,'0');assert.equal(h.draws.at(-1).view.yaw,-.1);
h.el('home').click();h.advance(1);assert.equal(h.draws.at(-1).view.yaw,0);
h.modes[1].click();h.el('host').checked=true;h.el('host').events.change();h.advance(1);assert.equal(h.draws.at(-1).view.mode,'atlas');assert.equal(h.draws.at(-1).view.host,true);
h.el('play').click();h.advance(20);const beforeHide=h.el('tick').textContent;
h.doc.hidden=true;h.doc.events.visibilitychange();h.advance(10000);assert.equal(h.queue.size,0);assert.equal(h.el('tick').textContent,beforeHide);
h.doc.hidden=false;h.doc.events.visibilitychange();h.advance(1);assert.equal(h.el('tick').textContent,beforeHide,'no hidden-time catch-up');
h.lose();assert.equal(h.queue.size,0);h.advance(1000);h.restore();h.advance(1);assert.equal(h.el('renderer').textContent,'WebGL');
h.motion.change({matches:true});h.advance(1);assert.equal(h.el('play').textContent,'Play');assert.equal(h.queue.size,0);
// Async sealing must retain the click-time state even if a later UI action changes it.
const exportTick=Number(h.el('tick').textContent);const sealing=h.el('export').click();
h.el('step60').click();h.el('host').checked=false;h.el('host').events.change();h.advance(1);await sealing;
const payload=JSON.parse(await h.exports[0].text());assert.equal(payload.tick,exportTick);assert.equal(payload.capture.presentation.hostTorus,true);
assert.equal(payload.evidence.envelope.tick,exportTick);assert.deepEqual(payload.evidence.receipt,await phase2.evidenceReceipt(payload.evidence.envelope));
const r=harness({reduced:true});assert.equal(r.el('play').textContent,'Play');assert.equal(r.queue.size,0);assert.equal(r.draws.length,1);
const f=harness({fallback:true,reduced:true});assert.equal(f.el('renderer').textContent,'Canvas 2D');f.el('step').click();f.advance(1);assert.equal(f.el('tick').textContent,'1');
// Restored form properties must drive the first frame and export without events.
for (const fallback of [false,true]) {
 const restored=harness({reduced:true,fallback,restored:{wire:{checked:true},host:{checked:true},projection:{value:'orthographic'},zoom:{value:'1.25'}}});
 const first=restored.draws[0].view;
 assert.equal(first.wire,true);assert.equal(first.host,true);
 assert.equal(first.projection,'orthographic');assert.equal(first.zoom,1.25);
 await restored.el('export').click();
 const initial=JSON.parse(await restored.exports[0].text()).capture.presentation;
 assert.equal(initial.wireframe,true);assert.equal(initial.hostTorus,true);
 assert.equal(initial.projection,'orthographic');assert.equal(initial.camera.zoom,1.25);
 // Browsers can also restore values after script execution / on history return.
 restored.el('wire').checked=false;restored.el('host').checked=false;
 restored.el('projection').value='perspective';restored.el('zoom').value='.8';
 restored.window.events.pageshow();restored.advance(1);
 const shown=restored.draws.at(-1).view;
 assert.equal(shown.wire,false);assert.equal(shown.host,false);
 assert.equal(shown.projection,'perspective');assert.equal(shown.zoom,.8);
 await restored.el('export').click();
 const after=JSON.parse(await restored.exports[1].text()).capture.presentation;
 assert.equal(after.wireframe,false);assert.equal(after.hostTorus,false);
 assert.equal(after.projection,'perspective');assert.equal(after.camera.zoom,.8);
}
console.log('GLUBALL browser controls: PASS (mock DOM/RAF; tick, idle, visibility, motion, fallback, export)');
