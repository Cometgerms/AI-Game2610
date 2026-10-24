import type {Order,Standing} from './sandbox';
export type PracticeInput={orders:Order[];standing:Standing;tradeOffer?:{give:number;receive:number}};
export type MapMovement={nation:number;kind:'move'|'attack'|'retreat'|'patrol'|'recall';from:number;to:number;amount:number};
/** @requires A validated draft. @ensures Guidance checks objectives without inventing player orders. */
export function practiceRequirements(stage:number,input:PracticeInput,defend:number,army:number){
  if(stage===0)return [input.orders.some(o=>o.kind==='move'&&o.to===defend&&(o.amount??0)>0),input.orders.some(o=>o.kind==='invest'&&o.field==='industry'&&(o.amount??0)>=20),input.orders.some(o=>o.kind==='research'&&o.field==='production')];
  if(stage===1)return [input.standing.mobilization.mode!=='off'&&input.standing.mobilization.target>army&&input.standing.mobilization.budget>=2,input.orders.some(o=>o.kind==='patrol'&&(o.amount??0)>0),!!input.tradeOffer];
  return [input.orders.some(o=>o.kind==='hold'&&o.from===defend)];
}
