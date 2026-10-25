#pragma once

// A small JSON reader for requests and a writer for answers. Requests are
// short lines from Etch, so the reader keeps the whole value in memory and
// gives up at a depth of 32.

#include <cstdint>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace etch::json {

class Value {
public:
    enum class Kind { Null, Bool, Number, String, Array, Object };

    Value() = default;
    static Value Bool(bool v);
    static Value Number(double v);
    static Value String(std::string v);
    static Value Array(std::vector<Value> items);
    static Value Object(std::map<std::string, Value, std::less<>> members);

    Kind kind() const { return kind_; }
    bool IsObject() const { return kind_ == Kind::Object; }

    // The member `key` of an object, or nullptr (also when this is no object).
    const Value* Find(std::string_view key) const;
    // A string, or nullopt for any other kind.
    std::optional<std::string_view> AsString() const;
    // A whole number in [0, 2^53 - 1] (the integers a JavaScript client keeps
    // exact), or nullopt.
    std::optional<std::uint64_t> AsUint() const;
    std::optional<bool> AsBool() const;
    // The items of an array, or nullptr for any other kind.
    const std::vector<Value>* AsArray() const;

private:
    Kind kind_ = Kind::Null;
    bool bool_ = false;
    double number_ = 0;
    std::string string_;
    std::shared_ptr<const std::vector<Value>> array_;
    std::shared_ptr<const std::map<std::string, Value, std::less<>>> object_;
};

struct ParseResult {
    std::optional<Value> value;
    std::string error;  // why value is empty, with the byte offset
};

// Parses one JSON text (RFC 8259) with nothing but whitespace around it.
ParseResult Parse(std::string_view text);

// `text` as a JSON string literal, quotes included. Bytes from 0x80 up are
// copied as they are, so UTF-8 stays UTF-8.
std::string Quote(std::string_view text);

// Builds one JSON object member by member: {"a":1,"b":"x"}.
class Writer {
public:
    Writer& Raw(std::string_view key, std::string_view json);
    Writer& Str(std::string_view key, std::string_view value);
    Writer& Uint(std::string_view key, std::uint64_t value);
    // A number with up to three decimals, such as a time in milliseconds.
    Writer& Fixed(std::string_view key, double value);
    Writer& Bool(std::string_view key, bool value);
    Writer& Null(std::string_view key);
    std::string Finish() const { return out_ + "}"; }

private:
    std::string out_ = "{";
};

}  // namespace etch::json
