cmake_minimum_required(VERSION 3.24)
project(Sovereign VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(sovereign_core src/server/core/simulation.cpp)
target_include_directories(sovereign_core PUBLIC src/server)
if(MSVC)
  target_compile_options(sovereign_core PRIVATE /W4 /WX)
else()
  target_compile_options(sovereign_core PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

add_executable(sovereign_sim src/server/main.cpp)
target_link_libraries(sovereign_sim PRIVATE sovereign_core)

include(CTest)
if(BUILD_TESTING)
  add_executable(simulation_tests tests/server/simulation_test.cpp)
  target_link_libraries(simulation_tests PRIVATE sovereign_core)
  add_test(NAME simulation COMMAND simulation_tests)
endif()
