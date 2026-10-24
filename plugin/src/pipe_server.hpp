#pragma once

#include "protocol.hpp"

#include <functional>
#include <string>

namespace etch {

enum class LogLevel { Info, Warn, Error };
using LogFn = std::function<void(LogLevel level, const std::string& message)>;

// Serves the session pipe `name` on a background thread for the rest of the
// process: one client at a time (a second one gets ERROR_PIPE_BUSY until the
// first leaves), local clients of the current Windows user only. Each client
// gets a fresh Connection. `host` must outlive the process's use of the pipe.
// Returns false, after logging why, when the pipe cannot be created, for
// example because another process already serves that name.
bool StartPipeServer(const std::wstring& name, const Host& host, LogFn log);

}  // namespace etch
