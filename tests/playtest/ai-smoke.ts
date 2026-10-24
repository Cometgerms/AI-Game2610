import { loadEnv } from 'vite';
import { mkdir,writeFile } from 'node:fs/promises';
import { Interpreter } from '../../src/server/ai';
import { createSession } from '../../src/client/game/sandbox';
import { createDoctrine } from '../../src/client/game/doctrine';
import { scenarios } from '../../src/client/game/scenarios';
import type { RoomView } from '../../src/client/game/network';
const env=loadEnv('development',process.cwd(),'');
const ai=new Interpreter({key:env.OPENAI_API_KEY,model:env.MODEL_NAME,projectBudget:2,roomBudget:1,logPath:'build/playtest/ai-smoke.jsonl'});
const room={code:'SMOKETST',nation:0,scenario:scenarios[0].id,draftRevision:0,session:createSession(scenarios[0],createDoctrine())} as RoomView;
await mkdir('build/playtest',{recursive:true});
const results=[];
for(const [mode,text] of [['treaty','持续三回合。我每回合给翠屿联邦 10 国库，对方每回合给我 20 粮食。如果翠屿联邦进攻蔚蓝同盟，整个协议终止。'],['orders','在地区1固守，并用20国库投资工业。']] as const){
  const start=Date.now();try{ const result=await ai.interpret(room,text,mode,1,3,'zh');results.push({mode,text,result});console.log(JSON.stringify({mode,usage:result.usage,unsupported:result.unsupported})); }catch(e){results.push({mode,error:String(e),ms:Date.now()-start});console.log(JSON.stringify(results.at(-1)));}
}
await writeFile('build/playtest/ai-smoke-results.json',JSON.stringify(results,null,2));
