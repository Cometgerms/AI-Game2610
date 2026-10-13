 #include "core/simulation.hpp"

#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <string>

/** @requires A predicate and diagnostic. @ensures Failures survive release builds with NDEBUG. */
void check(bool passed, const std::string& message) {
    if (!passed) throw std::runtime_error(message);
}

/** @requires A potentially invalid input. @ensures Invalid orders cannot silently resolve. */
void rejects(const sovereign::World& world, const std::vector<sovereign::Order>& orders) {
    bool rejected = false;
    try { static_cast<void>(sovereign::resolve(world, orders)); }
    catch (const std::invalid_argument&) { rejected = true; }
    check(rejected, "Expected invalid input to be rejected.");
}

/** @requires No external state. @ensures Exit failure for broken economic or turn invariants. */
int main() {
    try {
        sovereign::World world{};
        const auto original = world;
        std::vector<sovereign::Order> orders{{0, {60, 25, 15}}, {1, {30, 50, 20}}, {2, {30, 15, 55}}, {3, {60, 25, 15}}};
        const auto next = sovereign::resolve(world, orders);
        check(world == original, "Resolution mutated its input.");
        check(next.turn == 1 && next.nations[0] == sovereign::Nation{10, 26, 5, 23}, "Economy result differs from documented rules.");
        std::reverse(orders.begin(), orders.end());
        check(sovereign::resolve(world, orders) == next, "Submission order changed the outcome.");
        auto invalid = orders;
        invalid[0].budget = {-1, 51, 50};
        rejects(world, invalid);
        invalid[0].budget = {100, 1, 0};
        rejects(world, invalid);
        invalid = orders;
        invalid[0].nation = invalid[1].nation;
        rejects(world, invalid);
        invalid[0].nation = 9;
        rejects(world, invalid);
        invalid.pop_back();
        rejects(world, invalid);
        world.nations[0].treasury = 0;
        const auto poor = sovereign::resolve(world, orders);
        check(poor.nations[0] == sovereign::Nation{10, 20, 0, 20}, "Zero funds must not finance investment.");
        world.turn = world.turn_limit;
        rejects(world, orders);
        world.turn = -1;
        rejects(world, orders);
        std::cout << "Economic conservation, immutable resolution, order independence, validation and turn limits passed.\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
