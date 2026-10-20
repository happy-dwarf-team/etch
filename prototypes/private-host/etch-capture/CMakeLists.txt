# PROTOTYPE for happy-dwarf-team/etch#21, throwaway.
#   cmake -S . -B <build> -G Ninja -DCMAKE_BUILD_TYPE=Release -DFETCHCONTENT_SOURCE_DIR_ANVIL_SDK=<anvil checkout>
cmake_minimum_required(VERSION 3.25)
project(etch_capture_proto LANGUAGES CXX)

include(FetchContent)
set(ANVIL_BUILD_TESTS OFF)
set(ANVIL_BUILD_EXAMPLES OFF)
set(ANVIL_BUILD_BENCH OFF)
FetchContent_Declare(anvil_sdk
    GIT_REPOSITORY https://github.com/happy-dwarf-team/anvil.git
    GIT_TAG v1.2.0
    EXCLUDE_FROM_ALL)
FetchContent_MakeAvailable(anvil_sdk)

anvil_add_plugin(etch_capture_proto SOURCES plugin.cpp)
target_compile_definitions(etch_capture_proto PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
