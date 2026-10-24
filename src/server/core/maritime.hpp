#pragma once
#include "strategy.hpp"
#include <set>
#include <queue>

namespace sovereign::maritime {
using J=nlohmann::json;
inline bool member(const J& list,int n){return std::find(list.begin(),list.end(),n)!=list.end();}
inline bool peace(const J& state,int a,int b){for(const auto& t:state["treaties"])if(t["status"]=="active"&&strategy::peaceful(t)&&((t["from"]==a&&t["to"]==b)||(t["from"]==b&&t["to"]==a)))return true;return false;}
inline bool port(const J& state,int nation,int sea=-1){if(!state.contains("ocean"))return false;for(const auto& z:state["ocean"])if(sea<0||z["id"]==sea)for(const auto& r:z["ports"])if(state["regions"][r.get<int>()]["owner"]==nation)return true;return false;}
inline int fleet(const J& state,int n){int total=state["nations"][n].value("navalReserve",0);if(state.contains("ocean"))for(const auto& z:state["ocean"])total+=z["fleets"][n].get<int>();return total;}
inline int deployed(const J& state,int n){return fleet(state,n)-state["nations"][n].value("navalReserve",0);}
inline void validate(const J& state){
    if(!state.contains("ocean"))return;
    const auto& zones=state["ocean"];strategy::need(zones.is_array()&&zones.size()==6,"Expected six sea zones");
    for(int i=0;i<6;i++){
        const auto& z=zones[i];strategy::need(z.at("id")==i,"Invalid sea zone identity");
        const int owner=strategy::bounded(z.at("owner"),-1,4),blockade=strategy::bounded(z.at("blockade"),-1,4);
        strategy::need(z.at("fleets").is_array()&&z["fleets"].size()==5,"Invalid sea patrols");for(const auto& f:z["fleets"])strategy::bounded(f,0,10000);
        strategy::need(owner<0?blockade==-1:blockade!=owner&&z["fleets"][owner]>0,"Invalid sea controller or blockade");
        for(const auto* key:{"neighbors","ports"}){strategy::need(z.at(key).is_array()&&z[key].size()<=25,"Invalid sea topology");std::set<int> unique;for(const auto& value:z[key]){const int id=strategy::bounded(value,0,std::string(key)=="ports"?24:5);strategy::need(unique.insert(id).second,"Duplicate sea link");if(std::string(key)=="neighbors")strategy::need(id!=i&&member(zones[id]["neighbors"],i),"Sea links must be reciprocal");}}
    }
    for(const auto& n:state["nations"])strategy::bounded(n.at("navalReserve"),0,10000);
}
/** @requires Settled control. @ensures Only an explicit blockade denies access; ownership alone never closes water. */
inline bool accessible(const J& state,int zone,int a,int b=-1){const auto& z=state["ocean"][zone];const int blocked=z["blockade"];return blocked<0||(blocked!=a&&blocked!=b);}
inline int route(const J& state,int from,int to,int nation){
    if(!state.contains("ocean"))return member(state["regions"][from]["sea"],to)?1:-1;
    std::queue<std::pair<int,int>> queue;std::set<int> seen;
    for(const auto& z:state["ocean"])if(member(z["ports"],from)&&accessible(state,z["id"],nation))queue.push({z["id"],1});
    while(!queue.empty()){auto [id,distance]=queue.front();queue.pop();if(!seen.insert(id).second)continue;const auto& z=state["ocean"][id];if(member(z["ports"],to))return distance;for(const auto& next:z["neighbors"])if(accessible(state,next,nation))queue.push({next,distance+1});}return -1;
}
inline bool trade_route(const J& state,int a,int b){
    if(!state.contains("ocean"))return true;
    std::queue<int> queue;std::set<int> seen;for(const auto& r:state["regions"])if(r["owner"]==a)queue.push(r["id"]);
    while(!queue.empty()){const int id=queue.front();queue.pop();if(!seen.insert(id).second)continue;if(id<25){const auto& r=state["regions"][id];if(r["owner"]==b)return true;for(const auto& next:r["neighbors"])queue.push(next);for(const auto& z:state["ocean"])if(member(z["ports"],id)&&accessible(state,z["id"],a,b))queue.push(25+z["id"].get<int>());}else{const auto& z=state["ocean"][id-25];for(const auto& next:z["ports"])queue.push(next);for(const auto& next:z["neighbors"])if(accessible(state,next,a,b))queue.push(25+next.get<int>());}}return false;
}
inline bool naval(const std::string& kind){return kind=="build_fleet"||kind=="patrol"||kind=="recall"||kind=="blockade"||kind=="open_sea";}
/** @requires Server-owned topology. @ensures New ships cannot move until next turn; every origin has one fleet movement. */
inline void orders(J& state,const J& opening,const J& plans,std::array<std::array<int,3>,5>& spending,J& events){
    for(int n=0;n<5;n++){
        std::set<int> origins,policies;bool built=false;
        auto pay=[&](const char* key,int amount,int column){auto& value=state["nations"][n]["resources"][key];strategy::need(value.get<int>()>=amount,"Insufficient resources for naval orders");value=value.get<int>()-amount;spending[n][column]+=amount;};
        for(const auto& o:plans[n]["orders"]){const std::string kind=o.at("kind");if(!naval(kind))continue;
            strategy::need(state.contains("ocean"),"Ocean rules are not available in this historical save");
            bool alive=false;for(const auto& r:opening["regions"])alive|=r["owner"]==n;strategy::need(alive,"Eliminated country cannot issue naval orders");
            if(kind=="build_fleet"){const int amount=strategy::bounded(o.at("amount"),1,20);strategy::need(!built&&port(opening,n),"Shipbuilding needs an owned coast; one build per turn");built=true;strategy::need(amount<=2+opening["nations"][n]["resources"]["industry"].get<int>()/30,"Shipyard capacity exceeded");pay("treasury",amount*10,0);pay("energy",amount*3,2);auto& reserve=state["nations"][n]["navalReserve"];strategy::need(reserve.get<int>()+amount<=10000,"Fleet reserve limit reached");reserve=reserve.get<int>()+amount;events.push_back({{"code","fleet-built"},{"nation",n},{"amount",amount}});continue;}
            const int from=strategy::bounded(o.at("from"),kind=="patrol"?-1:0,5);
            if(kind=="blockade"||kind=="open_sea"){strategy::need(opening["ocean"][from]["owner"]==n&&policies.insert(from).second,"Sea policy needs opening control; one change per sea");int target=-1;if(kind=="blockade"){target=strategy::bounded(o.at("to"),0,4);strategy::need(target!=n&&!peace(state,n,target),"Blockade conflicts with signed peace; break the pact first");}state["ocean"][from]["blockade"]=target;events.push_back({{"code",target<0?"sea-open":"sea-blockade"},{"nation",n},{"target",from},{"amount",target}});continue;}
            strategy::need(origins.insert(from).second,"One fleet movement per source per turn");const int amount=strategy::bounded(o.at("amount"),1,10000);
            const int available=from<0?opening["nations"][n]["navalReserve"].get<int>():opening["ocean"][from]["fleets"][n].get<int>();strategy::need(amount<=available,"Not enough opening fleet strength");
            if(kind=="recall"){strategy::need(port(opening,n),"Recall needs an owned coast");state["ocean"][from]["fleets"][n]=state["ocean"][from]["fleets"][n].get<int>()-amount;auto& reserve=state["nations"][n]["navalReserve"];strategy::need(reserve.get<int>()+amount<=10000,"Fleet reserve limit reached");reserve=reserve.get<int>()+amount;}
            else{const int to=strategy::bounded(o.at("to"),0,5);strategy::need(from<0?port(opening,n,to):member(opening["ocean"][from]["neighbors"],to),"Patrol needs a coastal sea or neighbouring sea");pay("energy",(amount+3)/4,2);if(from<0)state["nations"][n]["navalReserve"]=state["nations"][n]["navalReserve"].get<int>()-amount;else state["ocean"][from]["fleets"][n]=state["ocean"][from]["fleets"][n].get<int>()-amount;auto& fleet=state["ocean"][to]["fleets"][n];strategy::need(fleet.get<int>()+amount<=10000,"Sea fleet limit reached");fleet=fleet.get<int>()+amount;}
            events.push_back({{"code",kind=="recall"?"fleet-recalled":"fleet-patrol"},{"nation",n},{"amount",amount}});
        }
    }
}
/** @requires Simultaneous fleet movements. @ensures Equal presence contests a zone; peaceful patrols never auto-declare war. */
inline void control(J& state,const J& opening,J& events){
    if(!state.contains("ocean"))return;
    for(int n=0;n<5;n++){bool alive=false;for(const auto& r:state["regions"])alive|=r["owner"]==n;if(!alive){state["nations"][n]["navalReserve"]=0;for(auto& z:state["ocean"])z["fleets"][n]=0;}}
    for(auto& z:state["ocean"]){int winner=-1,best=0;bool tie=false;for(int n=0;n<5;n++){const auto& nation=opening["nations"][n];const int factor=100+15*nation["tech"]["military"].get<int>()+10*nation["tech"]["logistics"].get<int>();const int power=z["fleets"][n].get<int>()*factor*(nation["resources"]["energy"]==0?65:100);if(power>best){best=power;winner=n;tie=false;}else if(power==best&&power>0)tie=true;}
        if(tie){winner=-1;}
        const int previous=z["owner"];if(winner!=previous){z["blockade"]=-1;if(winner>=0)events.push_back({{"code","sea-control"},{"nation",winner},{"target",z["id"]}});else if(previous>=0)events.push_back({{"code","sea-contested"},{"nation",previous},{"target",z["id"]}});}z["owner"]=winner;
        if(winner>=0&&z["blockade"].get<int>()>=0&&peace(state,winner,z["blockade"])){z["blockade"]=-1;events.push_back({{"code","sea-open"},{"nation",winner},{"target",z["id"]}});}
    }
}
inline int controlled(const J& state,int nation){int count=0;if(state.contains("ocean"))for(const auto& z:state["ocean"])if(z["owner"]==nation)count++;return count;}
}
