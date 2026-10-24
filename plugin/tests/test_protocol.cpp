#include "json.hpp"
#include "protocol.hpp"

#include <cassert>
#include <cstdio>
#include <string>

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
    const Reply hello = c.Handle(R"({"id":2,"type":"hello","protocol":1,"client":"etch 0.3.0"})");
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
    AssertError(c.Handle(R"({"id":3,"type":"hello","protocol":1})"), "already_greeted", true, 3);
}

void TestProtocolMismatch() {
    const etch::Host host = TestHost();
    Connection c(host);
    const Reply r = c.Handle(R"({"id":5,"type":"hello","protocol":2})");
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
    assert(!c.Handle(R"({"id":0,"type":"hello","protocol":1})").close);
    g_ready = true;
    g_frame = 1234;
    Value a = Answer(c.Handle("{\"type\":\"ping\",\"id\":9007199254740991}\r"));
    assert(a.Find("id")->AsUint() == 9007199254740991u);
    assert(a.Find("ok")->AsBool() == true);
    assert(a.Find("ready")->AsBool() == true);
    assert(a.Find("frame")->AsUint() == 1234u);
    g_frame = 1240;
    a = Answer(c.Handle(R"({"id":10,"type":"ping"})"));
    assert(a.Find("frame")->AsUint() == 1240u);
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
    assert(!c.Handle(R"({"id":1,"type":"hello","protocol":1})").close);
    AssertError(c.Handle(R"({"id":11,"type":"job"})"), "unknown_type", true, 11);
    const Reply too_long = c.LineTooLong();
    assert(too_long.close);
    AssertError(too_long, "line_too_long", false);
}

}  // namespace

int main() {
    TestHandshake();
    TestProtocolMismatch();
    TestPing();
    TestBadRequests();
    std::puts("protocol: ok");
    return 0;
}
