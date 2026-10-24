import type {GameState} from '../client/game/sandbox';

/** @requires An authoritative settled report. @ensures Only actual combatants must acknowledge a battle review. */
export function battleReadiness(state:GameState,previous?:boolean[]):boolean[]|null{
  const participants=new Set(state.report?.battles.flatMap(b=>b.forces.map(f=>f.nation))??[]);
  const ready=state.nations.map((_,i)=>!participants.has(i)||previous?.[i]===true);
  return ready.every(Boolean)?null:ready;
}

/** @requires A cloned client view. @ensures Private engagement details are filtered in current and historical reports. */
export function restrictBattleReport(state:GameState,nation:number){
  if(state.report)state.report.battles=state.report.battles.filter(b=>b.forces.some(f=>f.nation===nation));
}
