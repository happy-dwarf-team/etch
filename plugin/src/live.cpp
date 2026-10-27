#include "live.hpp"

#include <memory>
#include <set>
#include <utility>

namespace etch {
namespace {

constexpr std::size_t kMaxItems = 64;     // lines, files or windows in one request
constexpr std::size_t kMaxToken = 260;    // a file name or a texture path
constexpr std::size_t kMaxSaveName = 64;  // without `.eu4`

char Lower(char c) { return c >= 'A' && c <= 'Z' ? static_cast<char>(c - 'A' + 'a') : c; }

bool EqualNoCase(std::string_view a, std::string_view b) {
    if (a.size() != b.size()) return false;
    for (std::size_t i = 0; i < a.size(); ++i) {
        if (Lower(a[i]) != Lower(b[i])) return false;
    }
    return true;
}

bool EndsWithNoCase(std::string_view text, std::string_view suffix) {
    return text.size() >= suffix.size() && EqualNoCase(text.substr(text.size() - suffix.size()), suffix);
}

// A game path as the game compares it: lower case, `/`, no doubled slashes.
std::string PathKey(std::string_view path) {
    std::string out;
    for (const char c : path) {
        const char s = c == '\\' ? '/' : Lower(c);
        if (s == '/' && !out.empty() && out.back() == '/') continue;
        out += s;
    }
    return out;
}

// Printable ASCII without spaces: one console token.
bool IsToken(std::string_view text) {
    if (text.empty() || text.size() > kMaxToken) return false;
    for (const char c : text) {
        const auto u = static_cast<unsigned char>(c);
        if (u <= 0x20 || u > 0x7E) return false;
    }
    return true;
}

std::vector<std::string_view> Split(std::string_view line) {
    std::vector<std::string_view> out;
    std::size_t at = 0;
    while (at < line.size()) {
        while (at < line.size() && line[at] == ' ') ++at;
        std::size_t end = at;
        while (end < line.size() && line[end] != ' ') ++end;
        if (end > at) out.push_back(line.substr(at, end - at));
        at = end;
    }
    return out;
}

// Reads an optional array of strings, each accepted by `valid`.
std::optional<std::string> ReadStrings(const json::Value& request, std::string_view key, bool required,
                                       bool (*valid)(std::string_view), std::vector<std::string>& out) {
    const json::Value* member = request.Find(key);
    if (member == nullptr) {
        if (required) return "\"" + std::string(key) + "\" is missing";
        return std::nullopt;
    }
    const std::vector<json::Value>* items = member->AsArray();
    if (items == nullptr || items->size() > kMaxItems || (required && items->empty())) {
        return "\"" + std::string(key) + "\" must be an array of 1 to " + std::to_string(kMaxItems) + " strings";
    }
    for (const json::Value& item : *items) {
        const std::optional<std::string_view> text = item.AsString();
        if (!text || !valid(*text)) return "\"" + std::string(key) + "\" holds a value that is not allowed";
        out.emplace_back(*text);
    }
    return std::nullopt;
}

bool AnyLine(std::string_view) { return true; }

const Root* FindRoot(const std::vector<Root>& roots, std::string_view name) {
    for (const Root& root : roots) {
        if (EqualNoCase(root.name, name)) return &root;
    }
    return nullptr;
}

json::Writer Ok(std::uint64_t id) {
    json::Writer w;
    w.Uint("id", id).Bool("ok", true);
    return w;
}

std::string Error(std::uint64_t id, std::string_view code, std::string_view message) {
    json::Writer w;
    return w.Uint("id", id).Bool("ok", false).Str("error", code).Str("message", message).Finish();
}

std::string LineJson(const LineResult& line) {
    json::Writer w;
    return w.Str("line", line.line).Bool("success", line.success).Str("text", line.text).Fixed("ms", line.ms).Finish();
}

std::string LinesJson(const std::vector<LineResult>& lines) {
    std::string out = "[";
    for (const LineResult& line : lines) {
        if (out.size() > 1) out += ',';
        out += LineJson(line);
    }
    return out + "]";
}

std::string NamesJson(const std::vector<std::string>& names) {
    std::string out = "[";
    for (const std::string& name : names) {
        if (out.size() > 1) out += ',';
        out += json::Quote(name);
    }
    return out + "]";
}

}  // namespace

std::optional<std::string> AllowedLine(std::string_view line, std::vector<std::string>& tokens) {
    tokens.clear();
    const std::vector<std::string_view> parts = Split(line);
    if (parts.empty()) return "an empty console line";
    for (const std::string_view part : parts) {
        if (!IsToken(part)) return "a console line holds a token that is not printable ASCII or too long";
    }
    const std::string_view command = parts[0];
    if (EqualNoCase(command, "reloadloc") && parts.size() == 1) {
        tokens.emplace_back("reloadloc");
        return std::nullopt;
    }
    if (EqualNoCase(command, "reload") && parts.size() == 2) {
        // Only .gui files: never `guianim`, `texture`, `assets` or the other
        // reload targets (H10), and no folder, which `reload` does not take.
        const std::string_view name = parts[1];
        if (!EndsWithNoCase(name, ".gui") || name.size() == 4 || name.find('/') != std::string_view::npos ||
            name.find('\\') != std::string_view::npos) {
            return "reload takes a .gui file name only";
        }
        tokens = {"reload", std::string(name)};
        return std::nullopt;
    }
    if (EqualNoCase(command, "reloadtexture") && parts.size() == 2) {
        tokens = {"reloadtexture", std::string(parts[1])};
        return std::nullopt;
    }
    return "the live game runs reload <file>.gui, reloadloc and reloadtexture <texture> only";
}

bool IsSaveName(std::string_view name) {
    if (name.empty() || name.size() > kMaxSaveName) return false;
    for (const char c : name) {
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-')) {
            return false;
        }
    }
    return true;
}

std::optional<std::string> ReadReloadRequest(const json::Value& request, ReloadRequest& out) {
    out = {};
    if (auto error = ReadStrings(request, "lines", true, AnyLine, out.lines)) return error;
    std::vector<std::string> tokens;
    for (const std::string& line : out.lines) {
        if (auto error = AllowedLine(line, tokens)) return *error + ": " + json::Quote(line);
    }
    if (auto error = ReadStrings(request, "check", false, IsToken, out.check)) return error;
    if (auto error = ReadStrings(request, "close", false, IsToken, out.close)) return error;
    if (auto error = ReadStrings(request, "keep_hidden", false, IsToken, out.keep_hidden)) return error;
    return std::nullopt;
}

StaleCheck CompareRoots(const std::vector<Root>& before, const std::vector<Root>& after,
                        const std::vector<std::string>& files) {
    std::set<std::string> keys;
    for (const std::string& file : files) keys.insert(PathKey(file));
    std::set<std::uint64_t> built;
    StaleCheck out;
    for (const Root& root : before) {
        if (!root.file.empty() && keys.contains(PathKey(root.file)) && built.insert(root.id).second) ++out.checked;
    }
    for (const Root& root : after) {
        if (built.contains(root.id)) out.stale.push_back(root);
    }
    return out;
}

std::string ReloadAnswer(std::uint64_t id, const ReloadResult& result) {
    if (!result.error.empty()) {
        json::Writer w;
        return w.Uint("id", id)
            .Bool("ok", false)
            .Str("error", result.error)
            .Str("message", result.message)
            .Raw("lines", LinesJson(result.lines))
            .Finish();
    }
    json::Writer w = Ok(id);
    w.Raw("lines", LinesJson(result.lines))
        .Raw("closed", NamesJson(result.closed))
        .Raw("hidden_again", NamesJson(result.hidden_again))
        .Bool("tree", result.tree);
    if (result.tree) {
        std::string stale = "[";
        for (const Root& root : result.stale.stale) {
            if (stale.size() > 1) stale += ',';
            json::Writer s;
            stale += s.Str("name", root.name).Bool("visible", root.visible).Finish();
        }
        stale += "]";
        json::Writer roots;
        w.Uint("checked", result.stale.checked)
            .Raw("stale", stale)
            .Raw("roots", roots.Uint("before", result.roots_before).Uint("after", result.roots_after).Finish());
    }
    return w.Fixed("queued_ms", result.queued_ms).Fixed("run_ms", result.run_ms).Finish();
}

std::string SaveAnswer(std::uint64_t id, const SaveResult& result) {
    if (!result.error.empty()) return Error(id, result.error, result.message);
    return Ok(id)
        .Bool("success", result.line.success)
        .Str("text", result.line.text)
        .Fixed("ms", result.line.ms)
        .Fixed("queued_ms", result.queued_ms)
        .Finish();
}

std::optional<Refusal> LiveJobs::Begin() {
    if (faulted_.load()) {
        return Refusal{"console_broken", "a console call faulted earlier; the live game needs a restart"};
    }
    if (const std::optional<GameSession> session = env_.session ? env_.session() : std::nullopt) {
        if (session->multiplayer) return Refusal{"not_available", "reload is not available in multiplayer"};
        if (session->ironman) return Refusal{"not_available", "reload does not work in ironman"};
    }
    bool idle = false;
    if (!busy_.compare_exchange_strong(idle, true)) return Refusal{"busy", "another job of the live game runs"};
    return std::nullopt;
}

bool LiveJobs::Run(const std::vector<std::string>& tokens, LineResult& record, std::string& error,
                   std::string& message) {
    for (const std::string& token : tokens) record.line += (record.line.empty() ? "" : " ") + token;
    const double started = env_.now_ms();
    const ConsoleResult answer = env_.console(tokens);
    record.ms = env_.now_ms() - started;
    record.success = answer.success;
    record.text = answer.text;
    if (answer.faulted) {
        faulted_.store(true);
        error = "console_fault";
        message = "the game's console faulted (exception " + std::to_string(answer.fault_code) + ")";
        return false;
    }
    if (!answer.called) {
        error = "no_console";
        message = "the game's console is not set up yet";
        return false;
    }
    return true;
}

void LiveJobs::RunReload(const ReloadRequest& request, ReloadResult& result) {
    const std::optional<std::vector<Root>> before = env_.roots();
    result.tree = before.has_value();
    if (before) result.roots_before = before->size();
    auto line = [&](std::vector<std::string> tokens) {
        result.lines.emplace_back();
        return Run(tokens, result.lines.back(), result.error, result.message);
    };
    for (const std::string& name : request.close) {
        // Without the tree a close is sent anyway: closing a window that is not open does nothing.
        const Root* root = before ? FindRoot(*before, name) : nullptr;
        if (before && (root == nullptr || !root->visible)) continue;
        if (!line({"window", "close", name})) return;
        result.closed.push_back(name);
    }
    std::vector<std::string> tokens;
    for (const std::string& text : request.lines) {
        AllowedLine(text, tokens);
        if (!line(tokens)) return;
    }
    std::optional<std::vector<Root>> after = env_.roots();
    if (before && after) {
        for (const std::string& name : request.keep_hidden) {
            const Root* was = FindRoot(*before, name);
            const Root* now = FindRoot(*after, name);
            if ((was != nullptr && was->visible) || now == nullptr || !now->visible) continue;
            if (!line({"window", "close", name})) return;
            result.hidden_again.push_back(name);
        }
        if (!result.hidden_again.empty()) after = env_.roots();
    }
    result.tree = before.has_value() && after.has_value();
    if (result.tree) {
        result.stale = CompareRoots(*before, *after, request.check);
        result.roots_after = after->size();
    }
}

std::optional<Refusal> LiveJobs::Reload(ReloadRequest request, std::function<void(const ReloadResult&)> done) {
    if (auto refused = Begin()) return refused;
    const double asked = env_.now_ms();
    auto job = std::make_shared<ReloadRequest>(std::move(request));
    const bool queued = env_.run_on_main([this, job, asked, done = std::move(done)] {
        auto result = std::make_shared<ReloadResult>();
        const double started = env_.now_ms();
        result->queued_ms = started - asked;
        // The session may have changed while the job waited.
        const std::optional<GameSession> session = env_.session ? env_.session() : std::nullopt;
        if (session && (session->multiplayer || session->ironman)) {
            result->error = "not_available";
            result->message =
                session->multiplayer ? "reload is not available in multiplayer" : "reload does not work in ironman";
        } else {
            RunReload(*job, *result);
        }
        result->run_ms = env_.now_ms() - started;
        busy_.store(false);
        env_.run_later([result, done] { done(*result); });
    });
    if (!queued) {
        busy_.store(false);
        return Refusal{"no_main_thread", "the game's main thread does not take work"};
    }
    return std::nullopt;
}

std::optional<Refusal> LiveJobs::Save(std::string name, std::function<void(const SaveResult&)> done) {
    if (auto refused = Begin()) return refused;
    const double asked = env_.now_ms();
    const bool queued = env_.run_on_main([this, name = std::move(name), asked, done = std::move(done)] {
        auto result = std::make_shared<SaveResult>();
        result->queued_ms = env_.now_ms() - asked;
        Run({"savegame", name}, result->line, result->error, result->message);
        busy_.store(false);
        env_.run_later([result, done] { done(*result); });
    });
    if (!queued) {
        busy_.store(false);
        return Refusal{"no_main_thread", "the game's main thread does not take work"};
    }
    return std::nullopt;
}

}  // namespace etch
