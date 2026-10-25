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
    AssertError(c.Handle(R"({"id":11,"type":"jobs"})"), "unknown_type", true, 11);
    const Reply too_long = c.LineTooLong();
    assert(too_long.close);
    AssertError(too_long, "line_too_long", false);
}

const char* const kJob =
    R"({"id":12,"type":"job","reload":["etch_a.gui","etchw_a.gui"],"black":"etch_a_backdrop",)"
    R"("white":"etchw_a_backdrop","crop":{"x":1,"y":2,"width":3,"height":4},"output":"C:/c/job-12.tga"})";

void TestJob() {
    etch::Host host = TestHost();
    std::vector<std::string> sent;
    Connection c(host, [&](const std::string& line) { sent.push_back(line); });
    assert(!c.Handle(R"({"id":1,"type":"hello","protocol":1})").close);
    // No jobs before the game is ready, and none from a plugin that takes none.
    g_ready = true;
    AssertError(c.Handle(kJob), "not_ready", true, 12);
    std::function<void(const etch::JobResult&)> finish;
    etch::JobRequest started;
    std::optional<etch::Refusal> refusal;
    host.start_job = [&](etch::JobRequest request, std::function<void(const etch::JobResult&)> done) {
        started = std::move(request);
        finish = std::move(done);
        return refusal;
    };
    g_ready = false;
    AssertError(c.Handle(kJob), "not_ready", true, 12);
    g_ready = true;
    AssertError(c.Handle(R"({"id":13,"type":"job","reload":["a.gui"]})"), "bad_request", true, 13);
    assert(!finish);
    // Accepted: no answer now; the answer goes out through Send when the job ends.
    const Reply accepted = c.Handle(kJob);
    assert(accepted.line.empty() && !accepted.close);
    assert(started.black == "etch_a_backdrop" && started.crop.height == 4);
    assert(sent.empty());
    etch::JobResult result;
    result.output = started.output;
    result.crop = started.crop;
    finish(result);
    assert(sent.size() == 1);
    const Value a = Answer({sent[0]});
    assert(a.Find("id")->AsUint() == 12u);
    assert(a.Find("ok")->AsBool() == true);
    assert(a.Find("output")->AsString() == "C:/c/job-12.tga");
    // A refusal is answered at once.
    refusal = etch::Refusal{"busy", "a preview job is running"};
    AssertError(c.Handle(kJob), "busy", true, 12);
}

}  // namespace

int main() {
    TestHandshake();
    TestProtocolMismatch();
    TestPing();
    TestBadRequests();
    TestJob();
    std::puts("protocol: ok");
    return 0;
}
