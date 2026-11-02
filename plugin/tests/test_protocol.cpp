#include "json.hpp"
#include "protocol.hpp"

#include <cassert>
#include <cstdio>
#include <functional>
#include <optional>
#include <string>
#include <vector>

using etch::Connection;
using etch::Reply;
using etch::json::Parse;
using etch::json::Value;

namespace {

bool g_ready = false;
std::uint64_t g_frame = 0;

etch::Host TestHost() {
    etch::Host host;
    host.ready = [] { return g_ready; };
    host.frame = [] { return g_frame; };
    host.pid = 4242;
    host.process_start_ms = 1761400000123;
    host.session = "0123456789abcdef0123456789abcdef";
    host.plugin_version = "9.8.7";
    return host;
}

Value Answer(const Reply& reply) {
    const auto parsed = Parse(reply.line);
    assert(parsed.value && parsed.value->IsObject());
    return *parsed.value;
}

void AssertError(const Reply& reply, const char* code, bool has_id, std::uint64_t id = 0) {
    const Value a = Answer(reply);
    assert(a.Find("ok")->AsBool() == false);
    assert(a.Find("error")->AsString() == code);
    assert(a.Find("message")->AsString().has_value());
    if (has_id) {
        assert(a.Find("id")->AsUint() == id);
    } else {
        assert(a.Find("id")->kind() == Value::Kind::Null);
    }
}

void TestHandshake() {
    const etch::Host host = TestHost();
    Connection c(host);
    AssertError(c.Handle(R"({"id":1,"type":"ping"})"), "handshake_required", true, 1);
    g_ready = false;
    g_frame = 0;
    const Reply hello = c.Handle(R"({"id":2,"type":"hello","protocol":2,"client":"etch 0.3.0"})");
    assert(!hello.close);
    const Value a = Answer(hello);
    assert(a.Find("id")->AsUint() == 2u);
    assert(a.Find("ok")->AsBool() == true);
    assert(a.Find("protocol")->AsUint() == etch::kProtocolVersion);
    assert(a.Find("plugin")->AsString() == "9.8.7");
    assert(a.Find("session")->AsString() == "0123456789abcdef0123456789abcdef");
    assert(a.Find("pid")->AsUint() == 4242u);
    assert(a.Find("process_start_ms")->AsUint() == 1761400000123u);
    assert(a.Find("ready")->AsBool() == false);
    assert(a.Find("frame")->AsUint() == 0u);
    assert(a.Find("tree")->AsBool() == false);
    AssertError(c.Handle(R"({"id":3,"type":"hello","protocol":2})"), "already_greeted", true, 3);
}

void TestProtocolMismatch() {
    const etch::Host host = TestHost();
    Connection c(host);
    // Etch 1.x's protocol.
    const Reply r = c.Handle(R"({"id":5,"type":"hello","protocol":1})");
    assert(r.close);
    AssertError(r, "protocol_mismatch", true, 5);
    assert(Answer(r).Find("protocol")->AsUint() == etch::kProtocolVersion);
    assert(Answer(r).Find("plugin")->AsString() == "9.8.7");
    AssertError(c.Handle(R"({"id":6,"type":"ping"})"), "handshake_required", true, 6);
    AssertError(c.Handle(R"({"id":7,"type":"hello"})"), "bad_request", true, 7);
    AssertError(c.Handle(R"({"id":8,"type":"hello","protocol":"1"})"), "bad_request", true, 8);
}

void TestPing() {
    const etch::Host host = TestHost();
    Connection c(host);
    assert(!c.Handle(R"({"id":0,"type":"hello","protocol":2})").close);
    g_ready = true;
    g_frame = 1234;
    Value a = Answer(c.Handle("{\"type\":\"ping\",\"id\":9007199254740991}\r"));
    assert(a.Find("id")->AsUint() == 9007199254740991u);
    assert(a.Find("ok")->AsBool() == true);
    assert(a.Find("ready")->AsBool() == true);
    assert(a.Find("frame")->AsUint() == 1234u);
    // Without a window check, a session or jobs: responding, in the menu, not busy.
    assert(a.Find("responding")->AsBool() == true);
    assert(a.Find("busy")->AsBool() == false);
    assert(a.Find("game_session")->kind() == Value::Kind::Null);
    g_frame = 1240;
    a = Answer(c.Handle(R"({"id":10,"type":"ping"})"));
    assert(a.Find("frame")->AsUint() == 1240u);
}

void TestPingSession() {
    etch::Host host = TestHost();
    host.responding = [] { return false; };
    host.game_session = [] { return std::optional<etch::GameSession>(etch::GameSession{true, false, 3}); };
    Connection c(host);
    assert(!c.Handle(R"({"id":0,"type":"hello","protocol":2})").close);
    const Value a = Answer(c.Handle(R"({"id":1,"type":"ping"})"));
    assert(a.Find("responding")->AsBool() == false);
    const Value* session = a.Find("game_session");
    assert(session != nullptr && session->IsObject());
    assert(session->Find("ironman")->AsBool() == true);
    assert(session->Find("multiplayer")->AsBool() == false);
    assert(session->Find("number")->AsUint() == 3u);
    // Without tongs.navigation, or with no province on screen: null.
    assert(a.Find("province_view")->kind() == Value::Kind::Null);
}

void TestPingProvinceView() {
    etch::Host host = TestHost();
    etch::ProvinceView view{295, 295, true, false, false};
    host.province_view = [&view] { return std::optional<etch::ProvinceView>(view); };
    Connection c(host);
    assert(!c.Handle(R"({"id":0,"type":"hello","protocol":2})").close);
    Value a = Answer(c.Handle(R"({"id":1,"type":"ping"})"));
    const Value* shown = a.Find("province_view");
    assert(shown != nullptr && shown->IsObject());
    assert(shown->Find("province")->AsUint() == 295u && shown->Find("window")->AsString() == "provinceview");
    view = {1161, 1161, false, true, false};
    a = Answer(c.Handle(R"({"id":2,"type":"ping"})"));
    assert(a.Find("province_view")->Find("window")->AsString() == "colonisationpanel");
    // The view closed: the province it showed stays in the selection, but none is on screen.
    view = {1161, 1161, false, false, false};
    a = Answer(c.Handle(R"({"id":3,"type":"ping"})"));
    assert(a.Find("province_view")->kind() == Value::Kind::Null);
}

void TestJobsRefused() {
    etch::Host host = TestHost();
    Connection c(host);
    assert(!c.Handle(R"({"id":0,"type":"hello","protocol":2})").close);
    g_ready = true;
    // Lines the live game never runs (H10), and malformed members.
    AssertError(c.Handle(R"({"id":1,"type":"reload","lines":["reload guianim"]})"), "bad_request", true, 1);
    AssertError(c.Handle(R"({"id":2,"type":"reload","lines":["reload texture"]})"), "bad_request", true, 2);
    AssertError(c.Handle(R"({"id":3,"type":"reload","lines":["reload assets"]})"), "bad_request", true, 3);
    AssertError(c.Handle(R"({"id":4,"type":"reload","lines":["debug_crash"]})"), "bad_request", true, 4);
    AssertError(c.Handle(R"({"id":5,"type":"reload","lines":[]})"), "bad_request", true, 5);
    AssertError(c.Handle(R"({"id":6,"type":"reload","lines":["reloadloc"],"close":[1]})"), "bad_request", true, 6);
    AssertError(c.Handle(R"({"id":10,"type":"confirm","path":"DefaultConfirm/CancelButton"})"), "bad_request", true,
                10);
    // A host without jobs refuses them.
    AssertError(c.Handle(R"({"id":8,"type":"reload","lines":["reload provinceview.gui"]})"), "not_ready", true, 8);
    AssertError(c.Handle(R"({"id":9,"type":"save"})"), "not_ready", true, 9);
    // reselect takes a province id from 1; a reload's `reselect` is a boolean.
    for (const char* bad :
         {R"({"id":11,"type":"reselect"})", R"({"id":11,"type":"reselect","province":0})",
          R"({"id":11,"type":"reselect","province":-3})", R"({"id":11,"type":"reselect","province":"295"})",
          R"({"id":11,"type":"reselect","province":4294967296})"}) {
        AssertError(c.Handle(bad), "bad_request", true, 11);
    }
    AssertError(c.Handle(R"({"id":12,"type":"reselect","province":295})"), "not_ready", true, 12);
    AssertError(c.Handle(R"({"id":13,"type":"reload","lines":["reloadloc"],"reselect":1})"), "bad_request", true, 13);
}

void TestBadRequests() {
    const etch::Host host = TestHost();
    Connection c(host);
    AssertError(c.Handle("not json"), "bad_json", false);
    AssertError(c.Handle("[1]"), "bad_request", false);
    AssertError(c.Handle(R"({"type":"ping"})"), "bad_request", false);
    AssertError(c.Handle(R"({"id":-1,"type":"ping"})"), "bad_request", false);
    AssertError(c.Handle(R"({"id":1.5,"type":"ping"})"), "bad_request", false);
    AssertError(c.Handle(R"({"id":"1","type":"ping"})"), "bad_request", false);
    AssertError(c.Handle(R"({"id":4})"), "bad_request", true, 4);
    AssertError(c.Handle(R"({"id":4,"type":7})"), "bad_request", true, 4);
    assert(!c.Handle(R"({"id":1,"type":"hello","protocol":2})").close);
    AssertError(c.Handle(R"({"id":11,"type":"jobs"})"), "unknown_type", true, 11);
    // Etch 1.x's preview job is gone (ADR 0005).
    AssertError(c.Handle(R"({"id":12,"type":"job","reload":["a.gui"]})"), "unknown_type", true, 12);
    const Reply too_long = c.LineTooLong();
    assert(too_long.close);
    AssertError(too_long, "line_too_long", false);
}

}  // namespace

int main() {
    TestHandshake();
    TestProtocolMismatch();
    TestPing();
    TestPingSession();
    TestPingProvinceView();
    TestJobsRefused();
    TestBadRequests();
    std::puts("protocol: ok");
    return 0;
}
