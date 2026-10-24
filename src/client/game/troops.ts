/** @requires A nonnegative garrison. @ensures Density conveys strength with bounded geometry; the numeric counter remains authoritative. */
export function troopFormation(army:number):{x:number;y:number}[]{
 const count=Math.min(12,Math.ceil(Math.max(0,army)/3));
 return Array.from({length:count},(_,i)=>{const angle=i*2.3999632297,radius=i===0?0:6*Math.sqrt(i);return {x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};});
}
