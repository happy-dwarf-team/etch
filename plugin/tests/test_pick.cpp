#include "json.hpp"
#include "pick.hpp"
#include "protocol.hpp"

#include <windows.h>

#include <cassert>
#include <cstdio>
#include <functional>
#include <optional>
#include <string>
#include <vector>

using etch::HotKey;
using etch::MouseAction;
using etch::UiWidget;
using etch::json::Parse;
using etch::json::Value;

namespace {

constexpr std::uint32_t kVisible = 0x1, kEnabled = 0x2, kChecked = 0x4, kStale = 0x8;

UiWidget W(std::uint64_t id, const char* name, int parent, int x, int y, int w, int h,
           std::uint32_t flags = kVisible | kEnabled, std::uint32_t type = 1) {
    UiWidget out;
    out.id = id;
    out.name = name;
    out.parent = parent;
    out.x = x;
    out.y = y;
    out.width = w;
    out.height = h;
    out.flags = flags;
    out.type = type;
    return out;
}

Value Json(const std::string& line) {
    const auto parsed = Parse(line);
    assert(parsed.value && parsed.value->IsObject());
    return *parsed.value;
}

void TestKeys() {
    const auto key = etch::ParseKey("Ctrl+Shift+E");
    assert(key && key->vk == 'E' && key->ctrl && key->shift && !key->alt);
    assert(etch::FormatKey(*key) == "Ctrl+Shift+E");
    assert(HotKey::FromCode(key->Code()) == *key);
    assert(key->Code() == 0x345);  // Anvil's encoding: 'E' | Shift | Ctrl
    assert(etch::ParseKey("alt+f9") && etch::ParseKey("alt+f9")->vk == VK_F9);
    assert(etch::FormatKey(*etch::ParseKey("shift+ctrl+5")) == "Ctrl+Shift+5");
    // Without Ctrl or Alt the key would take one the game uses (e is the trade map mode).
    assert(!etch::ParseKey("E"));
    assert(!etch::ParseKey("Shift+E"));
    assert(!etch::ParseKey("Ctrl+"));
    assert(!etch::ParseKey("Ctrl+Space"));
    assert(!etch::ParseKey("Ctrl+F25"));
    assert(!etch::ParseKey("Hyper+E"));
}

void TestMouse() {
    // H6: the button bits of a move are cleared, or SDL makes the click itself.
    const auto move = etch::FilterMouse(WM_MOUSEMOVE, MK_LBUTTON | MK_SHIFT | MK_RBUTTON | MK_XBUTTON2);
    assert(move.action == MouseAction::Pass && move.wparam == MK_SHIFT);
    assert(etch::FilterMouse(WM_LBUTTONDOWN, MK_LBUTTON).action == MouseAction::Pick);
    for (const UINT m :
         {WM_LBUTTONUP, WM_LBUTTONDBLCLK, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_RBUTTONDBLCLK, WM_MBUTTONDOWN, WM_MBUTTONUP,
          WM_MBUTTONDBLCLK, WM_XBUTTONDOWN, WM_XBUTTONUP, WM_XBUTTONDBLCLK, WM_MOUSEHWHEEL}) {
        assert(etch::FilterMouse(m, 0).action == MouseAction::Drop);
    }
    const auto up = etch::FilterMouse(WM_MOUSEWHEEL, static_cast<WPARAM>(WHEEL_DELTA) << 16);
    assert(up.action == MouseAction::Wheel && up.wheel == 1);
    const auto down = etch::FilterMouse(WM_MOUSEWHEEL, static_cast<WPARAM>(static_cast<WORD>(-WHEEL_DELTA)) << 16);
    assert(down.wheel == -1);
    assert(etch::IsMouseMessage(WM_MOUSEMOVE) && etch::IsMouseMessage(WM_MOUSEHWHEEL));
    assert(!etch::IsMouseMessage(WM_KEYDOWN));
}

// menubar covers the screen; provinceview holds a button holding its text.
std::vector<UiWidget> Tree() {
    return {
        W(1, "menubar", -1, 0, 0, 1920, 1080),
        W(2, "provinceview", -1, 100, 100, 600, 800),
        W(3, "province_window", 1, 100, 150, 600, 700),
        W(4, "tax_button", 2, 120, 200, 40, 40, kVisible | kEnabled, 2),
        W(5, "tax_text", 3, 125, 205, 30, 20, kVisible | kEnabled, 4),
        W(6, "hidden_icon", 2, 110, 190, 100, 100, kEnabled, 3),
    };
}

void TestStack() {
    const auto tree = Tree();
    const auto stack = etch::StackAt(tree, 130, 210, 1920, 1080, 4);
    // The hovered button first, then smallest first; menubar and the hidden icon left out (H5).
    assert((stack == std::vector<std::size_t>{3, 4, 2, 1}));
    assert(etch::StackAt(tree, 5, 5, 1920, 1080, 0).empty());
    assert((etch::ChainOf(tree, 4) == std::vector<std::size_t>{4, 3, 2, 1}));
}

void TestLabel() {
    auto tree = Tree();
    tree[4].file = "interface/provinceview.gui";
    tree[4].line = 597;
    etch::Sources sources;
    sources.Set({{"Interface\\ProvinceView.gui", "P2KE Patch - Anbennar"}});
    std::vector<const UiWidget*> chain;
    for (const std::size_t i : etch::ChainOf(tree, 4)) chain.push_back(&tree[i]);
    const std::string label = etch::LabelText(chain, sources, 0, 4);
    assert(label.find("tax_text  \xC2\xB7  text  \xC2\xB7  30\xC3\x97") == 0);
    assert(label.find("P2KE Patch - Anbennar \xE2\x80\xBA interface/provinceview.gui:597") != std::string::npos);
    assert(label.find("provinceview/province_window/tax_button/tax_text") != std::string::npos);
    assert(label.find("1 of 4 under the pointer") != std::string::npos);
    assert(sources.Of("interface/topbar.gui") == "EU4");
    assert(etch::LabelText({}, sources, 0, 0) == "not a GUI widget");
    tree[4].flags |= kStale;
    assert(etch::LabelText(chain, sources, 0, 1).find("stale") != std::string::npos);
    std::vector<UiWidget> deep = {W(1, "a", -1, 0, 0, 1, 1), W(2, "b", 0, 0, 0, 1, 1), W(3, "c", 1, 0, 0, 1, 1),
                                  W(4, "d", 2, 0, 0, 1, 1), W(5, "e", 3, 0, 0, 1, 1)};
    std::vector<const UiWidget*> long_chain;
    for (const std::size_t i : etch::ChainOf(deep, 4)) long_chain.push_back(&deep[i]);
    assert(etch::ShortPath(long_chain) == "a/\xE2\x80\xA6/d/e");
    assert(etch::BadgeText(*etch::ParseKey("Ctrl+Shift+E")) == "Etch pick \xE2\x80\x94 Ctrl+Shift+E to leave");
}

void TestPickEvent() {
    auto tree = Tree();
    tree[3].file = "interface/provinceview.gui";
    tree[3].line = 596;
    tree[3].path = "provinceview/province_window/tax_button";
    const std::string line = etch::PickEvent(7, tree, etch::ChainOf(tree, 3), 0, 3, 1920, 1080, true, {12.5, 14.25});
    const Value e = Json(line);
    assert(e.Find("event")->AsString() == "pick");
    assert(e.Find("seq")->AsUint() == 7u);
    assert(e.Find("window")->AsString() == "provinceview");
    assert(e.Find("screen")->Find("width")->AsUint() == 1920u);
    assert(e.Find("front")->AsBool() == true);
    const auto& chain = *e.Find("chain")->AsArray();
    assert(chain.size() == 3);
    assert(chain[0].Find("name")->AsString() == "tax_button");
    assert(chain[0].Find("type")->AsString() == "button");
    assert(chain[0].Find("file")->AsString() == "interface/provinceview.gui");
    assert(chain[0].Find("line")->AsUint() == 596u);
    assert(chain[0].Find("path")->AsString() == "provinceview/province_window/tax_button");
    assert(chain[1].Find("file")->kind() == Value::Kind::Null);
    assert(chain[2].Find("name")->AsString() == "provinceview");
    assert(e.Find("stack")->Find("size")->AsUint() == 3u);
}

void TestSnapshot() {
    auto tree = Tree();
    tree.push_back(W(7, "stale_row", 2, 0, 0, 10, 10, kVisible | kStale));
    tree.push_back(W(8, "other", -1, 0, 0, 10, 10));
    tree[1].file = "interface/provinceview.gui";
    tree[4].has_text = true;
    tree[4].text = "12.5";
    tree[5].flags = kEnabled | kChecked;
    for (UiWidget& w : tree) w.path = w.name;
    const etch::Snapshot snapshot = etch::SnapshotOf(tree, 1, 1920, 1080, 6.5);
    assert(snapshot.widgets == 5 && snapshot.stale == 1);
    const Value v = Json("{" + snapshot.members + "}");
    assert(v.Find("window")->AsString() == "provinceview");
    assert(v.Find("file")->AsString() == "interface/provinceview.gui");
    assert(v.Find("stale")->AsUint() == 1u);
    const auto& widgets = *v.Find("widgets")->AsArray();
    assert(widgets.size() == 5);  // provinceview and its four, not menubar, the stale row or `other`
    assert(widgets[3].Find("text")->AsString() == "12.5");
    assert(widgets[2].Find("text")->kind() == Value::Kind::Null);
    assert(widgets[4].Find("visible")->AsBool() == false && widgets[4].Find("checked")->AsBool() == true);
    assert(widgets[0].Find("rect")->AsArray()->size() == 4);

    bool stale = true;
    assert(etch::FindRoot(tree, "ProvinceView", stale) == 1u && !stale);
    assert(!etch::FindRoot(tree, "topbar", stale));
    tree[1].flags |= kStale;
    assert(etch::FindRoot(tree, "provinceview", stale) == 1u && stale);
}

void TestPickModeRequest() {
    etch::PickModeRequest r;
    assert(!etch::ReadPickModeRequest(
        Json(R"({"on":true,"key":"Alt+F9","sources":{"interface/a.gui":"Mod A"},"front":true,)"
             R"("editor":{"pid":42,"title":"my-mod"}})"),
        r));
    assert(r.on == true && r.key->vk == VK_F9 && r.front && r.editor_pid == 42u && r.editor_title == "my-mod");
    assert(r.sources->at("interface/a.gui") == "Mod A");
    etch::PickModeRequest leave;
    assert(!etch::ReadPickModeRequest(Json(R"({"on":null})"), leave) && !leave.on && !leave.key && !leave.sources);
    etch::PickModeRequest bad;
    assert(etch::ReadPickModeRequest(Json(R"({"key":"E"})"), bad));
    assert(etch::ReadPickModeRequest(Json(R"({"sources":{"a":1}})"), bad));
    assert(etch::ReadPickModeRequest(Json(R"({"editor":{"pid":1}})"), bad));
}

// The protocol's side: pick_mode, snapshot, pushes and the ping's `pick`.
void TestProtocol() {
    bool on = false;
    std::optional<etch::PickModeRequest> seen;
    std::function<void(const etch::SnapshotResult&)> snapshot_done;
    std::string snapshot_window;
    etch::PickControl control{
        .mode =
            [&](const etch::PickModeRequest& request) {
                seen = request;
                if (request.on) on = *request.on;
                return etch::PickModeAnswer{on, request.key.value_or(*etch::ParseKey("Ctrl+Shift+E")), true};
            },
        .snapshot = [&](std::string window,
                        std::function<void(const etch::SnapshotResult&)> done) -> std::optional<std::string> {
            snapshot_window = window;
            snapshot_done = std::move(done);
            return std::nullopt;
        },
        .on = [&] { return on; },
    };
    etch::Pushes pushes;
    etch::Host host;
    host.ready = [] { return true; };
    host.frame = [] { return std::uint64_t{1}; };
    host.session = "0123456789abcdef0123456789abcdef";
    host.plugin_version = "1.2.3";
    host.pick = &control;
    host.pushes = &pushes;
    std::vector<std::string> sent;
    assert(!pushes.Push("before"));
    {
        etch::Connection c(host, [&](const std::string& line) { sent.push_back(line); });
        Json(c.Handle(R"({"id":1,"type":"hello","protocol":2})").line);
        assert(pushes.Push(R"({"event":"pick_mode","on":true})"));
        assert(sent.back() == R"({"event":"pick_mode","on":true})");

        const Value mode =
            Json(c.Handle(R"({"id":2,"type":"pick_mode","on":true,"key":"Ctrl+Shift+E","front":true})").line);
        assert(mode.Find("ok")->AsBool() == true && mode.Find("on")->AsBool() == true);
        assert(mode.Find("key")->AsString() == "Ctrl+Shift+E" && mode.Find("front")->AsBool() == true);
        assert(seen && seen->front);
        const Value bad = Json(c.Handle(R"({"id":3,"type":"pick_mode","key":"Q"})").line);
        assert(bad.Find("error")->AsString() == "bad_request");
        assert(Json(c.Handle(R"({"id":4,"type":"ping"})").line).Find("pick")->AsBool() == true);

        assert(c.Handle(R"({"id":5,"type":"snapshot","window":"provinceview"})").line.empty());
        assert(snapshot_window == "provinceview");
        snapshot_done({"", "", R"("window":"provinceview","widgets":[],"stale":0)", 3.5});
        const Value snap = Json(sent.back());
        assert(snap.Find("id")->AsUint() == 5u && snap.Find("ok")->AsBool() == true);
        assert(snap.Find("window")->AsString() == "provinceview" && snap.Find("queued_ms") != nullptr);
        assert(c.Handle(R"({"id":6,"type":"snapshot","window":"topbar"})").line.empty());
        snapshot_done({"not_open", "topbar is not on screen", "", 0});
        assert(Json(sent.back()).Find("error")->AsString() == "not_open");
        assert(Json(c.Handle(R"({"id":7,"type":"snapshot"})").line).Find("error")->AsString() == "bad_request");
    }
    // The connection is gone: pushes go nowhere.
    assert(!pushes.Push("after"));

    etch::Host bare = host;
    bare.pick = nullptr;
    etch::Connection c(bare, [](const std::string&) {});
    c.Handle(R"({"id":1,"type":"hello","protocol":2})");
    assert(Json(c.Handle(R"({"id":2,"type":"pick_mode","on":true})").line).Find("error")->AsString() == "no_tree");
    assert(Json(c.Handle(R"({"id":3,"type":"ping"})").line).Find("pick")->AsBool() == false);
}

}  // namespace

int main() {
    TestKeys();
    TestMouse();
    TestStack();
    TestLabel();
    TestPickEvent();
    TestSnapshot();
    TestPickModeRequest();
    TestProtocol();
    std::puts("pick: ok");
    return 0;
}
