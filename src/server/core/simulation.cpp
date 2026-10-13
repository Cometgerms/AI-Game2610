#include "core/simulation.hpp"

#include <algorithm>
#include <stdexcept>

namespace sovereign {

bool valid_budget(const Budget& budget) {
    const std::array values{budget.industry, budget.research, budget.defense};
    return std::all_of(values.begin(), values.end(), [](int value) { return value >= 0 && value <= 100; })
        && budget.industry + budget.research + budget.defense == 100;
}

World resolve(const World& world, const std::vector<Order>& orders) {
    if (world.turn_limit < 1 || world.turn_limit > 100 || world.turn < 0 || world.turn >= world.turn_limit) {
        throw std::invalid_argument("World is not in a resolvable turn.");
    }
    if (orders.size() != world.nations.size()) {
        throw std::invalid_argument("Exactly one order per nation is required.");
    }
    std::array<bool, 4> seen{};
    for (const auto& nation : world.nations) {
        const std::array values{nation.treasury, nation.industry, nation.research, nation.defense};
        if (!std::all_of(values.begin(), values.end(), [](int value) { return value >= 0 && value <= 1000000; })) {
            throw std::invalid_argument("Nation metrics are outside the supported range.");
        }
    }
    for (const auto& order : orders) {
        if (order.nation >= seen.size() || seen[order.nation] || !valid_budget(order.budget)) {
            throw std::invalid_argument("Invalid or duplicate nation order.");
        }
        seen[order.nation] = true;
    }

    World result = world;
    for (const auto& order : orders) {
        const auto& before = world.nations[order.nation];
        auto& after = result.nations[order.nation];
        const int available = std::min(before.treasury, 100);
        // Unspent rounding remainder stays in the treasury; investment cannot create currency.
        const int industry_spend = available * order.budget.industry / 100;
        const int research_spend = available * order.budget.research / 100;
        const int defense_spend = available * order.budget.defense / 100;
        after.treasury += before.industry / 2 - industry_spend - research_spend - defense_spend;
        after.industry += industry_spend / 10;
        after.research += research_spend / 5;
        after.defense += defense_spend / 5;
    }
    ++result.turn;
    return result;
}

} // namespace sovereign
