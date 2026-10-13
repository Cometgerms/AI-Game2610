#pragma once

#include <array>
#include <cstddef>
#include <vector>

namespace sovereign {

struct Budget {
    int industry{60};
    int research{25};
    int defense{15};
    bool operator==(const Budget&) const = default;
};

struct Nation {
    int treasury{100};
    int industry{20};
    int research{0};
    int defense{20};
    bool operator==(const Nation&) const = default;
};

struct World {
    int turn{0};
    int turn_limit{4};
    std::array<Nation, 4> nations{};
    bool operator==(const World&) const = default;
};

struct Order {
    std::size_t nation;
    Budget budget;
};

/** @requires No preconditions. @ensures Only whole, nonnegative allocations totaling 100 pass. */
[[nodiscard]] bool valid_budget(const Budget& budget);

/**
 * @requires One valid order per nation; treasury and metrics in the supported range.
 * @ensures Returns a deterministic next world or throws without mutating the input.
 * Validation happens before resolution so arrival order cannot grant economic advantages.
 */
[[nodiscard]] World resolve(const World& world, const std::vector<Order>& orders);

} // namespace sovereign
