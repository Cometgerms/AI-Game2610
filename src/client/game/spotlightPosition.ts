export type Rect={x:number;y:number;w:number;h:number};
/** @requires Viewport-clipped target bounds. @ensures The guide sits beside its target when space permits, otherwise at the nearest viewport edge. */
export function spotlightPosition(r:Rect,width:number,height:number,vw:number,vh:number){
 const gap=14,edge=16,clamp=(n:number,max:number)=>Math.max(edge,Math.min(max-edge,n));
 const middle=clamp(r.y+(r.h-height)/2,vh-height);
 const candidates=[{left:r.x+r.w+gap,top:middle},{left:r.x-width-gap,top:middle},{left:clamp(r.x+(r.w-width)/2,vw-width),top:r.y+r.h+gap},{left:clamp(r.x+(r.w-width)/2,vw-width),top:r.y-height-gap}];
 const fits=candidates.find(p=>p.left>=edge&&p.top>=edge&&p.left+width<=vw-edge&&p.top+height<=vh-edge);
 return fits??{left:clamp(r.x+(r.w-width)/2,vw-width),top:Math.max(edge,vh-height-edge)};
}
