import {forecastCase} from './forecast';
import type {PlanForecast} from '../client/game/forecast';
import {createSession,defaultStanding,type Session,type GameState} from '../client/game/sandbox';
import {createDoctrine} from '../client/game/doctrine';
import {scenarios} from '../client/game/scenarios';
import {nativeSimulation} from './native';
import {practiceRequirements,type MapMovement} from '../client/game/practice';
import {PracticeCommandError,checkPracticePlan,mergePracticeOrders,type CheckedPractice} from '../client/game/practiceLimits';
import {trainingPhrase} from '../client/game/trainingPhrase';
import type {Interpreter} from './ai';
import type {Order} from '../client/game/sandbox';
import {HttpError} from './rooms';

export type PracticeView={stage:number;session:Session;nation:number;defend:number;reinforceFrom:number;threatFrom:number;contested:number;playback:{before:GameState;movements:MapMovement[]}|null;objectives:{reinforcement:boolean;industry:boolean;technology:boolean;recruits:boolean;agreement:boolean;sea:boolean;defense:boolean};won:boolean;adjustments?:CheckedPractice['adjustments']};
type Entry={view:PracticeView;expires:number;busy:boolean};
/** @requires Authenticated player IDs. @ensures Training never reads or mutates a multiplayer room or accepts client-owned world state. */
export class PracticeStore {
  private sessions=new Map<string,Entry>();
  start(id:string):PracticeView {
    for(const [key,e] of this.sessions)if(e.expires<Date.now()&&!e.busy)this.sessions.delete(key);
    if(this.sessions.get(id)?.busy)throw new HttpError(409,'Training settlement is still running.');
    if(this.sessions.size>=100&&!this.sessions.has(id))throw new HttpError(429,'Training capacity reached. Please retry later.');
    const session=createSession(scenarios[0],createDoctrine()),nation=3;
    session.state.nations[nation].resources.treasury=260;session.state.nations[nation].resources.research=100;
    session.plans.forEach((p,i)=>{p.standing=defaultStanding(session.state.nations[i].resources.army);p.standing.mobilization.mode='off';});
    const defend=session.state.regions.find(r=>r.owner===nation&&r.neighbors.some(n=>session.state.regions[n].owner===0))!.id;
    const reinforceFrom=session.state.regions[defend].neighbors.find(id=>session.state.regions[id].owner===nation)!;
    const threatFrom=session.state.regions[defend].neighbors.find(id=>session.state.regions[id].owner===0)!;
    const contested=session.state.regions.find(r=>r.owner===4&&r.neighbors.some(id=>session.state.regions[id].owner===2))!.id;
    session.state.regions[contested].army=2;
    session.state.nations[4].resources.army=session.state.regions.filter(r=>r.owner===4).reduce((sum,r)=>sum+r.army,0);
    const view:PracticeView={stage:0,session,nation,defend,reinforceFrom,threatFrom,contested,playback:null,objectives:{reinforcement:false,industry:false,technology:false,recruits:false,agreement:false,sea:false,defense:false},won:false};
    this.sessions.set(id,{view,expires:Date.now()+3600000,busy:false});return structuredClone(view);
  }
  async interpret(id:string,stage:unknown,text:unknown,selected:unknown,target:unknown,input:unknown,language:string,ai:Interpreter){
    const e=this.sessions.get(id);
    if(!e||e.expires<Date.now())throw new HttpError(404,'Training expired. Start a fresh practice mission.');
    if(e.busy||stage!==e.view.stage||e.view.session.ended)throw new HttpError(409,'The training turn changed. Interpret again.');
    if(typeof text!=='string'||!text.trim()||text.length>4000)throw new HttpError(400,'Enter 1–4000 characters. / 请输入 1–4000 字。');
    const v=structuredClone(e.view),state=v.session.state;
    selected ??= v.reinforceFrom;target ??= v.defend;
    for(const id of [selected,target])if(!Number.isInteger(id)||!state.regions[id as number])throw new HttpError(400,'Select a valid source and destination. / 请选择有效的出发地和目的地。');
    const checkDraft=(draft:unknown)=>{
      try {return checkPracticePlan(draft,state,v.nation,v.stage);}
      catch(error){if(error instanceof PracticeCommandError)throw new HttpError(400,error.message,'practice-command');throw error;}
    };
    const base=checkDraft(input).plan;
    let draft=trainingPhrase(text,v,selected as number,target as number,base),source='local';
    let explanation='',adjustments:CheckedPractice['adjustments']=[];
    if(!draft){
      if(!ai.enabled)throw new HttpError(400,'Please clarify your command or edit the example. Free-form AI is not configured. / 请补充明确指令或修改示例；自由语言 AI 尚未配置。','practice-command');
      source='ai';
      const room={code:`training-${id}`,nation:v.nation,scenario:state.scenario,draftRevision:v.stage,session:v.session};
      const context=`Optional source context (not mandatory): sector #${Number(selected)+1}; selected destination: sector #${Number(target)+1}; own capital #${v.defend+1}; rear unit #${v.reinforceFrom+1}. All means every opening troop at the source. Preserve oversized requested quantities: the game clips them and displays adjustments. When the player gives a clear defensive goal such as strengthen the capital, infer legal adjacent friendly sources and modest amounts, preserve rear garrisons and explain the choices. Explicit destinations and quantities always override your suggestions. Never invent an attack. Training supports move, hold, invest, research and reserve patrol only; other requests must be unsupported. Player request: ${text}`;
      const result=await ai.interpret(room,context,'orders',1,1,language,orders=>{
        const checked=checkDraft({...base,orders:mergePracticeOrders(base.orders,orders as Order[])});
        adjustments=checked.adjustments;return checked.plan.orders;
      });
      if(result.unsupported.length)throw new HttpError(400,result.unsupported.join(' '),'practice-command');
      explanation=result.explanation;draft={...base,orders:result.orders as Order[]};
    }else {
      explanation=language==='zh'?'根据明确的目标拟定方案；未指定数量的首都增援优先选择邻接后方部队，每处至少保留一半驻军。具体来源和人数见下方，可在执行前修改。':'Plan derived from your stated goal. Unspecified capital reinforcements prefer adjacent rear units and retain at least half of each garrison. Review the sources and amounts below before executing.';
      draft.orders=mergePracticeOrders(base.orders,draft.orders);
    }
    const checked=checkDraft(draft);adjustments.push(...checked.adjustments);
    await nativeSimulation(state,v.session.plans.map((p,i)=>({...p,orders:[],...(i===v.nation?checked.plan:{})})),'validate');
    if(e.busy||e.view.stage!==v.stage||this.sessions.get(id)!==e)throw new HttpError(409,'The training turn changed. Interpret again.');
    const forecast=await this.forecast(id,stage,checked.plan);
    return {...checked,adjustments,source,explanation,stage:v.stage,forecast};
  }
  async forecast(id:string,stage:unknown,input:unknown):Promise<PlanForecast>{
    const next=await this.run(id,stage,input,true);
    return {scenario:next.session.state.scenario,turn:next.session.state.report!.turn,nation:next.nation,cases:[forecastCase(next.playback!.before,next.session.state,next.nation,'scripted',[])]};
  }
  async advance(id:string,stage:unknown,input:unknown):Promise<PracticeView> {return this.run(id,stage,input,false);}
  private async run(id:string,stage:unknown,input:unknown,preview:boolean):Promise<PracticeView> {
    const e=this.sessions.get(id);if(!e||e.expires<Date.now())throw new HttpError(404,'Training expired. Start a fresh practice mission.');
    if(e.busy||stage!==e.view.stage||e.view.session.ended)throw new HttpError(409,'Training has already advanced. Retry from the current step.');
    e.busy=true;
    try {
      const view=structuredClone(e.view),s=view.session,n=view.nation,plan=s.plans[n];s.plans.forEach(p=>{p.orders=[];p.submitted=true;});
      if(!input||typeof input!=='object')throw new HttpError(400,'Choose actual orders before confirming the turn.');
      let checked:CheckedPractice;
      try {checked=checkPracticePlan(input,s.state,n,view.stage);}catch(error){throw new HttpError(400,(error as Error).message);}
      const draft=checked.plan;view.adjustments=checked.adjustments;
      if(!preview&&!practiceRequirements(view.stage,draft,view.defend,s.state.nations[n].resources.army).every(Boolean))throw new HttpError(400,'Complete this turn’s objectives before confirming.');
      plan.orders=structuredClone(draft.orders);plan.standing=structuredClone(draft.standing);
      if(stage===1&&draft.tradeOffer){
        const offer=draft.tradeOffer;
        if(!Number.isInteger(offer.give)||!Number.isInteger(offer.receive)||offer.give<4||offer.give>15||offer.receive<1||offer.receive>offer.give*2)throw new HttpError(400,'Verdant Isles asks for 4–15 funds and offers at most 2 food per fund. Adjust your offer.');
        s.state.treaties.push({id:1,from:n,to:1,kind:'compact',give:'treasury',receive:'food',amount:1,duration:3,remaining:3,signatures:[n,1],status:'pending',text:`Training trade: ${offer.give} funds for ${offer.receive} food; ends if partner attacks nation 2.`,clauses:[{kind:'transfer',actor:n,target:1,resource:'treasury',amount:offer.give,start:1,every:1},{kind:'transfer',actor:1,target:n,resource:'food',amount:offer.receive,start:1,every:1},{kind:'cancel_on_attack',actor:1,target:2,resource:'treasury',amount:1,start:1,every:1}]});
      }
      // Neighbours issue legal orders against the same opening world as the learner.
      if(stage===0){
        const rear=s.state.regions[view.threatFrom].neighbors.find(id=>s.state.regions[id].owner===0)!;
        s.plans[0].orders=[{kind:'move',from:rear,to:view.threatFrom,amount:3}];
        const from=s.state.regions[view.contested].neighbors.find(id=>s.state.regions[id].owner===2)!;
        s.plans[2].orders=[{kind:'attack',from,to:view.contested,amount:6}];
        const coast=s.state.ocean!.find(z=>z.ports.some(id=>s.state.regions[id].owner===1))!;
        s.plans[1].orders=[{kind:'patrol',from:-1,to:coast.id,amount:3}];
        s.plans[4].orders=[{kind:'research',field:'production'}];
      }else if(stage===1){
        s.plans[0].orders=[{kind:'recruit',from:view.threatFrom,amount:3},{kind:'research',field:'military'}];
        s.plans[2].orders=[{kind:'invest',field:'industry',amount:20}];
        s.plans[4].orders=[{kind:'invest',field:'research',amount:20}];
      }else{
        s.plans[0].orders=[{kind:'attack',from:view.threatFrom,to:view.defend,amount:Math.min(12,s.state.regions[view.threatFrom].army)}];
        s.plans[2].orders=[{kind:'research',field:'production'}];
      }
      const before=structuredClone(s.state);s.state=await nativeSimulation(s.state,s.plans,'resolve');view.playback={before,movements:s.plans.flatMap((p,nation)=>p.orders.filter(o=>['move','attack','retreat','patrol','recall'].includes(o.kind)).map(o=>({nation,kind:o.kind as MapMovement['kind'],from:o.from!,to:o.to??-1,amount:o.amount!})))};s.history.push(before);s.plans.forEach(p=>{p.orders=[];p.submitted=false;});
      const report=s.state.report!,country=s.state.nations[n];
      view.objectives.reinforcement ||= view.playback.movements.some(m=>m.nation===n&&m.kind==='move'&&m.to===view.defend);
      view.objectives.industry ||= country.resources.industry>=scenarios[0].nations[n].resources.industry+5;
      view.objectives.technology ||= country.tech.production>=1;
      view.objectives.recruits ||= report.events.some(e=>e.nation===n&&e.code==='auto-recruit'&&(e.amount??0)>0);
      view.objectives.agreement ||= report.events.some(e=>e.nation===n&&e.code==='treaty-payment');
      view.objectives.sea ||= s.state.ocean!.some(z=>z.owner===n);
      view.objectives.defense ||= stage===2&&s.state.regions[view.defend].owner===n&&report.battles.some(b=>b.region===view.defend&&b.winner===n);
      view.stage++;view.won=view.stage===3&&Object.values(view.objectives).every(Boolean);s.ended=view.stage===3;
      if(!preview){e.view=view;e.expires=Date.now()+3600000;}return structuredClone(view);
    } finally {e.busy=false;}
  }
}
