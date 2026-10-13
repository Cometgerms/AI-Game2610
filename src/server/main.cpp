#include "core/simulation.hpp"

#include <iostream>

/** @requires No arguments.
 *  @ensures Prints one reproducible economy smoke-test, without network calls. */
int main() {
    const sovereign::World initial{};
    const auto next = sovereign::resolve(initial, {{0, {60, 25, 15}}, {1, {30, 50, 20}}, {2, {30, 15, 55}}, {3, {60, 25, 15}}});
    std::cout << "{\"mode\":\"local-economy-demo\",\"turn\":" << next.turn << ",\"nations\":[";
    for (std::size_t i = 0; i < next.nations.size(); ++i) {
        const auto& nation = next.nations[i];
        if (i != 0) std::cout << ',';
        std::cout << "{\"id\":" << i << ",\"treasury\":" << nation.treasury
                  << ",\"industry\":" << nation.industry << ",\"research\":" << nation.research
                  << ",\"defense\":" << nation.defense << '}';
    }
    std::cout << "]}\n";
}
