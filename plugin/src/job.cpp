#include "job.hpp"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <limits>

namespace etch {
namespace {

// The largest crop side: the largest screen Direct3D 9 gives the game.
constexpr std::uint64_t kMaxSide = 16384;
constexpr std::size_t kMaxNames = 64;
// The longest wait for a show animation.
constexpr std::uint64_t kMaxSettleMs = 5000;

std::optional<std::string> ReadName(const json::Value& request, std::string_view key, std::string& out) {
    const json::Value* member = request.Find(key);
    const std::optional<std::string_view> text = member ? member->AsString() : std::nullopt;
    if (!text || text->empty()) return "\"" + std::string(key) + "\" must be a non-empty string";
    out = *text;
    return std::nullopt;
}

std::optional<std::string> ReadNames(const json::Value& request, std::string_view key, bool required,
                                     std::vector<std::string>& out) {
    const json::Value* member = request.Find(key);
    if (member == nullptr && !required) return std::nullopt;
    const std::vector<json::Value>* items = member ? member->AsArray() : nullptr;
    const std::string error = "\"" + std::string(key) + "\" must be an array of non-empty strings";
    if (items == nullptr || items->size() > kMaxNames || (required && items->empty())) return error;
    for (const json::Value& item : *items) {
        const std::optional<std::string_view> text = item.AsString();
        if (!text || text->empty()) return error;
        out.emplace_back(*text);
    }
    return std::nullopt;
}

bool IsAbsoluteTga(std::string_view path) {
    const bool drive = path.size() > 3 && std::isalpha(static_cast<unsigned char>(path[0])) && path[1] == ':' &&
                       (path[2] == '\\' || path[2] == '/');
    const bool unc = path.size() > 2 && path[0] == '\\' && path[1] == '\\';
    if (!drive && !unc) return false;
    if (path.size() < 4) return false;
    std::string extension(path.substr(path.size() - 4));
    std::transform(extension.begin(), extension.end(), extension.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return extension == ".tga";
}

std::string Join(const std::vector<std::string>& tokens) {
    std::string line;
    for (const std::string& token : tokens) {
        if (!line.empty()) line += ' ';
        line += token;
    }
    return line;
}

std::string RectJson(const Rect& r) {
    return json::Writer().Uint("x", r.x).Uint("y", r.y).Uint("width", r.width).Uint("height", r.height).Finish();
}

std::string CommandsJson(const std::vector<CommandRecord>& commands) {
    std::string out = "[";
    for (const CommandRecord& c : commands) {
        if (out.size() > 1) out += ',';
        out += json::Writer()
                   .Str("line", c.line)
                   .Bool("success", c.success)
                   .Str("text", c.text)
                   .Fixed("ms", c.ms)
                   .Finish();
    }
    return out + "]";
}

std::string TimesJson(const JobResult& r) {
    return json::Writer()
        .Fixed("queued", r.queued_ms)
        .Fixed("commands", r.commands_ms)
        .Fixed("black", r.black_ms)
        .Fixed("white", r.white_ms)
        .Fixed("recover", r.recover_ms)
        .Fixed("write", r.write_ms)
        .Fixed("total", r.total_ms)
        .Finish();
}

}  // namespace

std::optional<std::string> ReadJobRequest(const json::Value& request, JobRequest& out) {
    out = {};
    if (auto error = ReadNames(request, "reload", true, out.reload)) return error;
    if (auto error = ReadNames(request, "textures", false, out.textures)) return error;
    if (const json::Value* member = request.Find("localisation")) {
        const std::optional<bool> value = member->AsBool();
        if (!value) return "\"localisation\" must be true or false";
        out.localisation = *value;
    }
    if (auto error = ReadName(request, "black", out.black)) return error;
    if (auto error = ReadName(request, "white", out.white)) return error;
    const json::Value* crop = request.Find("crop");
    if (crop == nullptr || !crop->IsObject()) return "\"crop\" must be an object";
    std::uint32_t* const sides[] = {&out.crop.x, &out.crop.y, &out.crop.width, &out.crop.height};
    const char* const keys[] = {"x", "y", "width", "height"};
    for (int i = 0; i < 4; ++i) {
        const json::Value* member = crop->Find(keys[i]);
        const std::optional<std::uint64_t> value = member ? member->AsUint() : std::nullopt;
        if (!value || *value > kMaxSide || (i >= 2 && *value == 0)) {
            return std::string("\"crop.") + keys[i] + "\" must be a whole number from " + (i >= 2 ? "1" : "0") +
                   " to " + std::to_string(kMaxSide);
        }
        *sides[i] = static_cast<std::uint32_t>(*value);
    }
    if (const json::Value* member = request.Find("settle_ms")) {
        const std::optional<std::uint64_t> value = member->AsUint();
        if (!value || *value > kMaxSettleMs) {
            return "\"settle_ms\" must be a whole number from 0 to " + std::to_string(kMaxSettleMs);
        }
        out.settle_ms = static_cast<std::uint32_t>(*value);
    }
    if (auto error = ReadName(request, "output", out.output)) return error;
    if (!IsAbsoluteTga(out.output)) return "\"output\" must be an absolute path ending in .tga";
    return std::nullopt;
}

Bgra RecoverStraight(const Bgra& black, const Bgra& white) {
    Bgra out;
    out.width = black.width;
    out.height = black.height;
    const std::size_t count = static_cast<std::size_t>(black.width) * black.height;
    out.pixels.resize(count * 4);
    for (std::size_t i = 0; i < count; ++i) {
        const std::uint8_t* b = &black.pixels[i * 4];
        const std::uint8_t* w = &white.pixels[i * 4];
        // 3 · (255 − (W − B)), summed over the colour channels.
        int sum = 0;
        for (int c = 0; c < 3; ++c) sum += 255 - (static_cast<int>(w[c]) - static_cast<int>(b[c]));
        // Rounded half up: ⌊sum / 3 + ½⌋.
        const int alpha = std::clamp((2 * sum + 3) / 6, 0, 255);
        std::uint8_t* o = &out.pixels[i * 4];
        for (int c = 0; c < 3; ++c) {
            // ⌊B · 255 / a + ½⌋, at most 255.
            o[c] = alpha == 0 ? 0 : static_cast<std::uint8_t>(std::min(255, (b[c] * 510 + alpha) / (2 * alpha)));
        }
        o[3] = static_cast<std::uint8_t>(alpha);
    }
    return out;
}

std::string TgaFile(const Bgra& image) {
    std::string out(18, '\0');
    out[2] = 2;  // uncompressed true colour
    out[12] = static_cast<char>(image.width & 0xFF);
    out[13] = static_cast<char>((image.width >> 8) & 0xFF);
    out[14] = static_cast<char>(image.height & 0xFF);
    out[15] = static_cast<char>((image.height >> 8) & 0xFF);
    out[16] = 32;
    out[17] = 0x28;  // 8 alpha bits, rows top first
    out.append(reinterpret_cast<const char*>(image.pixels.data()), image.pixels.size());
    return out;
}

std::string JobAnswer(std::uint64_t id, const JobResult& r) {
    json::Writer w;
    w.Uint("id", id);
    if (r.error.empty()) {
        w.Bool("ok", true)
            .Str("output", r.output)
            .Raw("crop", RectJson(r.crop))
            .Raw("frames", json::Writer().Uint("black", r.black_frame).Uint("white", r.white_frame).Finish());
    } else {
        w.Bool("ok", false).Str("error", r.error).Str("message", r.message);
    }
    return w.Raw("ms", TimesJson(r)).Raw("commands", CommandsJson(r.commands)).Finish();
}

std::optional<Refusal> JobRunner::Start(JobRequest request, std::function<void(const JobResult&)> done) {
    if (faulted_.load()) {
        return Refusal{"game_fault", "a console call faulted earlier; the game host must be restarted"};
    }
    int idle = kIdle;
    if (!state_.compare_exchange_strong(idle, kQueued)) return Refusal{"busy", "a preview job is running"};
    request_ = std::move(request);
    done_ = std::move(done);
    result_ = {};
    result_.output = request_.output;
    black_ = {};
    white_ = {};
    started_ = env_.now_ms();
    if (!env_.run_on_main([this] { Commands(); })) {
        state_.store(kIdle);
        return Refusal{"not_ready", "the game's main thread takes no work"};
    }
    return std::nullopt;
}

bool JobRunner::Capturing() const {
    const int state = state_.load(std::memory_order_relaxed);
    return state == kCaptureBlack || state == kCaptureWhite;
}

bool JobRunner::Run(std::vector<std::string> tokens, ConsoleResult& result) {
    const double started = env_.now_ms();
    result = env_.console(tokens);
    CommandRecord record;
    record.line = Join(tokens);
    record.success = result.success;
    record.text = result.text;
    record.ms = env_.now_ms() - started;
    result_.commands.push_back(std::move(record));
    if (result.faulted) {
        faulted_.store(true);
        return false;
    }
    return true;
}

void JobRunner::Commands() {
    const double started = env_.now_ms();
    result_.queued_ms = started - started_;
    ConsoleResult r;
    if (!open_.empty()) {
        // Closing a window that is not open is harmless (etch#22); its answer does not matter.
        if (!Run({"window", "close", open_}, r)) return Faulted(r);
        if (!r.called) return Fail("console_unavailable", "the game's console is not set up yet");
        open_.clear();
    }
    for (const std::string& file : request_.reload) {
        if (!Run({"reload", file}, r)) return Faulted(r);
        if (!r.called) return Fail("console_unavailable", "the game's console is not set up yet");
        if (!r.success) return Refused("reload_failed");
    }
    // A texture or localisation that does not reload leaves the old one on screen; the job goes on
    // and the extension reports the answer.
    if (request_.localisation && !Run({"reloadloc"}, r)) return Faulted(r);
    if (!Run({"window", "open", request_.black}, r)) return Faulted(r);
    if (!r.called) return Fail("console_unavailable", "the game's console is not set up yet");
    if (!r.success) return Refused("open_failed");
    open_ = request_.black;
    // `reloadtexture` finds only a texture the game holds: closing the wrapper drops its textures,
    // and the open loads them again (etch#117).
    for (const std::string& texture : request_.textures) {
        if (!Run({"reloadtexture", texture}, r)) return Faulted(r);
    }
    result_.commands_ms = env_.now_ms() - started;
    Arm(kCaptureBlack);
}

void JobRunner::OpenWhite() {
    ConsoleResult r;
    if (!Run({"window", "open", request_.white}, r)) return Faulted(r);
    if (!r.success) return Refused("open_failed");
    // `window open` closes the window opened before it (etch#22).
    open_ = request_.white;
    Arm(kCaptureWhite);
}

void JobRunner::Faulted(const ConsoleResult& r) {
    char code[16];
    std::snprintf(code, sizeof code, "0x%08X", r.fault_code);
    Fail("game_fault", "the console call \"" + result_.commands.back().line + "\" faulted (exception " + code + ")");
}

void JobRunner::Refused(const char* code) {
    const CommandRecord& last = result_.commands.back();
    Fail(code, "\"" + last.line + "\" answered: " + (last.text.empty() ? "nothing" : last.text));
}

void JobRunner::Arm(State capture) {
    armed_at_ = env_.now_ms();
    due_at_ = armed_at_ + request_.settle_ms;
    due_frame_.store(0);
    state_.store(capture);
}

void JobRunner::OnPresent(const std::function<Grab(const Rect& crop)>& grab) {
    int state = state_.load();
    if (state != kCaptureBlack && state != kCaptureWhite) return;
    // A window with a show animation reaches its place only after it.
    if (env_.now_ms() < due_at_) return;
    const bool black = state == kCaptureBlack;
    if (!state_.compare_exchange_strong(state, black ? kGrabBlack : kGrabWhite)) return;
    Grab g = grab(request_.crop);
    const double now = env_.now_ms();
    if (!g.error.empty()) {
        state_.store(kFinishing);
        return Fail("capture_failed", g.error);
    }
    result_.crop = g.crop;
    if (black) {
        result_.black_ms = now - armed_at_;
        result_.black_frame = env_.frame();
        black_ = std::move(g.image);
        state_.store(kBetween);
        if (!env_.run_on_main([this] { OpenWhite(); })) {
            state_.store(kFinishing);
            Fail("not_ready", "the game's main thread takes no work");
        }
    } else {
        result_.white_ms = now - armed_at_;
        result_.white_frame = env_.frame();
        white_ = std::move(g.image);
        state_.store(kFinishing);
        env_.run_later([this] { Compose(); });
    }
}

void JobRunner::OnFrame(std::uint64_t frame) {
    int state = state_.load();
    if (state != kCaptureBlack && state != kCaptureWhite) return;
    if (env_.now_ms() < due_at_) return;
    std::uint64_t due = due_frame_.load();
    if (due == 0) {
        due_frame_.store(frame);
        return;
    }
    if (frame < due + kCaptureFrames) return;
    if (!state_.compare_exchange_strong(state, kFinishing)) return;
    Fail("capture_timeout", "no Present drew the " + std::string(state == kCaptureBlack ? "black" : "white") +
                                " wrapper within " + std::to_string(kCaptureFrames) + " frames");
}

void JobRunner::Compose() {
    if (black_.width != white_.width || black_.height != white_.height ||
        black_.pixels.size() != white_.pixels.size()) {
        return Fail("capture_failed", "the black and the white crop differ in size");
    }
    double t = env_.now_ms();
    const Bgra straight = RecoverStraight(black_, white_);
    result_.recover_ms = env_.now_ms() - t;
    t = env_.now_ms();
    std::string error;
    const bool written = env_.write_file(request_.output, TgaFile(straight), error);
    result_.write_ms = env_.now_ms() - t;
    if (!written) return Fail("write_failed", error);
    Finish();
}

void JobRunner::Fail(std::string code, std::string message) {
    state_.store(kFinishing);
    result_.error = std::move(code);
    result_.message = std::move(message);
    env_.run_later([this] { Finish(); });
}

void JobRunner::Finish() {
    result_.total_ms = env_.now_ms() - started_;
    const JobResult result = std::move(result_);
    const auto done = std::move(done_);
    black_ = {};
    white_ = {};
    result_ = {};
    done_ = {};
    // Idle before the answer, so that the extension's next job is not refused as busy.
    state_.store(kIdle);
    if (done) done(result);
}

}  // namespace etch
