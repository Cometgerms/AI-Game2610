import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const output='build/playtest', temp=await mkdtemp(join(tmpdir(),'sovereign-campaign-')), path=join(temp,'rooms.json');
await mkdir(`${output}/screens`,{recursive:true});
const base='http://127.0.0.1:5184';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5184'],{windowsHide:true,env:{...process.env,GAME_DATA_PATH:path},stdio:'ignore'});
let browser;
const log={started:new Date().toISOString(),mode:'Five browser tabs; AI-assisted opening orders and diplomacy; scripted strategic controllers thereafter',scenario:'frontier',turns:[],diplomacy:[],ai:[],errors:[],screens:[],initial:null,final:null};
const names=['Marshal / Military','Envoy / Diplomacy','Builder / Industry','Steward / Society','Scholar / Technology'];
const budgets=[{political:5,economy:4,society:0,technology:6,diplomacy:0},{political:5,economy:4,society:10,technology:4,diplomacy:20},{political:5,economy:24,society:6,technology:8,diplomacy:0},{political:10,economy:8,society:24,technology:6,diplomacy:0},{political:5,economy:4,society:10,technology:30,diplomacy:0}];
const keys=['ideology','political','military','diplomacy','economy','society','technology','notes'];
const doctrine=i=>({en:Object.fromEntries(keys.map(k=>[k,`${names[i]} strategy. Prioritize ${i===0?'deterrence and territorial expansion':i===1?'trust and mutually useful trade':i===2?'industrial capacity':i===3?'public services and stable population':'research and technological leadership'}. No unspecified military attacks.`])),zh:Object.fromEntries(keys.map(k=>[k,['重视军事威慑与领土扩张','重视信誉与互利贸易','优先工业建设','优先民生与稳定','优先科研和技术领先'][i]]))});
const standing=(i,state)=>({mobilization:{mode:i===0?'expansion':'reserve',target:[180,55,70,95,45][i],budget:i===0?30:8,region:i===0?(state.regions.find(r=>r.owner===0&&r.neighbors.some(id=>state.regions[id].owner===2))?.id??-1):-1},programs:budgets[i]});
const clause=(kind,actor,target,amount=1,resource='treasury',start=1,every=1)=>({kind,actor,target,amount,resource,start,every});
try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/config')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1540,height:1100},reducedMotion:'reduce'});context.setDefaultTimeout(20000);
  const pages=[];
  for(let i=0;i<5;i++){
    const p=await context.newPage();pages.push(p);p.on('pageerror',error=>log.errors.push({type:'browser',player:i,error:error.message}));
    await p.goto(base);await p.getByRole('textbox',{name:'Player name',exact:true}).fill(names[i]);await p.getByRole('button',{name:/Play as guest/}).click();await p.locator('.profile-identity').waitFor();
  }
  const call=async(i,path,body)=>pages[i].evaluate(async({path,body})=>{const r=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${sessionStorage.getItem('sovereign.player.v1')}`},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();return {ok:r.ok,data};},{path,body}).then(r=>{if(!r.ok)throw new Error(r.data.error);return r.data;});
  const room=await call(0,'/rooms',{name:'Ten-turn strategy laboratory',scenario:'frontier',doctrine:doctrine(0)}), code=room.code;
  for(let i=1;i<5;i++)await call(i,`/rooms/${code}/join`,{doctrine:doctrine(i)});
  await call(0,`/rooms/${code}/start`,{});
  for(const p of pages){await p.evaluate(code=>sessionStorage.setItem('sovereign.room',code),code);await p.reload();await p.locator('.sandbox').waitFor();}
  const get=i=>call(i,`/rooms/${code}`);
  const action=(i,kind,body={})=>call(i,`/rooms/${code}/${kind}`,body);
  const shot=async(i,name)=>{await pages[i].screenshot({path:`${output}/screens/${name}.png`,fullPage:true});log.screens.push(name);};
  const initial=await get(0);log.initial=initial.session.state;log.personas=names.map((name,i)=>({name,standing:standing(i,log.initial),doctrine:doctrine(i)}));
  await pages[0].locator('canvas[data-territory-colors="5"]').waitFor();await shot(0,'01-opening');
  const propose=async(from,to,clauses,duration=3,operation='propose',id=undefined,text='Structured playtest agreement')=>{
    const r=await get(from);const next=await action(from,'treaty',{turn:r.session.state.turn,operation,id,treaty:{to,kind:'compact',give:'treasury',receive:'food',amount:1,duration,clauses,text}});
    const treaty=next.session.state.treaties.at(-1);log.diplomacy.push({turn:r.session.state.turn,operation,from,to,treaty});return treaty.id;
  };
  const respond=async(i,id,operation)=>{const r=await get(i);const next=await action(i,'treaty',{turn:r.session.state.turn,id,operation});log.diplomacy.push({turn:r.session.state.turn,operation,actor:i,id,trust:next.session.state.nations[i].trust});return next;};
  // A real model negotiates a bounded contract, then its recipient counters exact quantities.
  const prompt='持续五回合。我们向翠屿联邦每回合支付 8 国库，翠屿联邦向我们每回合提供 12 粮食。若维尔统辖国进攻蔚蓝同盟，整个协议自动终止。';
  let compiled;
  try{compiled=await action(0,'interpret',{turn:1,mode:'treaty',partner:1,duration:5,language:'zh',text:prompt});log.ai.push({turn:1,nation:0,mode:'treaty',text:prompt,result:compiled});assert.deepEqual(compiled.unsupported,[]);}
  catch(e){log.errors.push({type:'AI treaty',error:String(e)});throw e;}
  let trade=await propose(0,1,compiled.clauses,compiled.duration,'propose',undefined,prompt);
  trade=await propose(1,0,compiled.clauses.map(c=>c.kind==='transfer'&&c.actor===0?{...c,amount:10}:c),5,'counter',trade,'Counteroffer: 10 funds for 12 food; same attack condition.');await respond(0,trade,'accept');
  const peace=await propose(0,2,[clause('peace',0,2)],5);await respond(2,peace,'accept');
  const aid=await propose(1,4,[clause('transfer',1,4,5,'treasury'),clause('transfer',4,1,8,'energy',2,2)],5);await respond(4,aid,'accept');
  await pages[0].getByRole('tab',{name:'Treaties',exact:true}).click();await pages[0].locator('[data-treaty-status="pending"]').first().waitFor();await shot(0,'02-negotiation');
  const openingOrders=[];
  for(let i=0;i<5;i++){
    const r=await get(i), own=r.session.state.regions.find(x=>x.owner===i), text=[`Hold sector ${own.id+1}. Invest 20 funds in research.`,`Invest 20 funds in industry.`,`Invest 20 funds in industry.`,`Enact the society decree.`,`Research production technology.`][i];
    const compiled=await action(i,'interpret',{turn:1,mode:'orders',language:'en',text});log.ai.push({turn:1,nation:i,mode:'orders',text,result:compiled});assert.deepEqual(compiled.unsupported,[]);openingOrders.push(compiled.orders);
    // Save a separate national doctrine and policy through each authenticated browser.
    await action(i,'plan',{turn:1,draftRevision:r.draftRevision,plan:{...r.session.plans[i],strategy:text,doctrine:doctrine(i),standing:standing(i,r.session.state),orders:compiled.orders}});
  }
  await pages[0].getByRole('tab',{name:'Orders',exact:true}).click();await pages[0].getByRole('combobox',{name:'Mobilization',exact:true}).selectOption('expansion');await shot(0,'03-mobilization');
  await pages[3].getByRole('button',{name:'National programs',exact:true}).click();await shot(3,'04-programs');
  // Wait for the UI edit to settle before the controller obtains its fresh revision.
  await pages[0].waitForFunction(()=>document.querySelector('.draft-status')?.textContent==='Synced');
  for(let turn=1;turn<=10;turn++){
    const before=(await get(0)).session.state;
    if(turn===4){await respond(0,peace,'break');await pages[0].getByRole('tab',{name:'Treaties',exact:true}).click();await pages[0].locator('[data-treaty-status="broken"]').waitFor();await shot(0,'05-broken-pact');}
    if(turn===6){const id=await propose(1,3,[clause('transfer',1,3,6,'treasury'),clause('transfer',3,1,10,'food'),clause('peace',1,3)],4);await respond(3,id,'accept');}
    if(turn===7){const id=await propose(2,3,[clause('transfer',2,3,100,'treasury'),clause('transfer',3,2,100,'food')],3);await respond(3,id,'reject');}
    const plans=[], requests=[];
    for(let i=0;i<5;i++){
      const r=await get(i),state=r.session.state,n=state.nations[i],own=state.regions.filter(x=>x.owner===i), orders=turn===1?openingOrders[i]:[];
      if(turn>1&&own.length){
        let funds=n.resources.treasury, research=n.resources.research;
        const techs=i===0?['military','logistics','production']:i===4?['production','military','logistics']:['production','logistics','military'];
        const tech=techs.find(k=>n.tech[k]<3 && research>=30*(n.tech[k]+1));
        if(tech && funds>=55 && (i===4||turn%3===0)){orders.push({kind:'research',field:tech});funds-=15;research-=30*(n.tech[tech]+1);}
        const edict=i===0?'military':i===1?'diplomacy':i===2?'economy':i===3?'society':'technology';
        if(funds>=60&&!n.edicts.some(e=>e.kind===edict)){orders.push({kind:'edict',field:edict});funds-=20;}
        if(i===2&&funds>=70){orders.push({kind:'invest',field:'industry',amount:20});funds-=20;}
        if(i===0){
          const front=own.filter(x=>x.neighbors.some(id=>state.regions[id].owner!==0&&state.regions[id].owner!==1));
          let energy=n.resources.energy;
          for(const region of own){
            const enemy=region.neighbors.map(id=>state.regions[id]).filter(x=>x.owner!==0&&x.owner!==1).sort((a,b)=>a.army-b.army)[0];
            if(turn>=4&&enemy&&region.army>enemy.army*1.5+3&&region.army>5&&energy>=Math.ceil((region.army-2)/10)){
              orders.push({kind:'attack',from:region.id,to:enemy.id,amount:region.army-2});energy-=Math.ceil((region.army-2)/10);continue;
            }
            const visited=new Set([region.id]),queue=[[region.id,[]]];let route=[];
            while(queue.length){const [at,steps]=queue.shift();if(at!==region.id&&front.some(x=>x.id===at)){route=steps;break;}for(const next of state.regions[at].neighbors)if(!visited.has(next)&&state.regions[next].owner===0){visited.add(next);queue.push([next,[...steps,next]]);}}
            if(!enemy&&route.length&&region.army>3&&energy>=Math.ceil((region.army-2)/10)){orders.push({kind:'move',from:region.id,to:route[0],amount:region.army-2});energy-=Math.ceil((region.army-2)/10);}else orders.push({kind:'hold',from:region.id});
          }
        }else own.filter(x=>x.neighbors.some(id=>state.regions[id].owner!==i)).forEach(x=>orders.push({kind:'hold',from:x.id}));
      }
      const plan={...r.session.plans[i],doctrine:doctrine(i),standing:standing(i,state),strategy:turn===1?r.session.plans[i].strategy:`${names[i]} continuing strategy, turn ${turn}`,orders};
      plans.push(plan);const started=performance.now();await action(i,'plan',{turn,draftRevision:r.draftRevision,plan});requests.push(performance.now()-started);
    }
    for(let i=0;i<5;i++){
      await pages[i].getByRole('tab',{name:'Orders',exact:true}).click();
      await pages[i].getByRole('button',{name:'Reload saved draft',exact:true}).click();
      await pages[i].waitForFunction(()=>document.querySelector('.sandbox')?.getAttribute('aria-busy')!=='true');
      await pages[i].waitForFunction(count=>document.querySelector('.queued-orders h3 span')?.textContent===String(count),plans[i].orders.length);
      await pages[i].getByRole('button',{name:/Confirm country orders|Reconfirm orders/}).click();
      try{await pages[i].locator('.submission-card').waitFor();if(await pages[i].getByRole('button',{name:/^Keep exploring/}).isVisible())await pages[i].getByRole('button',{name:/^Keep exploring/}).click();}catch(e){log.errors.push({type:'confirmation',turn,nation:i,message:await pages[i].locator('.sandbox-message').innerText().catch(()=>String(e))});throw e;}
    }
    await pages[0].waitForFunction(()=>document.querySelector('.sandbox-status')?.textContent.includes('5 / 5'));
    const started=performance.now();await pages[0].getByRole('button',{name:'Resolve turn',exact:false}).click();
    await Promise.all(pages.map(async p=>{await p.waitForFunction(next=>document.querySelector('.sandbox-heading h1')?.textContent.includes(`TURN ${String(next).padStart(2,'0')}`),turn+1);await p.locator('.turn-review-modal').waitFor();await p.getByRole('heading',{name:'After-action report.'}).waitFor();}));
    for(const p of pages)await p.getByRole('button',{name:'Ready for next turn',exact:true}).click();
    await Promise.all(pages.map(p=>p.locator('.turn-review-modal').waitFor({state:'hidden'})));
    const after=(await get(0)).session.state, elapsed=performance.now()-started;
    assert.equal(after.turn,turn+1);for(let i=0;i<5;i++){const n=after.nations[i];assert.ok(Object.values(n.resources).every(x=>Number.isInteger(x)&&x>=0));assert.equal(n.resources.army,after.regions.filter(r=>r.owner===i).reduce((s,r)=>s+r.army,0));}
    log.turns.push({turn,before,plans,after,settlementUiMs:elapsed,planRequestMs:requests});
    console.log(JSON.stringify({turn,army:after.nations.map(n=>n.resources.army),scores:after.nations.map(n=>Object.values(n.score).reduce((a,b)=>a+b,0)),treaties:after.treaties.map(t=>t.status),ms:Math.round(elapsed)}));
    if([1,4,7,10].includes(turn))await shot(0,`turn-${turn}-report`);
    if(turn===5){await pages[2].reload();await pages[2].locator('.sandbox').waitFor();assert.equal((await get(2)).session.state.turn,6);}
    await writeFile(`${output}/campaign.json`,JSON.stringify(log,null,2));
  }
  await pages[0].getByRole('tab',{name:'Goals',exact:true}).click();await pages[0].getByRole('button',{name:'End match & score',exact:true}).click();
  await pages[0].waitForFunction(()=>document.querySelector('.sandbox-heading h1')?.textContent.includes('FINAL STANDINGS'));
  log.final=(await get(0)).session;await shot(0,'06-final-standings');
  await pages[0].getByRole('button',{name:'Switch to Chinese'}).click();await pages[0].setViewportSize({width:390,height:844});assert.ok(await pages[0].evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(0,'07-mobile-final');
  await writeFile(`${output}/ai-usage.jsonl`,await readFile(path+'.ai.jsonl','utf8'));
  log.finished=new Date().toISOString();await writeFile(`${output}/campaign.json`,JSON.stringify(log,null,2));console.log('PASS: completed ten-turn five-tab campaign with real AI, saved raw public state, plans, treaties, measurements and screenshots.');
}catch(e){log.errors.push({type:'fatal',error:String(e)});await writeFile(`${output}/campaign.json`,JSON.stringify(log,null,2));await writeFile(`${output}/ai-usage.jsonl`,await readFile(path+'.ai.jsonl','utf8').catch(()=>''));throw e;}
finally{await browser?.close();const exited=new Promise(r=>server.once('exit',r));server.kill();await exited;await rm(temp,{recursive:true,force:true});}
