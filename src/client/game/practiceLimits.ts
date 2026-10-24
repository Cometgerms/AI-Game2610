import type {GameState,Order,Standing} from './sandbox';
import {isStanding,programs,tracks} from './sandbox';
import {researchCost,researchFunds} from './balance';
import type {PracticeInput} from './practice';
export class PracticeCommandError extends Error {}
export type LimitChange={field:string;requested:number;actual:number};
export type CheckedPractice={plan:PracticeInput;adjustments:LimitChange[]};
/** @requires Server-owned opening state. @ensures All entry paths share integer/resource limits without accepting malformed or foreign commands. */
export function checkPracticePlan(input:unknown,state:GameState,nation:number,stage:number):CheckedPractice {
 const fail=(message:string):never=>{throw new PracticeCommandError(message);};
 if(!input||typeof input!=='object')return fail('Choose actual orders before confirming the turn. / 请先拟定指令。');
 const plan=structuredClone(input) as PracticeInput,adjustments:LimitChange[]=[];
 const clip=(value:unknown,max:number,field:string,min=0)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<min)return fail(`${field}: enter a finite number ≥ ${min}. / 请输入有效数字。`);
  const actual=Math.min(Math.floor(value),Math.max(0,Math.floor(max)));
  if(actual<min)return fail(`${field}: no available resources or troops. / 没有足够资源或兵力。`);
  if(actual!==value)adjustments.push({field,requested:value,actual});return actual;
 };
 if(!Array.isArray(plan.orders)||plan.orders.length>20)return fail('Orders: maximum 20 commands. / 指令最多 20 条。');
 const standing=plan.standing as Standing;
 if(!standing?.mobilization||!standing.programs)return fail('Standing policy is missing. / 缺少补员政策。');
 standing.mobilization.target=clip(standing.mobilization.target,10000,'Army target / 军力目标');
 standing.mobilization.budget=clip(standing.mobilization.budget,200,'Recruitment budget / 补员预算');
 for(const key of programs)standing.programs[key]=clip(standing.programs[key],30,`Program ${key}`);
 if(!isStanding(standing))return fail('Invalid recruitment mode or destination. / 补员模式或目的地无效。');
 const country=state.nations[nation];
 let funds=country.resources.treasury,energy=country.resources.energy,research=country.resources.research;
 const seen=new Set<string>();
 const own=(id:unknown)=>{if(!Number.isInteger(id)||!state.regions[id as number]||state.regions[id as number].owner!==nation)return fail(`Source #${Number(id)+1}: select your own region. / 请选择本国地区。`);return state.regions[id as number];};
 // Reserve fixed research costs before variable spending, including the first training objective.
 const researchOrders=plan.orders.filter(o=>o?.kind==='research');
 const reserved=Math.max(stage===0?researchFunds:0,researchOrders.length*researchFunds);funds-=reserved;
 if(funds<0)return fail('Not enough funds for research. / 科研所需国库不足。');
 for(const [i,o] of plan.orders.entries()){
  if(!o||typeof o!=='object')return fail(`Order ${i+1}: malformed command. / 指令格式无效。`);
  const field=`Order ${i+1} ${o.kind} / 指令 ${i+1}`;
  const key=['move','hold'].includes(o.kind)?`army:${o.from}`:`${o.kind}:${o.field??o.from??''}`;
  if(seen.has(key))return fail(`${field}: duplicate command for this source or field. / 同一来源或领域存在重复指令。`);seen.add(key);
  if(o.kind==='move'){
   const source=own(o.from);own(o.to);
   if(!source.neighbors.includes(o.to!))return fail(`${field}: choose an adjacent friendly destination. / 请选择相邻的本国目的地。`);
   o.amount=clip(o.amount,Math.min(source.army,energy*10),field,1);energy-=Math.ceil(o.amount/10);
  }else if(o.kind==='hold'){own(o.from);}
  else if(o.kind==='invest'){
   if(!['industry','food','energy','research'].includes(o.field??''))return fail(`${field}: unknown investment field.`);
   o.amount=clip(o.amount,Math.min(10000,funds),field,1);funds-=o.amount;
  }else if(o.kind==='research'){
   if(!tracks.includes(o.field as typeof tracks[number]))return fail(`${field}: unknown research field.`);
   const level=country.tech[o.field as typeof tracks[number]],cost=researchCost(level);
   if(level>=3||research<cost)return fail(`${field}: research unavailable or insufficient research points. / 科研点不足或已满级。`);research-=cost;
  }else if(o.kind==='patrol'){
   const zone=state.ocean?.find(z=>z.id===o.to);
   if(o.from!==-1||!zone?.ports.some(id=>state.regions[id].owner===nation))return fail(`${field}: choose a sea with an owned port. / 请选择有本国港口的海域。`);
   o.amount=clip(o.amount,Math.min(country.navalReserve??0,energy*4),field,1);energy-=Math.ceil(o.amount/4);
  }else return fail(`${field}: not available in training. / 此指令尚未在练习中开放。`);
 }
 // Never rewrite negotiated prices: an offer outside the scripted market needs explicit revision.
 if(plan.tradeOffer){const offer=plan.tradeOffer;if(!Number.isInteger(offer.give)||!Number.isInteger(offer.receive)||offer.give<4||offer.give>15||offer.receive<1||offer.receive>offer.give*2)return fail('Verdant Isles asks for 4–15 funds and offers at most 2 food per fund. / 报价应为 4–15 国库，每国库最多换 2 粮食。');}
 return {plan,adjustments};
}
export function mergePracticeOrders(list:Order[],orders:Order[]):Order[]{
 return orders.reduce((queue,order)=>[...queue.filter(o=>['move','hold'].includes(order.kind)?!(['move','hold'].includes(o.kind)&&o.from===order.from):!(o.kind===order.kind&&o.field===order.field&&o.from===order.from)),order],list);
}
