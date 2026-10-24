#include "core/sandbox.hpp"
#include <iostream>
#include <iterator>

int main() {
    try {
        const std::string input{std::istreambuf_iterator<char>(std::cin), {}};
        if (input.size() > 500000) throw std::runtime_error("Request too large");
        const auto state = sovereign::sandbox(nlohmann::json::parse(input));
        std::cout << nlohmann::json{{"ok", true}, {"state", state}}.dump();
    } catch (const std::exception& error) {
        std::cout << nlohmann::json{{"ok", false}, {"error", error.what()}}.dump();
        return 1;
    }
}
