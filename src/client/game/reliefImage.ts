import {sampleHeight,regionAt,type TerrainWorld} from './world';
const cache=new Map<number,string>();
/** Simplex gradients avoid the visible square grid of value noise in shaded relief. */
function noise(x:number,y:number,seed:number):number{
 const skew=(x+y)*.366025403784,i=Math.floor(x+skew),j=Math.floor(y+skew),unskew=(i+j)*.211324865405;
 const x0=x-i+unskew,y0=y-j+unskew,ix=x0>y0?1:0,iy=1-ix;
 const contribution=(a:number,b:number,dx:number,dy:number)=>{
  const t=.5-dx*dx-dy*dy;if(t<=0)return 0;
  let n=Math.imul(a,374761393)^Math.imul(b,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);const g=(n^(n>>>16))&7;
  const dot=g<4?((g&1)?-dx:dx)+((g&2)?-dy:dy):g===4?dx:g===5?-dx:g===6?dy:-dy;
  return t*t*t*t*dot;
 };
 return .5+35*(contribution(i,j,x0,y0)+contribution(i+ix,j+iy,x0-ix+.211324865405,y0-iy+.211324865405)+contribution(i+1,j+1,x0-.57735026919,y0-.57735026919));
}
/** @requires Catalog geography. @ensures Coasts and major heights remain aligned; fine ridges are visual texture only. */
export function reliefImage(world:TerrainWorld):string{
 if(typeof document==='undefined')return '';const saved=cache.get(world.seed);if(saved)return saved;
 const w=1002,h=723,cw=168,ch=122,base=new Float32Array(cw*ch),distance=new Float32Array(cw*ch);
 for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){const i=y*cw+x,p={x:x*6,y:y*6},r=regionAt(world,p);base[i]=r?sampleHeight(world,p,r):0;distance[i]=r?0:10000;}
 // Distance to the coastline gives the ocean a shallow shelf, without extra contour clutter.
 for(let y=1;y<ch;y++)for(let x=1;x<cw;x++){const i=y*cw+x;distance[i]=Math.min(distance[i],distance[i-1]+1,distance[i-cw]+1,distance[i-cw-1]+1.414);}
 for(let y=ch-2;y>=0;y--)for(let x=cw-2;x>=0;x--){const i=y*cw+x;distance[i]=Math.min(distance[i],distance[i+1]+1,distance[i+cw]+1,distance[i+cw+1]+1.414);}
 const sample=(a:Float32Array,x:number,y:number)=>{const gx=x/6,gy=y/6,ix=Math.floor(gx),iy=Math.floor(gy),u=gx-ix,v=gy-iy,i=iy*cw+ix;return (a[i]*(1-u)+a[i+1]*u)*(1-v)+(a[i+cw]*(1-u)+a[i+cw+1]*u)*v;};
 const heights=new Float32Array(w*h),seed=world.seed;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const elevation=sample(base,x,y),warpX=noise(x/85,y/85,seed)*25,warpY=noise(x/85,y/85,seed+8)*25;
  let ridge=0,amplitude=1,scale=38,weight=1;
  for(let octave=0;octave<5;octave++){const n=1-Math.abs(noise((x+warpX)/scale,(y+warpY)/scale,seed+octave*71)*2-1);ridge+=n*n*amplitude*weight;weight=Math.min(1,n*1.8);amplitude*=.48;scale*=.47;}
  const mountain=Math.min(1,elevation/450),coast=Math.min(1,elevation/35);
  heights[y*w+x]=elevation*.065+ridge*(1.8+mountain*24)*coast;
 }
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const context=canvas.getContext('2d');if(!context)return '';
 context.fillStyle='#fff';for(const r of world.regions){context.beginPath();r.polygon.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));context.closePath();context.fill();}
 const silhouette=context.getImageData(0,0,w,h).data;
 const pixels=context.createImageData(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,elevation=sample(base,x,y),shore=sample(distance,x,y)*6,grain=noise(x*1.7,y*1.7,seed+100)-.5;
  let red:number,green:number,blue:number;
  if(silhouette[i*4+3]<128){
   const shelf=Math.exp(-shore/20),seaNoise=noise(x/15,y/15,seed)*2;
   red=5+shelf*13+seaNoise;green=17+shelf*36+seaNoise;blue=27+shelf*37+seaNoise;
  }else{
   const dx=(heights[y*w+Math.min(w-1,x+1)]-heights[y*w+Math.max(0,x-1)])*.8,dy=(heights[Math.min(h-1,y+1)*w+x]-heights[Math.max(0,y-1)*w+x])*.8;
   const light=(-dx*.58-dy*.64+1)/Math.sqrt(dx*dx+dy*dy+1);
   // Surface colours are illustrative materials, not additional gameplay biomes.
   const dry=Math.max(0,Math.min(1,(noise(x/130,y/130,seed+211)-.35)*2.2));
   const rock=Math.max(0,Math.min(1,(elevation-160)/310));
   const summit=Math.max(0,Math.min(1,(elevation-430)/210));
   const shoreSand=Math.max(0,1-elevation/16)*.65;
   const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
   const shade=.28+Math.max(0,light)*.82,canopy=(noise(x/2.4,y/2.4,seed+83)-.5)*(1-rock)*12;
   red=mix(mix(mix(mix(36,84,dry),100,rock),155,summit),112,shoreSand)*shade+grain*7+canopy;
   green=mix(mix(mix(mix(64,75,dry),104,rock),161,summit),103,shoreSand)*shade+grain*7+canopy;
   blue=mix(mix(mix(mix(49,49,dry),99,rock),156,summit),75,shoreSand)*shade+grain*7+canopy;
  }
  pixels.data[i*4]=red;pixels.data[i*4+1]=green;pixels.data[i*4+2]=blue;pixels.data[i*4+3]=255;
 }
 context.putImageData(pixels,0,0);const url=canvas.toDataURL('image/png');cache.set(world.seed,url);return url;
}
