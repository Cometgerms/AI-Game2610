#pragma once
#include "sandbox.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <stdexcept>
#include <string>
#include <vector>

namespace sovereign::strategy {
using J = nlohmann::json;
inline void need(bool ok, const char* reason) { if (!ok) throw std::runtime_error(reason); }
inline int bounded(const J& v, int lo, int hi) { need(v.is_number_integer() && v >= lo && v <= hi, "Invalid standing policy or clause value"); return v.get<int>(); }
inline constexpr std::array<const char*, 5> sectors{"political", "economy", "society", "technology", "diplomacy"};
inline J defaults(int army) { return {{"mobilization", {{"mode", "reserve"}, {"target", army}, {"budget", 20}, {"region", -1}}}, {"programs", {{"political", 0}, {"economy", 0}, {"society", 0}, {"technology", 0}, {"diplomacy", 0}}}}; }
inline void validate_standing(const J& s) {
    const auto& m = s.at("mobilization"); const std::string mode = m.at("mode");
    need(mode == "off" || mode == "reserve" || mode == "expansion" || mode == "emergency", "Invalid mobilization mode");
    bounded(m.at("target"), 0, 10000); bounded(m.at("budget"), 0, 200); bounded(m.at("region"), -1, 24);
    for (const auto* key : sectors) bounded(s.at("programs").at(key), 0, 30);
}
inline void validate_clauses(const J& t) {
    const auto& clauses = t.at("clauses"); const int a = t.at("from"), b = t.at("to"), duration = t.at("duration");
    need(clauses.is_array() && !clauses.empty() && clauses.size() <= 8, "Expected one to eight clauses");
    for (const auto& c : clauses) {
        const std::string kind = c.at("kind"), resource = c.at("resource");
        need(kind == "transfer" || kind == "peace" || kind == "cancel_on_attack", "Unknown clause");
        const int actor = bounded(c.at("actor"), 0, 4), target = bounded(c.at("target"), 0, 4);
        need((actor == a || actor == b) && actor != target, "Clause actor must be a party");
        need(kind == "cancel_on_attack" || target == a || target == b, "Transfer/peace must be bilateral");
        need(resource == "treasury" || resource == "food" || resource == "energy", "Invalid clause resource");
        bounded(c.at("amount"), 1, 100); bounded(c.at("start"), 1, duration); bounded(c.at("every"), 1, 5);
    }
}
inline bool peaceful(const J& t) {
    if (t.at("kind") != "compact") return t.at("kind") != "trade";
    for (const auto& c : t.at("clauses")) if (c.at("kind") == "peace") return true;
    return false;
}
inline void conditions(J& state, const J& plans, J& events) {
    for (auto& t : state["treaties"]) if (t["status"] == "active" && t["kind"] == "compact") {
        bool closed = false;
        for (const auto& c : t["clauses"]) if (c["kind"] == "cancel_on_attack") {
            const int actor = c["actor"], target = c["target"];
            for (const auto& o : plans[actor]["orders"]) if (o.at("kind") == "attack") {
                const int to = bounded(o.at("to"), 0, 24);
                if (state["regions"][to]["owner"] == target) {
                    t["status"] = "terminated"; t["remaining"] = 0; t["closedBy"] = actor; t["closedTurn"] = state["turn"];
                    events.push_back({{"code", "treaty-condition"}, {"nation", actor}, {"target", target}, {"treaty", t["id"]}});
                    closed = true; break;
                }
            }
            if (closed) break;
        }
    }
}

/** @requires Manual costs already reserved. @ensures Standing policies never overspend, recruit into enemy land or spend the reserve floor. */
inline int standing(J& state, const J& opening, const J& plan, int nation, std::vector<std::array<int, 5>>& forces, std::array<int, 3>& spending, J& events) {
    auto& n = state["nations"][nation]; const auto& old = opening["nations"][nation];
    J setting = plan.contains("standing") ? plan.at("standing") : old.value("standing", defaults(old["resources"]["army"]));
    validate_standing(setting); n["standing"] = setting;
    std::vector<int> owned; for (const auto& r : opening["regions"]) if (r["owner"] == nation) owned.push_back(r["id"]);
    if (owned.empty()) return 100;
    auto& resources = n["resources"];
    auto gain = [&](const char* key, int amount) { resources[key] = std::clamp(resources[key].get<int>() + amount, 0, 1000000); };
    int total = 0; for (const auto* key : sectors) total += setting["programs"][key].get<int>();
    const int available = std::max(0, resources["treasury"].get<int>() - 20);
    for (const auto* key : sectors) {
        const int wanted = setting["programs"][key], funded = total > available ? wanted * available / total : wanted;
        if (!funded) continue;
        gain("treasury", -funded); spending[0] += funded;
        const std::string field = key;
        if (field == "political") n["stability"] = std::min(100, n["stability"].get<int>() + funded / 5);
        if (field == "economy") gain("industry", funded / 4);
        if (field == "society") { gain("population", funded / 10); gain("food", funded); n["stability"] = std::min(100, n["stability"].get<int>() + funded / 6); }
        if (field == "technology") gain("research", funded / 2);
        if (field == "diplomacy") n["trust"] = std::min(100, n["trust"].get<int>() + funded / 10);
        events.push_back({{"code", "program-funded"}, {"nation", nation}, {"amount", funded}, {"reason", field}});
    }
    if (total > available) events.push_back({{"code", "program-reduced"}, {"nation", nation}, {"amount", available}});
    const auto& m = setting["mobilization"]; const std::string mode = m["mode"];
    const int tier = mode == "emergency" ? 3 : mode == "expansion" ? 2 : mode == "reserve" ? 1 : 0;
    if (!tier) return 100;
    int army = 0; for (const auto& f : forces) army += f[nation];
    const int gap = std::max(0, m["target"].get<int>() - army); if (!gap) return 100;
    const int population = old["resources"]["population"], industry = old["resources"]["industry"], logistics = old["tech"]["logistics"];
    const int rate = tier == 3 ? 10 : tier == 2 ? 5 : 2;
    const int capacity = std::min((population * rate + 99) / 100, (2 + industry / 10 + 2 * logistics) * tier);
    const int cost = tier + 1;
    const int quantity = std::max(0, std::min({gap, capacity, m["budget"].get<int>() / cost, std::max(0, resources["treasury"].get<int>() - 20) / cost, std::max(0, resources["food"].get<int>() - 20), std::max(0, resources["population"].get<int>() - 20) * 5}));
    int destination = m["region"];
    if (std::find(owned.begin(), owned.end(), destination) == owned.end()) {
        destination = owned[0]; for (int id : owned) if (opening["regions"][id]["capital"] == nation) destination = id;
    }
    gain("treasury", -quantity * cost); gain("food", -quantity); gain("population", -(quantity + 4) / 5);
    spending[0] += quantity * cost; spending[1] += quantity; forces[destination][nation] += quantity;
    events.push_back({{"code", "auto-recruit"}, {"nation", nation}, {"target", destination}, {"amount", quantity}, {"reason", quantity < std::min(gap, capacity) ? "limited" : mode}});
    if (!quantity || tier == 1) return 100;
    const int penalty = tier == 3 ? 4 : 1;
    n["stability"] = std::max(0, n["stability"].get<int>() - penalty);
    n["fatigue"] = std::min(100, n["fatigue"].get<int>() + penalty);
    return tier == 3 ? 85 : 95;
}

/** @requires An active compact after upkeep. @ensures Gross obligations are jointly funded or no transfer occurs; a default ends the compact once. */
inline bool transfers(J& state, J& treaty, J& events) {
    constexpr std::array<const char*, 3> stocks{"treasury", "food", "energy"};
    std::array<std::array<int, 3>, 5> outgoing{}, incoming{};
    const int age = treaty["duration"].get<int>() - treaty["remaining"].get<int>() + 1;
    for (const auto& c : treaty["clauses"]) if (c["kind"] == "transfer" && age >= c["start"].get<int>() && (age - c["start"].get<int>()) % c["every"].get<int>() == 0) {
        const int actor = c["actor"], target = c["target"], amount = c["amount"];
        for (int k = 0; k < 3; ++k) if (c["resource"] == stocks[k]) { outgoing[actor][k] += amount; incoming[target][k] += amount; }
    }
    std::vector<int> failed;
    for (int i : {treaty["from"].get<int>(), treaty["to"].get<int>()}) {
        bool shortfall = false;
        for (int k = 0; k < 3; ++k) shortfall |= state["nations"][i]["resources"][stocks[k]].get<int>() < outgoing[i][k];
        if (shortfall) failed.push_back(i);
    }
    if (!failed.empty()) {
        treaty["status"] = "breached"; treaty["remaining"] = 0; treaty["closedBy"] = failed[0]; treaty["closedTurn"] = state["turn"];
        for (int i : failed) { auto& trust = state["nations"][i]["trust"]; trust = std::max(0, trust.get<int>() - 8); events.push_back({{"code", "treaty-default"}, {"nation", i}, {"treaty", treaty["id"]}, {"amount", 8}}); }
        return false;
    }
    for (int i = 0; i < 5; ++i) for (int k = 0; k < 3; ++k) {
        auto& stock = state["nations"][i]["resources"][stocks[k]]; stock = std::clamp(stock.get<int>() - outgoing[i][k] + incoming[i][k], 0, 1000000);
        if (outgoing[i][k]) events.push_back({{"code", "treaty-payment"}, {"nation", i}, {"treaty", treaty["id"]}, {"amount", outgoing[i][k]}, {"reason", stocks[k]}});
    }
    return true;
}
}
