var z=Object.defineProperty;var C=(o,e,t)=>e in o?z(o,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):o[e]=t;var n=(o,e,t)=>C(o,typeof e!="symbol"?e+"":e,t);import{r as u,u as j,s as q,j as S}from"./index-pzfJeSYd.js";import{W as D,P as F,S as k,V as x,M as G,a as W,O as _,T as A,b as X}from"./three.module-DLzAHRMd.js";const B=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,N=`
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2  uUvScale;   // object-fit: cover mapping
uniform vec2  uUvOffset;
uniform vec2  uPointer;   // element uv space, GL y-up
uniform float uHover;     // eased 0..1
uniform float uTime;
uniform float uVelocity;  // shell scroll velocity

void main() {
  vec2 uv = vUv;

  /* scroll refraction: the plate shears like fluid under momentum */
  float vel = clamp(uVelocity, -40.0, 40.0);
  uv.x += (sin(uv.y * 14.0 + uTime * 1.4) * 0.5 + sin(uv.y * 23.0 - uTime * 0.9) * 0.5) * vel * 0.0014;
  uv.y += sin(uv.x * 18.0 + uTime * 1.1) * vel * 0.0007;

  /* pointer ripple: expanding rings, exponentially damped */
  vec2 toP = uv - uPointer;
  float dist = length(toP);
  float ripple = sin(dist * 36.0 - uTime * 5.2) * exp(-dist * 5.0) * uHover;
  uv += normalize(toP + 1e-5) * ripple * 0.011;

  /* lens bulge under the cursor */
  uv -= toP * exp(-dist * dist * 9.0) * 0.045 * uHover;

  vec2 tuv = uUvOffset + uv * uUvScale;

  /* chromatic fringe proportional to how hard the light is bending */
  float disp = abs(ripple) * 1.4 + abs(vel) * 0.0009;
  vec3 col;
  col.r = texture2D(uTex, tuv + vec2(disp * 0.010, 0.0)).r;
  col.g = texture2D(uTex, tuv).g;
  col.b = texture2D(uTex, tuv - vec2(disp * 0.010, 0.0)).b;

  gl_FragColor = vec4(col, 1.0);
}
`;class Q{constructor(e){n(this,"renderer");n(this,"scene",new W);n(this,"camera",new _(-1,1,1,-1,0,1));n(this,"geometry");n(this,"material");n(this,"texture",null);n(this,"hover",0);n(this,"hoverTarget",0);n(this,"pointer",new x(.5,.5));n(this,"pointerTarget",new x(.5,.5));n(this,"velocity",0);n(this,"idleFor",0);this.canvas=e,this.renderer=new D({canvas:e,alpha:!1,antialias:!1}),this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5)),this.geometry=new F(2,2),this.material=new k({vertexShader:B,fragmentShader:N,uniforms:{uTex:{value:null},uUvScale:{value:new x(1,1)},uUvOffset:{value:new x(0,0)},uPointer:{value:new x(.5,.5)},uHover:{value:0},uTime:{value:0},uVelocity:{value:0}},depthTest:!1,depthWrite:!1}),this.scene.add(new G(this.geometry,this.material))}async load(e){const t=await new A().loadAsync(e);t.colorSpace=X,this.texture=t,this.material.uniforms.uTex.value=t,this.resize()}resize(){const e=this.canvas.clientWidth,t=this.canvas.clientHeight;!e||!t||(this.renderer.setSize(e,t,!1),this.computeCover(e,t))}computeCover(e,t){var p;const i=(p=this.texture)==null?void 0:p.image;if(!(i!=null&&i.width)||!(i!=null&&i.height))return;const f=Math.max(e/i.width,t/i.height),l=e/(i.width*f),c=t/(i.height*f);this.material.uniforms.uUvScale.value.set(l,c),this.material.uniforms.uUvOffset.value.set((1-l)/2,(1-c)/2)}setPointer(e,t){this.pointerTarget.set(e,t)}setHover(e){this.hoverTarget=e?1:0}setVelocity(e){this.velocity=e}render(e,t){if(!this.texture)return!1;const i=Math.min(t/1e3,.064);if(this.hover+=(this.hoverTarget-this.hover)*(1-Math.exp(-i*7)),this.pointer.lerp(this.pointerTarget,1-Math.exp(-i*9)),this.hoverTarget>0||this.hover>.012||Math.abs(this.velocity)>.4)this.idleFor=0;else if(this.idleFor+=i,this.idleFor>.5)return!1;const l=this.material.uniforms;return l.uTime.value=e/1e3,l.uHover.value=this.hover,l.uVelocity.value=this.velocity,l.uPointer.value.copy(this.pointer),this.renderer.render(this.scene,this.camera),!0}dispose(){var e;(e=this.texture)==null||e.dispose(),this.geometry.dispose(),this.material.dispose(),this.renderer.dispose(),this.renderer.forceContextLoss()}}const Y=3,d=[];function J(o){var t;for(;d.length>=Y;)(t=d.shift())==null||t.evict();const e={evict:o};return d.push(e),e}function K(o){const e=d.indexOf(o);e>=0&&d.splice(e,1)}function Z(){return d.length}function re({src:o,alt:e,className:t,style:i,imgClassName:f,imgStyle:l}){const c=u.useRef(null),p=u.useRef(null),v=u.useRef(null),y=u.useRef(!1),[P,E]=u.useState(!1),[H,V]=u.useState(0),[R,L]=u.useState(!1),b=j();return u.useEffect(()=>{const s=c.current;if(!s)return;const a=new IntersectionObserver(r=>E(r[0].isIntersecting),{threshold:.12});return a.observe(s),()=>a.disconnect()},[]),u.useEffect(()=>{if(!P||!y.current&&Z()>=3)return;const s=p.current,a=c.current;if(!s||!a)return;let r,h=!1,w,T;const U=new ResizeObserver(()=>r==null?void 0:r.resize()),m=()=>{h||(h=!0,w==null||w(),T==null||T(),U.disconnect(),K(I),r==null||r.dispose(),v.current=null,L(!1))},I=J(m);try{r=new Q(s)}catch{m();return}v.current=r,y.current&&r.setHover(!0),U.observe(a),r.load(o).then(()=>{h||(r==null||r.resize(),L(!0))}).catch(m),w=q((g,O)=>{r==null||r.render(g,O)}),b&&(T=b.velocity.on("change",g=>r==null?void 0:r.setVelocity(g)));const M=g=>{g.preventDefault(),m()};return s.addEventListener("webglcontextlost",M),()=>{s.removeEventListener("webglcontextlost",M),m()}},[P,H,o,b]),S.jsxs("div",{ref:c,className:t,"data-liquid":R?"live":"dormant",style:{position:"relative",overflow:"hidden",display:"block",...i},onPointerEnter:()=>{y.current=!0,v.current?v.current.setHover(!0):V(s=>s+1)},onPointerLeave:()=>{var s;y.current=!1,(s=v.current)==null||s.setHover(!1)},onPointerMove:s=>{var r,h;const a=(r=c.current)==null?void 0:r.getBoundingClientRect();a&&((h=v.current)==null||h.setPointer((s.clientX-a.left)/a.width,1-(s.clientY-a.top)/a.height))},children:[S.jsx("img",{src:o,alt:e??"",loading:"lazy",className:f,style:{width:"100%",height:"100%",objectFit:"cover",display:"block",...l}}),S.jsx("canvas",{ref:p,"aria-hidden":"true",style:{position:"absolute",inset:0,width:"100%",height:"100%",opacity:R?1:0,transition:"opacity 320ms ease",pointerEvents:"none"}})]})}export{re as default};
