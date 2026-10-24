#include "json.hpp"

#include <charconv>
#include <cmath>
#include <cstdio>

namespace etch::json {

Value Value::Bool(bool v) {
    Value out;
    out.kind_ = Kind::Bool;
    out.bool_ = v;
    return out;
}

Value Value::Number(double v) {
    Value out;
    out.kind_ = Kind::Number;
    out.number_ = v;
    return out;
}

Value Value::String(std::string v) {
    Value out;
    out.kind_ = Kind::String;
    out.string_ = std::move(v);
    return out;
}

Value Value::Array(std::vector<Value> items) {
    Value out;
    out.kind_ = Kind::Array;
    out.array_ = std::make_shared<const std::vector<Value>>(std::move(items));
    return out;
}

Value Value::Object(std::map<std::string, Value, std::less<>> members) {
    Value out;
    out.kind_ = Kind::Object;
    out.object_ = std::make_shared<const std::map<std::string, Value, std::less<>>>(std::move(members));
    return out;
}

const Value* Value::Find(std::string_view key) const {
    if (kind_ != Kind::Object) return nullptr;
    const auto it = object_->find(key);
    return it == object_->end() ? nullptr : &it->second;
}

std::optional<std::string_view> Value::AsString() const {
    if (kind_ != Kind::String) return std::nullopt;
    return std::string_view(string_);
}

std::optional<std::uint64_t> Value::AsUint() const {
    constexpr double kMaxSafe = 9007199254740991.0;  // 2^53 - 1
    if (kind_ != Kind::Number || number_ < 0 || number_ > kMaxSafe || std::floor(number_) != number_) {
        return std::nullopt;
    }
    return static_cast<std::uint64_t>(number_);
}

std::optional<bool> Value::AsBool() const {
    if (kind_ != Kind::Bool) return std::nullopt;
    return bool_;
}

namespace {

constexpr int kMaxDepth = 32;

class Parser {
public:
    explicit Parser(std::string_view text) : text_(text) {}

    ParseResult Run() {
        ParseResult result;
        SkipSpace();
        Value v;
        if (!ParseValue(v, 0)) {
            result.error = error_ + " at byte " + std::to_string(pos_);
            return result;
        }
        SkipSpace();
        if (pos_ != text_.size()) {
            result.error = "unexpected text after the value at byte " + std::to_string(pos_);
            return result;
        }
        result.value = std::move(v);
        return result;
    }

private:
    bool Fail(const char* why) {
        error_ = why;
        return false;
    }

    void SkipSpace() {
        while (pos_ < text_.size() &&
               (text_[pos_] == ' ' || text_[pos_] == '\t' || text_[pos_] == '\n' || text_[pos_] == '\r')) {
            ++pos_;
        }
    }

    bool Literal(std::string_view word) {
        if (text_.substr(pos_, word.size()) != word) return Fail("invalid literal");
        pos_ += word.size();
        return true;
    }

    bool ParseValue(Value& out, int depth) {
        if (depth >= kMaxDepth) return Fail("nested too deeply");
        if (pos_ >= text_.size()) return Fail("unexpected end");
        switch (text_[pos_]) {
            case '{':
                return ParseObject(out, depth);
            case '[':
                return ParseArray(out, depth);
            case '"': {
                std::string s;
                if (!ParseString(s)) return false;
                out = Value::String(std::move(s));
                return true;
            }
            case 't':
                out = Value::Bool(true);
                return Literal("true");
            case 'f':
                out = Value::Bool(false);
                return Literal("false");
            case 'n':
                out = Value();
                return Literal("null");
            default:
                return ParseNumber(out);
        }
    }

    bool ParseObject(Value& out, int depth) {
        ++pos_;  // {
        std::map<std::string, Value, std::less<>> members;
        SkipSpace();
        if (pos_ < text_.size() && text_[pos_] == '}') {
            ++pos_;
            out = Value::Object(std::move(members));
            return true;
        }
        for (;;) {
            SkipSpace();
            if (pos_ >= text_.size() || text_[pos_] != '"') return Fail("expected a member name");
            std::string key;
            if (!ParseString(key)) return false;
            SkipSpace();
            if (pos_ >= text_.size() || text_[pos_] != ':') return Fail("expected ':'");
            ++pos_;
            SkipSpace();
            Value member;
            if (!ParseValue(member, depth + 1)) return false;
            if (!members.emplace(std::move(key), std::move(member)).second) return Fail("duplicate member name");
            SkipSpace();
            if (pos_ < text_.size() && text_[pos_] == ',') {
                ++pos_;
                continue;
            }
            if (pos_ < text_.size() && text_[pos_] == '}') {
                ++pos_;
                out = Value::Object(std::move(members));
                return true;
            }
            return Fail("expected ',' or '}'");
        }
    }

    bool ParseArray(Value& out, int depth) {
        ++pos_;  // [
        std::vector<Value> items;
        SkipSpace();
        if (pos_ < text_.size() && text_[pos_] == ']') {
            ++pos_;
            out = Value::Array(std::move(items));
            return true;
        }
        for (;;) {
            SkipSpace();
            Value item;
            if (!ParseValue(item, depth + 1)) return false;
            items.push_back(std::move(item));
            SkipSpace();
            if (pos_ < text_.size() && text_[pos_] == ',') {
                ++pos_;
                continue;
            }
            if (pos_ < text_.size() && text_[pos_] == ']') {
                ++pos_;
                out = Value::Array(std::move(items));
                return true;
            }
            return Fail("expected ',' or ']'");
        }
    }

    bool Hex4(std::uint32_t& out) {
        if (pos_ + 4 > text_.size()) return Fail("short \\u escape");
        out = 0;
        for (int i = 0; i < 4; ++i) {
            const char c = text_[pos_++];
            out <<= 4;
            if (c >= '0' && c <= '9') {
                out |= static_cast<std::uint32_t>(c - '0');
            } else if (c >= 'a' && c <= 'f') {
                out |= static_cast<std::uint32_t>(c - 'a' + 10);
            } else if (c >= 'A' && c <= 'F') {
                out |= static_cast<std::uint32_t>(c - 'A' + 10);
            } else {
                return Fail("invalid \\u escape");
            }
        }
        return true;
    }

    static void AppendUtf8(std::string& out, std::uint32_t cp) {
        if (cp < 0x80) {
            out += static_cast<char>(cp);
        } else if (cp < 0x800) {
            out += static_cast<char>(0xC0 | (cp >> 6));
            out += static_cast<char>(0x80 | (cp & 0x3F));
        } else if (cp < 0x10000) {
            out += static_cast<char>(0xE0 | (cp >> 12));
            out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
            out += static_cast<char>(0x80 | (cp & 0x3F));
        } else {
            out += static_cast<char>(0xF0 | (cp >> 18));
            out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
            out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
            out += static_cast<char>(0x80 | (cp & 0x3F));
        }
    }

    bool ParseString(std::string& out) {
        ++pos_;  // "
        for (;;) {
            if (pos_ >= text_.size()) return Fail("unterminated string");
            const char c = text_[pos_++];
            if (c == '"') return true;
            if (static_cast<unsigned char>(c) < 0x20) return Fail("control character in a string");
            if (c != '\\') {
                out += c;
                continue;
            }
            if (pos_ >= text_.size()) return Fail("unterminated string");
            const char e = text_[pos_++];
            switch (e) {
                case '"':
                case '\\':
                case '/':
                    out += e;
                    break;
                case 'b':
                    out += '\b';
                    break;
                case 'f':
                    out += '\f';
                    break;
                case 'n':
                    out += '\n';
                    break;
                case 'r':
                    out += '\r';
                    break;
                case 't':
                    out += '\t';
                    break;
                case 'u': {
                    std::uint32_t cp = 0;
                    if (!Hex4(cp)) return false;
                    if (cp >= 0xD800 && cp <= 0xDBFF) {
                        std::uint32_t low = 0;
                        if (text_.substr(pos_, 2) != "\\u") return Fail("lone surrogate");
                        pos_ += 2;
                        if (!Hex4(low)) return false;
                        if (low < 0xDC00 || low > 0xDFFF) return Fail("lone surrogate");
                        cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
                    } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
                        return Fail("lone surrogate");
                    }
                    AppendUtf8(out, cp);
                    break;
                }
                default:
                    return Fail("invalid escape");
            }
        }
    }

    static bool IsDigit(char c) { return c >= '0' && c <= '9'; }

    bool ParseNumber(Value& out) {
        const std::size_t start = pos_;
        if (pos_ < text_.size() && text_[pos_] == '-') ++pos_;
        if (pos_ >= text_.size() || !IsDigit(text_[pos_])) return Fail("unexpected character");
        if (text_[pos_] == '0') {
            ++pos_;
        } else {
            while (pos_ < text_.size() && IsDigit(text_[pos_])) ++pos_;
        }
        if (pos_ < text_.size() && text_[pos_] == '.') {
            ++pos_;
            if (pos_ >= text_.size() || !IsDigit(text_[pos_])) return Fail("expected a digit");
            while (pos_ < text_.size() && IsDigit(text_[pos_])) ++pos_;
        }
        if (pos_ < text_.size() && (text_[pos_] == 'e' || text_[pos_] == 'E')) {
            ++pos_;
            if (pos_ < text_.size() && (text_[pos_] == '+' || text_[pos_] == '-')) ++pos_;
            if (pos_ >= text_.size() || !IsDigit(text_[pos_])) return Fail("expected a digit");
            while (pos_ < text_.size() && IsDigit(text_[pos_])) ++pos_;
        }
        double v = 0;
        const auto [end, ec] = std::from_chars(text_.data() + start, text_.data() + pos_, v);
        if (ec != std::errc() || end != text_.data() + pos_) return Fail("number out of range");
        out = Value::Number(v);
        return true;
    }

    std::string_view text_;
    std::size_t pos_ = 0;
    std::string error_;
};

}  // namespace

ParseResult Parse(std::string_view text) { return Parser(text).Run(); }

std::string Quote(std::string_view text) {
    std::string out = "\"";
    for (const char c : text) {
        switch (c) {
            case '"':
                out += "\\\"";
                break;
            case '\\':
                out += "\\\\";
                break;
            case '\n':
                out += "\\n";
                break;
            case '\r':
                out += "\\r";
                break;
            case '\t':
                out += "\\t";
                break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char escaped[8];
                    std::snprintf(escaped, sizeof escaped, "\\u%04x", static_cast<unsigned>(c));
                    out += escaped;
                } else {
                    out += c;
                }
        }
    }
    return out + "\"";
}

Writer& Writer::Raw(std::string_view key, std::string_view json) {
    if (out_.size() > 1) out_ += ',';
    out_ += Quote(key);
    out_ += ':';
    out_ += json;
    return *this;
}

Writer& Writer::Str(std::string_view key, std::string_view value) { return Raw(key, Quote(value)); }

Writer& Writer::Uint(std::string_view key, std::uint64_t value) { return Raw(key, std::to_string(value)); }

Writer& Writer::Bool(std::string_view key, bool value) { return Raw(key, value ? "true" : "false"); }

Writer& Writer::Null(std::string_view key) { return Raw(key, "null"); }

}  // namespace etch::json
