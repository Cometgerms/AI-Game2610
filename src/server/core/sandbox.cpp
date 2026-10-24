#include "sandbox.hpp"
#include "strategy.hpp"
#include "maritime.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace sovereign {
using J = nlohmann::json;
namespace {
constexpr std::array<const char*, 3> stocks{"treasury", "food", "energy"};
constexpr std::array<const char*, 7> resources{"treasury", "food", "energy", "industry", "research", "army", "population"};
constexpr std::array<const char*, 3> tracks{"production", "military", "logistics"};
constexpr std::array<const char*, 6> domains{"political", "military", "diplomacy", "economy", "society", "technology"};
void require(bool condition, const std::string& message) { if (!condition) throw std::runtime_error(message); }
int integer(const J& value, int low = 0, int high = 1000000) {
    require(value.is_number_integer(), "Expected an integer");
    const auto n = value.get<long long>();
    require(n >= low && n <= high, "Value outside allowed range");
    return static_cast<int>(n);
}
template<class T> bool includes(const T& values, const std::string& value) { return std::find(values.begin(), values.end(), value) != values.end(); }
bool linked(const J& region, int to, const char* kind) { return std::find(region.at(kind).begin(), region.at(kind).end(), to) != region.at(kind).end(); }
bool edict(const J& nation, const std::string& kind) { return std::any_of(nation.at("edicts").begin(), nation.at("edicts").end(), [&](const J& e) { return e.at("kind") == kind; }); }
int level(const J& nation, const char* track) { return nation.at("tech").at(track).get<int>(); }
int quantity(const J& nation, const char* key) { return nation.at("resources").at(key).get<int>(); }
void add(J& nation, const char* key, int amount) { nation["resources"][key] = std::clamp(quantity(nation, key) + amount, 0, 1000000); }
int count_regions(const J& state, int owner) { return static_cast<int>(std::count_if(state.at("regions").begin(), state.at("regions").end(), [&](const J& r) { return r.at("owner") == owner; })); }
bool protected_pair(const J& state, int a, int b) {
    for (const auto& t : state.at("treaties")) if (t.at("status") == "active" && strategy::peaceful(t) &&
        ((t.at("from") == a && t.at("to") == b) || (t.at("from") == b && t.at("to") == a))) return true;
    return false;
}
void validate(const J& state, const J& plans) {
    require(state.at("version") == 1 && state.at("scenario").is_string(), "Unsupported save version");
    integer(state.at("turn"), 1, 10000);
    require(state.at("nations").is_array() && state.at("nations").size() == 5 && plans.is_array() && plans.size() == 5, "Five nations and plans required");
    require(state.at("regions").is_array() && state.at("regions").size() == 25, "Expected 25 regions");
    for (int i = 0; i < 25; ++i) {
        const auto& r = state.at("regions").at(i);
        require(integer(r.at("id"), 0, 24) == i, "Invalid region identity");
        integer(r.at("owner"), 0, 4); integer(r.at("army")); integer(r.at("capital"), -1, 4);
        require(includes(std::array{"mountain", "plateau", "plain", "river", "island"}, r.at("terrain").get<std::string>()), "Invalid terrain");
        for (const auto* key : {"neighbors", "sea"}) {
            require(r.at(key).is_array() && r.at(key).size() <= 24, "Invalid adjacency");
            std::set<int> seen;
            for (const auto& value : r.at(key)) { const int to = integer(value, 0, 24); require(to != i && seen.insert(to).second && linked(state.at("regions").at(to), i, key), "Links must be unique and reciprocal"); }
        }
    }
    for (int i = 0; i < 5; ++i) {
        const auto& n = state.at("nations").at(i);
        if (n.contains("standing")) strategy::validate_standing(n.at("standing"));
        for (const auto* key : resources) integer(n.at("resources").at(key));
        for (const auto* key : {"stability", "fatigue", "trust"}) integer(n.at(key), 0, 100);
        for (const auto* key : tracks) integer(n.at("tech").at(key), 0, 3);
        for (const auto* key : {"military", "economy", "technology", "diplomacy"}) integer(n.at("score").at(key), 0, 100);
        require(n.at("edicts").is_array() && n.at("edicts").size() <= 6, "Invalid edicts");
        std::set<std::string> kinds;
        for (const auto& e : n.at("edicts")) { const auto key = e.at("kind").get<std::string>(); require(includes(domains, key) && kinds.insert(key).second, "Invalid edict domain"); integer(e.at("remaining"), 1, 3); }
        const auto& p = plans.at(i);
        if (p.contains("standing")) strategy::validate_standing(p.at("standing"));
        require(p.at("submitted").is_boolean() && p.at("strategy").is_string() && p.at("strategy").get<std::string>().size() <= 16000, "Invalid plan");
        require(p.at("orders").is_array() && p.at("orders").size() <= 100, "Too many orders");
    }
    require(state.at("treaties").is_array() && state.at("treaties").size() <= 100, "Treaty limit reached");
    std::set<int> ids;
    for (const auto& t : state.at("treaties")) {
        require(ids.insert(integer(t.at("id"))).second, "Duplicate treaty ID");
        const int a = integer(t.at("from"), 0, 4), b = integer(t.at("to"), 0, 4);
        require(a != b, "Treaty needs two countries");
        require(includes(std::array{"trade", "nonaggression", "ceasefire", "compact"}, t.at("kind").get<std::string>()), "Unknown treaty type");
        if (t.at("kind") == "compact") strategy::validate_clauses(t);
        require(includes(stocks, t.at("give").get<std::string>()) && includes(stocks, t.at("receive").get<std::string>()), "Invalid trade resource");
        integer(t.at("amount"), 1, 100); integer(t.at("duration"), 1, 5); integer(t.at("remaining"), 0, 5);
        require(includes(std::array{"pending", "active", "expired", "rejected", "withdrawn", "superseded", "broken", "terminated", "breached"}, t.at("status").get<std::string>()), "Invalid treaty status");
        if (includes(std::array{"superseded", "broken", "terminated", "breached"}, t.at("status").get<std::string>())) {
            const int who = integer(t.at("closedBy"), 0, 4); require(who == a || who == b, "Invalid treaty closing party");
            integer(t.at("closedTurn"), 1, state.at("turn").get<int>()); require(t.at("remaining") == 0, "Closed treaty cannot remain active");
        }
        if (t.at("status") == "rejected" || t.at("status") == "withdrawn") {
            require(integer(t.at("closedBy"), 0, 4) == (t.at("status") == "withdrawn" ? a : b), "Invalid treaty closing party");
            integer(t.at("closedTurn"), 1, state.at("turn").get<int>());
            require(t.at("remaining") == 0, "Closed treaty cannot remain active");
        }
        require(t.at("signatures").is_array() && t.at("signatures").size() <= 2, "Invalid signatures");
        std::set<int> signatures;
        for (const auto& s : t.at("signatures")) { const int who = integer(s, 0, 4); require((who == a || who == b) && signatures.insert(who).second, "Invalid signature"); }
        if (t.at("status") == "active") require(signatures.size() == 2 && t.at("remaining") > 0, "Unsigned treaty cannot be active");
    }
    maritime::validate(state);
    if (!state.at("report").is_null()) {
        const auto& report = state.at("report"); integer(report.at("turn"), 1, 10000);
        require(report.at("ledger").is_array() && report.at("ledger").size() == 5, "Invalid report ledger");
        for (int i = 0; i < 5; ++i) {
            const auto& row = report.at("ledger").at(i); require(integer(row.at("nation"), 0, 4) == i, "Invalid ledger nation");
            for (const auto* key : resources) { integer(row.at("before").at(key)); integer(row.at("after").at(key)); }
            for (const auto* group : {"income", "upkeep", "spending", "shortage"}) for (const auto* key : stocks) integer(row.at(group).at(key));
        }
        require(report.at("battles").is_array() && report.at("battles").size() <= 25, "Invalid battles");
        for (const auto& b : report.at("battles")) {
            integer(b.at("region"), 0, 24); integer(b.at("winner"), 0, 4); integer(b.at("survivors"));
            require(b.at("forces").is_array() && b.at("forces").size() <= 5, "Invalid battle forces");
            for (const auto& f : b.at("forces")) { integer(f.at("nation"), 0, 4); integer(f.at("army")); require(f.at("power").is_number() && f.at("power") >= 0 && f.at("power") <= 10000000, "Invalid battle power"); }
        }
        require(report.at("events").is_array() && report.at("events").size() <= 2000, "Invalid events");
        for (const auto& e : report.at("events")) { integer(e.at("nation"), 0, 4); require(e.at("code").is_string() && e.at("code").get<std::string>().size() <= 60, "Invalid event"); }
    }
}
}

J sandbox(const J& request) {
    J state = request.at("state");
    const J& plans = request.at("plans");
    validate(state, plans);
    const std::string mode = request.value("mode", "resolve");
    require(mode == "resolve" || mode == "validate", "Unknown operation");
    if (mode == "resolve") for (const auto& p : plans) require(p.at("submitted").get<bool>(), "All five countries must submit");
    const J opening = state;
    J events = J::array(), battles = J::array(), ledger = J::array();
    for (const auto& t : state["treaties"]) if (t["status"] == "broken" && t.at("closedTurn") == state["turn"])
        events.push_back({{"code", "treaty-broken"}, {"nation", t.at("closedBy")}, {"treaty", t["id"]}, {"amount", 15}});
    std::array<bool, 5> fought{};
    for (auto& t : state["treaties"]) if (t["status"] == "pending" && t["signatures"].size() == 2) {
        t["status"] = "active"; t["remaining"] = t["duration"]; t["activatedTurn"] = state["turn"];
        events.push_back({{"code", "treaty-active"}, {"nation", t["from"]}, {"target", t["to"]}});
    }
    strategy::conditions(state, plans, events);
    std::vector<std::array<int, 5>> forces(25);
    std::vector<std::array<bool, 5>> sea(25);
    std::array<std::set<int>, 5> held;
    std::array<std::array<int, 3>, 5> spending{};
    maritime::orders(state, opening, plans, spending, events);
    std::array<int, 5> transported{};
    std::array<int, 5> output_factor{100, 100, 100, 100, 100};
    for (const auto& r : state["regions"]) forces[r["id"].get<int>()][r["owner"].get<int>()] = r["army"].get<int>();

    for (int i = 0; i < 5; ++i) {
        auto& n = state["nations"][i];
        std::set<int> used;
        std::set<std::string> fields;
        auto pay = [&](const char* key, int amount) {
            require(quantity(n, key) >= amount, "Country " + std::to_string(i + 1) + ": insufficient " + key);
            add(n, key, -amount);
            for (int k = 0; k < 3; ++k) if (std::string(stocks[k]) == key) spending[i][k] += amount;
        };
        for (const auto& o : plans[i]["orders"]) {
            require(count_regions(opening, i) > 0, "Eliminated country cannot issue orders");
            const auto kind = o.at("kind").get<std::string>();
            if (maritime::naval(kind)) continue;
            if (kind == "invest") {
                const auto field = o.at("field").get<std::string>();
                require(includes(std::array{"industry", "food", "energy", "research"}, field), "Invalid investment");
                const int amount = integer(o.at("amount"), 1, 1000); pay("treasury", amount);
                add(n, field.c_str(), amount / (field == "industry" ? 4 : field == "research" ? 2 : 1));
            } else if (kind == "research") {
                const auto field = o.at("field").get<std::string>();
                require(includes(tracks, field) && fields.insert("tech-" + field).second, "One research order per track");
                const int old = level(n, field.c_str()); require(old < 3, "Technology already completed");
                pay("research", 25 + 20 * old); pay("treasury", 10); n["tech"][field] = old + 1;
            } else if (kind == "edict" || kind == "cancel") {
                const auto field = o.at("field").get<std::string>();
                require(includes(domains, field) && fields.insert("edict-" + field).second, "One edict change per domain");
                auto& list = n["edicts"]; J retained = J::array();
                for (const auto& e : list) if (e["kind"] != field) retained.push_back(e);
                if (kind == "edict") { pay("treasury", 20); retained.push_back({{"kind", field}, {"remaining", 3}}); }
                list = retained;
            } else {
                require(includes(std::array{"recruit", "hold", "move", "attack", "retreat"}, kind), "Unknown order type");
                const int from = integer(o.at("from"), 0, 24);
                const auto& origin = opening["regions"][from];
                require(origin["owner"] == i && used.insert(from).second, "One army order per owned source region");
                if (kind == "hold") { held[i].insert(from); continue; }
                const int amount = integer(o.at("amount"), 1, 10000);
                if (kind == "recruit") {
                    pay("treasury", amount * 2); pay("food", amount); pay("population", (amount + 4) / 5); forces[from][i] += amount;
                } else {
                    const int to = integer(o.at("to"), 0, 24);
                    const bool land_route = linked(origin, to, "neighbors");
                    const int distance = land_route ? 0 : maritime::route(opening, from, to, i);
                    require(land_route || distance >= 0, "Destination needs a land border or an open coastal route");
                    if (!land_route && opening.contains("ocean")) {
                        require(maritime::fleet(opening, i) > 0, "Fleet transport capacity needs an existing fleet");
                        transported[i] += amount;
                        require(transported[i] <= 3 * maritime::fleet(opening, i) + 5 * level(opening["nations"][i], "logistics"), "Fleet transport capacity exceeded");
                        pay("treasury", (amount + 4) / 5); pay("energy", distance);
                    }
                    require(amount <= origin["army"].get<int>(), "Cannot move more than opening garrison");
                    const int target = opening["regions"][to]["owner"].get<int>();
                    require(kind == "attack" ? target != i : target == i, "Move/retreat needs friendly land; attack needs foreign land");
                    require(kind != "attack" || !protected_pair(state, i, target), "Attack conflicts with signed peace treaty");
                    pay("energy", (amount + 9) / 10); forces[from][i] -= amount; forces[to][i] += amount;
                    if (!land_route) sea[to][i] = true;
                }
            }
        }
    }
    for (int i = 0; i < 5; ++i) output_factor[i] = strategy::standing(state, opening, plans[i], i, forces, spending[i], events);
    for (int r = 0; r < 25; ++r) for (int a = 0; a < 5; ++a) for (int b = a + 1; b < 5; ++b)
        require(!(forces[r][a] > 0 && forces[r][b] > 0 && protected_pair(state, a, b)), "Peace partners cannot contest the same sector; coordinate destinations");
    // Validate uses the same reservation and conflict checks without committing effects.
    if (mode == "validate") return opening;

    for (int r = 0; r < 25; ++r) {
        const int defender = opening["regions"][r]["owner"].get<int>();
        int winner = defender, participants = 0;
        double best = -1, opposition = 0;
        std::array<double, 5> power{}, factors{};
        J entries = J::array();
        for (int i = 0; i < 5; ++i) if (forces[r][i] > 0) {
            ++participants;
            const auto& n = opening["nations"][i];
            const std::string terrain = opening["regions"][r]["terrain"];
            const double defense = i == defender ? (terrain == "mountain" ? 1.4 : terrain == "plateau" || terrain == "river" ? 1.2 : 1.1) : 1;
            const double supply = quantity(n, "food") == 0 || quantity(n, "energy") == 0 ? .65 : 1;
            factors[i] = (1 + .15 * level(n, "military")) * defense * supply * (1 - n["fatigue"].get<int>() * .003)
                * (sea[r][i] ? .8 + .05 * level(n, "logistics") : 1) * (held[i].contains(r) ? 1.15 : 1) * (edict(state["nations"][i], "military") ? 1.1 : 1);
            power[i] = forces[r][i] * factors[i];
            if (power[i] > best || (power[i] == best && i == defender)) { best = power[i]; winner = i; }
            entries.push_back({{"nation", i}, {"army", forces[r][i]}, {"power", std::round(power[i] * 10) / 10},
                {"factor", factors[i]}, {"supply", supply}, {"defense", defense}, {"military", level(n, "military")},
                {"fatigue", n["fatigue"]}, {"held", held[i].contains(r)}, {"food", quantity(n, "food")},
                {"energy", quantity(n, "energy")}, {"treasury", quantity(n, "treasury")}});
        }
        int survivors = forces[r][winner];
        if (participants > 1) {
            for (int i = 0; i < 5; ++i) if (i != winner) opposition += power[i];
            survivors = std::max(1, forces[r][winner] - static_cast<int>(std::ceil(opposition * .55 / factors[winner])));
            for (int i = 0; i < 5; ++i) if (forces[r][i] > 0) fought[i] = true;
            battles.push_back({{"region", r}, {"winner", winner}, {"forces", entries}, {"survivors", survivors}});
        }
        state["regions"][r]["owner"] = winner; state["regions"][r]["army"] = survivors;
        if (winner != defender) events.push_back({{"code", "capture"}, {"nation", winner}, {"target", r}});
    }
    // Defeated formations retreat only into an adjacent province still held after all battles.
    for (auto& b : battles) {
        const int r = b["region"].get<int>(), winner = b["winner"].get<int>();
        for (auto& f : b["forces"]) {
            const int i = f["nation"].get<int>(), original = f["army"].get<int>();
            int returned = 0, destination = -1;
            if (i != winner) for (const auto& to : opening["regions"][r]["neighbors"]) if (state["regions"][to.get<int>()]["owner"] == i) {
                destination = to.get<int>(); returned = original * 2 / 5;
                auto& army = state["regions"][destination]["army"]; army = army.get<int>() + returned; break;
            }
            f["retreated"] = returned; f["retreatTo"] = destination;
            f["remaining"] = i == winner ? b["survivors"].get<int>() : returned;
            f["losses"] = original - f["remaining"].get<int>();
        }
        b["terrain"] = opening["regions"][r]["terrain"];
        b["defender"] = opening["regions"][r]["owner"];
    }
    maritime::control(state, opening, events);
    // Income uses opening production; newly researched modifiers take effect next turn.
    for (int i = 0; i < 5; ++i) {
        auto& n = state["nations"][i]; const auto& old = opening["nations"][i];
        int army = 0; for (const auto& r : state["regions"]) if (r["owner"] == i) army += r["army"].get<int>();
        n["resources"]["army"] = army;
        const int land = count_regions(state, i), production = level(old, "production"), logistics = level(old, "logistics");
        const int industry = quantity(old, "industry"), population = quantity(n, "population");
        const int tax = (industry / 2 + land * 3 + production * 5) * (50 + old["stability"].get<int>()) / 150 * output_factor[i] / 100;
        const std::array<int, 3> income{land ? tax + 2 * maritime::controlled(state, i) : 0, land ? land * 8 + production * 5 + (edict(n, "society") ? 20 : 0) : 0, land ? land * 5 + production * 4 : 0};
        const std::array<int, 3> upkeep{(maritime::deployed(state, i) + 2) / 3 + army / (4 + logistics) + population / 10 + (land && edict(n, "political") ? 5 : 0), population / 8 + army / (6 + logistics) + (land && edict(n, "military") ? 5 : 0), (maritime::deployed(state, i) + 3) / 4 + industry / (5 + logistics) + army / 12 + (land && edict(n, "technology") ? 5 : 0)};
        J gains = J::object(), costs = J::object(), spent = J::object(), shortages = J::object();
        bool shortfall = false;
        for (int k = 0; k < 3; ++k) {
            gains[stocks[k]] = income[k]; costs[stocks[k]] = upkeep[k]; spent[stocks[k]] = spending[i][k];
            const int shortage = std::max(0, upkeep[k] - quantity(n, stocks[k]) - income[k]);
            shortages[stocks[k]] = shortage; shortfall |= shortage > 0;
            add(n, stocks[k], income[k] - upkeep[k]);
        }
        n["fatigue"] = std::clamp(n["fatigue"].get<int>() + (fought[i] ? 12 : -6), 0, 100);
        n["stability"] = std::clamp(n["stability"].get<int>() + (shortfall ? -12 : 2) - (fought[i] ? 4 : 0), 0, 100);
        if (shortfall) {
            events.push_back({{"code", "shortage"}, {"nation", i}});
            for (auto& r : state["regions"]) if (r["owner"] == i) r["army"] = r["army"].get<int>() * 9 / 10;
        }
        if (land > 0) add(n, "research", 3 + industry / 20);
        J active = J::array();
        for (auto e : n["edicts"]) {
            const auto kind = e["kind"].get<std::string>();
            if (land > 0) {
                if (kind == "economy") add(n, "industry", 6);
                if (kind == "society") n["stability"] = std::min(100, n["stability"].get<int>() + 3);
                if (kind == "political") n["stability"] = std::min(100, n["stability"].get<int>() + 6);
                if (kind == "technology") add(n, "research", 10);
                if (kind == "diplomacy") n["trust"] = std::min(100, n["trust"].get<int>() + 4);
            }
            e["remaining"] = e["remaining"].get<int>() - 1; if (e["remaining"] > 0) active.push_back(e);
        }
        n["edicts"] = active;
        ledger.push_back({{"nation", i}, {"before", old["resources"]}, {"after", n["resources"]}, {"income", gains}, {"upkeep", costs}, {"spending", spent}, {"shortage", shortages}});
    }
    std::array<std::set<int>, 5> partners;
    for (auto& t : state["treaties"]) if (t["status"] == "active") {
        const int a = t["from"].get<int>(), b = t["to"].get<int>();
        bool fulfilled = count_regions(state, a) > 0 && count_regions(state, b) > 0;
        const bool transfers = t["kind"] == "trade" || (t["kind"] == "compact" && std::any_of(t["clauses"].begin(), t["clauses"].end(), [](const J& c){return c["kind"] == "transfer";}));
        const bool blocked = fulfilled && transfers && !maritime::trade_route(state, a, b);
        if (blocked) { fulfilled = false; events.push_back({{"code", "trade-blocked"}, {"nation", a}, {"target", b}}); }
        if (fulfilled && t["kind"] == "compact") fulfilled = strategy::transfers(state, t, events);
        if (fulfilled && t["kind"] == "trade") {
            auto& x = state["nations"][a]; auto& y = state["nations"][b]; const int amount = t["amount"].get<int>();
            const auto give = t["give"].get<std::string>(), receive = t["receive"].get<std::string>();
            fulfilled = quantity(x, give.c_str()) >= amount && quantity(y, receive.c_str()) >= amount;
            if (fulfilled) { add(x, give.c_str(), -amount); add(y, give.c_str(), amount); add(y, receive.c_str(), -amount); add(x, receive.c_str(), amount); }
        }
        if (t["status"] != "active") continue;
        if (fulfilled) { partners[a].insert(b); partners[b].insert(a); }
        else if (!blocked) { events.push_back({{"code", "treaty-unfulfilled"}, {"nation", a}, {"target", b}}); }
        t["remaining"] = t["remaining"].get<int>() - 1;
        if (t["remaining"] == 0) { t["status"] = "expired"; events.push_back({{"code", "treaty-expired"}, {"nation", a}, {"target", b}}); }
    }
    for (int i = 0; i < 5; ++i) {
        auto& n = state["nations"][i]; int army = 0;
        for (const auto& r : state["regions"]) if (r["owner"] == i) army += r["army"].get<int>();
        n["resources"]["army"] = army;
        const bool alive = count_regions(state, i) > 0;
        n["score"] = {{"military", std::min(100, count_regions(state, i) * 4 + maritime::controlled(state, i) * 2)}, {"economy", alive ? std::min(100, quantity(n, "industry") / 3 + quantity(n, "treasury") / 40) : 0},
            {"technology", alive ? (level(n, "production") + level(n, "military") + level(n, "logistics")) * 100 / 9 : 0},
            {"diplomacy", alive ? std::min(100, n["trust"].get<int>() / 2 + static_cast<int>(partners[i].size()) * 12) : 0}};
        ledger[i]["after"] = n["resources"];
    }
    state["report"] = {{"turn", state["turn"]}, {"ledger", ledger}, {"battles", battles}, {"events", events}};
    state["turn"] = state["turn"].get<int>() + 1;
    return state;
}
}
