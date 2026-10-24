#include "json.hpp"

#include <cassert>
#include <cstdio>
#include <string>

using etch::json::Parse;
using etch::json::Value;

namespace {

bool Fails(const char* text) { return !Parse(text).value.has_value(); }

void TestValues() {
    const char* text = R"( {"id": 7, "type": "ping", "flag": true, "none": null, "list": [1, 2.5, "x"], "o": {}} )";
    const auto r = Parse(text);
    assert(r.value && r.error.empty());
    const Value& v = *r.value;
    assert(v.IsObject());
    assert(v.Find("id")->AsUint() == 7u);
    assert(v.Find("type")->AsString() == "ping");
    assert(v.Find("flag")->AsBool() == true);
    assert(v.Find("none")->kind() == Value::Kind::Null);
    assert(v.Find("list")->kind() == Value::Kind::Array);
    assert(v.Find("o")->IsObject());
    assert(v.Find("missing") == nullptr);
    assert(!v.Find("type")->AsUint());
    assert(!v.Find("id")->AsString());
}

void TestNumbers() {
    assert(Parse("0").value->AsUint() == 0u);
    assert(Parse("9007199254740991").value->AsUint() == 9007199254740991u);
    assert(!Parse("9007199254740992").value->AsUint());
    assert(!Parse("-1").value->AsUint());
    assert(!Parse("1.5").value->AsUint());
    assert(Parse("1e3").value->AsUint() == 1000u);
    assert(Fails("01"));
    assert(Fails("1."));
    assert(Fails("-"));
    assert(Fails("+1"));
    assert(Fails("1e"));
}

// A JSON escape: backslash, then `rest` ("u00e9", "x").
std::string Escape(const char* rest) { return std::string(1, '\\') + rest; }
std::string Quoted(const std::string& inner) { return "\"" + inner + "\""; }

void TestStrings() {
    // MSVC's assert cannot stringize raw literals, so the inputs live outside it.
    const std::string escapes = R"("a\"b\\c\/d\n")";
    const std::string e_acute = Quoted(Escape("u00e9"));
    const std::string pair = Quoted(Escape("ud83d") + Escape("ude00"));
    const std::string high_alone = Quoted(Escape("ud83d"));
    const std::string low_alone = Quoted(Escape("ude00"));
    const std::string unknown = Quoted(Escape("x"));
    assert(Parse(escapes).value->AsString() == "a\"b\\c/d\n");
    assert(Parse(e_acute).value->AsString() == "\xC3\xA9");
    assert(Parse(pair).value->AsString() == "\xF0\x9F\x98\x80");
    assert(Parse("\"\xC3\xA9\"").value->AsString() == "\xC3\xA9");  // raw UTF-8 passes through
    assert(Fails(high_alone.c_str()));
    assert(Fails(low_alone.c_str()));
    assert(Fails(unknown.c_str()));
    assert(Fails("\"a\tb\""));
    assert(Fails("\"open"));
}

void TestStructure() {
    assert(Fails(""));
    assert(Fails("{"));
    assert(Fails("{\"a\":1,}"));
    assert(Fails("{\"a\" 1}"));
    assert(Fails("{\"a\":1,\"a\":2}"));
    assert(Fails("[1,]"));
    assert(Fails("{} {}"));
    assert(Fails("tru"));
    assert(Fails("nul"));
    std::string deep(33, '[');
    deep += std::string(33, ']');
    assert(Fails(deep.c_str()));
    std::string ok(32, '[');
    ok += std::string(32, ']');
    assert(!Fails(ok.c_str()));
    assert(Parse("{oops}").error.find("byte 1") != std::string::npos);
}

void TestWriter() {
    etch::json::Writer w;
    const std::string s = w.Uint("id", 3).Bool("ok", true).Str("m", "a\"\\\n\x01").Null("n").Raw("r", "[1]").Finish();
    const std::string expected = R"({"id":3,"ok":true,"m":"a\"\\\n)" + Escape("u0001") + R"(","n":null,"r":[1]})";
    assert(s == expected);
    assert(etch::json::Writer().Finish() == "{}");
    // What the writer quotes, the reader reads back.
    assert(Parse(etch::json::Quote("x\"y\\z\t\x1f\xC3\xA9")).value->AsString() == "x\"y\\z\t\x1f\xC3\xA9");
}

}  // namespace

int main() {
    TestValues();
    TestNumbers();
    TestStrings();
    TestStructure();
    TestWriter();
    std::puts("json: ok");
    return 0;
}
