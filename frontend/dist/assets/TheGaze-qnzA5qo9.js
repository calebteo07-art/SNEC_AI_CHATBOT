var x=Object.defineProperty;var w=(l,e,i)=>e in l?x(l,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):l[e]=i;var t=(l,e,i)=>w(l,typeof e!="symbol"?e+"":e,i);import{r as f,a as R,s as b,j as y}from"./index-pzfJeSYd.js";import{W as P,P as z,S as C,V as d,M as E,a as M,O as T}from"./three.module-DLzAHRMd.js";const I=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,S=`
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2  uRes;
uniform vec2  uGaze;    // smoothed gaze offset, [-1,1]
uniform vec2  uCenter;  // iris anchor in UV space (off-centre on desktop)
uniform float uPupil;   // pupil radius, iris-relative
uniform float uExpand;  // 0→1 engulf on login success
uniform float uIris;    // iris radius in px

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.13; a *= 0.5; }
  return v;
}

void main() {
  vec2 frag = vUv * uRes;
  vec2 center = uRes * uCenter + uGaze * vec2(uIris * 0.16, uIris * 0.12);
  vec2 d = frag - center;
  d.x *= 1.0 + abs(uGaze.x) * 0.07; /* perspective squash when looking aside */
  d.y *= 1.0 + abs(uGaze.y) * 0.06;
  float r = length(d) / uIris;
  float theta = atan(d.y, d.x);

  vec3 stage  = vec3(0.094, 0.090, 0.090); /* #181717 */
  vec3 deep   = vec3(0.008, 0.024, 0.090); /* #020617 */
  vec3 green  = vec3(0.133, 0.773, 0.369); /* #22C55E */
  vec3 greenD = vec3(0.082, 0.502, 0.239); /* #15803D */
  vec3 teal   = vec3(0.102, 0.659, 0.612); /* #1AA89C */
  vec3 blue   = vec3(0.259, 0.522, 0.957); /* #4285F4 */
  vec3 cream  = vec3(0.957, 0.937, 0.906); /* #F4EFE7 */

  /* pupil with hippus — the real physiological tremor — and an organic,
     slightly irregular margin */
  float pupil = uPupil * (1.0 + 0.014 * sin(uTime * 1.9) + 0.007 * sin(uTime * 4.7));
  pupil += (noise(vec2(theta * 5.0, uTime * 0.25)) - 0.5) * 0.018;
  float pupilR = mix(pupil, 7.0, smoothstep(0.0, 1.0, uExpand));

  /* iris fibres: radial streaks drifting slowly */
  float fib  = fbm(vec2(theta * 7.0 + sin(r * 4.0) * 0.6, r * 6.0 - uTime * 0.045));
  float ring = fbm(vec2(r * 16.0 - uTime * 0.025, theta * 2.0));
  float fiber = fib * 0.72 + ring * 0.28;
  /* fine striations — the crisp radial threads of a real iris */
  float stria = smoothstep(0.3, 0.8, noise(vec2(theta * 34.0, r * 8.0)));

  /* radial colour ramp: deep green core → brand green → teal → blue limbus */
  vec3 irisCol = mix(greenD, green, smoothstep(0.10, 0.55, r));
  irisCol = mix(irisCol, teal, smoothstep(0.45, 0.85, r));
  irisCol = mix(irisCol, blue, smoothstep(0.80, 1.00, r) * 0.8);
  irisCol *= 0.38 + fiber * 1.18;
  irisCol *= 0.82 + stria * 0.34;

  /* collarette — brighter weave just outside the pupil */
  float coll = smoothstep(0.045, 0.0, abs(r - (pupil + 0.14)));
  irisCol += green * coll * (0.25 + fiber * 0.45);

  /* limbal glow ring */
  float limbus = smoothstep(1.07, 0.99, r) * smoothstep(0.90, 0.99, r);
  irisCol += blue * limbus * 0.55;

  /* the void, with an ambient halo breathing off the eye */
  float irisMask = smoothstep(1.07, 0.97, r);
  float halo = exp(-max(r - 1.0, 0.0) * 2.4);
  vec3 voidCol = deep + (green * 0.45 + blue * 0.55) * halo * 0.16;
  vec3 col = mix(voidCol, irisCol, irisMask);

  /* catchlight — the exam lamp's reflection; fades during the engulf */
  vec2 cl = frag - (center + vec2(-uIris * 0.30, uIris * 0.36));
  float catchlight = exp(-dot(cl, cl) / (uIris * uIris * 0.0045));
  col += cream * catchlight * 0.55 * (1.0 - uExpand);

  /* the pupil paints stage charcoal over everything — the portal in */
  float pm = 1.0 - smoothstep(pupilR, pupilR + 0.03, r);
  col = mix(col, stage, pm);

  /* film grain against banding in the dark field */
  col += (hash(frag + fract(uTime) * 91.7) - 0.5) * 0.014;

  gl_FragColor = vec4(col, 1.0);
}
`,m=.26,G=.345;class F{constructor(e,i=2){t(this,"renderer");t(this,"scene",new M);t(this,"camera",new T(-1,1,1,-1,0,1));t(this,"geometry");t(this,"material");t(this,"pointer",new d(0,0));t(this,"gaze",new d(0,0));t(this,"jitter",new d(0,0));t(this,"hasPointer",!1);t(this,"pupilTarget",m);t(this,"pupil",m);t(this,"expand",0);t(this,"expanding",!1);t(this,"expandResolve",null);this.canvas=e,this.renderer=new P({canvas:e,antialias:!1,alpha:!1,powerPreference:"high-performance"}),this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,i)),this.geometry=new z(2,2),this.material=new C({vertexShader:I,fragmentShader:S,uniforms:{uTime:{value:0},uRes:{value:new d(1,1)},uGaze:{value:new d(0,0)},uCenter:{value:new d(.5,.5)},uPupil:{value:m},uExpand:{value:0},uIris:{value:300}},depthTest:!1,depthWrite:!1}),this.scene.add(new E(this.geometry,this.material)),this.resize()}resize(){const e=this.canvas.clientWidth||window.innerWidth,i=this.canvas.clientHeight||window.innerHeight;this.renderer.setSize(e,i,!1),this.material.uniforms.uRes.value.set(e,i),this.material.uniforms.uIris.value=Math.min(e,i)*.4;const n=e/i>1.05;this.material.uniforms.uCenter.value.set(n?.66:.5,n?.5:.7)}setPointer(e,i){this.pointer.set(e*2-1,-(i*2-1)),this.hasPointer=!0}setFocus(e){this.pupilTarget=e?G:m}saccade(){this.jitter.set((Math.random()-.5)*.14,(Math.random()-.5)*.09)}expandPupil(){return this.expanding?Promise.resolve():(this.expanding=!0,new Promise(e=>{this.expandResolve=e}))}render(e,i){const n=e/1e3,a=Math.min(i/1e3,.064),o=this.material.uniforms,u=this.hasPointer?this.pointer.x:Math.sin(n*.35)*.35,r=this.hasPointer?this.pointer.y:Math.cos(n*.27)*.25,s=1-Math.exp(-a*5.2);if(this.gaze.x+=(u+this.jitter.x-this.gaze.x)*s,this.gaze.y+=(r+this.jitter.y-this.gaze.y)*s,this.jitter.multiplyScalar(Math.exp(-a*7)),this.pupil+=(this.pupilTarget-this.pupil)*(1-Math.exp(-a*6)),this.expanding&&this.expand<1){this.expand=Math.min(1,this.expand+a*1.9);const v=o.uRes.value,h=o.uIris.value,c=(this.pupil+(7-this.pupil)*this.smooth(this.expand))*h,p=Math.hypot(v.x,v.y)/2;this.expandResolve&&c>p+h*.04&&(this.expandResolve(),this.expandResolve=null)}o.uTime.value=n,o.uGaze.value.copy(this.gaze),o.uPupil.value=this.pupil,o.uExpand.value=this.expand,this.renderer.render(this.scene,this.camera)}renderStatic(){this.render(4e4,16)}smooth(e){return e*e*(3-2*e)}dispose(){var e;(e=this.expandResolve)==null||e.call(this),this.expandResolve=null,this.geometry.dispose(),this.material.dispose(),this.renderer.dispose(),this.renderer.forceContextLoss()}}const U=f.forwardRef(function(e,i){const n=f.useRef(null),a=f.useRef(null),{tier:o,reducedMotion:u}=R();return f.useImperativeHandle(i,()=>({setFocus:r=>{var s;return(s=a.current)==null?void 0:s.setFocus(r)},saccade:()=>{var r;return(r=a.current)==null?void 0:r.saccade()},expandPupil:()=>{var r;return u?Promise.resolve():((r=a.current)==null?void 0:r.expandPupil())??Promise.resolve()}}),[u]),f.useEffect(()=>{const r=n.current;if(!r)return;let s;try{s=new F(r,o==="high"?2:1.25)}catch{return}a.current=s;const v=()=>s.resize();window.addEventListener("resize",v);let h,c;return u?s.renderStatic():(c=p=>s.setPointer(p.clientX/window.innerWidth,p.clientY/window.innerHeight),window.addEventListener("pointermove",c),h=b((p,g)=>s.render(p,g))),()=>{window.removeEventListener("resize",v),c&&window.removeEventListener("pointermove",c),h==null||h(),s.dispose(),a.current=null}},[o,u]),y.jsx("canvas",{ref:n,"aria-hidden":"true",style:{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}})});export{U as TheGaze};
