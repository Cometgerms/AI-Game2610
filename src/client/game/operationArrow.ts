import type {Point} from './world';
/** @requires Finite map positions. @ensures A tapered operational arrow avoids unit counters and its replay follows the same curve. */
export function operationArrow(a:Point,b:Point){
 const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
 if(length<1)return {path:'',point:()=>a};
 const bend=Math.min(24,length*.12),control={x:(a.x+b.x)/2-dy/length*bend,y:(a.y+b.y)/2+dx/length*bend};
 const point=(t:number)=>({x:(1-t)**2*a.x+2*(1-t)*t*control.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*control.y+t*t*b.y});
 const side=(t:number,w:number)=>{const p=point(t),tx=2*((1-t)*(control.x-a.x)+t*(b.x-control.x)),ty=2*((1-t)*(control.y-a.y)+t*(b.y-control.y)),n=Math.hypot(tx,ty);return {x:p.x-ty/n*w,y:p.y+tx/n*w};};
 const gap=Math.min(34,length*.22)/length,start=gap,end=1-gap,span=length*(end-start),head=Math.min(18,span*.3),neck=end-head/length,width=Math.min(5,span*.065),wing=width*2.4;
 const left:Point[]=[],right:Point[]=[];
 for(let i=0;i<=14;i++){const f=i/14,t=start+(neck-start)*f,w=width*(.28+.72*f);left.push(side(t,w));right.push(side(t,-w));}
 const points=[...left,side(neck,wing),point(end),side(neck,-wing),...right.reverse()];
 return {point,path:points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')+'Z'};
}
