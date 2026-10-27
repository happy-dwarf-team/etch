#include "protocol.hpp"

#include <optional>

namespace etch {
namespace {

// {"id":<id or null>,"ok":false,"error":"<code>","message":"..."}
std::string Error(std::optional<std::uint64_t> id, std::string_view code, std::string_view message) {
    json::Writer w;
    if (id) {
        w.Uint("id", *id);
    } else {
        w.Null("id");
    }
    return w.Bool("ok", false).Str("error", code).Str("message", message).Finish();
}

json::Writer Ok(std::uint64_t id) {
    json::Writer w;
    w.Uint("id", id).Bool("ok", true);
    return w;
}

}  // namespace

Reply Connection::Handle(std::string_view line) {
    if (!line.empty() && line.back() == '\r') line.remove_suffix(1);
    const json::ParseResult parsed = json::Parse(line);
    if (!parsed.value) return {Error(std::nullopt, "bad_json", parsed.error)};
    const json::Value& request = *parsed.value;
    if (!request.IsObject()) return {Error(std::nullopt, "bad_request", "a request is a JSON object")};
    const json::Value* id_member = request.Find("id");
    const std::optional<std::uint64_t> id = id_member ? id_member->AsUint() : std::nullopt;
    if (!id) return {Error(std::nullopt, "bad_request", "\"id\" must be a whole number from 0 to 2^53 - 1")};
    const json::Value* type_member = request.Find("type");
    const std::optional<std::string_view> type = type_member ? type_member->AsString() : std::nullopt;
    if (!type) return {Error(id, "bad_request", "\"type\" must be a string")};

    if (*type == "hello") return Hello(*id, request);
    if (!greeted_) return {Error(id, "handshake_required", "send hello first")};
    if (*type == "ping") return Ping(*id);
    if (*type == "reload") return Reload(*id, request);
    if (*type == "save") return Save(*id);
    if (*type == "confirm") return Confirm(*id, request);
    return {Error(id, "unknown_type", "unknown request type")};
}

Reply Connection::LineTooLong() const {
    return {Error(std::nullopt, "line_too_long", "a request line is at most 65536 bytes"), true};
}

Reply Connection::Hello(std::uint64_t id, const json::Value& request) {
    if (greeted_) return {Error(id, "already_greeted", "hello was already answered on this connection")};
    const json::Value* protocol_member = request.Find("protocol");
    const std::optional<std::uint64_t> protocol = protocol_member ? protocol_member->AsUint() : std::nullopt;
    if (!protocol) return {Error(id, "bad_request", "\"protocol\" must be a whole number")};
    if (*protocol != kProtocolVersion) {
        json::Writer w;
        const std::string line = w.Uint("id", id)
                                     .Bool("ok", false)
                                     .Str("error", "protocol_mismatch")
                                     .Str("message", "this plugin speaks another protocol version")
                                     .Uint("protocol", kProtocolVersion)
                                     .Str("plugin", host_.plugin_version)
                                     .Finish();
        return {line, true};
    }
    greeted_ = true;
    return {Ok(id)
                .Uint("protocol", kProtocolVersion)
                .Str("plugin", host_.plugin_version)
                .Str("session", host_.session)
                .Uint("pid", host_.pid)
                .Uint("process_start_ms", host_.process_start_ms)
                .Bool("ready", host_.ready())
                .Uint("frame", host_.frame())
                .Bool("tree", host_.tree)
                .Finish()};
}

Reply Connection::Ping(std::uint64_t id) const {
    json::Writer w = Ok(id);
    w.Bool("ready", host_.ready())
        .Uint("frame", host_.frame())
        .Bool("responding", !host_.responding || host_.responding())
        .Bool("busy", host_.jobs != nullptr && host_.jobs->Busy());
    const std::optional<GameSession> session = host_.game_session ? host_.game_session() : std::nullopt;
    if (session) {
        json::Writer s;
        w.Raw("game_session", s.Bool("ironman", session->ironman)
                                  .Bool("multiplayer", session->multiplayer)
                                  .Uint("number", session->number)
                                  .Finish());
    } else {
        w.Null("game_session");
    }
    return {w.Finish()};
}

Reply Connection::Reload(std::uint64_t id, const json::Value& request) {
    ReloadRequest reload;
    if (const std::optional<std::string> error = ReadReloadRequest(request, reload)) {
        return {Error(id, "bad_request", *error)};
    }
    if (host_.jobs == nullptr || !host_.ready()) return {Error(id, "not_ready", "the live game is not ready")};
    const Send send = send_;
    const std::optional<Refusal> refused = host_.jobs->Reload(std::move(reload), [send, id](const ReloadResult& r) {
        if (send) send(ReloadAnswer(id, r));
    });
    if (refused) return {Error(id, refused->code, refused->message)};
    return {};  // answered when the main thread ran it
}

Reply Connection::Save(std::uint64_t id) {
    if (host_.jobs == nullptr || !host_.ready()) return {Error(id, "not_ready", "the live game is not ready")};
    if (!host_.game_session || !host_.game_session()) {
        return {Error(id, "not_in_game", "the live game has no game loaded to save")};
    }
    const Send send = send_;
    const std::optional<Refusal> refused = host_.jobs->Save([send, id](const SaveResult& r) {
        if (send) send(SaveAnswer(id, r));
    });
    if (refused) return {Error(id, refused->code, refused->message)};
    return {};
}

Reply Connection::Confirm(std::uint64_t id, const json::Value& request) {
    const json::Value* path_member = request.Find("path");
    const std::optional<std::string_view> path = path_member ? path_member->AsString() : std::nullopt;
    if (!path || !IsConfirmPath(*path)) {
        return {Error(id, "bad_request", "\"path\" must be a prompt button the live game answers")};
    }
    if (host_.jobs == nullptr || !host_.ready()) return {Error(id, "not_ready", "the live game is not ready")};
    const Send send = send_;
    const std::optional<Refusal> refused = host_.jobs->Confirm(std::string(*path), [send, id](const ConfirmResult& r) {
        if (send) send(ConfirmAnswer(id, r));
    });
    if (refused) return {Error(id, refused->code, refused->message)};
    return {};
}

}  // namespace etch
