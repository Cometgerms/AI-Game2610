import type {Battle,GameState,Ledger,Order} from './sandbox';

export type ForecastCase = {
  kind:'unchanged'|'pressure'|'surge'|'scripted';
  ledger:Ledger;
  battles:Battle[];
  assumptions:{nation:number;order:Order}[];
  exposed:number[];
  control:{region:number;from:number;to:number;capital:boolean}[];
  events:NonNullable<GameState['report']>['events'];
};
export type PlanForecast = {scenario:string;turn:number;nation:number;cases:ForecastCase[]};
