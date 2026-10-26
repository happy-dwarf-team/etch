# etch-pick-probe: a throwaway Anvil plugin for the live checks of pick mode
# (etch#171). Prototype branch only, never merged or shipped.
#
#   cmake -S pick-probe -B pick-probe/build -G "Visual Studio 17 2022" -A x64 -DAnvilPlugin_DIR=<sdk>/cmake
#   cmake --build pick-probe/build --config Release
cmake_minimum_required(VERSION 3.25)
project(etch_pick_probe LANGUAGES CXX)
find_package(AnvilPlugin REQUIRED)
anvil_add_plugin(etch_pick_probe SOURCES src/probe.cpp)
target_compile_definitions(etch_pick_probe PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX _CRT_SECURE_NO_WARNINGS)
target_compile_options(etch_pick_probe PRIVATE /utf-8 /EHsc)
target_link_libraries(etch_pick_probe PRIVATE user32)
