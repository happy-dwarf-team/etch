# Etch's Anvil plugin: the game host's end of the session pipe (docs/plugin-protocol.md).
#
#   cmake -S plugin -B plugin/build -G "Visual Studio 17 2022" -A x64
#   cmake --build plugin/build --config Release
#   ctest --test-dir plugin/build -C Release --output-on-failure
#   cmake --install plugin/build --config Release --component plugin --prefix plugin/dist
cmake_minimum_required(VERSION 3.28)

# One version for the repository (ADR 0004): release-please bumps package.json
# and plugin.toml together, and the build refuses to go on when they differ.
file(READ "${CMAKE_CURRENT_SOURCE_DIR}/../package.json" ETCH_PACKAGE_JSON)
string(JSON ETCH_VERSION GET "${ETCH_PACKAGE_JSON}" version)
file(STRINGS plugin.toml ETCH_MANIFEST_VERSION LIMIT_COUNT 1 REGEX "^version = \"[^\"]*\"")
if(NOT ETCH_MANIFEST_VERSION MATCHES "^version = \"${ETCH_VERSION}\"")
    message(FATAL_ERROR "plugin/plugin.toml (${ETCH_MANIFEST_VERSION}) does not match package.json (${ETCH_VERSION})")
endif()
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ../package.json plugin.toml)
project(etch_plugin VERSION ${ETCH_VERSION} LANGUAGES CXX)

if(NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "64-bit Windows only")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

option(ETCH_BUILD_TESTS "Build the plugin's tests" ON)

# The Anvil SDK (anvil_add_plugin, the headers, anvil.exe for `anvil gen` and
# `anvil check`): the SDK archive of the Anvil release ETCH_ANVIL_VERSION,
# checked against the release's SHA256SUMS.txt. It is the Anvil the game host
# runs (pins/, ADR 0004), so both change together in one pull request.
# -DAnvilPlugin_DIR=<sdk>/cmake uses an unpacked SDK instead.
set(ETCH_ANVIL_VERSION 1.3.0)
set(ETCH_ANVIL_SDK_SHA256 f138ce478c42a939502fa3dbab66bdbc180803eedd92c20861a3d1a00cf83803)
if(AnvilPlugin_DIR)
    find_package(AnvilPlugin REQUIRED)
else()
    include(FetchContent)
    FetchContent_Declare(anvil_sdk
        URL https://github.com/happy-dwarf-team/anvil/releases/download/v${ETCH_ANVIL_VERSION}/anvil-sdk-windows-x64.zip
        URL_HASH SHA256=${ETCH_ANVIL_SDK_SHA256})
    FetchContent_MakeAvailable(anvil_sdk)
endif()

# The parts that do not need the game, also linked into the tests.
add_library(etch_core STATIC src/json.cpp src/protocol.cpp src/session.cpp src/pipe_server.cpp src/console.cpp)
target_include_directories(etch_core PUBLIC src)
target_compile_definitions(etch_core PUBLIC WIN32_LEAN_AND_MEAN NOMINMAX ETCH_PLUGIN_VERSION="${ETCH_VERSION}")
target_link_libraries(etch_core PUBLIC advapi32)

# etch.dll and its folder <build>/plugin/etch/ (plugin.toml, symbols.toml, the DLL).
anvil_add_plugin(etch SOURCES src/plugin.cpp)
target_link_libraries(etch PRIVATE etch_core)

if(MSVC)
    foreach(target etch_core etch)
        target_compile_options(${target} PRIVATE /W4 /WX /utf-8 /permissive- /EHsc)
    endforeach()
endif()

# anvil.exe of the SDK, for CI (`anvil check --format github`): its path in
# <build>/anvil-tool.txt.
get_property(ETCH_ANVIL_TOOL GLOBAL PROPERTY ANVIL_SDK_TOOL)
file(GENERATE OUTPUT ${CMAKE_BINARY_DIR}/anvil-tool.txt CONTENT "${ETCH_ANVIL_TOOL}")

if(ETCH_BUILD_TESTS)
    enable_testing()
    foreach(test json protocol session pipe_server console)
        add_executable(test_${test} tests/test_${test}.cpp)
        target_link_libraries(test_${test} PRIVATE etch_core)
        if(MSVC)
            # /UNDEBUG: the tests use assert(), which Release would compile out.
            target_compile_options(test_${test} PRIVATE /W4 /WX /utf-8 /permissive- /EHsc /UNDEBUG)
        endif()
        add_test(NAME ${test} COMMAND test_${test})
    endforeach()
    # plugin.toml and symbols.toml against Anvil's schemas, and symbols.lock
    # against symbols.toml (the lock comes from `anvil check plugin --exe`).
    add_test(NAME anvil_check COMMAND ${ETCH_ANVIL_TOOL} check ${CMAKE_CURRENT_SOURCE_DIR})
endif()

# <prefix>/etch/{plugin.toml, symbols.toml, etch.dll, LICENSE}: the folder that
# goes to <private install>/anvil/plugins/etch. pnpm package takes it from
# plugin/dist/etch/ (pins/README.md).
install(TARGETS etch RUNTIME DESTINATION etch COMPONENT plugin)
install(FILES plugin.toml symbols.toml ../LICENSE DESTINATION etch COMPONENT plugin)
