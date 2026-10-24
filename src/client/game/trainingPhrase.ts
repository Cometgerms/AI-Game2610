import {reinforceCapital} from './reinforcement';
import type {PracticeView} from '../../server/practice';
import type {PracticeInput} from './practice';
/** @requires A trusted training view. @ensures Only complete recognised clauses become a draft; ambiguous language is not partially executed. */
export function trainingPhrase(text:string,view:PracticeView,selected:number,target:number,base:PracticeInput):PracticeInput|null {
 const draft=structuredClone(base);draft.orders=[];
 const number='(\\d+(?:\\.\\d+)?(?:万|亿|k|m)?)';
 const value=(s:string)=>parseFloat(s)*(/万$/.test(s)?1e4:/亿$/.test(s)?1e8:/k$/i.test(s)?1e3:/m$/i.test(s)?1e6:1);
 const clauses=text.trim().split(/[;；。\n]+|(?<!\d)[,，]|[,，](?!\d)/).map(s=>s.trim().replace(/\.$/,'')).filter(Boolean);
 if(!clauses.length)return null;
 for(const clause of clauses){
  let m:RegExpMatchArray|null;
  if(/^(?:请)?(?:加强|增援|强化|巩固)(?:首都|首都防御)$/.test(clause)||/^(?:please )?(?:reinforce|strengthen|bolster) (?:the )?capital(?: defenses)?$/i.test(clause)){const moves=reinforceCapital(view.session.state,view.nation,view.defend);if(!moves.length)return null;draft.orders.push(...moves);}
  else if(/^(?:后方部队)?(?:全力调动|全部调动|全力增援首都|全部增援首都)$/.test(clause)||/^(?:move|send) all(?: rear troops)?(?: to (?:the )?capital)?$/i.test(clause)){
   const from=/后方|rear/i.test(clause)?view.reinforceFrom:selected,to=/首都|capital/i.test(clause)?view.defend:target;
   draft.orders.push({kind:'move',from,to,amount:view.session.state.regions[from]?.army??0});
  }else if(m=clause.match(new RegExp(`^(?:调动|派遣)${number}(?:人|兵力)?(?:到|增援)首都$`))||clause.match(new RegExp(`^move ${number}(?: troops)? to (?:the )?capital$`,'i'))){draft.orders.push({kind:'move',from:selected,to:view.defend,amount:value(m[1])});}
  else if(m=clause.match(new RegExp(`^(?:工业投资|投资工业|投资)\\s*${number}(?:\\s*(?:国库|发展工业|到工业))?$`))||clause.match(new RegExp(`^invest ${number}(?: funds)? (?:in )?industry$`,'i'))){draft.orders.push({kind:'invest',field:'industry',amount:value(m[1])});}
  else if(/^(?:研究生产(?:科技)?|research production)$/i.test(clause))draft.orders.push({kind:'research',field:'production'});
  else if(/^(?:固守首都|保卫首都|hold (?:the )?capital)$/i.test(clause))draft.orders.push({kind:'hold',from:view.defend});
  else if(m=clause.match(new RegExp(`^自动补员(?:目标|至)${number}(?:人)?(?:预算|每回合)${number}$`))||clause.match(new RegExp(`^auto recruit to ${number} budget ${number}$`,'i'))){draft.standing.mobilization={mode:'reserve',region:view.defend,target:value(m[1]),budget:value(m[2])};}
  else if(m=clause.match(new RegExp(`^派${number}(?:艘)?(?:舰船)?巡逻(?:近海)?$`))||clause.match(new RegExp(`^patrol ${number}(?: ships)?$`,'i'))){const to=view.session.state.ocean!.find(z=>z.ports.some(id=>view.session.state.regions[id].owner===view.nation))!.id;draft.orders.push({kind:'patrol',from:-1,to,amount:value(m[1])});}
  else if(m=clause.match(new RegExp(`^每回合用${number}国库换${number}粮食$`))||clause.match(new RegExp(`^trade ${number} funds for ${number} food per turn$`,'i'))){if(view.stage!==1)return null;draft.tradeOffer={give:value(m[1]),receive:value(m[2])};}
  else return null;
 }
 return draft;
}
