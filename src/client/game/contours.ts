import {sampleHeight,type Point,type TerrainWorld} from './world';

export const contourLevels=[20,30,40,50,60,75,100,125,150,175,200,225,250,275,300,325,350,375,400,450,500,550,600,700,800,900,1000,1200];

/** @requires Catalog terrain. @ensures Isolines use the same height field as the displayed elevations. */
export function terrainContours(world:TerrainWorld):string[]{
  const step=8,cols=128,rows=94;
  const points=Array.from({length:rows},(_,y)=>Array.from({length:cols},(_,x)=>({x:x*step,y:y*step})));
  const heights=points.map(row=>row.map(p=>sampleHeight(world,p)));
  return contourLevels.map(level=>{
    const lines:string[]=[];
    for(let y=0;y<rows-1;y++)for(let x=0;x<cols-1;x++)for(const triangle of [[[x,y],[x+1,y],[x,y+1]],[[x+1,y],[x+1,y+1],[x,y+1]]]){
      const crossings:Point[]=[];
      for(let k=0;k<3;k++){
        const [ax,ay]=triangle[k],[bx,by]=triangle[(k+1)%3],a=heights[ay][ax],b=heights[by][bx];
        if((a<level)===(b<level))continue;
        const t=(level-a)/(b-a),p=points[ay][ax],q=points[by][bx];crossings.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});
      }
      if(crossings.length===2)lines.push(`M${crossings[0].x.toFixed(1)},${crossings[0].y.toFixed(1)}L${crossings[1].x.toFixed(1)},${crossings[1].y.toFixed(1)}`);
    }
    return lines.join('');
  });
}
