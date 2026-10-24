#pragma once
#include "vendor/nlohmann/json.hpp"

namespace sovereign {
/** @requires A bounded JSON request. @ensures Invalid orders throw before any state is returned; identical inputs resolve identically. */
nlohmann::json sandbox(const nlohmann::json& request);
}
